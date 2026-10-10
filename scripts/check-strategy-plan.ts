// Checks the free MAIRO Advertising Plan's rules: dependent recommendations,
// suggestions, the plain-language request reader, the approved-vs-real
// comparison and the Create draft prefill. Pure — no database, no AI.
//
//   npm run check:strategy-plan

import assert from "node:assert/strict";
import { plainStrategy, finishPlan, dailyFromMonthly, type StrategyInput } from "../src/lib/ai/strategy";
import {
  applyEdit,
  applyEdits,
  applySuggestion,
  changedSections,
  parseRequest,
  patchToEdits,
  revisionSummary,
  strategySchema,
  suggestionFor,
  type StrategyContent,
} from "../src/lib/strategy/plan-logic";
import { compareWithPlan, platformsOfPlacements, type RealCampaign } from "../src/lib/strategy/compare";
import { campaignPlanFromStrategy } from "../src/lib/strategy/campaign";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const input: StrategyInput = {
  businessName: "Sunrise Dental",
  industry: "Dental practice",
  goal: "LEADS",
  monthlyBudgetCents: 150000,
  destination: "PHONE_CALL",
  website: "https://sunrisedental.example",
  targetAudience: "Families nearby",
  brandVoice: null,
  competitors: null,
  notes: null,
  offering: "Teeth whitening",
  offer: "20% off your first visit",
  location: "Austin, TX",
  brainBrief: null,
  siteIssues: [],
  purchaseTracking: false,
};
const ctx = { purchaseTracking: false };
const base = plainStrategy(input);

check("plain plan is valid and uses the business's own answers", () => {
  assert.equal(strategySchema.safeParse(base).success, true);
  assert.equal(base.dailyBudget, 50);
  assert.equal(base.goal, "LEADS");
  assert.equal(base.campaignType, "CALLS");
  assert.equal(base.audience.location, "Austin, TX");
  assert.equal(base.offer, "20% off your first visit");
  assert.deepEqual(base.platforms, ["FACEBOOK", "INSTAGRAM"]);
  assert.deepEqual(base.split.map((s) => s.percent), [80, 20]);
  assert.equal(base.structure.filter((s) => s.level === "Ad set").length, 2);
  assert.ok(!JSON.stringify(base).toLowerCase().includes("tiktok"));
});

check("monthly budget becomes a daily one, never below $5", () => {
  assert.equal(dailyFromMonthly(150000), 50);
  assert.equal(dailyFromMonthly(5000), 5);
});

check("lowering the budget below $30 updates split, retargeting and structure — with reasons", () => {
  const r = applyEdit(base, { section: "budget", dailyBudget: 20 }, ctx);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.plan.dailyBudget, 20);
  assert.deepEqual(r.plan.split.map((s) => s.percent), [100]);
  assert.match(r.plan.retargeting, /Hold retargeting/);
  assert.equal(r.plan.structure.filter((s) => s.level === "Ad set").length, 1);
  const sections = r.changes.map((c) => c.section);
  assert.deepEqual(sections.slice(0, 1), ["budget"]);
  for (const s of ["split", "retargeting", "structure"]) assert.ok(sections.includes(s as never), s);
  for (const c of r.changes) assert.ok(c.reason.length > 5, `reason for ${c.section}`);
  assert.equal(r.changes.find((c) => c.section === "budget")!.previous, "$50/day (about $1,500/month)");
  assert.equal(r.changes.find((c) => c.section === "split")!.dependent, true);
  assert.match(r.plan.budgetWhy, /one ad set/);
});

check("raising the budget to $60+ adds a second new-customer ad set", () => {
  const r = applyEdit(base, { section: "budget", dailyBudget: 75 }, ctx);
  assert.ok(r.ok && r.plan.structure.filter((s) => s.level === "Ad set").length === 3);
});

check("a very low budget brings a suggestion, not a forced change", () => {
  const r = applyEdit(base, { section: "budget", dailyBudget: 8 }, ctx);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.plan.dailyBudget, 8);
  assert.equal(r.suggestion?.id, "budget-floor");
  assert.equal(r.suggestion?.patch.dailyBudget, 10);
});

check("budget out of range is refused", () => {
  assert.equal(applyEdit(base, { section: "budget", dailyBudget: 2 }, ctx).ok, false);
  assert.equal(applyEdit(base, { section: "budget", dailyBudget: 99999 }, ctx).ok, false);
});

check("one platform keeps the choice and offers both as a suggestion", () => {
  const r = applyEdit(base, { section: "platforms", platforms: ["INSTAGRAM"] }, ctx);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.plan.platforms, ["INSTAGRAM"]);
  assert.equal(r.suggestion?.id, "both-platforms");
  const back = applySuggestion(r.plan, r.suggestion!.patch);
  assert.deepEqual(back.plan.platforms, ["FACEBOOK", "INSTAGRAM"]);
  assert.equal(back.changes[0].reason, "You accepted MAIRO's suggestion.");
  assert.equal(applyEdit(base, { section: "platforms", platforms: [] }, ctx).ok, false);
});

check("changing the goal updates a campaign type built for the old goal", () => {
  const r = applyEdit(base, { section: "goal", goal: "TRAFFIC" }, ctx);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.plan.campaignType, "TRAFFIC");
  const typeChange = r.changes.find((c) => c.section === "campaignType");
  assert.ok(typeChange?.dependent && /goal changed/.test(typeChange.reason));
});

check("sales without purchase tracking suggests starting with traffic", () => {
  const r = applyEdit(base, { section: "goal", goal: "SALES" }, ctx);
  assert.ok(r.ok && r.suggestion?.id === "sales-tracking");
  const tracked = applyEdit(base, { section: "goal", goal: "SALES" }, { purchaseTracking: true });
  assert.ok(tracked.ok && tracked.suggestion === null);
});

check("a campaign type that doesn't fit the goal is kept but questioned", () => {
  const r = applyEdit(base, { section: "campaignType", campaignType: "AWARENESS" }, ctx);
  assert.ok(r.ok && r.plan.campaignType === "AWARENESS" && r.suggestion?.id === "type-goal");
});

check("a narrow age range on a small budget brings a suggestion", () => {
  const r = applyEdit(base, { section: "audience", location: "Austin, TX", ageMin: 30, ageMax: 35, interests: [] }, ctx);
  assert.ok(r.ok && r.suggestion?.id === "age-span");
  assert.equal(applyEdit(base, { section: "audience", location: "", ageMin: 50, ageMax: 30, interests: [] }, ctx).ok, false);
});

check("no-op edits change nothing", () => {
  const r = applyEdit(base, { section: "budget", dailyBudget: 50 }, ctx);
  assert.ok(r.ok && r.changes.length === 0);
});

check("plain requests are read without the AI", () => {
  assert.equal(parseRequest("Change my budget to $35/day")?.dailyBudget, 35);
  assert.equal(parseRequest("Lower the budget to $600 a month")?.dailyBudget, 20);
  assert.deepEqual(parseRequest("Only run on Instagram")?.platforms, ["INSTAGRAM"]);
  const who = parseRequest("Target people in Miami aged 25-40");
  assert.equal(who?.location, "Miami");
  assert.equal(who?.ageMin, 25);
  assert.equal(who?.ageMax, 40);
  assert.equal(parseRequest("I want the goal to be more leads")?.goal, "LEADS");
  assert.equal(parseRequest("Focus on getting more sales")?.goal, "SALES");
  assert.equal(parseRequest("Promote our Invisalign treatment")?.product, "Invisalign treatment");
  assert.equal(parseRequest("Add 15% off for new patients")?.offer, "15% off for new patients");
  assert.equal(parseRequest("Make the hooks funnier"), null);
});

check("several requested changes merge into one entry per section", () => {
  const patch = parseRequest("Change my budget to $20/day and only run on Facebook")!;
  const r = applyEdits(base, patchToEdits(base, patch), ctx, "You asked for this.");
  assert.ok(r.ok);
  if (!r.ok) return;
  const sections = r.changes.map((c) => c.section);
  assert.equal(new Set(sections).size, sections.length);
  assert.ok(sections.includes("budget") && sections.includes("platforms"));
  assert.equal(r.changes.find((c) => c.section === "budget")!.previous, "$50/day (about $1,500/month)");
  assert.match(revisionSummary(r.changes), /Platforms: Facebook \+ Instagram → Facebook/);
});

check("changedSections sees exactly what moved", () => {
  const next: StrategyContent = { ...base, hooks: ["A new hook"] };
  assert.deepEqual(changedSections(base, next), ["hooks"]);
});

check("suggestionFor stays quiet when nothing's worth raising", () => {
  assert.equal(suggestionFor(base, "budget", ctx), null);
  assert.equal(suggestionFor(base, "platforms", ctx), null);
});

const real: RealCampaign = {
  objective: "LEADS",
  budgetType: "DAILY",
  totalDailyBudgetCents: 5000,
  lifetimeBudgetCents: null,
  destinationType: "PHONE_CALL",
  geoLabel: "Austin, Texas",
  geoRadius: 10,
  ageMin: base.audience.ageMin,
  ageMax: base.audience.ageMax,
  advantageAudience: false,
  placements: [],
  ads: [{ headline: "Whiter teeth in one visit", primaryText: "…", kind: "GENERATED" }],
  adSets: 1,
};

check("a campaign built as approved matches row by row", () => {
  const rows = compareWithPlan(base, real, { pixelActive: false });
  for (const k of ["goal", "budget", "platforms", "audience", "campaignType", "tracking"]) {
    assert.equal(rows.find((r) => r.key === k)?.status, "same", k);
  }
  assert.equal(rows.find((r) => r.key === "creative")?.status, "explained");
  // The plan has two ad sets at $50/day; the first build makes one, and says why.
  const structure = rows.find((r) => r.key === "structure")!;
  assert.equal(structure.status, "explained");
  assert.match(structure.note!, /won't add them on its own/);
});

check("differences are flagged and explained", () => {
  const rows = compareWithPlan(base, { ...real, totalDailyBudgetCents: 6500, placements: ["INSTAGRAM_FEED"], ageMin: 30 }, { pixelActive: false });
  const budget = rows.find((r) => r.key === "budget")!;
  assert.equal(budget.status, "different");
  assert.match(budget.note!, /\$15\/day more/);
  assert.equal(rows.find((r) => r.key === "platforms")!.status, "different");
  assert.equal(rows.find((r) => r.key === "audience")!.status, "different");
  const noAds = compareWithPlan(base, { ...real, ads: [] }, { pixelActive: false });
  assert.equal(noAds.find((r) => r.key === "creative")!.status, "different");
});

check("sales without a pixel is never shown as tracked", () => {
  const sales = finishPlan({ ...base, goal: "SALES", campaignType: "SALES_WEBSITE" });
  const rows = compareWithPlan(sales, { ...real, objective: "SALES", destinationType: "WEBSITE" }, { pixelActive: false });
  const tracking = rows.find((r) => r.key === "tracking")!;
  assert.equal(tracking.status, "different");
  assert.match(tracking.real, /can't be counted/);
});

check("placements map back to platforms", () => {
  assert.deepEqual(platformsOfPlacements([]), ["FACEBOOK", "INSTAGRAM"]);
  assert.deepEqual(platformsOfPlacements(["INSTAGRAM_FEED"]), ["INSTAGRAM"]);
  assert.deepEqual(platformsOfPlacements(["FACEBOOK_FEED", "REELS"]), ["FACEBOOK", "INSTAGRAM"]);
});

check("the approved plan prefills the Create draft", () => {
  const org = { name: "Sunrise Dental", website: "https://sunrisedental.example", phone: "+15125550100", defaultMessageChannel: "MESSENGER" as const };
  const p = campaignPlanFromStrategy(base, org, { differentiator: null });
  assert.equal(p.goal, "LEADS");
  assert.equal(p.destinationType, "PHONE_CALL");
  assert.equal(p.destinationValue, "+15125550100");
  assert.equal(p.dailyAmount, 50);
  assert.equal(p.audienceMode, "manual");
  assert.equal(p.ageMin, base.audience.ageMin);
  assert.equal(p.choosingPlacements, false);
  assert.equal(p.promotes, "OFFER");
  assert.equal(p.promotesDetail, "Teeth whitening");
  const ig = campaignPlanFromStrategy({ ...base, platforms: ["INSTAGRAM"] }, org, { differentiator: null });
  assert.deepEqual(ig.placements, ["INSTAGRAM_FEED"]);
  assert.equal(ig.choosingPlacements, true);
});

console.log(`\n${passed} strategy plan checks passed.`);
