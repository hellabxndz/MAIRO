import type { ConsoleHeaderData } from "@/components/console/header";
import type { MetricData } from "@/components/console/metrics";
import type { ActionItemData } from "@/components/console/action-center";
import type { CampaignCounts, CampaignSummaryRow } from "@/components/console/campaigns";
import type { TeamMemberData } from "@/components/console/team";
import type { ResultsInsight } from "@/components/console/results";
import type { DailyPoint } from "@/lib/dashboard/overview";
import type { DecisionView } from "@/lib/decisions/store";
import { buildReport, type PlanReport } from "@/lib/preview/report";
import { savedPlanSchema, type SavedPlan } from "@/lib/preview/saved-plan";
import { newPlan, type CampaignPlan } from "@/lib/campaigns/plan";
import { EXAMPLES } from "./examples";

// The one business the homepage's product clips and film follow from start to
// finish: Fernleaf Ceramics, the fictional online shop from lib/demo/
// examples.ts (a reserved .example address), selling handmade mugs, with the
// goal "more online sales" and $1,000 a month for Meta.
//
// Its free plan goes through the generator's own report builder, so the plan
// the clips show is what the tool gives for these answers. Its dashboard
// figures are sample figures — modest, internally consistent, and shown only
// under the sample-data label every frame carries. Where a figure comes from
// (Meta, the shop's own orders) is said beside it, as in the app.

const ex = EXAMPLES.shop;

export const SHOP = { name: ex.name, site: ex.url, owner: "Maya", monthly: 1000 } as const;

const concepts = [
  {
    label: "The product in use",
    headline: ex.concepts[0].hook,
    primaryText: "Each mug is thrown and glazed in our studio, so no two are quite the same. Made for the first coffee of the day.",
    format: "Single image",
    visual: "A speckled green mug of coffee on a wooden table, steam rising, morning light.",
    cta: "Shop now",
    targetCustomer: "Coffee lovers",
    why: "A mug in use shows its size and glaze better than a product shot on white.",
  },
  {
    label: "Built to last",
    headline: ex.concepts[1].hook,
    primaryText: "Fired twice and glazed thick, so they keep their colour and take the dishwasher.",
    format: "Short video",
    visual: "A few seconds filmed on a phone: a mug going into the dishwasher and coming out unchanged.",
    cta: "Shop now",
    targetCustomer: "People replacing chipped mugs",
    why: "Answers the question a buyer has about handmade pottery: will it last?",
  },
  {
    label: "The offer",
    headline: ex.concepts[2].hook,
    primaryText: "Two mugs and you're there. Gift-boxed on request.",
    format: "Single image",
    visual: "A kraft gift box holding two mugs, a tag reading 'for you'.",
    cta: "Shop now",
    targetCustomer: "Gift buyers",
    why: "Free shipping is the reason to buy two — and the website already offers it.",
  },
];

/** The free plan, as saved: what the owner gave, what the website reading saw, and the written parts. */
export const SHOP_PLAN: SavedPlan = savedPlanSchema.parse({
  inputs: { website: `https://${ex.url}/`, sells: "Handmade stoneware mugs", goal: "sales", monthly: SHOP.monthly },
  facts: {
    name: ex.name,
    offering: "Handmade stoneware mugs, $34",
    customer: "",
    location: "Ships across the US",
    offer: "Free shipping over $60",
    proof: "Thrown and glazed in our own studio",
    problem: "",
    businessType: "ecommerce",
    pixelSeen: true,
    usesLeadForm: false,
    fromWebsite: ["name", "offering", "location", "offer", "proof"],
    destinations: { booking: null, form: false, phone: false, checkout: true },
  },
  site: { url: `https://${ex.url}/`, pagesRead: 3, platform: "Shopify" },
  findings: [{ title: "Shipping costs appear only at checkout", why: "Buyers who meet a cost late often leave.", change: "Say “Free shipping over $60” on the product page, near the price.", evidence: "Product page: no shipping line near the price" }],
  written: {
    appeal: ["Handmade in a small studio, so each mug is one of a kind", "A clear price — $34 — with free shipping over $60", "A gift that feels personal without being fussy"],
    customers: "Coffee lovers, and people buying a gift",
    messaging: ["Lead with the mug in use, not the studio.", "Say the price and the free-shipping line plainly.", "One button: Shop now."],
    concepts,
    first: 0,
    firstWhy: "A mug in use answers the two questions every buyer of pottery has — how big, and what the glaze looks like — in one picture.",
  },
  source: { by: "ai" },
});

/** The plan as the report shows it — built by the generator's own rules. */
export const SHOP_REPORT: PlanReport = buildReport(SHOP_PLAN)!;

/** The campaign the builder makes from the plan: Sales on Facebook and Instagram, about $33 a day. */
export function shopCampaign(): CampaignPlan {
  const p = newPlan({ service: "meta", businessName: ex.name, website: `https://${ex.url}/`, offering: "Handmade stoneware mugs", targetAudience: "Coffee lovers and gift buyers", differentiator: "Thrown and glazed in our own studio", messageChannel: "MESSENGER", timeZone: "America/New_York", metaPercent: 100 });
  return { ...p, promotes: "PRODUCT", promotesDetail: "Handmade stoneware mugs", goal: "SALES", destinationType: "WEBSITE", destinationValue: `https://${ex.url}/mugs`, audienceMode: "ai", dailyAmount: 33 };
}

// ── The dashboard, two weeks after launch ──────────────────────────────────

export const SHOP_CONSOLE = {
  business: ex.name,
  period: "Last 14 days",
  header: {
    greeting: `Good morning, ${SHOP.owner}.`,
    subline: "Working toward: more online sales.",
    business: ex.name,
    adAccount: { label: `${ex.name} · act_•••• 2290`, state: "connected" },
    ai: { label: "Monitoring", tone: "live", running: false, detail: "Next check tomorrow, 7:00 AM", href: null },
  } satisfies ConsoleHeaderData,
  metrics: [
    { key: "spend", label: "Money spent", value: "$412.40", source: "Meta reports", change: null, empty: null },
    { key: "value", label: "Confirmed order value", value: "$538.00", source: "Your store's orders", change: null, empty: null },
    { key: "results", label: "Purchases", value: "12", source: "Meta reports", change: null, empty: null },
    { key: "cost", label: "Cost per purchase", value: "$34.37", source: "Meta reports", change: null, empty: null },
  ] satisfies MetricData[],
  actions: [
    { key: "opening", agent: "CREATIVE", kind: "creative", title: "Consider testing a new opening line.", why: "“Made by hand. Used every morning.” brought 9 of the 12 purchases. A second version tests whether naming free shipping does better.", impact: { text: "No change to what you spend.", up: false }, risk: "Low risk", href: null, cta: "Review & approve" },
    { key: "shipping", agent: "GROWTH", kind: "creative", title: ex.story.recommendation.title, why: "7 of the 11 matched orders were over $60, where free shipping starts.", impact: { text: "No change to what you spend.", up: false }, risk: "Low risk", href: null, cta: "Review & approve" },
    { key: "orders", agent: "ANALYST", kind: "tracking", title: "Match this week's orders", why: "1 order isn't matched to an ad yet. Matching it lets MAIRO judge the ads on what sold, not on clicks.", impact: null, risk: null, href: null, cta: "Review orders" },
  ] satisfies ActionItemData[],
  counts: { live: 1, paused: 0, review: 1, draft: 0 } satisfies CampaignCounts,
  campaigns: [
    { id: "c1", name: "Handmade mugs — sales", status: { label: "Live", tone: "live" }, goal: "Sales", budget: "$33 a day", result: "$412 spent · 12 purchases", thumbnailUrl: null, href: null },
    { id: "c2", name: "Gift sets — retargeting", status: { label: "Ready for review", tone: "warn" }, goal: "Sales", budget: "$7 a day", result: null, thumbnailUrl: null, href: null },
  ] satisfies CampaignSummaryRow[],
  insights: [
    { key: "i1", text: "$412 spent on one campaign in the last 14 days, as Meta reports it." },
    { key: "i2", text: "12 purchases reported by Meta; 11 matched to orders in your store, worth $538." },
    { key: "i3", text: "Too early to call a winning ad: MAIRO checks again Friday." },
  ] satisfies ResultsInsight[],
  team: [
    { role: "STRATEGIST", state: "Completed", tone: "blue", line: "Wrote the plan you approved." },
    { role: "CREATIVE", state: "Waiting for approval", tone: "warn", line: "Drafted a second opening line." },
    { role: "AUDIENCE", state: "Completed", tone: "blue", line: "Set up the audience you approved." },
    { role: "ARCHITECT", state: "Completed", tone: "blue", line: "Built the campaign you launched." },
    { role: "OPTIMIZER", state: "Monitoring scheduled", tone: "live", line: "Checks again Friday." },
    { role: "GUARDIAN", state: "Monitoring scheduled", tone: "live", line: "Spend is inside your limits." },
    { role: "ANALYST", state: "Monitoring scheduled", tone: "live", line: "Reads Meta's figures daily." },
    { role: "GROWTH", state: "Waiting for approval", tone: "warn", line: "Suggests testing the free-shipping line." },
  ] satisfies TeamMemberData[],
  teamIntro: "Your MAIRO AI Team is monitoring one live campaign. 2 recommendations are waiting for your approval.",
};

/** Fourteen sample days at about $30 a day, twelve purchases in all — drawn with the real chart. */
export function shopDaily(): DailyPoint[] {
  const spend = [28.4, 31.2, 29.6, 30.8, 27.9, 29.1, 30.2, 28.7, 31.6, 29.3, 30.1, 27.8, 29.0, 28.7];
  const purchases = [0, 1, 1, 0, 1, 2, 0, 1, 1, 0, 2, 1, 1, 1];
  const start = Date.UTC(2026, 8, 28);
  return spend.map((s, i) => ({ date: new Date(start + i * 86_400_000).toISOString().slice(0, 10), spendCents: Math.round(s * 100), revenueCents: 0, purchases: purchases[i], delivered: true }));
}

/** The recommendation the optimisation clip follows, as the Approval Center shows it. */
export const SHOP_DECISION: DecisionView = {
  id: "sample-opening",
  kind: "test-variation",
  category: "CREATIVE",
  urgent: false,
  mairoCampaignId: null,
  title: "Consider testing a new opening line.",
  noticed: "One ad has brought 9 of your 12 purchases. People stop for the mug in use, but fewer than 1 in 50 who see it click through.",
  noticedAdvanced: "Ad A: 9 of 12 purchases; click-through rate 1.8%. Frequency 2.4 over 14 days.",
  whyItMatters: "A second opening line, tested against the first, shows whether naming free shipping brings more buyers — without stopping what already works.",
  recommendation: "Add a version that opens with “Free shipping over $60” to Handmade mugs — sales, sharing its budget.",
  impact: "More purchases from the same spend, if the new line wins.",
  risk: "LOW",
  confidence: "MEDIUM",
  evidence: [
    { label: "Purchases from this ad", value: "9 of 12" },
    { label: "People who clicked", value: "1.8% of those who saw it", advancedLabel: "CTR" },
    { label: "Orders over $60", value: "7 of 11 matched" },
    { label: "Spend so far", value: "$412.40 over 14 days" },
  ],
  changes: [{ type: "new-ad-variation", platform: "META", mairoCampaignId: "c1", basedOnCampaignAdId: "a1", basedOnLabel: "Made by hand. Yours every morning.", campaignName: "Handmade mugs — sales" }],
  status: "PENDING",
  source: "Daily review",
  automatic: false,
  result: null,
  createdAt: "2026-10-12T11:05:00.000Z",
  decidedAt: null,
};
