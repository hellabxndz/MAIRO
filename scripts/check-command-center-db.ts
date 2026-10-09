// Checks the AI Team Command Center against the database and a simulated
// Meta: a campaign only goes live after a person's recorded approval; every
// launch waiting for one is in the Approval Center with its budget; a change
// is reported as done only once Meta accepted it; trails, approvals and the
// Daily Brief show one business only its own records; and agent states come
// from recorded runs.
//
//   npm run check:command-center-db   (needs DATABASE_URL; makes no network calls)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { saveMetaConnection } from "../src/lib/meta/connection";
import { maybeGoLive } from "../src/lib/campaigns/auto-launch";
import { otherApprovals } from "../src/lib/approvals/queue";
import { applyDecision } from "../src/lib/decisions/apply";
import { loadTrails } from "../src/lib/team/trail-store";
import { loadTeam } from "../src/lib/team/store";
import { loadBrief } from "../src/lib/team/brief-store";
import { nextBestSteps } from "../src/lib/team/answers";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "e2e-ccdb";
const ORG = `${TAG}-org`;
const OTHER = `${TAG}-other`;
const now = new Date();

// A pretend Meta that records every write, and can refuse them.
const writes: string[] = [];
let refuse = false;
const fakeMeta: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    writes.push(`${method} ${url.pathname}`);
    if (refuse) return new Response(JSON.stringify({ error: { message: "Invalid parameter", code: 100, type: "OAuthException" } }), { status: 400 });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }
  return new Response(JSON.stringify({ data: [] }), { status: 200 });
};
const viaMeta = <T,>(fn: () => Promise<T>) => withGraphTransport({ fetch: fakeMeta, record: false }, fn);

const built = (id: string, organizationId: string, approved: boolean) =>
  db.mairoCampaign.create({
    data: {
      id,
      organizationId,
      name: id.endsWith("approved") ? "Approved roofs" : "Built by the team",
      objective: "LEADS",
      status: "PENDING_REVIEW",
      totalDailyBudgetCents: 4_000,
      launchApprovedAt: approved ? now : null,
      platformCampaigns: { create: { platform: "META", status: "PENDING_REVIEW", externalCampaignId: `${id}-x`, externalAdGroupId: `${id}-as`, externalAdId: `${id}-ad`, budgetPercent: 100, dailyBudgetCents: 4_000 } },
    },
    include: { platformCampaigns: true },
  });

async function setup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  await db.organization.create({ data: { id: ORG, name: "Peak Roofing", autoLaunchHeld: false } });
  await db.organization.create({ data: { id: OTHER, name: "Someone Else" } });
  await saveMetaConnection({ organizationId: ORG, metaAdAccountId: `act_${TAG}`, pageId: "p1", pageName: "Peak Roofing", accessToken: "EAAB-cc-token", tokenExpiresAt: null });
}

async function main() {
  await setup();
  try {
    const unapproved = await built(`${TAG}-built`, ORG, false);

    await check("a campaign the team built isn't put live without a person's approval", async () => {
      const r = await viaMeta(() => maybeGoLive(ORG));
      assert.equal(r.launched, false);
      assert.match(r.heldBecause ?? "", /Approval Center/);
      assert.equal((await db.platformCampaign.findFirstOrThrow({ where: { mairoCampaignId: unapproved.id } })).status, "PENDING_REVIEW");
      assert.equal(writes.length, 0, writes.join(","));
    });

    await check("it waits in the Approval Center with its budget, for this business only", async () => {
      const mine = await otherApprovals(ORG, now);
      const launch = mine.find((o) => o.kind === "launch");
      assert.ok(launch, JSON.stringify(mine));
      assert.equal(launch.launch?.campaignId, unapproved.id);
      assert.match(launch.budget, /\$40 a day/);
      assert.match(launch.authorization, /explicit approval/);
      assert.equal((await otherApprovals(OTHER, now)).length, 0);
    });

    await check("…and it's among the next best things to do", async () => {
      const steps = await viaMeta(() => nextBestSteps(ORG, now));
      assert.ok(steps.some((s) => /Launch/.test(s.title)), JSON.stringify(steps));
    });

    await check("an approved campaign gets past the approval gate — and still waits for Meta to confirm funding", async () => {
      await built(`${TAG}-approved`, ORG, true);
      const r = await viaMeta(() => maybeGoLive(ORG));
      assert.equal(r.launched, false);
      assert.doesNotMatch(r.heldBecause ?? "", /Approval Center/);
      assert.equal(writes.length, 0, "nothing switched on while funding is unconfirmed");
    });

    await check("another business can't launch this one's campaign", async () => {
      const r = await viaMeta(() => maybeGoLive(OTHER, { onlyCampaignId: unapproved.id, approvedByPerson: true }));
      assert.equal(r.launched, false);
      assert.equal(writes.length, 0);
    });

    // A recommendation from a daily review.
    const review = await db.agentRun.create({ data: { organizationId: ORG, agent: "STRATEGIST", task: "team-review", status: "DONE", summary: "Coordinated the daily review", startedAt: now, finishedAt: now } });
    for (const [agent, task, summary] of [
      ["ANALYST", "read-results", "Read the latest results for 1 campaign."],
      ["OPTIMIZER", "recommend", "Recommended: Lower Roofs to $30/day"],
      ["GUARDIAN", "check-limits", "Checked 1 budget change against your limits — it stays within them."],
    ] as const) {
      await db.agentRun.create({ data: { organizationId: ORG, agent, task, parentId: review.id, status: "DONE", summary, startedAt: now, finishedAt: now } });
    }
    const pc = unapproved.platformCampaigns[0];
    const decision = (key: string) =>
      db.mairoDecision.create({
        data: {
          organizationId: ORG,
          kind: "pause-underperformer",
          category: "BUDGET",
          title: "Lower Roofs to $30/day",
          noticed: "n",
          noticedAdvanced: "n",
          whyItMatters: "w",
          recommendation: "r",
          impact: "i",
          risk: "LOW",
          confidence: "MEDIUM",
          evidenceJson: "[]",
          changesJson: JSON.stringify([{ type: "set-budget", platform: "META", mairoCampaignId: unapproved.id, platformCampaignId: pc.id, externalCampaignId: pc.externalCampaignId, campaignName: "Roofs", fromCents: 4_000, toCents: 3_000 }]),
          dedupeKey: `${TAG}-${key}`,
          reviewRunId: review.id,
        },
      });

    await check("a recommendation's trail shows who took part, from the review's own records", async () => {
      const d = await decision("trail");
      const trail = (await loadTrails(ORG, [d.id])).get(d.id)!;
      assert.deepEqual(trail.steps.map((s) => s.who), ["ANALYST", "OPTIMIZER", "GUARDIAN", "OWNER"]);
      assert.equal(trail.steps[3].state, "waiting");
    });

    await check("another business never sees it", async () => {
      const d = await db.mairoDecision.findFirstOrThrow({ where: { organizationId: ORG, dedupeKey: `${TAG}-trail` } });
      assert.equal((await loadTrails(OTHER, [d.id])).size, 0);
    });

    await check("Meta refusing a change: not reported as done, and the trail says Meta refused", async () => {
      refuse = true;
      const d = await decision("refused");
      const r = await viaMeta(() => applyDecision({ organizationId: ORG, decisionId: d.id, userId: null, automatic: false }));
      refuse = false;
      assert.equal(r.ok && r.applied.some((a) => a.ok), false);
      assert.equal((await db.mairoDecision.findUniqueOrThrow({ where: { id: d.id } })).status, "FAILED");
      assert.equal(await db.agentRun.count({ where: { organizationId: ORG, decisionId: d.id, task: "apply-approved" } }), 0, "no 'carried out' record");
      const trail = (await loadTrails(ORG, [d.id])).get(d.id)!;
      assert.ok(trail.steps.some((s) => s.who === "META" && s.state === "failed"));
      assert.ok(!trail.steps.some((s) => /confirmed/.test(s.did)));
    });

    await check("Meta accepting it: recorded as carried out, and the trail says Meta confirmed", async () => {
      const d = await decision("accepted");
      const before = writes.length;
      const r = await viaMeta(() => applyDecision({ organizationId: ORG, decisionId: d.id, userId: null, automatic: false }));
      assert.ok(r.ok, JSON.stringify(r));
      assert.equal(writes.length, before + 1, "one write to Meta");
      assert.equal(await db.agentRun.count({ where: { organizationId: ORG, decisionId: d.id, task: "apply-approved" } }), 1);
      const trail = (await loadTrails(ORG, [d.id])).get(d.id)!;
      assert.ok(trail.steps.some((s) => s.who === "META" && /confirmed/.test(s.did)));
    });

    await check("agent states come from recorded runs — and one business's runs never colour another's", async () => {
      await db.agentRun.create({ data: { organizationId: OTHER, agent: "CREATIVE", task: "ad-concept", status: "RUNNING", startedAt: new Date() } });
      const mine = await viaMeta(() => loadTeam(ORG, { now: new Date() }));
      assert.notEqual(mine.statuses.find((s) => s.role === "CREATIVE")?.state, "WORKING");
      await db.agentRun.create({ data: { organizationId: ORG, agent: "CREATIVE", task: "ad-concept", status: "RUNNING", startedAt: new Date() } });
      const again = await viaMeta(() => loadTeam(ORG, { now: new Date() }));
      const creative = again.statuses.find((s) => s.role === "CREATIVE")!;
      assert.equal(creative.state, "WORKING");
      assert.equal(creative.current, "Writing ad ideas");
    });

    await check("the Daily Brief: steps, not figures, before anything has run", async () => {
      const team = await viaMeta(() => loadTeam(OTHER, { now }));
      const brief = await loadBrief(OTHER, team, now);
      assert.equal(brief.kind, "onboarding");
    });

    await check("…and a brief from the records once something has run", async () => {
      await db.platformCampaign.updateMany({ where: { mairoCampaignId: `${TAG}-approved` }, data: { status: "ACTIVE" } });
      await db.mairoCampaign.update({ where: { id: `${TAG}-approved` }, data: { status: "ACTIVE" } });
      const team = await viaMeta(() => loadTeam(ORG, { now }));
      const brief = await loadBrief(ORG, team, now);
      assert.equal(brief.kind, "brief");
      if (brief.kind !== "brief") return;
      assert.match(brief.results[0].text, /Read the latest results for 1 campaign/);
      assert.ok(brief.pending.count >= 1, "the trail decision and the launch are waiting");
      assert.ok(brief.nextAt, "a live campaign has a next scheduled analysis");
    });
  } finally {
    await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  }
  console.log(`\nCommand Center (database): ${passed} checks passed`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } }).catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
