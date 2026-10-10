// Checks MAIRO Intelligence: the insight engine, Business Health, the
// Opportunity Radar, the Morning Brief and Profit First.
//
//   npm run check:intelligence
//
// The promises asserted here: one finding feeds every screen (fatigue lowers
// Creative Health, lights the radar and is an early warning, linked to its
// decision); nothing is judged during learning and a score with no data is
// "not enough data", never a number; most things are not urgent; and profit
// is only estimated when the margin is known.

import { EMPTY_METRICS, type PlatformMetrics } from "@/lib/ad-platforms/types";
import { allDrafts, decide } from "@/lib/decisions/rules";
import { DEFAULT_GUARDRAILS } from "@/lib/decisions/gather";
import type { AdSnapshot, CampaignSnapshot, DecisionInput } from "@/lib/decisions/types";
import { detectInsights, type IntelligenceContext } from "@/lib/intelligence/detect";
import { radar, scoreHealth } from "@/lib/intelligence/score";
import { buildBrief } from "@/lib/intelligence/brief";
import { briefRanges } from "@/lib/intelligence/run";
import { breakEvenRoas, contributionRate, DEFAULT_PROFIT_INPUTS, estimateProfit, marginOf, productEconomics } from "@/lib/intelligence/profit";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

const NOW = new Date("2026-09-29T12:00:00Z");
const DAY = 86_400_000;
const m = (p: Partial<PlatformMetrics>): PlatformMetrics => ({ ...EMPTY_METRICS, ...p });

function ad(i: number, p: Partial<AdSnapshot> = {}): AdSnapshot {
  return { label: `Creative #${i + 1}`, campaignAdId: `ad${i}`, kind: "IMAGE", externalAdId: `ext-ad-${i}`, headline: "H", primaryText: "T", recent: null, prior: null, week: null, ...p };
}

function campaign(p: Partial<CampaignSnapshot> = {}): CampaignSnapshot {
  return {
    mairoCampaignId: "c1",
    name: "Spring sale",
    objective: "SALES",
    status: "ACTIVE",
    platform: "META",
    platformCampaignId: "pc1",
    externalCampaignId: "ext-c1",
    externalAdGroupId: "ext-g1",
    dailyBudgetCents: 4000,
    liveSince: new Date(NOW.getTime() - 14 * DAY),
    recent: m({ spendCents: 12000, impressions: 9000, reach: 5000, clicks: 180, purchases: 5 }),
    prior: m({ spendCents: 16000, impressions: 12000, reach: 7000, clicks: 240, purchases: 7 }),
    week: m({ spendCents: 28000, impressions: 21000, reach: 11000, clicks: 420, purchases: 12, revenueCents: 90000, roas: 3.2 }),
    ads: [ad(0), ad(1)],
    audience: { geoKey: null, geoLabel: null, geoRadius: null, ageMin: 18, ageMax: 65, specialAdCategory: null, advantageAudience: false },
    destinationType: "WEBSITE",
    destinationUrl: "https://example.com",
    canPauseAd: true,
    canChangeAudience: true,
    ...p,
  };
}

const input = (campaigns: CampaignSnapshot[], p: Partial<DecisionInput> = {}): DecisionInput => ({ now: NOW, campaigns, guardrails: DEFAULT_GUARDRAILS, landing: {}, ...p });
const ctx = (p: Partial<IntelligenceContext> = {}): IntelligenceContext => ({ pixels: [{ status: "ACTIVE" }], publishers: null, pages: {}, ...p });
const run = (i: DecisionInput, c = ctx()) => detectInsights(i, allDrafts(i), c);

console.log("\n— nothing is judged during learning —");
{
  const young = input([campaign({ liveSince: new Date(NOW.getTime() - DAY) })]);
  const found = run(young).filter((i) => i.type !== "tracking-setup");
  ok("a 1-day-old campaign produces no insights", found.length === 0, found.map((i) => i.type).join());
  const h = scoreHealth(young, found, ctx(), null);
  ok("and every health area says not enough data", h.areas.every((a) => a.score === null), JSON.stringify(h.areas.map((a) => a.score)));
  ok("so there's no overall score", h.score === null && h.status === null);
  ok("each empty area says what it needs", h.areas.every((a) => Boolean(a.needs)));
  ok("the radar has no levels yet", radar(found, false).areas.every((a) => a.level === null));
}

console.log("\n— one finding reaches every screen —");
{
  const tired = campaign({
    ads: [
      ad(0, {
        recent: m({ impressions: 6000, reach: 1500, clicks: 30, spendCents: 6000 }),
        prior: m({ impressions: 6000, reach: 2500, clicks: 90, spendCents: 6000 }),
        week: m({ impressions: 12000, reach: 3000, clicks: 120, spendCents: 12000, purchases: 4 }),
      }),
      ad(1, { week: m({ impressions: 9000, reach: 6000, clicks: 300, spendCents: 16000, purchases: 8 }) }),
    ],
  });
  const i = input([tired]);
  const insights = run(i);
  const fatigue = insights.find((x) => x.type === "creative-fatigue");
  ok("creative fatigue becomes an insight", Boolean(fatigue));
  ok("linked to the decision that fixes it", Boolean(fatigue?.decisionDedupeKey) && decide(i).decisions.some((d) => d.dedupeKey === fatigue?.decisionDedupeKey));
  ok("with the generate_creative action", fatigue?.actionType === "generate_creative");
  ok("shown as an early warning", fatigue?.earlyWarning === true);
  ok("in the radar's Creative area", fatigue?.radarArea === "creative");
  ok("and it isn't urgent", fatigue?.severity !== "URGENT");
  ok("its CTR before/after is carried", Boolean(fatigue?.previousValue && fatigue.currentValue));
  const h = scoreHealth(i, insights, ctx(), null);
  const creative = h.areas.find((a) => a.key === "creative")!;
  ok("Creative Health drops below 100 for it", creative.score !== null && creative.score < 100, String(creative.score));
  ok("and says why", creative.reasons.some((r) => !r.good && r.text === fatigue?.title));
  ok("with Fix with MAIRO pointing at Decisions", creative.recommendation?.href === "/dashboard/decisions" && creative.recommendation.actionLabel === "Fix with MAIRO");
  const r = radar(insights, true);
  ok("the radar rates Creative higher than Low", r.areas.find((a) => a.area === "creative")?.level !== "LOW");
  ok("and features a creative insight", r.top.includes(fatigue!.dedupeKey));
}

console.log("\n— early warnings —");
{
  const rising = campaign({
    recent: m({ spendCents: 15000, impressions: 9000, reach: 5000, clicks: 180, purchases: 3 }),
    prior: m({ spendCents: 16000, impressions: 12000, reach: 7000, clicks: 240, purchases: 8 }),
    ads: [
      ad(0, { week: m({ spendCents: 19000, impressions: 12000, clicks: 200, purchases: 2 }) }),
      ad(1, { week: m({ spendCents: 9000, impressions: 9000, clicks: 220, purchases: 9 }) }),
    ],
  });
  const cpa = run(input([rising])).find((x) => x.type === "cpa-rising");
  ok("rising cost per purchase is caught", Boolean(cpa));
  ok("with before and after", cpa?.previousValue === "$20" && cpa.currentValue === "$50", `${cpa?.previousValue} ${cpa?.currentValue}`);
  ok("naming the ad taking budget without results", Boolean(cpa?.recommendation.includes("Creative #1")));
  ok("a small wobble isn't reported", !run(input([campaign()])).some((x) => x.type === "cpa-rising"));

  const tracking = campaign({
    recent: m({ spendCents: 12000, impressions: 9000, reach: 5000, clicks: 180, purchases: 0 }),
    prior: m({ spendCents: 16000, impressions: 12000, reach: 7000, clicks: 240, purchases: 10 }),
  });
  const t = run(input([tracking]));
  ok("results vanishing with clicks steady reads as tracking", t.some((x) => x.type === "tracking-drop" && x.actionType === "fix_tracking"));
  ok("not as a landing-page problem", !t.some((x) => x.type === "conversion-drop"));

  const page = campaign({
    recent: m({ spendCents: 12000, impressions: 9000, reach: 5000, clicks: 180, purchases: 2 }),
    prior: m({ spendCents: 16000, impressions: 12000, reach: 7000, clicks: 240, purchases: 10 }),
  });
  ok("fewer conversions with steady clicks points at the website", run(input([page])).some((x) => x.type === "conversion-drop" && x.actionType === "analyze_website"));
  ok("and isn't also reported as a rising cost", !run(input([page])).some((x) => x.type === "cpa-rising"));
  const pageHealth = scoreHealth(input([page]), run(input([page])), ctx(), null).areas.find((a) => a.key === "website")!;
  ok("a website finding gives Website Health a score", pageHealth.score !== null && pageHealth.score < 100, String(pageHealth.score));

  const near = run(input([campaign()], { guardrails: { ...DEFAULT_GUARDRAILS, maxCpaCents: 2400 } })).find((x) => x.type === "near-target-cpa");
  ok("close to the target cost is flagged", Boolean(near));
  ok("and only urgent once well over", near?.severity === "ATTENTION", near?.severity);
  const over = run(input([campaign()], { guardrails: { ...DEFAULT_GUARDRAILS, maxCpaCents: 1800 } })).find((x) => x.type === "near-target-cpa");
  ok("20%+ over the target is urgent", over?.severity === "URGENT", over?.severity);

  ok("no pixel with a sales campaign is a tracking warning", run(input([campaign()]), ctx({ pixels: [] })).some((x) => x.type === "tracking-setup"));
  ok("a working pixel isn't", !run(input([campaign()])).some((x) => x.type === "tracking-setup"));

  const broken = run(input([campaign()]), ctx({ pages: { c1: { probe: { ok: true, status: 200, finalUrl: "https://example.com", mobileReady: false, hasMetaPixel: true, title: null }, ms: 800 } } }));
  ok("a page that isn't built for phones is caught", broken.some((x) => x.type === "page-problem" && x.severity === "ATTENTION"));

  const split = run(
    input([campaign()]),
    ctx({
      publishers: [
        { publisher: "facebook", metrics: m({ spendCents: 39000, purchases: 10 }) },
        { publisher: "instagram", metrics: m({ spendCents: 26000, purchases: 10 }) },
      ],
    }),
  ).find((x) => x.type === "platform-split");
  ok("Instagram cheaper than Facebook is an opportunity", split?.severity === "OPPORTUNITY" && split.title.startsWith("Instagram"));

  const all = run(input([rising, tracking, page]));
  ok("most findings aren't urgent", all.filter((x) => x.severity === "URGENT").length <= 1, all.map((x) => x.severity).join());
  ok("every insight carries what it's based on", all.every((x) => x.basedOn.days > 0));
  ok("and the five explanation parts", all.every((x) => x.happened && x.whyItMatters && x.recommendation && x.reason && x.ifApproved));
}

console.log("\n— health scores need real data —");
{
  const i = input([campaign()]);
  const h = scoreHealth(i, run(i), ctx(), null);
  ok("a steady campaign scores advertising", h.areas.find((a) => a.key === "advertising")!.score !== null);
  ok("website without a page check or analysis has no score", h.areas.find((a) => a.key === "website")!.score === null);
  const h2 = scoreHealth(i, run(i), ctx({ pages: { c1: { probe: { ok: true, status: 200, finalUrl: "https://example.com", mobileReady: true, hasMetaPixel: true, title: null }, ms: 700 } } }), null);
  ok("with a page check it does", h2.areas.find((a) => a.key === "website")!.score !== null);
  ok("an overall score once two areas have one", h2.score !== null && h2.status !== null);
  ok("scores stay within 0–100", h2.areas.every((a) => a.score === null || (a.score >= 0 && a.score <= 100)));
}

console.log("\n— the Morning Brief —");
{
  const { current, before } = briefRanges(NOW, "DAILY");
  ok("daily covers yesterday", current.since.toISOString().slice(0, 10) === "2026-09-28" && current.until.toISOString().slice(0, 10) === "2026-09-28");
  ok("against the day before", before.since.toISOString().slice(0, 10) === "2026-09-27");
  const w = briefRanges(NOW, "WEEKLY");
  ok("weekly covers the 7 days to yesterday", w.current.since.toISOString().slice(0, 10) === "2026-09-22");
  const brief = buildBrief({
    period: "yesterday",
    since: "2026-09-28",
    until: "2026-09-28",
    figures: { spendCents: 8400, revenueCents: 41200, results: 6, resultWord: "purchase", roas: 4.9 },
    before: null,
    ads: [
      { label: "Creative #4", campaignName: "Spring sale", spendCents: 2350, results: 3 },
      { label: "Creative #2", campaignName: "Spring sale", spendCents: 6050, results: 3 },
    ],
    input: input([campaign()]),
    insights: [],
  });
  ok("finds yesterday's winner", brief.winner?.label === "Creative #4");
  ok("by share of results against share of spend", Math.round((brief.winner?.resultShare ?? 0) * 100) === 50 && Math.round((brief.winner?.spendShare ?? 0) * 100) === 28);
  ok("lists what MAIRO is watching", brief.watching.length >= 3);
  const none = buildBrief({ period: "yesterday", since: "x", until: "x", figures: null, before: null, ads: [{ label: "A", campaignName: "c", spendCents: 100, results: 1 }], input: input([]), insights: [] });
  ok("no winner from one purchase", none.winner === null);
}

console.log("\n— Profit First —");
{
  const s = { ...DEFAULT_PROFIT_INPUTS };
  const unknown = estimateProfit({ revenueCents: 842000, spendCents: 210000, purchases: 64 }, s, 30);
  ok("no margin, no profit figure", unknown.profitCents === null && unknown.status === "unknown");
  ok("and it says what's missing", unknown.missing.length === 1);
  ok("but revenue, spend and ROAS still show", unknown.roas !== null && Math.abs(unknown.roas - 4.01) < 0.01);
  ok("cost per customer is spend ÷ customers", unknown.costPerCustomerCents === 3281);

  const withMargin = estimateProfit({ revenueCents: 842000, spendCents: 210000, purchases: 64 }, { ...s, averageMarginPercent: 60 }, 30);
  ok("with a margin, profit is estimated", withMargin.profitCents !== null);
  const expected = 842000 - Math.round(842000 * 0.4) - 210000 - 0 - Math.round(842000 * 0.029 + 64 * 30);
  ok("revenue − product costs − ads − fees", withMargin.profitCents === expected, `${withMargin.profitCents} vs ${expected}`);
  ok("above break-even at 4x on a 60% margin", withMargin.status === "above");
  ok("other monthly costs are spread across the period", estimateProfit({ revenueCents: 1000, spendCents: 100, purchases: 1 }, { ...s, averageMarginPercent: 50, otherMonthlyCostsCents: 3000 }, 10).otherCostsCents === 1000);

  ok("margin from price and cost", Math.round(marginOf({ ...s, sellingPriceCents: 5000, productCostCents: 2000 })!.percent) === 60);
  ok("an entered margin wins over the Business Brain", marginOf({ ...s, averageMarginPercent: 40, brainMarginPercent: 70 })!.source === "entered");
  ok("break-even ROAS is 1 ÷ what's left per dollar", Math.abs((breakEvenRoas(contributionRate(50, { ...s, paymentFeePercent: 0, paymentFeeFixedCents: 0 }, 5000)) ?? 0) - 2) < 1e-9);
  ok("no break-even when every sale loses money", breakEvenRoas(contributionRate(2, s, 5000)) === null);
  ok("shipping lowers what's left per dollar", (contributionRate(50, { ...s, shippingCostCents: 500 }, 5000) ?? 1) < (contributionRate(50, s, 5000) ?? 0));
  const p = productEconomics(4000, 1600, s);
  ok("a product's margin and break-even", Math.round(p.marginPercent ?? 0) === 60 && (p.breakEven ?? 0) > 1.6);
  ok("a product with no cost has no economics", productEconomics(4000, null, s).marginPercent === null);
}

console.log(bad ? `\n${bad} check(s) failed.` : "\nAll checks passed.");
process.exit(bad ? 1 : 0);
