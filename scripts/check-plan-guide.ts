// Checks the free plan's guide: channel advice sized to the budget, exactly
// three creative directions, the tracking each destination needs, a slower
// testing schedule at small budgets, facts kept apart from MAIRO's
// assumptions, and no promised results anywhere. Pure — no database, no AI.
//
//   npm run check:plan-guide

import assert from "node:assert/strict";
import { plainStrategy, type StrategyInput } from "../src/lib/ai/strategy";
import { RETARGET_FROM, SLOW_BELOW, TEST_FROM, type StrategyContent } from "../src/lib/strategy/plan-logic";
import { economicsFromSale, economicsFromService } from "../src/lib/calc/assumptions";
import { breakEven, saleEconomics, serviceEconomics } from "../src/lib/calc/economics";
import { channelAdvice, creativeDirections, factsAndAssumptions, landingIssues, testingSchedule, trackingNeeds } from "../src/lib/strategy/plan-guide";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const input: StrategyInput = {
  businessName: "Northside Plumbing",
  industry: "Plumbing",
  goal: "LEADS",
  monthlyBudgetCents: 60000,
  destination: "LEAD_FORM",
  website: "https://northside.example",
  targetAudience: null,
  brandVoice: null,
  competitors: null,
  notes: null,
  offering: "Emergency plumbing repairs",
  offer: null,
  location: null,
  brainBrief: null,
  siteIssues: [],
  purchaseTracking: false,
};
const plan = plainStrategy(input);
const at = (daily: number, extra: Partial<StrategyContent> = {}): StrategyContent => ({ ...plan, dailyBudget: daily, ...extra });
const none = { pixelActive: false, storeConnected: false };

const PROMISE = /\b(guarantee[ds]?|will (get|bring|deliver|generate|double|triple)|\d+\s?x (more|return)|roas of|expect \d+|you'll get \d+)/i;

console.log("— channel —");
check("below the testing threshold, the budget stays in one campaign with one audience", () => {
  const a = channelAdvice(at(TEST_FROM - 1));
  assert.match(a.channel, /one campaign/);
  assert.match(a.focusWhy, /one campaign with one audience/);
  assert.match(a.focusWhy, /too little to tell/);
});
check("with room to test, it compares audiences inside the same campaign — still one channel", () => {
  const a = channelAdvice(at(TEST_FROM));
  assert.match(a.focusWhy, /two audiences inside one campaign/);
  assert.match(a.channel, /^Meta/);
});
check("it never recommends a network MAIRO doesn't run", () => {
  const a = channelAdvice(plan);
  assert.match(a.notOffered, /doesn't run Google, TikTok/);
  assert.doesNotMatch(a.channel, /Google|TikTok/);
});

console.log("\n— creative directions —");
check("there are always exactly three, even when the plan has fewer concepts", () => {
  assert.equal(creativeDirections(plan).length, 3);
  assert.equal(creativeDirections(at(plan.dailyBudget, { concepts: [] })).length, 3);
  assert.equal(creativeDirections(at(plan.dailyBudget, { concepts: plan.concepts.slice(0, 1) })).length, 3);
});
check("the three directions are different", () => {
  for (const p of [plan, at(plan.dailyBudget, { concepts: [] })]) {
    const titles = creativeDirections(p).map((d) => d.title);
    assert.equal(new Set(titles).size, 3, titles.join(" / "));
  }
});
check("an offer the business doesn't run is never invented", () => {
  const dirs = creativeDirections(at(plan.dailyBudget, { concepts: [], offer: "" }));
  assert.match(dirs[2].angle, /one simple next step/);
  const withOffer = creativeDirections(at(plan.dailyBudget, { concepts: [], offer: "Free call-out this month" }));
  assert.match(withOffer[2].angle, /Free call-out this month/);
});

console.log("\n— tracking —");
check("a lead form needs nothing installed, but leads still need marking", () => {
  const needs = trackingNeeds(at(20, { goal: "LEADS", campaignType: "LEAD_FORM" }), none);
  assert.equal(needs.find((n) => /lead form/i.test(n.what))?.status, "not needed");
  assert.equal(needs.find((n) => /Marking what became/.test(n.what))?.status, "needed");
  assert.equal(needs.some((n) => /pixel/i.test(n.what)), false);
});
check("website enquiries need the pixel and a thank-you page, and say when they're in place", () => {
  const p = at(20, { goal: "LEADS", campaignType: "LEADS_WEBSITE" });
  assert.deepEqual(trackingNeeds(p, none).filter((n) => n.href === "/dashboard/tracking").map((n) => n.status), ["needed", "needed"]);
  assert.deepEqual(trackingNeeds(p, { ...none, pixelActive: true }).filter((n) => n.href === "/dashboard/tracking").map((n) => n.status), ["in place", "in place"]);
});
check("sales need the pixel and store orders, each judged separately", () => {
  const p = at(20, { goal: "SALES", campaignType: "SALES_WEBSITE" });
  const needs = trackingNeeds(p, { pixelActive: true, storeConnected: false });
  assert.equal(needs.find((n) => /pixel/i.test(n.what))?.status, "in place");
  assert.equal(needs.find((n) => /Orders/.test(n.what))?.status, "needed");
  assert.equal(needs.some((n) => /Marking/.test(n.what)), false);
});
check("calls and messages say what Meta can't see", () => {
  assert.match(trackingNeeds(at(20, { goal: "LEADS", campaignType: "CALLS" }), none)[0].why, /can't hear the call/);
  assert.match(trackingNeeds(at(20, { goal: "ENGAGEMENT", campaignType: "MESSAGES" }), none)[0].why, /You mark which/);
});

console.log("\n— testing schedule —");
check("small budgets get a slower schedule that allows keeping on collecting data", () => {
  const slow = testingSchedule(at(SLOW_BELOW - 1));
  assert.equal(slow[0].when, "Weeks 1–2");
  assert.match(slow[2].why, /keep collecting data/);
  const normal = testingSchedule(at(SLOW_BELOW));
  assert.equal(normal[0].when, "Week 1");
});
check("the first phase changes nothing, and each test changes one thing", () => {
  const s = testingSchedule(plan);
  assert.match(s[0].what, /change nothing/);
  assert.match(s[1].what, /^Test one thing/);
});
check("audience tests and retargeting only appear once the budget can carry them", () => {
  assert.doesNotMatch(testingSchedule(at(TEST_FROM - 1))[1].what, /audience/);
  assert.match(testingSchedule(at(TEST_FROM))[1].what, /second audience/);
  assert.equal(testingSchedule(at(RETARGET_FROM - 1)).some((s) => /retargeting/.test(s.what)), false);
  assert.equal(testingSchedule(at(RETARGET_FROM)).some((s) => /retargeting/.test(s.what)), true);
});

console.log("\n— facts and assumptions —");
check("what the owner didn't say is listed as an assumption with a way to fix it", () => {
  const { facts, assumptions } = factsAndAssumptions(plan, { website: "https://northside.example", pagesRead: [], offering: "Emergency plumbing repairs", location: null, offer: null, targetAudience: null, monthlyBudgetCents: null });
  assert.deepEqual(facts.map((f) => f.label), ["What you do", "Website"]);
  assert.equal(facts[1].source, "Not read yet");
  assert.deepEqual(assumptions.map((a) => a.href), ["#plan-audience", "#plan-budget", "#plan-offer", "/tools/service-lead-economics", "#plan-audience"]);
  assert.match(assumptions[1].assumed, /weren't sure/);
  assert.match(assumptions[2].assumed, /won't promise a discount/);
});
check("what the owner did say is a fact with its source, and pages read are named", () => {
  const { facts, assumptions } = factsAndAssumptions(plan, { website: "https://northside.example", pagesRead: ["https://northside.example/", "https://northside.example/services"], offering: "Repairs", location: "Leeds", offer: "Free quote", targetAudience: "Homeowners", monthlyBudgetCents: 60000 });
  // Everything they said is a fact; the one thing left is a break-even they haven't worked out.
  assert.deepEqual(assumptions.map((a) => a.label), ["Most a lead can cost"]);
  assert.match(facts.find((f) => f.label === "Website")!.source, /^Read: .*services/);
  assert.equal(facts.find((f) => f.label === "Monthly budget")!.value, "$600");
});

console.log("\n— landing page —");
check("issues from the website reading come first, the plan's own advice is not repeated, and the list is capped", () => {
  const p = at(20, { website: ["No phone number above the fold", "Slow on phones"] });
  const issues = landingIssues(p, [{ issue: "Slow on phones", fix: "Compress images", severity: "high" }]);
  assert.deepEqual(issues.map((i) => i.issue), ["Slow on phones", "No phone number above the fold"]);
  assert.equal(issues[0].severity, "high");
  const many = landingIssues(at(20, { website: [] }), Array.from({ length: 10 }, (_, i) => ({ issue: `Issue ${i}`, fix: "" })));
  assert.equal(many.length, 6);
});

console.log("\n— the owner's own numbers —");
const svc = serviceEconomics({ jobValue: 600, jobCost: 200, rates: { mode: "two-step", leadToBookingPct: 50, bookingToSalePct: 40 }, reservePerJob: 100 });
const leadNums = svc.ok ? economicsFromService(svc.value, 600, "USD", "service-lead-economics") : null;
const saleR = saleEconomics({ price: 100, productCost: 60 });
const saleNums = saleR.ok ? economicsFromSale(saleR.value, breakEven(saleR.value), "USD", "break-even-roas") : null;
const noFacts = { website: null, pagesRead: [], offering: null, location: null, offer: null, targetAudience: null, monthlyBudgetCents: null };
check("with the owner's lead numbers, they're plan facts and the test is measured against them", () => {
  const p = at(20, { goal: "LEADS" });
  const { facts, assumptions } = factsAndAssumptions(p, { ...noFacts, economics: leadNums });
  assert.ok(facts.some((f) => f.label === "Most a lead can cost" && /\$80\.00/.test(f.value) && /you chose to use it/.test(f.source)));
  assert.ok(!assumptions.some((a) => /Most a lead/.test(a.label)));
  const decide = testingSchedule(p, leadNums).find((x) => /Compare/.test(x.what))!;
  assert.match(decide.what, /\$60\.00 per lead \(break-even \$80\.00\)/);
  assert.match(decide.why, /Above \$80\.00 a lead costs more than it brings in/);
  assert.match(decide.why, /about 4 days of budget/);
});
check("without numbers, a sales or leads plan says it had to judge by cost alone — and links the calculator", () => {
  const s1 = factsAndAssumptions(at(20, { goal: "SALES" }), noFacts).assumptions.find((a) => a.label === "Most a sale can cost")!;
  assert.equal(s1.href, "/tools/break-even-roas");
  const l1 = factsAndAssumptions(at(20, { goal: "LEADS" }), noFacts).assumptions.find((a) => a.label === "Most a lead can cost")!;
  assert.equal(l1.href, "/tools/service-lead-economics");
  assert.ok(!factsAndAssumptions(at(20, { goal: "AWARENESS" }), noFacts).assumptions.some((a) => /can cost/.test(a.label)));
  assert.match(testingSchedule(at(20, { goal: "LEADS" }), null).find((x) => /Compare/.test(x.what))!.what, /per qualified lead or per sale/);
});
check("numbers for another goal aren't used, and another currency is never compared with the budget", () => {
  const p = at(20, { goal: "LEADS" });
  assert.ok(!factsAndAssumptions(p, { ...noFacts, economics: saleNums }).facts.some((f) => /can cost/.test(f.label)));
  assert.doesNotMatch(testingSchedule(p, saleNums).map((x) => x.what).join(" "), /your number/);
  const gbp = leadNums ? { ...leadNums, currency: "GBP" as const } : null;
  const why = testingSchedule(p, gbp).find((x) => /Compare/.test(x.what))!.why;
  assert.match(why, /£80\.00/);
  assert.doesNotMatch(why, /days of budget/);
});

console.log("\n— no promises —");
check("nothing in the guide promises a number of leads, sales or returns", () => {
  for (const daily of [5, SLOW_BELOW, RETARGET_FROM, TEST_FROM, 200]) {
    for (const campaignType of ["LEAD_FORM", "LEADS_WEBSITE", "CALLS", "MESSAGES", "SALES_WEBSITE"] as const) {
      const p = at(daily, { campaignType, goal: campaignType === "SALES_WEBSITE" ? "SALES" : campaignType === "MESSAGES" ? "ENGAGEMENT" : "LEADS" });
      const nums = p.goal === "SALES" ? saleNums : leadNums;
      const text = JSON.stringify([channelAdvice(p), trackingNeeds(p, none), testingSchedule(p), testingSchedule(p, nums), creativeDirections(p), factsAndAssumptions(p, { website: null, pagesRead: [], offering: null, location: null, offer: null, targetAudience: null, monthlyBudgetCents: null }), factsAndAssumptions(p, { website: null, pagesRead: [], offering: null, location: null, offer: null, targetAudience: null, monthlyBudgetCents: null, economics: nums })]);
      assert.doesNotMatch(text, PROMISE, `${daily}/${campaignType}`);
    }
  }
});

console.log(`\n${passed} checks passed.`);
