// Checks the free AI ad plan's strategy core (src/lib/preview/strategy.ts):
//
//   - the budget split always adds up to the visitor's own figure, and moves
//     with the budget, the goal and the business — not one split for all;
//   - retargeting, testing and new audiences appear only when the budget and
//     the website can support them, and the plan says why when they don't;
//   - how many ads run at once follows the campaign builder's own rule;
//   - the first 30 days are planned actions with approval, never promises;
//   - no text forecasts sales, leads, returns or reach.
//
//   npm run check:strategy   (pure)

import assert from "node:assert/strict";
import { budgetPlan, firstMonth, setupGoalFor, budgetLabel, BUDGET_CHOICES, GOAL_OPTIONS, type BudgetInput } from "../src/lib/preview/strategy";
import { buildPreview, emptyFacts, type PreviewGoal, type PreviewKind } from "../src/lib/preview/build";
import { BANNED_CLAIMS } from "../src/lib/capabilities";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const FORECAST = /\bguarantee|\bwill (get|bring|deliver|generate|double|increase)\b|\bexpect(ed)? \d|\b\d+\s*(leads|sales|customers|bookings|visits|clicks) (a|per|each) (day|week|month)|\broas of\b|\bprojected\b/i;
const base = (patch: Partial<BudgetInput>): BudgetInput => ({ monthly: 1000, goal: "sales", kind: "shop", hasWebsite: true, pixelSeen: true, usesLeadForm: false, ...patch });
const GOALS: PreviewGoal[] = ["sales", "leads", "bookings", "traffic", "awareness"];
const KINDS: PreviewKind[] = ["shop", "service", "appointments"];
const sum = (b: ReturnType<typeof budgetPlan>) => b.lines.reduce((t, l) => t + l.monthly, 0);

console.log("— the budget split —");
check("every split adds up to the visitor's budget, for every goal, business and budget", () => {
  for (const goal of GOALS) for (const kind of KINDS) for (const monthly of [...BUDGET_CHOICES, 150, 750, 1800, 12_345]) for (const pixelSeen of [true, false, null]) {
    const b = budgetPlan(base({ monthly, goal, kind, pixelSeen }));
    assert.equal(sum(b), monthly, `${goal}/${kind}/${monthly}`);
    assert.ok(b.lines.every((l) => l.monthly >= 0 && l.why.length > 20), `${goal}/${kind}/${monthly}: every line says why`);
    assert.ok(Math.abs(b.daily - monthly / 30.4) < 0.01);
  }
});
check("$1,000 for an online shop: prospecting, retargeting and testing — the brief's example", () => {
  const b = budgetPlan(base({}));
  assert.deepEqual(b.lines.map((l) => [l.key, l.monthly]), [["prospecting", 650], ["retargeting", 200], ["testing", 150]]);
  assert.equal(b.adsAtOnce, 3);
});
check("the split depends on the business, not one formula: a local service retargets less", () => {
  const shop = budgetPlan(base({}));
  const service = budgetPlan(base({ goal: "leads", kind: "service" }));
  assert.notDeepEqual(shop.lines.map((l) => l.monthly), service.lines.map((l) => l.monthly));
  assert.equal(service.lines.find((l) => l.key === "retargeting")!.monthly, 150);
});
check("small budgets: no retargeting, no separate test, fewer ads at once — and the plan says why", () => {
  const b = budgetPlan(base({ monthly: 300 }));
  assert.deepEqual(b.lines.map((l) => l.key), ["prospecting"]);
  assert.equal(b.adsAtOnce, 1);
  assert.ok(b.notes.some((n) => /No retargeting yet: at \$300 a month/.test(n)));
  assert.ok(b.notes.some((n) => /No separate testing budget/.test(n) && /other two wait/.test(n)));
  assert.ok(b.notes.some((n) => /Meta learns slowly/.test(n)));
  assert.equal(budgetPlan(base({ monthly: 500 })).adsAtOnce, 2);
});
check("retargeting waits for a pixel, and isn't offered for traffic or awareness", () => {
  assert.ok(!budgetPlan(base({ pixelSeen: false })).lines.some((l) => l.key === "retargeting"));
  assert.ok(budgetPlan(base({ pixelSeen: false })).notes.some((n) => /no Meta pixel/.test(n)));
  for (const goal of ["traffic", "awareness"] as const) {
    const b = budgetPlan(base({ goal, monthly: 2500 }));
    assert.ok(!b.lines.some((l) => l.key === "retargeting"), goal);
    assert.ok(b.notes.some((n) => /No retargeting/.test(n)), goal);
  }
  assert.equal(budgetPlan(base({ goal: "awareness" })).lines[0].key, "reach");
});
check("a lead form can retarget people who opened it, with no website at all", () => {
  const b = budgetPlan(base({ goal: "leads", kind: "service", hasWebsite: false, pixelSeen: null, usesLeadForm: true }));
  assert.match(b.lines.find((l) => l.key === "retargeting")!.why, /opened your form/);
  assert.ok(!budgetPlan(base({ goal: "leads", kind: "service", hasWebsite: false, pixelSeen: null, usesLeadForm: false })).lines.some((l) => l.key === "retargeting"));
});
check("$5,000+: a new audience test, and a note to give the real figure", () => {
  const b = budgetPlan(base({ monthly: 5000 }));
  assert.ok(b.lines.some((l) => l.key === "audiences"));
  assert.ok(b.notes.some((n) => /Planned at \$5,000/.test(n)));
  assert.equal(budgetLabel(5000), "$5,000+");
  assert.equal(budgetLabel(1200), "$1,200");
});
check("different budgets give different plans", () => {
  const plans = BUDGET_CHOICES.map((m) => JSON.stringify(budgetPlan(base({ monthly: m })).lines.map((l) => [l.key, l.monthly])));
  assert.equal(new Set(plans).size, BUDGET_CHOICES.length);
});

console.log("\n— the first 30 days —");
check("four weeks of planned actions, with approval before anything runs", () => {
  for (const goal of GOALS) {
    const w = firstMonth({ ...base({ goal }), firstAd: "Straight to the point" });
    assert.deepEqual(w.map((x) => x.week), [1, 2, 3, 4]);
    const text = JSON.stringify(w);
    assert.match(text, /approve/i);
    assert.match(text, /Straight to the point/);
    assert.doesNotMatch(text, FORECAST, goal);
  }
  assert.match(JSON.stringify(firstMonth({ ...base({ goal: "leads", kind: "service", usesLeadForm: true }), firstAd: "x" })), /lead form/);
  assert.match(JSON.stringify(firstMonth({ ...base({ monthly: 300 }), firstAd: "x" })), /Finish your first ad,/);
});

console.log("\n— honesty —");
check("no forecasts or banned claims anywhere in the strategy", () => {
  for (const goal of GOALS) for (const kind of KINDS) for (const monthly of BUDGET_CHOICES) {
    const t = JSON.stringify([budgetPlan(base({ goal, kind, monthly })), firstMonth({ ...base({ goal, kind, monthly }), firstAd: "x" })]);
    assert.doesNotMatch(t, FORECAST, `${goal}/${kind}/${monthly}`);
    for (const b of BANNED_CLAIMS) assert.doesNotMatch(t, b.pattern, b.why);
  }
});
check("the five goals map onto setup's goals and build plans that differ", () => {
  assert.deepEqual(GOAL_OPTIONS.map((g) => g.value), GOALS);
  assert.deepEqual(GOALS.map(setupGoalFor), ["SALES", "LEADS", "LEADS", "TRAFFIC", "AWARENESS"]);
  const f = { ...emptyFacts("https://shop.example"), name: "Nova Clothing", offering: "Premium streetwear", sources: {} };
  const objectives = GOALS.map((goal) => buildPreview({ ...f, goal }, { quick: true })!.plan.objective);
  assert.equal(new Set(objectives).size, 5);
  assert.match(buildPreview({ ...f, goal: "awareness" }, { quick: true })!.firstCampaign.judgedOn, /reach 1,000 people/);
});

console.log(`\nStrategy: ${passed} checks passed`);
