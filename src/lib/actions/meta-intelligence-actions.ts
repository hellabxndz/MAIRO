"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { FLAG_STAGES, PIPELINE, type FlagStage, type PipelineStatus } from "@/lib/platform-intelligence/types";
import { ensureMetaIntelligence } from "@/lib/meta-intelligence";
import { checkSource, ingestText } from "@/lib/meta-intelligence/change-detector/run";
import { analyzeUpdate, moveUpdate, validateFeature } from "@/lib/meta-intelligence/pipeline";
import { recordContractRun, recordManualTest, runSandbox } from "@/lib/meta-intelligence/testing/run";
import { ensureFlag, flagKeyFor, setFlagStage } from "@/lib/meta-intelligence/feature-flags";
import { upsertFeature } from "@/lib/meta-intelligence/feature-registry/store";
import { addSource } from "@/lib/meta-intelligence/sources/store";
import { authorityFor, type SourceKind } from "@/lib/meta-intelligence/sources/catalog";
import { markAlertsRead } from "@/lib/meta-intelligence/alerts";
import { discoverAccount } from "@/lib/meta-intelligence/discovery";
import { versionSweep } from "@/lib/meta-intelligence/api-versioning";

// AIOS → Meta Intelligence. Owner only. Every action here is a structured,
// audited administrative step; none of them changes code or a customer's
// live campaign.

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function owner(): Promise<string> {
  const session = await auth();
  if (!session?.user || session.user.role !== "OWNER") throw new Error("Owner access required");
  return session.user.email ?? session.user.id ?? "owner";
}

const done = (message?: string): Result => {
  revalidatePath("/aios/meta-intelligence", "layout");
  return { ok: true, message };
};

export async function setupMetaIntelligenceAction(): Promise<Result> {
  await owner();
  const r = await ensureMetaIntelligence();
  return done(`Ready: ${r.sources} sources and ${r.features} registry features added; production API ${r.version}.`);
}

export async function checkSourceNowAction(sourceId: string): Promise<Result> {
  await owner();
  const s = await db.platformSource.findUnique({ where: { id: sourceId } });
  if (!s) return { ok: false, error: "No such source." };
  const r = await checkSource(s);
  if (!r.ok) return { ok: false, error: r.error ?? "Couldn't check it." };
  return done(r.baseline ? "Baseline stored — changes are detected from the next check." : r.changed ? `${r.updates} update${r.updates === 1 ? "" : "s"} filed.` : "No change since the last check.");
}

/** For pages MAIRO can't fetch (or text Meta sent by email): paste the official text. */
export async function ingestOfficialTextAction(sourceId: string, text: string): Promise<Result> {
  await owner();
  const s = await db.platformSource.findUnique({ where: { id: sourceId } });
  if (!s) return { ok: false, error: "No such source." };
  if (authorityFor(s.url) === "UNVERIFIED") return { ok: false, error: "Only official or trusted sources." };
  if (text.trim().length < 40) return { ok: false, error: "Paste the full text of the page." };
  const r = await ingestText(s, text.slice(0, 400_000));
  return done(r.baseline ? "Stored as the baseline." : r.changed ? `${r.updates} update${r.updates === 1 ? "" : "s"} filed.` : "Same as the last version.");
}

export async function addSourceAction(input: { name: string; url: string; kind: SourceKind }): Promise<Result> {
  await owner();
  const r = await addSource(input);
  return r.ok ? done("Source added.") : r;
}

export async function toggleSourceAction(sourceId: string, active: boolean): Promise<Result> {
  await owner();
  await db.platformSource.update({ where: { id: sourceId }, data: { active } });
  return done();
}

export async function analyzeUpdateAction(id: string): Promise<Result> {
  const by = await owner();
  const u = await db.platformUpdate.findUnique({ where: { id }, select: { status: true } });
  if (!u) return { ok: false, error: "No such update." };
  if (!["DETECTED", "ANALYZED"].includes(u.status)) {
    // Re-analysing goes back to DETECTED first, on the record.
    const back = await moveUpdate(id, "DETECTED", by, "Re-analysis requested");
    if (!back.ok) return back;
  }
  await analyzeUpdate(id, by);
  return done("Analyzed.");
}

export async function moveUpdateAction(id: string, to: string, note: string): Promise<Result> {
  const by = await owner();
  if (![...PIPELINE, "DISMISSED"].includes(to)) return { ok: false, error: "Unknown stage." };
  const r = await moveUpdate(id, to as PipelineStatus, by, note);
  return r.ok ? done() : { ok: false, error: r.error };
}

export async function runContractTestsAction(updateId?: string): Promise<Result> {
  const by = await owner();
  const r = await recordContractRun(by, updateId ?? null);
  return done(`${r.passed} passed, ${r.failed} failed${r.criticalFailed ? ` (${r.criticalFailed} critical)` : ""}.`);
}

export async function runSandboxAction(version: string, updateId?: string): Promise<Result> {
  const by = await owner();
  const r = await runSandbox(by, { version: version.trim() || undefined, updateId: updateId ?? null });
  if (r.error) return { ok: false, error: r.error };
  return done(r.ok ? "Sandbox run passed." : "Sandbox run finished with failures — see Testing.");
}

export async function recordManualTestAction(input: { passed: boolean; notes: string; updateId?: string }): Promise<Result> {
  const by = await owner();
  if (input.notes.trim().length < 10) return { ok: false, error: "Say what you tested, on which test account, and what happened." };
  await recordManualTest({ by, passed: input.passed, notes: input.notes, updateId: input.updateId ?? null });
  return done("Recorded.");
}

export async function setFlagStageAction(key: string, stage: string, internal: string, selected: string): Promise<Result> {
  const by = await owner();
  if (!(FLAG_STAGES as readonly string[]).includes(stage)) return { ok: false, error: "Unknown stage." };
  const ids = (s: string) => s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean).slice(0, 200);
  await setFlagStage(key, stage as FlagStage, by, { internalOrgIds: ids(internal), selectedOrgIds: ids(selected) });
  return done(`${key} is now ${stage.toLowerCase().replace("_", " ")}.`);
}

export async function createFlagAction(featureKey: string): Promise<Result> {
  await owner();
  const f = await db.platformFeature.findUnique({ where: { platform_featureKey: { platform: "META", featureKey } } });
  if (!f) return { ok: false, error: "No such feature." };
  await ensureFlag({ key: flagKeyFor(featureKey), featureKey, description: `Rollout of ${f.name}.` });
  return done("Flag created (off).");
}

export async function validateFeatureAction(featureKey: string, support: "SUPPORTED" | "PARTIALLY_SUPPORTED"): Promise<Result> {
  const by = await owner();
  const r = await validateFeature(featureKey, by, support);
  return r.ok ? done("Marked as validated.") : r;
}

/** Admin edits to a registry record: restrictive or descriptive fields only; "supported" goes through validation. */
export async function editFeatureAction(featureKey: string, input: { availability: string; regionRestrictions: string; deprecated: boolean; deprecationDate: string; replacementKey: string; notes: string; support: string }): Promise<Result> {
  const by = await owner();
  if (input.support === "SUPPORTED" || input.support === "PARTIALLY_SUPPORTED") {
    const current = await db.platformFeature.findUnique({ where: { platform_featureKey: { platform: "META", featureKey } }, select: { mairoSupport: true } });
    if (current?.mairoSupport !== input.support) return { ok: false, error: "Use “Validate” to mark something supported — it checks the tests first." };
  }
  if (!["GA", "LIMITED", "BETA", "ALPHA", "UNKNOWN"].includes(input.availability)) return { ok: false, error: "Unknown availability." };
  if (!["SUPPORTED", "PARTIALLY_SUPPORTED", "TESTING", "NOT_SUPPORTED", "DEPRECATED", "NOT_APPLICABLE"].includes(input.support)) return { ok: false, error: "Unknown support status." };
  const date = input.deprecationDate.trim() ? new Date(`${input.deprecationDate.trim()}T00:00:00Z`) : null;
  if (date && Number.isNaN(date.getTime())) return { ok: false, error: "Use YYYY-MM-DD for the date." };
  await upsertFeature(
    featureKey,
    {
      availability: input.availability,
      regionRestrictions: input.regionRestrictions.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s)),
      deprecated: input.deprecated || input.support === "DEPRECATED",
      deprecationDate: date,
      replacementKey: input.replacementKey.trim() || null,
      notes: input.notes.trim().slice(0, 2000) || null,
      mairoSupport: input.deprecated ? "DEPRECATED" : (input.support as never),
    },
    { source: `Edited by ${by}`, changeNote: "Administrator edit." },
  );
  return done("Saved. The previous version is in the history.");
}

export async function setVersionDatesAction(version: string, retiresAt: string, migrationStatus: string): Promise<Result> {
  const by = await owner();
  if (!/^v\d{1,2}\.0$/.test(version)) return { ok: false, error: "Versions look like v24.0." };
  const date = retiresAt.trim() ? new Date(`${retiresAt.trim()}T00:00:00Z`) : null;
  if (date && Number.isNaN(date.getTime())) return { ok: false, error: "Use YYYY-MM-DD." };
  if (!["NOT_STARTED", "TESTING", "PASSED", "MIGRATED"].includes(migrationStatus)) return { ok: false, error: "Unknown migration status." };
  await db.platformApiVersion.upsert({
    where: { platform_version: { platform: "META", version } },
    create: { platform: "META", version, retiresAt: date, retiresSource: date ? `Entered by ${by}` : null, migrationStatus },
    update: { retiresAt: date, retiresSource: date ? `Entered by ${by}` : null, migrationStatus },
  });
  await versionSweep();
  return done("Saved.");
}

export async function markAlertsReadAction(): Promise<Result> {
  await owner();
  await markAlertsRead();
  return done();
}

export async function discoverAccountAction(organizationId: string): Promise<Result> {
  await owner();
  const r = await discoverAccount(organizationId);
  return r.ok ? done("Account capabilities refreshed.") : { ok: false, error: r.error ?? "Couldn't check it." };
}
