// Checks the Performance Coach end to end against the database and a
// simulated Meta: a review saves its findings (and only once), proposes a
// budget move only as a recommendation waiting for approval, records just the
// specialists that worked on something, alerts only when the business allows
// it, keeps the business's progress on its plan, respects a dismissal,
// resolves what it no longer sees, judges approved plans and applied changes
// without claiming cause — and never mixes one business's records with
// another's.
//
//   npm run check:coach-db   (needs DATABASE_URL; makes no network calls)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { saveMetaConnection } from "../src/lib/meta/connection";
import { runCoach } from "../src/lib/coach/run";
import { gatherCoachInput } from "../src/lib/coach/gather";
import { judgeApprovedPlans } from "../src/lib/coach/history";
import { judgeAppliedChanges } from "../src/lib/coach/history";
import { loadFindings } from "../src/lib/coach/store";
import { NOT_PROOF } from "../src/lib/coach/verdict";
import { submitLead } from "../src/lib/leads/forms";
import type { PlanStep } from "../src/lib/coach/types";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "e2e-coachdb";
const ORG = `${TAG}-org`;
const OTHER = `${TAG}-other`;
const DAY = 86_400_000;
const now = new Date();

// --- A pretend Meta: campaign figures by period --------------------------------
const methods: string[] = [];
let decidedAtDay: string | null = null;
const fakeMeta: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  methods.push((init?.method ?? "GET").toUpperCase());
  const ok = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
  if (url.pathname.endsWith("/insights")) {
    const range = JSON.parse(url.searchParams.get("time_range") ?? "{}") as { since?: string };
    const ids = (JSON.parse(url.searchParams.get("filtering") ?? "[]")[0]?.value ?? []) as string[];
    const recent = range.since && new Date(range.since).getTime() > now.getTime() - 16 * DAY;
    // For a change made on decidedAtDay: before = 30 leads for $300, after = 20 leads for $300.
    const before = decidedAtDay && range.since && range.since < decidedAtDay;
    const row = (id: string) => ({
      campaign_id: id,
      spend: "300.00",
      impressions: "20000",
      reach: "9000",
      clicks: "400",
      actions: [{ action_type: "offsite_conversion", value: decidedAtDay ? (before ? "30" : "20") : recent ? "20" : "18" }],
    });
    return ok({ data: ids.map(row) });
  }
  return ok({ data: [] });
};
const viaMeta = <T>(fn: () => Promise<T>) => withGraphTransport({ fetch: fakeMeta, record: false }, fn);

const ago = (days: number) => new Date(now.getTime() - days * DAY);

async function setup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  for (const id of [ORG, OTHER]) await db.organization.create({ data: { id, name: id === ORG ? "Coach Roofing" : "Someone Else" } });
  await saveMetaConnection({ organizationId: ORG, metaAdAccountId: `act_${TAG}`, pageId: "p1", pageName: "Coach Roofing", accessToken: "EAAB-coach-token", tokenExpiresAt: null });
  const form = await db.leadForm.create({ data: { organizationId: ORG, slug: `${TAG}-form`, name: "Quote", headline: "Quote", description: "d", thankYou: "t", fieldsJson: JSON.stringify([{ key: "name", type: "FULL_NAME", label: "Name", required: true }]) } });
  const mk = (id: string, name: string, ext: string) =>
    db.mairoCampaign.create({
      data: {
        id,
        organizationId: ORG,
        name,
        objective: "LEADS",
        status: "ACTIVE",
        totalDailyBudgetCents: 5000,
        destinationType: "LEAD_FORM",
        createdAt: ago(60),
        platformCampaigns: { create: { platform: "META", status: "ACTIVE", externalCampaignId: ext, budgetPercent: 100, dailyBudgetCents: 5000 } },
      },
    });
  await mk(`${TAG}-a`, "Gutters", `${TAG}-xa`);
  await mk(`${TAG}-b`, "Roofs", `${TAG}-xb`);
  const otherCampaign = await db.mairoCampaign.create({ data: { id: `${TAG}-other-c`, organizationId: OTHER, name: "Not yours", objective: "LEADS", totalDailyBudgetCents: 1000 } });
  const lead = (campaign: string, status: "QUALIFIED" | "LOST" | "NEW", daysAgo: number, extra: Record<string, unknown> = {}) =>
    db.lead.create({ data: { organizationId: ORG, leadFormId: form.id, answersJson: "{}", status, mairoCampaignId: campaign, createdAt: ago(daysAgo), ...extra } });
  for (let i = 0; i < 15; i++) await lead(`${TAG}-a`, "QUALIFIED", 4 + (i % 9));
  for (let i = 0; i < 5; i++) await lead(`${TAG}-b`, "QUALIFIED", 4 + i);
  for (let i = 0; i < 5; i++) await lead(`${TAG}-b`, "LOST", 4 + i, { lostReason: "outside-area" });
  for (let i = 0; i < 3; i++) await lead(`${TAG}-b`, "NEW", 2 + i);
  // Another business's finding, which nothing here may touch.
  await db.coachFinding.create({ data: { organizationId: OTHER, key: "followup:waiting", category: "FOLLOW_UP", severity: "ATTENTION", confidence: "STRONG", title: "Theirs", plain: "p", noticed: "n", explanationsJson: "[]", recommendation: "r", alternativesJson: "[]", evidenceJson: "[]", limitations: "l", missingJson: "[]", stepsJson: "[]", agentsJson: "[]" } });
  return { form, otherCampaign };
}

async function main() {
  const { otherCampaign } = await setup();
  try {
    let budgetFindingId = "";
    await check("a review saves its findings and puts the budget move up for approval — nothing changes on Meta", async () => {
      const r = await viaMeta(() => runCoach(ORG, { now }));
      assert.ok(r.ok, JSON.stringify(r));
      assert.ok(methods.every((m) => m === "GET"), "a review only reads from Meta");
      const findings = await db.coachFinding.findMany({ where: { organizationId: ORG } });
      const keys = findings.map((f) => f.key);
      assert.ok(keys.includes("followup:waiting"), keys.join(","));
      const budget = findings.find((f) => f.key.startsWith("budget:quality-shift"));
      assert.ok(budget?.decisionId, keys.join(","));
      budgetFindingId = budget.id;
      const decision = await db.mairoDecision.findUniqueOrThrow({ where: { id: budget.decisionId! } });
      assert.equal(decision.status, "PENDING", "waits for approval");
      assert.equal(decision.kind, "coach-shift-qualified");
      assert.equal(decision.findingId, budget.id);
      const changes = JSON.parse(decision.changesJson) as { fromCents: number; toCents: number }[];
      assert.equal(changes.reduce((a, c) => a + (c.toCents - c.fromCents), 0), 0, "total daily budget unchanged");
    });

    await check("only the specialists that worked on something are in the activity log", async () => {
      const runs = await db.agentRun.findMany({ where: { organizationId: ORG } });
      const parent = runs.find((r) => r.task === "coach-review");
      assert.equal(parent?.status, "DONE");
      const children = runs.filter((r) => r.parentId === parent!.id);
      const agents = new Set(children.map((r) => r.agent));
      for (const a of ["ANALYST", "OPTIMIZER", "GUARDIAN", "ARCHITECT", "GROWTH"]) assert.ok(agents.has(a as never), `${a} missing: ${[...agents].join(",")}`);
      assert.ok(!agents.has("CREATIVE") && !agents.has("AUDIENCE"), "no specialist that didn't contribute");
      assert.ok(children.every((r) => r.summary && r.status === "DONE"));
      assert.ok(children.find((r) => r.agent === "ARCHITECT")?.decisionId, "the Campaign Agent's line names the change it prepared");
    });

    await check("alerts only for what the records support, and only if the business wants them", async () => {
      const alerts = await db.notification.findMany({ where: { organizationId: ORG, kind: "COACH_ALERT" } });
      assert.ok(alerts.some((a) => /haven't been contacted/.test(a.title)));
      await db.coachFinding.deleteMany({ where: { organizationId: ORG } });
      await db.notification.deleteMany({ where: { organizationId: ORG } });
      await db.organization.update({ where: { id: ORG }, data: { notifyCoachAlerts: false } });
      await viaMeta(() => runCoach(ORG, { now }));
      assert.equal(await db.notification.count({ where: { organizationId: ORG, kind: "COACH_ALERT" } }), 0);
      await db.organization.update({ where: { id: ORG }, data: { notifyCoachAlerts: true } });
      budgetFindingId = (await db.coachFinding.findFirstOrThrow({ where: { organizationId: ORG, key: { startsWith: "budget:quality-shift" } } })).id;
    });

    await check("a second review updates the same findings and keeps the business's progress", async () => {
      const before = await db.coachFinding.count({ where: { organizationId: ORG } });
      const f = await db.coachFinding.findFirstOrThrow({ where: { organizationId: ORG, key: "followup:waiting" } });
      const steps = JSON.parse(f.stepsJson) as PlanStep[];
      await db.coachFinding.update({ where: { id: f.id }, data: { stepsJson: JSON.stringify(steps.map((s, i) => (i === 0 ? { ...s, status: "done" } : s))) } });
      await viaMeta(() => runCoach(ORG, { now }));
      assert.equal(await db.coachFinding.count({ where: { organizationId: ORG } }), before, "no duplicates");
      const again = await db.coachFinding.findUniqueOrThrow({ where: { id: f.id } });
      assert.equal((JSON.parse(again.stepsJson) as PlanStep[])[0].status, "done");
      assert.equal(await db.mairoDecision.count({ where: { organizationId: ORG, kind: "coach-shift-qualified" } }), 1, "one decision for one situation");
    });

    await check("what the business dismissed stays dismissed", async () => {
      await db.coachFinding.updateMany({ where: { organizationId: ORG, key: "followup:waiting" }, data: { status: "DISMISSED", decidedAt: now } });
      await viaMeta(() => runCoach(ORG, { now }));
      assert.equal(await db.coachFinding.count({ where: { organizationId: ORG, key: "followup:waiting", status: { in: ["OPEN", "APPROVED"] } } }), 0);
    });

    await check("what's no longer seen is resolved — and another business's findings are never touched", async () => {
      // The expensive campaign's leads turn out good too: no reason to move budget.
      await db.lead.updateMany({ where: { organizationId: ORG, mairoCampaignId: `${TAG}-b`, status: "LOST" }, data: { status: "QUALIFIED", lostReason: null } });
      for (let i = 0; i < 6; i++) await db.lead.create({ data: { organizationId: ORG, leadFormId: (await db.leadForm.findFirstOrThrow({ where: { organizationId: ORG } })).id, answersJson: "{}", status: "QUALIFIED", mairoCampaignId: `${TAG}-b`, createdAt: ago(5 + i) } });
      await viaMeta(() => runCoach(ORG, { now }));
      const budget = await db.coachFinding.findUniqueOrThrow({ where: { id: budgetFindingId } });
      assert.equal(budget.status, "RESOLVED");
      assert.match(budget.verdictNote ?? "", /No longer seen/);
      const theirs = await db.coachFinding.findFirstOrThrow({ where: { organizationId: OTHER } });
      assert.equal(theirs.status, "OPEN");
      const mine = await loadFindings(ORG, now);
      assert.ok([...mine.active, ...mine.past].every((f) => f.title !== "Theirs"));
    });

    await check("an approved plan is checked again on its date, and the note says it isn't proof", async () => {
      await db.coachFinding.updateMany({ where: { organizationId: ORG, key: "followup:waiting" }, data: { status: "APPROVED", decidedAt: ago(15), checkAfter: ago(1), measureJson: JSON.stringify({ metric: "waitingForContact", value: 3, betterWhen: "lower", campaignId: null }), verdict: null } });
      await db.lead.updateMany({ where: { organizationId: ORG, status: "NEW" }, data: { status: "CONTACTED", firstContactedAt: now } });
      const input = await viaMeta(() => gatherCoachInput(ORG, { now }));
      const judged = await judgeApprovedPlans(ORG, input);
      assert.equal(judged[0]?.verdict, "IMPROVED");
      assert.ok(judged[0].note.includes(NOT_PROOF));
      const f = await db.coachFinding.findFirstOrThrow({ where: { organizationId: ORG, key: "followup:waiting" } });
      assert.equal(f.status, "RESOLVED");
    });

    await check("a change carried out on Meta is compared two weeks before against two weeks after", async () => {
      const decidedAt = ago(20);
      decidedAtDay = decidedAt.toISOString().slice(0, 10);
      const d = await db.mairoDecision.create({
        data: {
          organizationId: ORG,
          mairoCampaignId: `${TAG}-a`,
          kind: "scale-winner",
          category: "GROWTH",
          title: "Raise Gutters' budget",
          noticed: "n",
          noticedAdvanced: "n",
          whyItMatters: "w",
          recommendation: "r",
          impact: "i",
          risk: "MEDIUM",
          confidence: "MEDIUM",
          evidenceJson: "[]",
          changesJson: JSON.stringify([{ type: "set-budget", platform: "META", mairoCampaignId: `${TAG}-a`, platformCampaignId: "pc", externalCampaignId: `${TAG}-xa`, campaignName: "Gutters", fromCents: 5000, toCents: 6000 }]),
          status: "APPLIED",
          decidedAt,
          dedupeKey: `${TAG}-applied`,
        },
      });
      const r = await viaMeta(() => judgeAppliedChanges(ORG, now));
      assert.equal(r.length, 1);
      const after = await db.mairoDecision.findUniqueOrThrow({ where: { id: d.id } });
      assert.equal(after.verdict, "WORSENED", "30 leads for $300 before, 20 after");
      assert.ok(after.verdictNote?.includes(NOT_PROOF));
      decidedAtDay = null;
    });

    await check("…and the same kind of change isn't suggested again for that campaign", async () => {
      const input = await viaMeta(() => gatherCoachInput(ORG, { now }));
      assert.ok(input.history.worsened.some((w) => w.kind === "scale-winner" && w.mairoCampaignId === `${TAG}-a`));
    });

    await check("a lead only takes a campaign that belongs to the form's own business", async () => {
      const mine = await submitLead({ slug: `${TAG}-form`, values: { name: "Ann" }, campaignRef: `${TAG}-a` });
      const theirs = await submitLead({ slug: `${TAG}-form`, values: { name: "Bo" }, campaignRef: otherCampaign.id });
      assert.equal((await db.lead.findUniqueOrThrow({ where: { id: mine.ok ? mine.leadId! : "" } })).mairoCampaignId, `${TAG}-a`);
      assert.equal((await db.lead.findUniqueOrThrow({ where: { id: theirs.ok ? theirs.leadId! : "" } })).mairoCampaignId, null);
    });
  } finally {
    await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  }
  console.log(`\nPerformance Coach (database): ${passed} checks passed`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } }).catch(() => undefined);
  await db.$disconnect();
  process.exit(1);
});
