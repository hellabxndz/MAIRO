import { db } from "@/lib/db";
import { graphApiVersion, metaGraphRequest, withGraphTransport } from "@/lib/meta/client";
import { metaCampaignBody } from "@/lib/meta/campaigns";
import { raiseAlert } from "../alerts";
import { CONTRACT_TESTS, runContractTests, type ContractResult } from "./contract";

// Recorded test runs: the evidence the pipeline's gates read.
//
//   CONTRACT  the stubbed-Meta suite (any time, no network)
//   SANDBOX   a real Meta test/sandbox ad account, from META_SANDBOX_* env
//             (admin-triggered only; can try a candidate API version)
//   MANUAL    an administrator's recorded check on a test account

export async function recordContractRun(by: string | null, updateId?: string | null): Promise<{ id: string; passed: number; failed: number; criticalFailed: number; results: ContractResult[] }> {
  const run = await db.platformTestRun.create({ data: { platform: "META", mode: "CONTRACT", apiVersion: graphApiVersion(), resultsJson: "[]", ranBy: by, updateId: updateId ?? null } });
  const results = await runContractTests();
  const failed = results.filter((r) => !r.ok);
  const criticalFailed = failed.filter((r) => r.critical).length;
  await db.platformTestRun.update({ where: { id: run.id }, data: { passed: results.length - failed.length, failed: failed.length, criticalFailed, resultsJson: JSON.stringify(results), finishedAt: new Date() } });
  // A feature is verified when every test covering it passed.
  const byFeature = new Map<string, boolean>();
  for (const t of CONTRACT_TESTS) {
    const ok = results.find((r) => r.key === t.key)?.ok ?? false;
    for (const f of t.features) byFeature.set(f, (byFeature.get(f) ?? true) && ok);
  }
  const verified = [...byFeature.entries()].filter(([, ok]) => ok).map(([f]) => f);
  if (verified.length) await db.platformFeature.updateMany({ where: { platform: "META", featureKey: { in: verified }, mairoSupport: { in: ["SUPPORTED", "PARTIALLY_SUPPORTED"] } }, data: { lastVerifiedAt: new Date() } });
  if (criticalFailed) await raiseAlert({ key: `contract-fail:${run.id}`, severity: "CRITICAL", title: `${criticalFailed} critical Meta contract test${criticalFailed === 1 ? "" : "s"} failing`, body: `${failed.map((f) => f.name).join("; ")}. Nothing goes to production until they pass.`, href: "/aios/meta-intelligence?tab=testing" });
  return { id: run.id, passed: results.length - failed.length, failed: failed.length, criticalFailed, results };
}

export function sandboxConfigured(): boolean {
  return Boolean(process.env.META_SANDBOX_ACCESS_TOKEN?.trim() && process.env.META_SANDBOX_AD_ACCOUNT_ID?.trim());
}

/**
 * Live checks on a Meta test/sandbox ad account — never a customer's. Reads
 * permissions and the account, creates a PAUSED campaign and deletes it, and
 * reads insights. `version` tries a candidate API version for this run only.
 */
export async function runSandbox(by: string, opts: { version?: string; updateId?: string | null } = {}): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!sandboxConfigured()) return { ok: false, error: "Set META_SANDBOX_ACCESS_TOKEN and META_SANDBOX_AD_ACCOUNT_ID (a Meta test or sandbox ad account) to run live tests." };
  const token = process.env.META_SANDBOX_ACCESS_TOKEN!.trim();
  const account = process.env.META_SANDBOX_AD_ACCOUNT_ID!.trim().replace(/^(?!act_)/, "act_");
  const version = opts.version && /^v\d{1,2}\.0$/.test(opts.version) ? opts.version : graphApiVersion();
  const run = await db.platformTestRun.create({ data: { platform: "META", mode: "SANDBOX", apiVersion: version, resultsJson: "[]", ranBy: by, updateId: opts.updateId ?? null } });
  const results: { name: string; ok: boolean; critical: boolean; error: string | null }[] = [];
  const step = async (name: string, critical: boolean, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ name, ok: true, critical, error: null });
    } catch (error) {
      results.push({ name, ok: false, critical, error: (error instanceof Error ? error.message : String(error)).replace(token, "[token]").slice(0, 400) });
    }
  };
  await withGraphTransport({ fetch, version, record: false }, async () => {
    await step("Permissions", true, async () => {
      const p = await metaGraphRequest<{ data?: { permission: string; status: string }[] }>("/me/permissions", { accessToken: token });
      const granted = (p.data ?? []).filter((x) => x.status === "granted").map((x) => x.permission);
      if (!granted.includes("ads_management")) throw new Error("ads_management not granted to the sandbox token");
    });
    await step("Ad account", true, async () => {
      await metaGraphRequest(`/${account}`, { accessToken: token, params: { fields: "account_status,currency,business_country_code,capabilities" } });
    });
    let campaignId: string | null = null;
    await step("Create a paused campaign", true, async () => {
      const r = await metaGraphRequest<{ id: string }>(`/${account}/campaigns`, { method: "POST", accessToken: token, body: metaCampaignBody({ name: `MAIRO sandbox check ${new Date().toISOString()}`, goal: "TRAFFIC", dailyBudgetCents: 500, status: "PAUSED" }) });
      campaignId = r.id;
    });
    await step("Delete the test campaign", true, async () => {
      if (!campaignId) throw new Error("No campaign to delete.");
      await metaGraphRequest(`/${campaignId}`, { method: "DELETE", accessToken: token });
    });
    await step("Insights", false, async () => {
      await metaGraphRequest(`/${account}/insights`, { accessToken: token, params: { fields: "spend,impressions,clicks", date_preset: "last_7d" } });
    });
  });
  const failed = results.filter((r) => !r.ok);
  await db.platformTestRun.update({ where: { id: run.id }, data: { passed: results.length - failed.length, failed: failed.length, criticalFailed: failed.filter((r) => r.critical).length, resultsJson: JSON.stringify(results), finishedAt: new Date() } });
  if (version !== graphApiVersion() && failed.length === 0) {
    await db.platformApiVersion.upsert({ where: { platform_version: { platform: "META", version } }, create: { platform: "META", version, status: "CANDIDATE", migrationStatus: "PASSED" }, update: { migrationStatus: "PASSED", status: "CANDIDATE" } });
  }
  return { ok: failed.length === 0, id: run.id };
}

/** An administrator's recorded test-account check. */
export async function recordManualTest(input: { by: string; passed: boolean; notes: string; updateId?: string | null; apiVersion?: string }): Promise<string> {
  const row = await db.platformTestRun.create({
    data: { platform: "META", mode: "MANUAL", apiVersion: input.apiVersion ?? graphApiVersion(), passed: input.passed ? 1 : 0, failed: input.passed ? 0 : 1, criticalFailed: input.passed ? 0 : 1, resultsJson: JSON.stringify([{ name: "Manual test-account check", ok: input.passed, notes: input.notes }]), ranBy: input.by, notes: input.notes.slice(0, 2000), updateId: input.updateId ?? null, finishedAt: new Date() },
  });
  return row.id;
}
