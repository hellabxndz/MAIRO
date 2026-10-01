// Checks the MAIRO Strategy Engine: turning what an owner says into a
// structured objective, industry- and goal-specific strategy, launch stages,
// promotion timing, budget split, confidence wording, the learning loop's
// thresholds, the core rule (no objective, no recommendation), the brief
// every creative carries, the engine's decisions, and the plan built from it.
//
//   npm run check:engine   (needs DATABASE_URL; no AI key or network needed)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { EMPTY_METRICS, type PlatformMetrics } from "../src/lib/ad-platforms/types";
import { DEFAULT_GUARDRAILS } from "../src/lib/decisions/gather";
import { decide } from "../src/lib/decisions/rules";
import type { AdSnapshot, CampaignSnapshot, DecisionInput } from "../src/lib/decisions/types";
import { readRequest, type MissionGoal } from "../src/lib/mission/goals";
import {
  ALLOWED_OBJECTIVES,
  GOAL_PRIORITIES,
  briefFor,
  buildStrategy,
  engineConfidence,
  justifyAction,
  launchStages,
  promotionPlan,
  recommendBudget,
  structureObjective,
  type EngineInsight,
  type StrategyInput,
} from "../src/lib/engine/core";
import { MIN_RESULTS, MIN_SPEND_CENTS, compareGroups, engineInsights, hasOffer, hookStyle } from "../src/lib/engine/learning";
import { engineDrafts, mergeDrafts, type EngineContext } from "../src/lib/engine/recommend";
import { saveInsights, savedInsights } from "../src/lib/engine/index";
import { approveMission, creativeObjective, proposedMission, startMission } from "../src/lib/mission/store";

delete process.env.ANTHROPIC_API_KEY;

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TODAY = "2026-10-01"; // a Thursday
const NOW = new Date("2026-10-01T12:00:00Z");
const DAY = 86_400_000;
const TAG = `zz-engine-${Date.now()}`;

function objective(request: string, industry = "", goal: MissionGoal | null = null, priced = false) {
  return structureObjective({ understood: readRequest(request, TODAY), request, chosenGoal: goal, business: { industry, text: industry, hasPricedProducts: priced } });
}

function strategy(request: string, industry: string, p: Partial<StrategyInput> = {}, goal: MissionGoal | null = null) {
  return buildStrategy({
    objective: objective(request, industry, goal),
    business: { name: "Test Co", offers: [], pixelActive: false, hasVideo: false, scale: false, location: null },
    marketing: { monthlyBudgetCents: 90_000, currentDailyCents: 0, campaignsRunning: 0, promotion: null, promotionsLast30Days: 0, hasPromoCreative: false },
    data: { spendCents: 0, results: 0 },
    insights: [],
    today: TODAY,
    ...p,
  });
}

const m = (p: Partial<PlatformMetrics>): PlatformMetrics => ({ ...EMPTY_METRICS, ...p });
function ad(i: number, p: Partial<AdSnapshot> = {}): AdSnapshot {
  return { label: `Creative #${i + 1}`, campaignAdId: `ad${i}`, kind: "IMAGE", externalAdId: `ext-ad-${i}`, headline: "Fresh roof, no surprises", primaryText: "Local roofers.", recent: null, prior: null, week: null, ...p };
}
function campaign(p: Partial<CampaignSnapshot> = {}): CampaignSnapshot {
  return {
    mairoCampaignId: "c1",
    name: "Roof leads",
    objective: "LEADS",
    status: "ACTIVE",
    platform: "META",
    platformCampaignId: "pc1",
    externalCampaignId: "ext-c1",
    externalAdGroupId: "ext-g1",
    dailyBudgetCents: 3000,
    liveSince: new Date(NOW.getTime() - 14 * DAY),
    recent: null,
    prior: null,
    week: m({ spendCents: 21000, clicks: 300, conversions: 14 }),
    ads: [ad(0)],
    audience: { geoKey: null, geoLabel: null, geoRadius: null, ageMin: 25, ageMax: 65, specialAdCategory: null, advantageAudience: false },
    destinationType: "LEAD_FORM",
    destinationUrl: null,
    canPauseAd: true,
    canChangeAudience: true,
    ...p,
  };
}
const input = (campaigns: CampaignSnapshot[]): DecisionInput => ({ now: NOW, campaigns, guardrails: DEFAULT_GUARDRAILS, landing: {} });

async function main() {
  console.log("\n— the objective, structured —");
  await check('"We need more roofing estimates"', () => {
    const o = objective("We need more roofing estimates");
    assert.equal(o.primaryGoal, "GENERATE_LEADS");
    assert.equal(o.goalLabel, "Lead generation");
    assert.equal(o.desiredAction, "Request an estimate");
    assert.equal(o.industry, "Roofing");
    assert.equal(o.intent, "High");
    assert.equal(o.marketingFocus, "Local customer acquisition");
  });
  await check('"more dinner reservations during weekdays"', () => {
    const o = objective("We need more dinner reservations during weekdays", "Italian restaurant");
    assert.equal(o.family, "bookings");
    assert.equal(o.desiredAction, "Reserve a table");
    assert.equal(o.industry, "Restaurant");
    assert.equal(o.marketingFocus, "Fill weekday dinner");
  });
  await check('"sell more memberships"', () => {
    const o = objective("We want to sell more memberships", "Gym");
    assert.equal(o.family, "sales");
    assert.equal(o.desiredAction, "Join a membership");
    assert.equal(o.marketingFocus, "Recurring membership sign-ups");
  });
  await check('"We\'re releasing a hoodie Friday" is a launch', () => {
    const o = objective("We're releasing a hoodie Friday", "Clothing brand");
    assert.equal(o.primaryGoal, "NEW_PRODUCT");
    assert.equal(o.item, "hoodie");
    assert.equal(o.timing.start, "2026-10-02");
    assert.equal(o.marketingFocus, "Product launch");
    assert.equal(o.desiredAction, "Buy");
  });
  await check('"We need more customers" lets MAIRO pick for the business', () => {
    const roofer = objective("We need more customers", "Roofing");
    assert.equal(roofer.chosenGoal, "RECOMMEND");
    assert.equal(roofer.primaryGoal, "GENERATE_LEADS");
    assert.equal(roofer.intent, "Medium");
    const shop = objective("We need more customers", "Clothing boutique", null, true);
    assert.equal(shop.primaryGoal, "INCREASE_SALES");
  });
  await check("the business's own industry wins over a word in the request", () => {
    assert.equal(objective("More haircuts booked", "Barbershop").industry, "Barbershop");
    assert.equal(objective("More trial sign-ups for our scheduling app", "Software").desiredAction, "Start a free trial");
  });
  await check("a booking word doesn't turn a sales goal into a booking one", () => {
    const o = objective("We want to sell more of our appointment books", "Stationery shop", "INCREASE_SALES");
    assert.equal(o.family, "sales");
    assert.notEqual(o.desiredAction, "Book an appointment");
  });

  console.log("\n— strategy fits the goal and the business —");
  await check("goal priorities differ by goal", () => {
    assert.ok(GOAL_PRIORITIES.sales.includes("Demonstrations") && GOAL_PRIORITIES.sales.includes("Purchase CTA"));
    assert.ok(GOAL_PRIORITIES.leads.includes("Free estimates") && GOAL_PRIORITIES.leads.includes("Pain points"));
    assert.ok(GOAL_PRIORITIES.bookings.includes("Availability") && GOAL_PRIORITIES.bookings.includes("Transformations"));
  });
  await check("the roofing strategy reads like the example", () => {
    const s = strategy("We need more roofing estimates", "");
    assert.equal(s.headline, "Generate Roofing Leads");
    assert.match(s.statement, /^Local Meta lead generation supported by .+ creatives\.$/);
    assert.equal(s.cta, "Request Free Estimate");
    assert.ok(s.messaging.includes("Prevent expensive damage"));
    assert.ok(!s.priorities.some((p) => /retargeting/i.test(p)), "no retargeting without a pixel");
    assert.match(s.retargeting, /tracking/);
  });
  await check("six industries, six different strategies", () => {
    const cases: [string, string, MissionGoal][] = [
      ["More sales of our new collection", "Clothing boutique", "INCREASE_SALES"],
      ["More dinner reservations", "Restaurant", "GET_BOOKINGS"],
      ["More patients", "Dentist", "GET_BOOKINGS"],
      ["More estimates", "Contractor", "GENERATE_LEADS"],
      ["More haircuts booked", "Barbershop", "GET_BOOKINGS"],
      ["More trial sign-ups", "Software", "INCREASE_SALES"],
    ];
    const made = cases.map(([r, i, g]) => strategy(r, i, {}, g));
    const signatures = new Set(made.map((s) => `${s.creativeDirection.map((c) => c.angle).join("|")}::${s.cta}::${s.messaging.join("|")}`));
    assert.equal(signatures.size, cases.length);
    assert.equal(made[1].cta, "Reserve a Table");
    assert.equal(made[5].cta, "Start Free Trial");
    assert.equal(made[5].objective.marketingFocus, "Trial sign-ups and demos");
  });
  await check("every creative direction serves the goal", () => {
    for (const [r, i] of [["We need more roofing estimates", ""], ["More dinner reservations", "Restaurant"], ["We're releasing a hoodie Friday", "Clothing"]]) {
      const s = strategy(r, i);
      assert.ok(s.creativeDirection.length >= 2, r);
      for (const c of s.creativeDirection) assert.ok(justifyAction(s, { kind: "creative", objective: c.objective }).ok, `${r}: ${c.objective}`);
    }
  });
  await check("a small budget tests one angle at a time", () => {
    const s = strategy("We need more roofing estimates", "", { marketing: { monthlyBudgetCents: 30_000, currentDailyCents: 0, campaignsRunning: 0, promotion: null, promotionsLast30Days: 0, hasPromoCreative: false } });
    assert.match(s.testingPlan, /first, then test/);
    const big = strategy("We need more roofing estimates", "");
    assert.match(big.testingPlan, /^Test .+ creative .+ against .+ creative/);
  });
  await check("what the account learned reorders creative and is said back", () => {
    const videoWins: EngineInsight = { attribute: "format", winner: "Video ads", loser: "Image ads", metric: "cost per lead", improvement: 0.3, confidence: "MEDIUM", statement: "Video ads brought in leads about 30% cheaper than image ads.", adjustment: "MAIRO leads with video in your next creatives." };
    const s = strategy("We need more roofing estimates", "", { insights: [videoWins] });
    const firstVideo = s.creativeDirection.findIndex((c) => c.format === "VIDEO");
    if (firstVideo >= 0) assert.equal(firstVideo, 0);
    assert.deepEqual(s.learningsApplied, [videoWins.adjustment]);
  });

  console.log("\n— launches and promotions —");
  await check("a launch tomorrow skips the tease; no fake urgency or fake proof", () => {
    const st = launchStages({ daysUntilLaunch: 1, hasEndOrLimited: false, hasVideo: false, isService: false, windowDays: 3 });
    const on = (n: string) => st.find((s) => s.stage === n)!.include;
    assert.equal(on("Tease"), false);
    assert.equal(on("Reveal"), true);
    assert.equal(on("Urgency"), false);
    assert.equal(on("Social proof"), false);
    assert.equal(on("Purchase"), true);
    for (const s of st) assert.ok(s.reason.length > 10);
  });
  await check("a launch a week out with an end date uses every stage", () => {
    const st = launchStages({ daysUntilLaunch: 7, hasEndOrLimited: true, hasVideo: true, isService: false, windowDays: 10 });
    assert.ok(st.every((s) => s.include));
  });
  await check("a new service with no footage shows results, not a demo", () => {
    const st = launchStages({ daysUntilLaunch: 5, hasEndOrLimited: false, hasVideo: false, isService: true, windowDays: 10 });
    assert.equal(st.find((s) => s.stage === "Demonstration")!.include, false);
  });
  await check("the hoodie launch strategy carries its stages", () => {
    const s = strategy("We're releasing a hoodie Friday", "Clothing brand");
    assert.ok(s.launch && s.launch.find((x) => x.stage === "Tease")!.include === false);
    assert.equal(s.headline, "Launch Hoodie");
  });
  await check("promotion: urgency only at the end, ads only if running", () => {
    const p = promotionPlan({ start: "2026-10-05", end: "2026-10-11", today: TODAY, campaignsRunning: 1, promotionsLast30Days: 0, hasPromoCreative: false });
    assert.match(p.introduce, /Tease it on 2026-10-03, announce it on 2026-10-05/);
    assert.deepEqual(p.urgency.map((u) => u.date), ["2026-10-10", "2026-10-11"]);
    assert.equal(p.mentionsPerWeek, 2);
    assert.equal(p.adsChange.yes, true);
    assert.equal(p.newCreatives.yes, true);
    assert.equal(p.restraint, null);
    const quick = promotionPlan({ start: TODAY, end: "2026-10-02", today: TODAY, campaignsRunning: 0, promotionsLast30Days: 0, hasPromoCreative: false });
    assert.equal(quick.adsChange.yes, false);
    assert.equal(quick.newCreatives.yes, false);
    assert.deepEqual(quick.urgency.map((u) => u.message), ["Last day"]);
    const none = promotionPlan({ start: TODAY, end: null, today: TODAY, campaignsRunning: 0, promotionsLast30Days: 0, hasPromoCreative: false });
    assert.equal(none.urgency.length, 0);
  });
  await check("promotion: frequent discounts are rested", () => {
    const p = promotionPlan({ start: TODAY, end: "2026-10-04", today: TODAY, campaignsRunning: 0, promotionsLast30Days: 3, hasPromoCreative: false });
    assert.match(p.restraint ?? "", /wait for sales/);
    const s = strategy("We need more roofing estimates", "", { marketing: { monthlyBudgetCents: 90_000, currentDailyCents: 0, campaignsRunning: 0, promotion: null, promotionsLast30Days: 4, hasPromoCreative: false } });
    assert.equal(s.offer.use, false);
    assert.equal(justifyAction(s, { kind: "creative", objective: "Promotion", discount: true }).ok, false);
  });

  console.log("\n— budget —");
  await check("allocation always sums to 100", () => {
    for (const monthly of [10_000, 59_999, 60_000, 150_000, 299_999, 300_000, 1_000_000]) {
      for (const family of ["sales", "leads", "awareness", "visits"] as const) {
        for (const pixel of [true, false]) {
          const b = recommendBudget({ monthlyCents: monthly, currentDailyCents: 0, family, pixelActive: pixel, hasLearnings: false });
          assert.equal(b.allocation.reduce((n, a) => n + a.percent, 0), 100, `${monthly} ${family} ${pixel}`);
          assert.ok(b.allocation.every((a) => a.percent > 0 && a.why.length > 0));
        }
      }
    }
  });
  await check("the summary reads like the example and promises nothing", () => {
    const b = recommendBudget({ monthlyCents: 150_000, currentDailyCents: 0, family: "leads", pixelActive: true, hasLearnings: false });
    assert.equal(b.summary, "Based on your $1,500 monthly budget, MAIRO recommends focusing most spend on customer acquisition before adding a larger awareness campaign.");
    assert.equal(b.dailyCents, 5000);
    assert.match(b.note, /not a promise/);
    assert.match(b.note, /never raises your budget/);
    assert.ok(b.allocation.some((a) => a.purpose === "Retargeting"));
    const small = recommendBudget({ monthlyCents: 30_000, currentDailyCents: 0, family: "leads", pixelActive: true, hasLearnings: false });
    assert.equal(small.allocation.length, 1);
    const big = recommendBudget({ monthlyCents: 500_000, currentDailyCents: 0, family: "sales", pixelActive: false, hasLearnings: true });
    assert.ok(big.allocation.some((a) => a.purpose === "Awareness"));
    assert.equal(recommendBudget({ monthlyCents: null, currentDailyCents: 2000, family: "sales", pixelActive: false, hasLearnings: false }).monthlyCents, 60_000);
    const unset = recommendBudget({ monthlyCents: null, currentDailyCents: 0, family: "leads", pixelActive: false, hasLearnings: false });
    assert.equal(unset.summary, "You haven't set a budget yet, so MAIRO starts from about $600 a month. It recommends focusing most spend on customer acquisition before adding a larger awareness campaign.");
    assert.doesNotMatch(unset.summary, /your \$/, "never calls a default 'your budget'");
  });

  console.log("\n— confidence, in words —");
  await check("low, medium, high — never a number", () => {
    const low = engineConfidence({ spendCents: 0, results: 0, strongInsights: 0, anyInsights: 0 });
    const mid = engineConfidence({ spendCents: 8_000, results: 3, strongInsights: 0, anyInsights: 0 });
    const high = engineConfidence({ spendCents: 80_000, results: 40, strongInsights: 1, anyInsights: 2 });
    assert.deepEqual([low.level, mid.level, high.level], ["low", "medium", "high"]);
    assert.match(low.customer, /MAIRO needs more data/);
    assert.match(mid.customer, /MAIRO is becoming more confident/);
    for (const c of [low, mid, high]) assert.doesNotMatch(c.customer, /\d|%/);
    assert.equal(engineConfidence({ spendCents: 80_000, results: 40, strongInsights: 0, anyInsights: 1 }).level, "medium", "no strong lesson, no high");
  });

  console.log("\n— the learning loop —");
  const lead = (spend: number, results: number) => ({ spend, results });
  await check("tiny samples teach nothing", () => {
    assert.equal(compareGroups("format", [{ name: "Video ads", items: [lead(900, 3), lead(800, 2)] }, { name: "Image ads", items: [lead(3000, 1), lead(2000, 1)] }], "lead"), null, "under $50 a side");
    assert.equal(compareGroups("format", [{ name: "Video ads", items: [lead(9000, 4)] }, { name: "Image ads", items: [lead(9000, 1), lead(9000, 1)] }], "lead"), null, "one ad isn't a group");
    assert.equal(compareGroups("format", [{ name: "Video ads", items: [lead(6000, 2), lead(6000, 2)] }, { name: "Image ads", items: [lead(6000, 1), lead(6000, 1)] }], "lead"), null, "fewer than 5 results");
    assert.equal(compareGroups("format", [{ name: "Video ads", items: [lead(6000, 3), lead(6000, 3)] }, { name: "Image ads", items: [lead(6000, 3), lead(6000, 2)] }], "lead"), null, "under 20% apart");
  });
  await check("a clear difference becomes a medium lesson; lots of data makes it high", () => {
    const i = compareGroups("format", [{ name: "Video ads", items: [lead(6000, 4), lead(6000, 4)] }, { name: "Image ads", items: [lead(6000, 2), lead(6000, 2)] }], "lead")!;
    assert.equal(i.winner, "Video ads");
    assert.equal(i.confidence, "MEDIUM");
    assert.equal(Math.round(i.improvement * 100), 50);
    assert.equal(i.statement, "Video ads brought in leads about 50% cheaper than image ads.");
    assert.match(i.adjustment, /leads with video/);
    assert.equal(i.key, "engine:format:video-ads");
    const strong = compareGroups("format", [{ name: "Video ads", items: [lead(20_000, 15), lead(20_000, 15)] }, { name: "Image ads", items: [lead(20_000, 5), lead(20_000, 5)] }], "lead")!;
    assert.equal(strong.confidence, "HIGH");
    assert.ok(MIN_RESULTS === 5 && MIN_SPEND_CENTS === 5000);
  });
  await check("offers, hooks and CTAs are read from the words", () => {
    assert.ok(hasOffer("20% off this weekend"));
    assert.ok(hasOffer("Free inspection"));
    assert.ok(!hasOffer("Local roofers you can trust"));
    assert.equal(hookStyle("Is your roof leaking?"), "Question headlines");
    assert.equal(hookStyle("5 signs you need a new roof"), "Headlines with a number");
    assert.equal(hookStyle("Roofs done right"), "Plain statement headlines");
  });
  await check("insights come from the campaign snapshots, per result", () => {
    const c = campaign({
      ads: [
        ad(0, { kind: "VIDEO", headline: "Is your roof leaking?", week: m({ spendCents: 7000, conversions: 7 }) }),
        ad(1, { kind: "VIDEO", headline: "Is your gutter full?", week: m({ spendCents: 7000, conversions: 6 }) }),
        ad(2, { kind: "IMAGE", headline: "Roofs done right", week: m({ spendCents: 7000, conversions: 2 }) }),
        ad(3, { kind: "IMAGE", headline: "Local roofers", week: m({ spendCents: 7000, conversions: 1 }) }),
      ],
    });
    const found = engineInsights([c], "LEADS");
    assert.ok(found.find((x) => x.attribute === "format" && x.winner === "Video ads"));
    assert.ok(found.find((x) => x.attribute === "hook" && x.winner === "Question headlines"));
    assert.equal(engineInsights([campaign({ objective: "AWARENESS", ads: c.ads })]).length, 0, "awareness has no result to compare");
  });

  console.log("\n— the core rule —");
  await check("no objective, no recommendation", () => {
    const s = strategy("We need more roofing estimates", "");
    assert.equal(justifyAction(s, { kind: "creative", objective: null }).ok, false);
    assert.equal(justifyAction(s, { kind: "post", objective: "Retention" }).ok, false, "retention doesn't serve lead generation");
    assert.equal(justifyAction(s, { kind: "campaign", adGoal: "AWARENESS", objective: "Awareness" }).ok, false, "awareness at $900/month");
    const ok = justifyAction(s, { kind: "creative", objective: "Trust" });
    assert.ok(ok.ok && /lead generation/.test(ok.reason));
    const big = strategy("We need more roofing estimates", "", { marketing: { monthlyBudgetCents: 500_000, currentDailyCents: 0, campaignsRunning: 0, promotion: null, promotionsLast30Days: 0, hasPromoCreative: false } });
    assert.equal(justifyAction(big, { kind: "campaign", adGoal: "AWARENESS", objective: "Awareness" }).ok, true, "a small awareness share at a big budget");
    assert.ok(ALLOWED_OBJECTIVES.sales.includes("Conversion") && !ALLOWED_OBJECTIVES.leads.includes("Retention"));
  });
  await check("every brief has all eight fields", () => {
    const s = strategy("We need more roofing estimates", "");
    const b = briefFor(s, s.creativeDirection[0]);
    for (const k of ["goal", "objective", "audience", "hook", "message", "cta", "format", "reason"] as const) assert.ok(String(b[k]).length > 0, k);
    assert.equal(b.goal, "Generate leads");
    assert.equal(b.cta, "Request Free Estimate");
  });

  console.log("\n— the engine's decisions —");
  const ctx: EngineContext = { family: "leads", goalLabel: "Generate leads", insights: [], promotions: [], promotionsLast30Days: 0, today: TODAY };
  await check("money moves from a campaign that can't produce the goal's result", () => {
    const leads = campaign({ week: m({ spendCents: 20_000, conversions: 12 }) });
    const traffic = campaign({ mairoCampaignId: "c2", name: "Website visits", objective: "TRAFFIC", platformCampaignId: "pc2", externalCampaignId: "ext-c2", dailyBudgetCents: 4000, week: m({ spendCents: 25_000, clicks: 600 }) });
    const d = engineDrafts(input([leads, traffic]), ctx).find((x) => x.kind === "strategy-shift-budget")!;
    assert.ok(d, "shift drafted");
    const [from, to] = d.changes as Extract<(typeof d.changes)[number], { type: "set-budget" }>[];
    assert.equal(from.mairoCampaignId, "c2");
    assert.equal(to.mairoCampaignId, "c1");
    assert.equal(from.fromCents - from.toCents, to.toCents - to.fromCents, "total stays the same");
    assert.ok(from.fromCents - from.toCents <= from.fromCents * 0.2);
    assert.match(d.whyItMatters, /generate leads/);
    assert.match(d.impact, /^Expected purpose:/);
    assert.match(d.impact, /not a guarantee/i);
  });
  await check("no move without enough results on the goal's side", () => {
    const thin = campaign({ week: m({ spendCents: 20_000, conversions: 3 }) });
    const traffic = campaign({ mairoCampaignId: "c2", objective: "TRAFFIC", platformCampaignId: "pc2", dailyBudgetCents: 4000, week: m({ spendCents: 25_000, clicks: 600 }) });
    assert.equal(engineDrafts(input([thin, traffic]), ctx).filter((x) => x.kind === "strategy-shift-budget").length, 0);
    assert.equal(engineDrafts(input([thin, traffic]), { ...ctx, family: "awareness", goalLabel: "Increase brand awareness" }).length, 0);
  });
  await check("more of a winning format, from its best ad", () => {
    const c = campaign({ ads: [ad(0, { kind: "VIDEO", week: m({ spendCents: 8000, conversions: 8 }) }), ad(1, { kind: "IMAGE", week: m({ spendCents: 8000, conversions: 2 }) })] });
    const win: EngineInsight = { attribute: "format", winner: "Video ads", loser: "Image ads", metric: "cost per lead", improvement: 0.75, confidence: "MEDIUM", statement: "Video ads brought in leads about 75% cheaper than image ads.", adjustment: "x" };
    const d = engineDrafts(input([c]), { ...ctx, insights: [win] }).find((x) => x.kind === "strategy-more-of-winner")!;
    assert.ok(d);
    assert.equal(d.changes[0].type, "new-ad-variation");
    assert.equal((d.changes[0] as { basedOnCampaignAdId: string }).basedOnCampaignAdId, "ad0");
  });
  await check("promotion urgency only in the last day, and only with ads running", () => {
    const promo = { id: "p1", title: "20% off", end: "2026-10-02" };
    assert.equal(engineDrafts(input([campaign()]), { ...ctx, promotions: [promo] }).filter((d) => d.kind === "strategy-promotion-urgency").length, 1);
    assert.equal(engineDrafts(input([campaign()]), { ...ctx, promotions: [{ ...promo, end: "2026-10-06" }] }).filter((d) => d.kind === "strategy-promotion-urgency").length, 0);
    assert.equal(engineDrafts(input([]), { ...ctx, promotions: [promo] }).length, 0);
  });
  await check("a rest from discounts after several promotions", () => {
    assert.equal(engineDrafts(input([]), { ...ctx, promotionsLast30Days: 3 })[0]?.kind, "strategy-discount-rest");
    assert.equal(engineDrafts(input([]), { ...ctx, promotionsLast30Days: 2 }).length, 0);
  });
  await check("a daily rule about the same budget wins over the engine's", () => {
    const a = campaign({ week: m({ spendCents: 28_000, conversions: 20 }) });
    const b = campaign({ mairoCampaignId: "c2", name: "Other leads", platformCampaignId: "pc2", externalCampaignId: "ext-c2", dailyBudgetCents: 4000, week: m({ spendCents: 28_000, conversions: 5 }) });
    const traffic = campaign({ mairoCampaignId: "c3", objective: "TRAFFIC", platformCampaignId: "pc3", externalCampaignId: "ext-c3", dailyBudgetCents: 4000, week: m({ spendCents: 28_000, clicks: 600 }) });
    const rules = decide(input([a, b, traffic])).decisions;
    const engine = engineDrafts(input([a, b, traffic]), ctx);
    const merged = mergeDrafts(rules, engine);
    const budgets = merged.flatMap((d) => d.changes.filter((c) => c.type === "set-budget").map((c) => (c as { mairoCampaignId: string }).mairoCampaignId));
    assert.equal(new Set(budgets).size, budgets.length, "no campaign budget is in two decisions");
    assert.ok(merged.length <= 5);
  });

  console.log("\n— wired in: plan, approval, briefs, memory —");
  const orgId = `${TAG}-org`;
  await db.organization.create({ data: { id: orgId, name: "Peak Roofing", industry: "Roofing", website: "https://peak.example", phone: "555-0100", subscriptionTier: "GROWTH", subscriptionStatus: "active" } });
  try {
    await check("the plan is built from the engine's strategy", async () => {
      const r = await startMission(orgId, { request: "We need more roofing estimates", answers: { location: "Austin, TX", sells: "Roof repair and replacement" } });
      assert.equal(r.kind, "plan");
      const p = (await proposedMission(orgId))!;
      const e = p.plan.engine!;
      assert.ok(e, "engine snapshot stored");
      assert.equal(e.objective.desiredAction, "Request an estimate");
      assert.equal(e.objective.industry, "Roofing");
      assert.equal(p.plan.tactics.cta, "Request Free Estimate");
      assert.equal(p.plan.title, "Generate Roofing Leads");
      assert.equal(p.plan.dailyBudget, Math.round(e.budget.dailyCents / 100));
      assert.equal(e.confidence.level, "low");
      for (const c of p.plan.adConcepts) assert.ok(justifyAction(e, { kind: "creative", objective: c.objective as never }).ok, c.objective);
    });
    await check("approval carries the message and CTA into Create", async () => {
      const p = (await proposedMission(orgId))!;
      const { draftId } = await approveMission(orgId, p.id, null);
      const draft = await db.campaignDraft.findUnique({ where: { id: draftId! } });
      const data = draft!.data as { offering: string; dailyAmount: number };
      assert.match(data.offering, /Ask people to: Request Free Estimate/);
      assert.equal(data.dailyAmount, p.plan.dailyBudget);
    });
    await check("a new creative stores its brief", async () => {
      const purpose = (await creativeObjective(orgId, { format: "IMAGE", message: "Storm damage inspection" }))!;
      const b = JSON.parse(purpose.briefJson);
      for (const k of ["goal", "objective", "audience", "hook", "message", "cta", "format", "reason"]) assert.ok(String(b[k]).length > 0, k);
      assert.equal(b.goal, "Generate leads");
      assert.equal(b.format, "image");
      assert.equal(b.message, "Storm damage inspection");
    });
    await check("lessons strengthen when seen again, and a new winner retires the old", async () => {
      const i = compareGroups("format", [{ name: "Video ads", items: [lead(6000, 4), lead(6000, 4)] }, { name: "Image ads", items: [lead(6000, 2), lead(6000, 2)] }], "lead")!;
      await saveInsights(orgId, [i]);
      let saved = await savedInsights(orgId);
      assert.equal(saved.length, 1);
      assert.equal(saved[0].winner, "Video ads");
      assert.equal(saved[0].confidence, "MEDIUM");
      await saveInsights(orgId, [i]);
      await saveInsights(orgId, [i]);
      saved = await savedInsights(orgId);
      assert.equal(saved[0].confidence, "HIGH", "seen three times");
      const flip = compareGroups("format", [{ name: "Image ads", items: [lead(6000, 4), lead(6000, 4)] }, { name: "Video ads", items: [lead(6000, 2), lead(6000, 2)] }], "lead")!;
      await saveInsights(orgId, [flip]);
      saved = await savedInsights(orgId);
      assert.deepEqual(saved.map((s) => s.winner), ["Image ads"]);
    });
  } finally {
    await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  }

  console.log(`\n${passed} checks passed.\n`);
}

main()
  .catch(async (error) => {
    console.error(error);
    await db.organization.deleteMany({ where: { id: { startsWith: TAG } } }).catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
