// Checks "Pause everything", the emergency stop on Campaigns, against a
// pretend Meta (withGraphTransport) — nothing is sent to Meta:
//
//   - every campaign running or waiting on Meta is paused; drafts, archived
//     and already-paused ones are left alone, and so is another business;
//   - a campaign is marked paused only when Meta accepted the pause; one Meta
//     refuses stays as it was, is reported, and doesn't stop the rest;
//   - automatic launches are held afterwards, so nothing switches itself on;
//   - each outcome is logged for the owner;
//   - the action is gated by role, never by billing.
//
//   npm run check:pause-everything-db   (needs DATABASE_URL; no network)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { saveMetaConnection } from "../src/lib/meta/connection";
import { pauseEverything, runningOrWaiting } from "../src/lib/protection/run";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-pauseall";
const ORG = `${TAG}-org`;
const OTHER = `${TAG}-other`;
const REFUSE = "cmp-refuse";
const calls: { path: string; status: string | null }[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fakeMeta: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/v\d+\.\d+/, "");
  const raw = typeof init?.body === "string" ? init.body : "";
  let status: string | null = url.searchParams.get("status");
  try {
    status = status ?? (JSON.parse(raw) as { status?: string }).status ?? null;
  } catch {
    status = status ?? new URLSearchParams(raw).get("status");
  }
  calls.push({ path, status });
  if (path === `/${REFUSE}`) return json({ error: { message: "(#100) Something went wrong on Meta's side", type: "OAuthException", code: 100 } }, 400);
  return json({ success: true });
};
const viaMeta = <T,>(fn: () => Promise<T>) => withGraphTransport({ fetch: fakeMeta, record: false }, fn);

async function campaign(organizationId: string, name: string, status: "ACTIVE" | "PAUSED" | "DRAFT" | "ARCHIVED", child: { ext: string | null; status: "ACTIVE" | "PENDING_REVIEW" | "PAUSED" | "DRAFT" }) {
  const c = await db.mairoCampaign.create({ data: { organizationId, name, objective: "LEADS", status, totalDailyBudgetCents: 2000, launchApprovedAt: new Date() } });
  await db.platformCampaign.create({ data: { mairoCampaignId: c.id, platform: "META", externalCampaignId: child.ext, budgetPercent: 100, dailyBudgetCents: 2000, status: child.status } });
  return c.id;
}

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function main() {
  await cleanup();
  try {
    for (const id of [ORG, OTHER]) {
      await db.organization.create({ data: { id, name: id, autoLaunchHeld: false } });
      await saveMetaConnection({ organizationId: id, metaAdAccountId: "act_1", accessToken: `EAAB-${id}`, tokenExpiresAt: null });
    }
    const live = await campaign(ORG, "Spring leads", "ACTIVE", { ext: "cmp-live", status: "ACTIVE" });
    const waiting = await campaign(ORG, "Waiting on review", "ACTIVE", { ext: "cmp-wait", status: "PENDING_REVIEW" });
    const refused = await campaign(ORG, "Meta says no", "ACTIVE", { ext: REFUSE, status: "ACTIVE" });
    const paused = await campaign(ORG, "Already paused", "PAUSED", { ext: "cmp-paused", status: "PAUSED" });
    const draft = await campaign(ORG, "Draft", "DRAFT", { ext: null, status: "DRAFT" });
    const archived = await campaign(ORG, "Old", "ARCHIVED", { ext: "cmp-old", status: "ACTIVE" });
    const theirs = await campaign(OTHER, "Someone else's", "ACTIVE", { ext: "cmp-theirs", status: "ACTIVE" });

    await check("it finds what's running or waiting on Meta — not drafts, archived, paused or another business's", async () => {
      assert.deepEqual((await runningOrWaiting(ORG)).map((c) => c.id), [live, waiting, refused]);
    });

    const results = await viaMeta(() => pauseEverything(ORG));

    await check("each is paused through Meta, and only those", async () => {
      assert.deepEqual(calls.map((c) => [c.path, c.status]), [["/cmp-live", "PAUSED"], ["/cmp-wait", "PAUSED"], [`/${REFUSE}`, "PAUSED"]]);
    });
    await check("paused is recorded only where Meta accepted; a refusal stays as it was and is reported", async () => {
      assert.deepEqual(results.map((r) => [r.id, r.ok]), [[live, true], [waiting, true], [refused, false]]);
      assert.match(results[2].error ?? "", /Something went wrong/);
      const status = async (id: string) => (await db.mairoCampaign.findUnique({ where: { id }, select: { status: true, platformCampaigns: { select: { status: true } } } }))!;
      assert.deepEqual(await status(live), { status: "PAUSED", platformCampaigns: [{ status: "PAUSED" }] });
      assert.deepEqual(await status(waiting), { status: "PAUSED", platformCampaigns: [{ status: "PAUSED" }] });
      assert.deepEqual(await status(refused), { status: "ACTIVE", platformCampaigns: [{ status: "ACTIVE" }] });
    });
    await check("everything else is untouched", async () => {
      for (const [id, want] of [[paused, "PAUSED"], [draft, "DRAFT"], [archived, "ARCHIVED"], [theirs, "ACTIVE"]] as const) {
        assert.equal((await db.mairoCampaign.findUnique({ where: { id }, select: { status: true } }))!.status, want, id);
      }
      assert.equal((await db.platformCampaign.findFirst({ where: { mairoCampaignId: theirs } }))!.status, "ACTIVE");
    });
    await check("automatic launches are held afterwards — for this business only", async () => {
      assert.equal((await db.organization.findUnique({ where: { id: ORG } }))!.autoLaunchHeld, true);
      assert.equal((await db.organization.findUnique({ where: { id: OTHER } }))!.autoLaunchHeld, false);
    });
    await check("each outcome is logged for the owner", async () => {
      const events = await db.protectionEvent.findMany({ where: { organizationId: ORG }, orderBy: { createdAt: "asc" }, select: { mairoCampaignId: true, kind: true, action: true } });
      assert.deepEqual(events, [
        { mairoCampaignId: live, kind: "PAUSED_BY_YOU", action: "PAUSED" },
        { mairoCampaignId: waiting, kind: "PAUSED_BY_YOU", action: "PAUSED" },
        { mairoCampaignId: refused, kind: "PAUSED_BY_YOU", action: "NOTIFIED" },
      ]);
    });
    await check("running it again only retries what's still running", async () => {
      calls.length = 0;
      const again = await viaMeta(() => pauseEverything(ORG));
      assert.deepEqual(again.map((r) => r.id), [refused]);
      assert.deepEqual(calls.map((c) => c.path), [`/${REFUSE}`]);
    });
    await check("the action checks the role that may change campaigns, and never billing", () => {
      const src = readFileSync(join(import.meta.dirname, "../src/lib/actions/protection-actions.ts"), "utf8");
      const body = src.slice(src.indexOf("export async function pauseEverythingAction"), src.indexOf("export async function resumeCampaignAction"));
      assert.match(body, /deniedFor\("campaign\.edit"\)/);
      assert.doesNotMatch(body, /executionBlock|entitlementsFor|hasActivePlan/);
    });
  } finally {
    await cleanup();
    await db.$disconnect();
  }
  console.log(`\nPause everything: ${passed} checks passed`);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
