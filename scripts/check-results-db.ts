// Checks the Results page's figures and the record of the AI team's work
// against the database and a simulated Meta: the month adds up from the
// business's own records, Meta is only read, the budget suggestion waits
// while lead quality is being looked into, nothing private about a lead
// reaches the report, and one business never sees another's records.
//
//   npm run check:results-db   (needs DATABASE_URL; makes no network calls)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { saveMetaConnection } from "../src/lib/meta/connection";
import { currentMonth, monthlyReport, reportAsText, reportRange } from "../src/lib/reports/monthly";
import { teamWork } from "../src/lib/results/work";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "e2e-resultsdb";
const ORG = `${TAG}-org`;
const OTHER = `${TAG}-other`;
const now = new Date();
// Inside the running month, whatever day this runs on.
const recently = new Date(now.getTime() - 60_000);
const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 12);
const PRIVATE = { name: "Jane Private", email: "jane@private.test", phone: "555-0100" };

const methods: string[] = [];
const fakeMeta: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  methods.push((init?.method ?? "GET").toUpperCase());
  const ok = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
  if (url.pathname.endsWith("/insights")) {
    const ids = (JSON.parse(url.searchParams.get("filtering") ?? "[]")[0]?.value ?? []) as string[];
    return ok({ data: ids.map((id) => ({ campaign_id: id, spend: "600.00", impressions: "40000", reach: "18000", clicks: "1180", actions: [{ action_type: "lead", value: "25" }] })) });
  }
  return ok({ data: [] });
};
const viaMeta = <T,>(fn: () => Promise<T>) => withGraphTransport({ fetch: fakeMeta, record: false }, fn);

const decision = (organizationId: string, key: string, extra: Record<string, unknown>) =>
  db.mairoDecision.create({
    data: { organizationId, kind: "shift-budget", category: "BUDGET", title: key, noticed: "n", noticedAdvanced: "n", whyItMatters: "w", recommendation: "r", impact: "i", risk: "LOW", confidence: "MEDIUM", evidenceJson: "[]", changesJson: "[]", dedupeKey: `${TAG}-${organizationId}-${key}`, ...extra },
  });
const finding = (organizationId: string, key: string, extra: Record<string, unknown> = {}) =>
  db.coachFinding.create({ data: { organizationId, key, category: "LEAD_QUALITY", severity: "ATTENTION", confidence: "SOME", title: "Most leads aren't turning out to be good ones", plain: "p", noticed: "n", explanationsJson: "[]", recommendation: "r", alternativesJson: "[]", evidenceJson: "[]", limitations: "l", missingJson: "[]", stepsJson: "[]", agentsJson: "[]", firstSeenAt: recently, ...extra } });

async function setup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  await db.organization.create({ data: { id: ORG, name: "Peak Roofing", industry: "Roofing" } });
  await db.organization.create({ data: { id: OTHER, name: "Someone Else", industry: "Roofing" } });
  await saveMetaConnection({ organizationId: ORG, metaAdAccountId: `act_${TAG}`, pageId: "p1", pageName: "Peak Roofing", accessToken: "EAAB-results-token", tokenExpiresAt: null });

  // One campaign Meta accepted, one draft that never reached it.
  await db.mairoCampaign.create({ data: { id: `${TAG}-live`, organizationId: ORG, name: "Roof inspections", objective: "LEADS", status: "ACTIVE", totalDailyBudgetCents: 4000, destinationType: "LEAD_FORM", createdAt: recently, platformCampaigns: { create: { platform: "META", status: "ACTIVE", externalCampaignId: `${TAG}-x1`, budgetPercent: 100, dailyBudgetCents: 4000 } } } });
  await db.mairoCampaign.create({ data: { id: `${TAG}-draft`, organizationId: ORG, name: "Draft", objective: "LEADS", status: "DRAFT", totalDailyBudgetCents: 4000, createdAt: recently } });
  await db.mairoCampaign.create({ data: { id: `${TAG}-theirs`, organizationId: OTHER, name: "Theirs", objective: "LEADS", status: "ACTIVE", totalDailyBudgetCents: 4000, createdAt: recently, platformCampaigns: { create: { platform: "META", status: "ACTIVE", externalCampaignId: `${TAG}-x9`, budgetPercent: 100, dailyBudgetCents: 4000 } } } });

  // 25 leads: 4 qualified (2 good, 1 booked, 1 won), 14 not a fit, 3 spam, 4 unmarked.
  const form = await db.leadForm.create({ data: { organizationId: ORG, slug: `${TAG}-form`, name: "Quote", headline: "Quote", description: "d", thankYou: "t", fieldsJson: "[]" } });
  const answers = JSON.stringify(PRIVATE);
  const lead = (status: "WON" | "BOOKED" | "QUALIFIED" | "LOST" | "SPAM" | "NEW", extra: Record<string, unknown> = {}) =>
    db.lead.create({ data: { organizationId: ORG, leadFormId: form.id, answersJson: answers, status, mairoCampaignId: `${TAG}-live`, createdAt: recently, ...extra } });
  await lead("WON", { valueCents: 940_000 });
  await lead("BOOKED");
  for (let i = 0; i < 2; i++) await lead("QUALIFIED");
  for (let i = 0; i < 14; i++) await lead("LOST");
  for (let i = 0; i < 3; i++) await lead("SPAM", { mairoCampaignId: null });
  for (let i = 0; i < 4; i++) await lead("NEW");
  // Last month's lead isn't this month's.
  await lead("WON", { valueCents: 100_000, createdAt: lastMonth });
  // Another business's customers, worth a lot.
  const theirForm = await db.leadForm.create({ data: { organizationId: OTHER, slug: `${TAG}-their-form`, name: "Q", headline: "Q", description: "d", thankYou: "t", fieldsJson: "[]" } });
  for (let i = 0; i < 10; i++) await db.lead.create({ data: { organizationId: OTHER, leadFormId: theirForm.id, answersJson: "{}", status: "WON", valueCents: 5_000_000, mairoCampaignId: `${TAG}-theirs`, createdAt: recently } });

  // The AI team's work.
  await decision(ORG, "test", { kind: "test-variation", category: "TESTING", status: "APPLIED", decidedAt: recently, createdAt: recently });
  await decision(ORG, "auto", { status: "APPLIED", automatic: true, decidedAt: recently, createdAt: recently });
  await decision(ORG, "measured", { status: "APPLIED", decidedAt: lastMonth, createdAt: lastMonth, verdict: "INCONCLUSIVE", verdictAt: recently });
  await decision(ORG, "pending", { status: "PENDING", createdAt: recently });
  await decision(ORG, "declined", { status: "REJECTED", decidedAt: recently, createdAt: recently });
  for (let i = 0; i < 5; i++) await decision(OTHER, `theirs-${i}`, { status: "APPLIED", decidedAt: recently, createdAt: recently, category: "TESTING" });
  await finding(ORG, "quality:low");
  await finding(OTHER, "quality:low");
  await db.mairoInsight.create({ data: { organizationId: ORG, type: "cost-rising", category: "PERFORMANCE", severity: "ATTENTION", confidence: "MEDIUM", title: "Cost per lead rising", happened: "h", happenedAdvanced: "h", whyItMatters: "w", recommendation: "r", reason: "r", ifApproved: "i", evidenceJson: "[]", basedOnJson: "[]", dedupeKey: `${TAG}-insight`, createdAt: recently } });
  await db.weeklyReport.create({ data: { organizationId: ORG, weekStart: new Date(now.getTime() - 8 * 86_400_000), weekEnd: new Date(now.getTime() - 86_400_000), dataJson: "{}", generatedAt: recently } });
  await db.agentRun.create({ data: { organizationId: ORG, agent: "ANALYST", task: "team-review", status: "DONE", startedAt: recently, finishedAt: recently } });
  await db.agentRun.create({ data: { organizationId: ORG, agent: "ANALYST", task: "team-review", status: "FAILED", startedAt: recently } });
  await db.agentRun.create({ data: { organizationId: OTHER, agent: "ANALYST", task: "team-review", status: "DONE", startedAt: recently, finishedAt: recently } });
}

async function main() {
  await setup();
  try {
    const range = reportRange(currentMonth(now), now);
    const work = Object.fromEntries((await teamWork(ORG, range)).map((w) => [w.key, w]));

    await check("campaigns count only what Meta accepted", () => assert.equal(work.campaigns.count, 1));
    await check("recommendations made this month, whatever was decided", () => assert.equal(work.recommendations.count, 4));
    await check("optimizations carried out: approved and within limits, said apart", () => {
      assert.equal(work.optimizations.count, 2);
      assert.match(work.optimizations.detail, /1 you approved/);
      assert.match(work.optimizations.detail, /1 within limits you set/);
    });
    await check("issues: problems caught plus Performance Coach findings", () => assert.equal(work.issues.count, 2));
    await check("experiments: an ad test started plus a change measured before and after", () => {
      assert.equal(work.experiments.count, 2);
      assert.match(work.experiments.detail, /1 ad test started on Meta/);
    });
    await check("reports: a weekly report and a finished daily review — not the failed one", () => assert.equal(work.reports.count, 2));
    await check("each kind of work says when it last happened", () => assert.ok(work.campaigns.latestAt && work.reports.latestAt && work.experiments.latestAt));
    await check("since the start includes last month's change too", async () => {
      const all = Object.fromEntries((await teamWork(ORG, null)).map((w) => [w.key, w]));
      assert.equal(all.optimizations.count, 3);
    });

    const report = await viaMeta(() => monthlyReport(ORG, currentMonth(now), { now }));
    const m = Object.fromEntries(report.outcomes.metrics.map((x) => [x.key, x.value]));
    await check("Meta is only read", () => assert.ok(methods.length > 0 && methods.every((x) => x === "GET"), methods.join(",")));
    await check("a roofer is shown leads and appointments", () => {
      assert.equal(report.kind, "leads");
      assert.match(report.kindWhy, /campaigns aim for enquiries/);
      assert.ok(report.partial && report.label.endsWith("so far"));
    });
    await check("the month adds up from the business's own records", () => {
      assert.equal(m.spend, "$600.00");
      assert.equal(m.leads, "25");
      assert.equal(m.qualified, "4");
      assert.equal(m.booked, "2");
      assert.equal(m.customers, "1");
      assert.equal(m.costPerQualified, "$150.00");
      assert.equal(m.cac, "$600.00");
      assert.equal(m.verifiedRevenue, "$9,400");
      assert.equal(m.roas, "15.7×");
    });
    await check("the budget suggestion waits while lead quality is looked into", () => {
      assert.equal(report.recommendedNextCents, 60_000);
      assert.match(report.recommendationWhy, /lead quality/);
    });
    await check("nothing private about a lead reaches the report or its download", () => {
      const all = JSON.stringify(report) + reportAsText(report, "Peak Roofing");
      for (const v of Object.values(PRIVATE)) assert.ok(!all.includes(v), v);
    });
    await check("another business sees only its own month", async () => {
      const theirs = await viaMeta(() => monthlyReport(OTHER, currentMonth(now), { now }));
      const t = Object.fromEntries(theirs.outcomes.metrics.map((x) => [x.key, x.value]));
      assert.equal(t.customers, "10");
      assert.equal(t.leads, "10");
      const theirWork = Object.fromEntries(theirs.team.map((w) => [w.key, w.count]));
      assert.equal(theirWork.optimizations, 5);
      assert.equal(theirWork.campaigns, 1);
      // And ours didn't pick up theirs.
      assert.equal(work.optimizations.count, 2);
      assert.ok(!JSON.stringify(report).includes("Someone Else"));
    });
    await check("a Meta that can't be read isn't reported as a month with nothing in it", async () => {
      const down: typeof fetch = async () => new Response(JSON.stringify({ error: { message: "Error validating access token", code: 190 } }), { status: 400 });
      const r = await withGraphTransport({ fetch: down, record: false }, () => monthlyReport(ORG, currentMonth(now), { now }));
      assert.equal(r.thin, false);
      assert.ok(r.metaProblem, "says Meta couldn't be read");
      assert.ok(!/Nothing ran/.test(r.summary), r.summary);
      assert.equal(r.outcomes.metrics.find((x) => x.key === "spend")?.value, null);
      assert.match(r.outcomes.metrics.find((x) => x.key === "spend")?.missing?.why ?? "", /couldn't read Meta/);
    });
  } finally {
    await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  }
  console.log(`\nResults (database): ${passed} checks passed`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } }).catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
