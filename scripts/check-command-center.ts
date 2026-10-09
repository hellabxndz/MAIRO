// Checks the AI Team Command Center can't overstate what happened:
//
//   - Every proposed change says what it does to spending and what has to
//     authorize it, and raising spend or launching always needs a person.
//   - A recommendation's trail shows only recorded steps, and "done" only
//     once Meta confirmed it.
//   - The Daily Brief shows the steps left, not figures, before anything has
//     launched.
//
//   npm run check:command-center   (pure; no database, no network)

import assert from "node:assert/strict";
import { approvalFacts, authorizationFor, budgetImpact } from "../src/lib/decisions/approval";
import { ALWAYS_NEEDS_APPROVAL, mayDoAutomatically } from "../src/lib/automation/levels";
import { mayAutoApply } from "../src/lib/decisions/guardrails";
import { buildTrail, contributors, type TrailDecision, type TrailRun } from "../src/lib/team/trail";
import { dailyBrief, type BriefInput } from "../src/lib/team/brief";
import type { DecisionChange } from "../src/lib/decisions/types";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const budget = (name: string, from: number, to: number): DecisionChange => ({ type: "set-budget", platform: "META", mairoCampaignId: name, platformCampaignId: `p-${name}`, externalCampaignId: `e-${name}`, campaignName: name, fromCents: from, toCents: to });
const open = { requireApprovalNewCreatives: false, requireApprovalAudience: false, requireApprovalPlatformShift: false };
const strict = { requireApprovalNewCreatives: true, requireApprovalAudience: true, requireApprovalPlatformShift: true };

console.log("— budget impact and authorization —");
check("raising a budget says how much more is spent", () => {
  const b = budgetImpact([budget("Roofs", 4_000, 5_000)]);
  assert.equal(b.direction, "up");
  assert.match(b.text, /Adds \$10/);
});
check("moving money says the total stays the same", () => {
  const b = budgetImpact([budget("A", 4_000, 3_000), budget("B", 2_000, 3_000)]);
  assert.equal(b.direction, "same");
  assert.match(b.text, /Moves \$10 a day from A to B/);
  assert.match(b.text, /stays the same/);
});
check("cutting spends less; a new ad or a paused ad changes nothing", () => {
  assert.equal(budgetImpact([budget("A", 4_000, 3_000)]).direction, "down");
  assert.match(budgetImpact([{ type: "new-ad-variation", platform: "META", mairoCampaignId: "c", basedOnCampaignAdId: "a", basedOnLabel: "Ad 1", campaignName: "C" }]).text, /No change to what you spend/);
  assert.match(budgetImpact([{ type: "pause-ad", platform: "META", mairoCampaignId: "c", campaignName: "C", externalAdId: "x", adLabel: "Ad 2" } as DecisionChange]).text, /No change to the budget/);
});
check("raising spend needs an explicit yes at every automation level", () => {
  for (const level of ["MANUAL", "ASSISTED", "AUTOPILOT"] as const) {
    const a = authorizationFor([budget("A", 4_000, 6_000)], level, open);
    assert.equal(a.explicit, true, level);
    assert.match(a.text, /never does it on its own/);
    assert.equal(mayAutoApply(level, [budget("A", 4_000, 6_000)], open), false, level);
  }
});
check("launching and spending above a limit are never automatic", () => {
  for (const action of ["launch-campaign", "raise-total-budget", "spend-above-limit"] as const) {
    assert.ok(ALWAYS_NEEDS_APPROVAL.includes(action));
    for (const level of ["MANUAL", "ASSISTED", "AUTOPILOT"] as const) assert.equal(mayDoAutomatically(level, action), false);
  }
});
check("a move within the total says when the automation level may make it", () => {
  const shift = [budget("A", 4_000, 3_000), budget("B", 2_000, 3_000)];
  assert.equal(authorizationFor(shift, "MANUAL", open).explicit, true);
  const assisted = authorizationFor(shift, "ASSISTED", open);
  assert.equal(assisted.explicit, false);
  assert.match(assisted.text, /automation level/);
  assert.match(assisted.text, /Budget Guardian checks/);
});
check("the owner's own switches are respected", () => {
  const ad: DecisionChange[] = [{ type: "new-ad-variation", platform: "META", mairoCampaignId: "c", basedOnCampaignAdId: "a", basedOnLabel: "Ad 1", campaignName: "C" }];
  assert.equal(authorizationFor(ad, "ASSISTED", open).explicit, false);
  assert.equal(authorizationFor(ad, "ASSISTED", strict).explicit, true);
});
check("each change names the specialist responsible", () => {
  assert.equal(approvalFacts({ kind: "shift-budget", category: "BUDGET", changes: [] }, { level: "MANUAL", switches: open }).owner, "OPTIMIZER");
  assert.equal(approvalFacts({ kind: "test-variation", category: "TESTING", changes: [] }, { level: "MANUAL", switches: open }).owner, "CREATIVE");
});

console.log("\n— the collaboration trail —");
const t0 = new Date("2026-10-09T09:30:00Z");
const min = (m: number) => new Date(t0.getTime() + m * 60_000);
const run = (id: string, agent: TrailRun["agent"], task: string, summary: string, m: number, extra: Partial<TrailRun> = {}): TrailRun => ({ id, agent, task, status: "DONE", summary, detail: null, decisionId: null, startedAt: min(m), finishedAt: min(m), ...extra });
const review = [
  run("r1", "ANALYST", "read-results", "Read the latest results for 2 campaigns. In the last 7 days: $412 spent, 23 leads.", 1),
  run("r2", "OPTIMIZER", "recommend", "Recommended: Move $10/day from Gutters to Roofs", 2),
  run("r3", "GUARDIAN", "check-limits", "Checked 1 budget change against your limits — it stays within them.", 3),
];
const decision = (over: Partial<TrailDecision> = {}): TrailDecision => ({ id: "d1", kind: "shift-budget", category: "BUDGET", title: "Move $10/day from Gutters to Roofs", status: "PENDING", automatic: false, source: "daily", createdAt: min(2), decidedAt: null, changes: [budget("Gutters", 4_000, 3_000), budget("Roofs", 2_000, 3_000)], result: null, verdict: null, verdictNote: null, verdictAt: null, ...over });

check("a waiting recommendation: results read, proposed, checked, then waiting for you", () => {
  const trail = buildTrail(decision(), review, []);
  assert.deepEqual(trail.map((s) => s.who), ["ANALYST", "OPTIMIZER", "GUARDIAN", "OWNER"]);
  assert.equal(trail[3].state, "waiting");
  assert.ok(!trail.some((s) => s.who === "META"), "nothing from Meta before it's sent");
  assert.deepEqual(contributors(trail), ["ANALYST", "OPTIMIZER", "GUARDIAN"]);
});
check("carried out: your approval, the checks recorded against it, and what Meta confirmed", () => {
  const runs = [run("x1", "GUARDIAN", "check-approval", "Checked it against your spending limits before it ran — within them.", 30, { decisionId: "d1" }), run("x2", "OPTIMIZER", "apply-approved", "Carried out your approval on Meta: Move $10/day", 31, { decisionId: "d1" })];
  const trail = buildTrail(decision({ status: "APPLIED", decidedAt: min(31), result: [{ label: "Gutters — daily budget", ok: true, error: null }, { label: "Roofs — daily budget", ok: true, error: null }] }), review, runs);
  const said = trail.map((s) => s.did).join(" | ");
  assert.match(said, /You approved it/);
  assert.match(said, /Meta confirmed 2 changes/);
  assert.match(said, /Compares results two weeks after/);
});
check("refused by Meta: never shown as done", () => {
  const trail = buildTrail(decision({ status: "FAILED", decidedAt: min(31), result: [{ label: "Roofs — daily budget", ok: false, error: "Ad account is disabled" }] }), review, []);
  assert.ok(!trail.some((s) => /confirmed/.test(s.did)));
  const meta = trail.find((s) => s.who === "META")!;
  assert.equal(meta.state, "failed");
  assert.match(meta.did, /Ad account is disabled/);
});
check("made within the owner's limits says so", () => {
  const trail = buildTrail(decision({ status: "APPLIED", automatic: true, decidedAt: min(5), result: [{ label: "x", ok: true, error: null }] }), review, []);
  assert.ok(trail.some((s) => s.who === "OWNER" && /automation level you chose/.test(s.did)));
});
check("one proposed in conversation, with no review behind it, shows only what's recorded", () => {
  const trail = buildTrail(decision({ source: "assistant" }), [], []);
  assert.deepEqual(trail.map((s) => s.who), ["OPTIMIZER", "OWNER"]);
  assert.match(trail[0].did, /when you asked/);
});
check("what followed two weeks later is the verdict on record", () => {
  const trail = buildTrail(decision({ status: "APPLIED", decidedAt: min(5), result: [{ label: "x", ok: true, error: null }], verdict: "IMPROVED", verdictNote: "Cost per lead fell from $18 to $14 in the two weeks after. Other things changed too, so this isn't proof.", verdictAt: min(60 * 24 * 14) }), review, []);
  assert.match(trail[trail.length - 1].did, /isn't proof/);
});

console.log("\n— the Daily Brief —");
const briefBase: BriefInput = { now: t0, launched: true, setup: { goal: true, meta: true, plan: true, built: true, launchApproved: true }, results: { summary: "Read the latest results for 2 campaigns.", detail: null, at: min(1) }, leadsLastDay: 3, changes: [], completed: [], issues: [], pending: { count: 0, top: null }, nextReview: min(60 * 24), liveCampaigns: 2 };
check("before anything has launched: the steps left, no figures", () => {
  const b = dailyBrief({ ...briefBase, launched: false, results: null, setup: { goal: true, meta: true, plan: false, built: false, launchApproved: false } });
  assert.equal(b.kind, "onboarding");
  if (b.kind !== "onboarding") return;
  assert.deepEqual(b.steps.map((s) => s.done), [true, true, false, false, false]);
  assert.ok(b.steps.some((s) => /Approve the launch/.test(s.label)));
});
check("once live: results, leads, approvals and the next scheduled analysis", () => {
  const b = dailyBrief({ ...briefBase, pending: { count: 2, top: "Move $10/day" } });
  assert.equal(b.kind, "brief");
  if (b.kind !== "brief") return;
  assert.match(b.results[0].text, /Read the latest results/);
  assert.match(b.results[1].text, /3 new leads/);
  assert.match(b.pending.text, /2 items waiting/);
  assert.equal(b.nextAt?.getTime(), min(60 * 24).getTime());
});
check("nothing live: no scheduled analysis is promised", () => {
  const b = dailyBrief({ ...briefBase, liveCampaigns: 0 });
  assert.ok(b.kind === "brief" && b.nextAt === null && /once a campaign is live/.test(b.next));
});
check("no results read yet is said, not filled in", () => {
  const b = dailyBrief({ ...briefBase, results: null, leadsLastDay: 0 });
  assert.ok(b.kind === "brief" && /No results read yet/.test(b.results[0].text));
});

console.log(`\nCommand Center: ${passed} checks passed`);
