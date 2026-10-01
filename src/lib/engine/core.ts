import {
  businessCategory,
  missionGoal,
  playbookFor,
  recommendMissionGoal,
  type Category,
  type CustomerAction,
  type MarketingObjective,
  type MetricFamily,
  type MissionGoal,
  type Understood,
} from "@/lib/mission/goals";

// The MAIRO Strategy Engine — the one place that decides marketing strategy.
//
// The owner gives an objective; this turns it into a structured objective,
// then a strategy: creative direction, audience, messaging, CTA, offer use,
// launch stages, promotion timing, budget split, testing plan and how sure
// MAIRO is. Campaign creation, creatives, Social Manager, recommendations
// and optimization all read it from here (lib/engine/index.ts).
//
// Everything in this file is pure: same inputs, same strategy, so
// scripts/check-engine.ts can pin every rule down. AI writes the words
// around it (lib/mission/planner.ts); the decisions are made here.

// --- 1. The objective, structured -----------------------------------------------

export type Intent = "High" | "Medium" | "Low";

export type StructuredObjective = {
  /** The goal MAIRO plans for ("Let MAIRO recommend" is resolved). */
  primaryGoal: Exclude<MissionGoal, "RECOMMEND">;
  chosenGoal: MissionGoal;
  secondaryGoal: MissionGoal | null;
  family: MetricFamily;
  /** e.g. "Lead generation". */
  goalLabel: string;
  /** What the customer should do, e.g. "Request an estimate". */
  desiredAction: string;
  customerAction: CustomerAction;
  /** e.g. "Roofing". */
  industry: string;
  category: Category;
  intent: Intent;
  /** e.g. "Local customer acquisition". */
  marketingFocus: string;
  item: string | null;
  price: string | null;
  discount: string | null;
  timing: { start: string | null; end: string | null };
};

const FAMILY_LABEL: Record<MetricFamily, string> = {
  sales: "Sales",
  leads: "Lead generation",
  bookings: "Bookings",
  calls: "Phone calls",
  traffic: "Website traffic",
  awareness: "Brand awareness",
  social: "Social growth",
  visits: "Store visits",
};

const ACTIONS: { re: RegExp; action: string; customer: CustomerAction }[] = [
  { re: /estimate|quote|inspection|assessment/, action: "Request an estimate", customer: "CONTACT" },
  { re: /reservation|reserve|table|dinner|brunch|lunch/, action: "Reserve a table", customer: "BOOK" },
  { re: /consult/, action: "Book a consultation", customer: "BOOK" },
  { re: /appointment|booking|\bbook\b|session|cut|treatment/, action: "Book an appointment", customer: "BOOK" },
  { re: /member/, action: "Join a membership", customer: "BUY" },
  { re: /trial|demo|sign ?ups?|subscri/, action: "Start a free trial", customer: "BUY" },
  { re: /\bcalls?\b|phone/, action: "Call the business", customer: "CALL" },
  { re: /walk-?ins?|come in|coming in|visit (my|our|the)/, action: "Visit the location", customer: "VISIT_LOCATION" },
];

const DEFAULT_ACTION: Record<MetricFamily, string> = {
  sales: "Buy",
  leads: "Get in touch",
  bookings: "Book an appointment",
  calls: "Call the business",
  traffic: "Visit the website",
  awareness: "Get to know the business",
  social: "Follow the business",
  visits: "Visit the location",
};

const INDUSTRY_WORDS: [RegExp, string][] = [
  [/roof/, "Roofing"],
  [/plumb/, "Plumbing"],
  [/hvac|heating|air condition/, "HVAC"],
  [/landscap|lawn/, "Landscaping"],
  [/detail|ceramic coat|car wash/, "Car detailing"],
  [/restaurant|dinner|brunch|bistro|cafe|café|pizza/, "Restaurant"],
  [/dent/, "Dentist"],
  [/barber/, "Barbershop"],
  [/salon|hair/, "Hair salon"],
  [/gym|fitness|membership|pilates|yoga/, "Fitness"],
  [/hoodie|clothing|apparel|t-?shirt|collection|fashion/, "Clothing"],
  [/real estate|realtor|listing/, "Real estate"],
  [/software|saas|\bapp\b|platform/, "Software"],
];

const LOCAL: Category[] = ["food", "trades", "auto", "beauty_fitness", "health", "realestate"];

/** Turns what MAIRO understood into a structured objective. */
export function structureObjective(input: {
  understood: Understood;
  request: string;
  chosenGoal?: MissionGoal | null;
  secondaryGoal?: MissionGoal | null;
  business: { industry: string; text: string; hasPricedProducts: boolean };
}): StructuredObjective {
  const low = `${input.request} ${input.understood.item ?? ""}`.toLowerCase();
  // The business's own industry first; their words only when it isn't known.
  const own = input.business.industry.trim();
  const industry = (own && (INDUSTRY_WORDS.find(([re]) => re.test(own.toLowerCase()))?.[1] ?? titleCase(own))) || INDUSTRY_WORDS.find(([re]) => re.test(low))?.[1] || null;
  const category = businessCategory(`${low} ${industry ?? ""} ${input.business.text}`);
  const chosen: MissionGoal = input.chosenGoal ?? input.understood.goal ?? "RECOMMEND";
  const primaryGoal = chosen === "RECOMMEND" ? recommendMissionGoal(category, input.business.hasPricedProducts) : chosen;
  const g = missionGoal(primaryGoal);
  const matched = ACTIONS.find((a) => a.re.test(low));
  // The action follows the goal: a "booking" word doesn't turn a sales goal into a booking one.
  const fits = matched && (g.metrics !== "sales" || matched.customer === "BUY");
  const desiredAction = fits ? matched!.action : primaryGoal === "NEW_PRODUCT" || primaryGoal === "PROMOTE_SALE" ? "Buy" : DEFAULT_ACTION[g.metrics];
  const customerAction = fits ? matched!.customer : g.action;

  const specific = Boolean(fits) || Boolean(input.understood.item);
  const intent: Intent = ["awareness", "social"].includes(g.metrics) ? "Low" : ["sales", "leads", "bookings", "calls"].includes(g.metrics) && specific ? "High" : "Medium";

  const weekday = /weekday|monday|tuesday|wednesday|thursday|mid-?week/.test(low);
  const slot = low.match(/\b(dinner|lunch|brunch|breakfast|evening|morning)s?\b/)?.[1];
  const marketingFocus =
    weekday ? `Fill weekday ${slot ?? "slots"}`
    : primaryGoal === "NEW_PRODUCT" || primaryGoal === "NEW_SERVICE" ? "Product launch"
    : primaryGoal === "PROMOTE_SALE" ? "Promotion"
    : /member/.test(low) ? "Recurring membership sign-ups"
    : category === "software" ? "Trial sign-ups and demos"
    : LOCAL.includes(category) && ["leads", "bookings", "calls", "visits", "sales"].includes(g.metrics) ? "Local customer acquisition"
    : g.metrics === "sales" ? "Online sales"
    : g.metrics === "awareness" ? "Brand awareness"
    : g.metrics === "traffic" ? "Qualified website visits"
    : "Customer acquisition";

  return {
    primaryGoal,
    chosenGoal: chosen,
    secondaryGoal: input.secondaryGoal ?? null,
    family: g.metrics,
    goalLabel: FAMILY_LABEL[g.metrics],
    desiredAction,
    customerAction,
    industry: industry ?? (category === "general" ? "Your business" : category),
    category,
    intent,
    marketingFocus,
    item: input.understood.item,
    price: input.understood.price,
    discount: input.understood.discount,
    timing: { start: input.understood.date, end: input.understood.endDate },
  };
}

// --- 2. Goal priorities (what each goal emphasises) -------------------------------

export const GOAL_PRIORITIES: Record<MetricFamily, string[]> = {
  sales: ["Product value", "Purchase intent", "Demonstrations", "Benefits", "Customer proof", "Objection handling", "Offers", "Retargeting when available", "Purchase CTA"],
  leads: ["Pain points", "Education", "Proof", "Free estimates", "Free consultations", "Forms", "Calls", "Messaging", "Strong lead CTA"],
  bookings: ["Service results", "Transformations", "Availability", "Testimonials", "Benefits", "Booking CTA"],
  calls: ["Why call you", "Proof", "Fast response", "Tap-to-call CTA"],
  traffic: ["A reason to click", "Useful content", "Relevant landing pages"],
  awareness: ["Who you are", "What makes you different", "Reach the right people often"],
  social: ["Shareable content", "Behind the scenes", "Community"],
  visits: ["What's waiting when they come in", "Local offers", "Reviews", "Directions"],
};

/** Objectives a marketing item may serve for each goal. Anything else isn't made. */
export const ALLOWED_OBJECTIVES: Record<MetricFamily, MarketingObjective[]> = {
  sales: ["Consideration", "Trust", "Conversion", "Promotion", "Product launch", "Education", "Retention", "Lead generation"],
  leads: ["Education", "Trust", "Lead generation", "Consideration", "Promotion"],
  bookings: ["Trust", "Booking", "Consideration", "Education", "Promotion", "Lead generation"],
  calls: ["Trust", "Lead generation", "Education", "Consideration"],
  traffic: ["Education", "Consideration", "Awareness", "Conversion"],
  awareness: ["Awareness", "Trust", "Education", "Consideration"],
  social: ["Awareness", "Education", "Trust", "Consideration"],
  visits: ["Consideration", "Promotion", "Trust", "Awareness"],
};

const CTA_FOR: Record<string, string> = {
  "Request an estimate": "Request Free Estimate",
  "Reserve a table": "Reserve a Table",
  "Book a consultation": "Book a Free Consultation",
  "Book an appointment": "Book Now",
  "Join a membership": "Join Today",
  "Start a free trial": "Start Free Trial",
  "Call the business": "Call Now",
  "Visit the location": "Get Directions",
  "Visit the website": "Learn More",
  "Get in touch": "Contact Us",
  "Get to know the business": "Learn More",
  "Follow the business": "Follow Us",
  Buy: "Shop Now",
};

const MESSAGING: Partial<Record<Category, Partial<Record<MetricFamily, string[]>>>> = {
  trades: { leads: ["Prevent expensive damage", "Get a professional inspection"], calls: ["Fast, local help when you need it"] },
  auto: { bookings: ["See the finish before you book", "Protect your car's paint for years"] },
  food: { bookings: ["A table is waiting tonight", "Your new weekday favorite"], visits: ["Come hungry — it's worth the trip"] },
  health: { bookings: ["Gentle, modern care", "Book a visit that fits your schedule"], leads: ["Answers from a professional, free"] },
  beauty_fitness: { bookings: ["See the results our clients get", "Openings this week"], sales: ["Start your membership today"] },
  retail: { sales: ["Made to be worn, not just bought", "Limited pieces — they go fast"] },
  realestate: { leads: ["Know what your home is worth", "Local expertise for buyers and sellers"] },
  software: { sales: ["See it solve your problem in minutes", "Try it free — no setup"], leads: ["See how teams like yours use it"] },
};

const GENERIC_MESSAGING: Record<MetricFamily, string[]> = {
  sales: ["What it does for you", "Proof it works", "A clear reason to buy now"],
  leads: ["The problem, named plainly", "Proof you can fix it", "Getting in touch is easy"],
  bookings: ["The result you'll get", "Booking is easy"],
  calls: ["We pick up and sort it out"],
  traffic: ["The answer is on our site"],
  awareness: ["Why choose us", "Who we are"],
  social: ["Worth following"],
  visits: ["What's waiting when you come in"],
};

// --- 3. Launch, promotion, budget, confidence -------------------------------------

export type LaunchStage = { stage: string; include: boolean; offsetDays: number; reason: string };

/** Which launch stages fit. Not every launch needs every stage. */
export function launchStages(input: { daysUntilLaunch: number | null; hasEndOrLimited: boolean; hasVideo: boolean; isService: boolean; windowDays: number }): LaunchStage[] {
  const lead = input.daysUntilLaunch ?? 0;
  return [
    { stage: "Tease", include: lead >= 3, offsetDays: -Math.min(3, Math.max(lead, 0)), reason: lead >= 3 ? "There's time to build curiosity before launch day." : "Launch is too close to tease — MAIRO goes straight to the reveal." },
    { stage: "Reveal", include: true, offsetDays: 0, reason: "Launch day: show it clearly." },
    { stage: "Education", include: true, offsetDays: 1, reason: input.isService ? "People need to understand what the service is and who it's for." : "Explain what it is and why it matters before asking for the sale." },
    { stage: "Demonstration", include: input.hasVideo || !input.isService, offsetDays: 3, reason: input.hasVideo ? "You have video — showing it in use builds purchase intent." : input.isService ? "No footage yet; MAIRO uses results instead of a demo." : "Seeing it in use is the strongest reason to buy." },
    { stage: "Social proof", include: input.windowDays >= 7, offsetDays: 6, reason: input.windowDays >= 7 ? "By then the first customers can vouch for it." : "Too early for real reviews — MAIRO won't invent them." },
    { stage: "Purchase", include: true, offsetDays: input.windowDays >= 7 ? 8 : 2, reason: "Ask for the sale once people know what it is." },
    { stage: "Urgency", include: input.hasEndOrLimited, offsetDays: input.windowDays >= 7 ? 9 : 3, reason: input.hasEndOrLimited ? "There's a real end date or limited stock." : "No deadline or limited stock, so no false urgency." },
  ];
}

export type PromotionPlan = {
  introduce: string;
  mentionsPerWeek: number;
  adsChange: { yes: boolean; why: string };
  newCreatives: { yes: boolean; why: string };
  urgency: { date: string; message: string }[];
  restraint: string | null;
};

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** When and how often to push a promotion — without making every week a sale. */
export function promotionPlan(input: { start: string; end: string | null; today: string; campaignsRunning: number; promotionsLast30Days: number; hasPromoCreative: boolean }): PromotionPlan {
  const lead = dayDiff(input.today, input.start);
  const length = input.end ? dayDiff(input.start, input.end) + 1 : null;
  const urgency = input.end
    ? [
        ...(length !== null && length >= 3 ? [{ date: addDays(input.end, -1), message: "Ends tomorrow" }] : []),
        { date: input.end, message: "Last day" },
      ]
    : [];
  return {
    introduce: lead >= 3 ? `Tease it on ${addDays(input.start, -2)}, announce it on ${input.start}.` : `Announce it on ${input.start}.`,
    // Outside the final two days, a promotion is mentioned at most twice a week.
    mentionsPerWeek: length !== null && length <= 3 ? Math.max(1, length) : 2,
    adsChange: input.campaignsRunning > 0
      ? { yes: true, why: "Your running ads should mention the offer while it lasts — MAIRO asks before changing them." }
      : { yes: false, why: "No ads are running, so there's nothing to update." },
    newCreatives: !input.hasPromoCreative && (length === null || length >= 3)
      ? { yes: true, why: "The offer runs long enough to deserve its own creative." }
      : { yes: false, why: input.hasPromoCreative ? "You already have a creative for it." : "It's too short to be worth new creative — MAIRO updates the text instead." },
    urgency,
    restraint: input.promotionsLast30Days >= 3 ? "You've run several promotions this month. MAIRO keeps discount messaging to this offer only, so customers don't learn to wait for sales." : null,
  };
}

export type BudgetPlan = {
  monthlyCents: number;
  dailyCents: number;
  /** Shares of ad spend by purpose. Always sums to 100. */
  allocation: { purpose: string; percent: number; why: string }[];
  summary: string;
  /** The owner can always change it; MAIRO never raises it on its own. */
  note: string;
};

const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;

export function recommendBudget(input: { monthlyCents: number | null; currentDailyCents: number; family: MetricFamily; pixelActive: boolean; hasLearnings: boolean }): BudgetPlan {
  const monthly = input.monthlyCents ?? (input.currentDailyCents > 0 ? input.currentDailyCents * 30 : 60_000);
  // Never say "your budget" about a figure the owner didn't give.
  const basis = input.monthlyCents !== null
    ? `Based on your ${usd(monthly)} monthly budget`
    : input.currentDailyCents > 0
      ? `Based on what your campaigns spend now (about ${usd(monthly)} a month)`
      : `You haven't set a budget yet, so MAIRO starts from about ${usd(monthly)} a month.`;
  const lead = basis.endsWith(".") ? `${basis} It` : `${basis}, MAIRO`;
  const daily = Math.max(500, Math.round(monthly / 30));
  const goalPurpose = input.family === "awareness" || input.family === "visits" ? "Reaching local people" : input.family === "traffic" ? "Bringing visitors" : "Customer acquisition";
  let allocation: BudgetPlan["allocation"];
  if (monthly < 60_000) {
    allocation = [{ purpose: goalPurpose, percent: 100, why: "At this budget, splitting it would starve every part. Everything goes to your goal." }];
  } else {
    const retarget = input.pixelActive && input.family !== "awareness" ? 15 : 0;
    const testing = input.hasLearnings ? 5 : 10;
    const awareness = input.family !== "awareness" && input.family !== "visits" && monthly >= 300_000 ? 10 : 0;
    allocation = [
      { purpose: goalPurpose, percent: 100 - retarget - testing - awareness, why: "Most spend goes straight at your goal." },
      ...(retarget ? [{ purpose: "Retargeting", percent: retarget, why: "People who visited your site but didn't act yet." }] : []),
      { purpose: "Testing new creatives", percent: testing, why: input.hasLearnings ? "A small share keeps finding better ads." : "New accounts need to find what works for them." },
      ...(awareness ? [{ purpose: "Awareness", percent: awareness, why: "At this budget, a little awareness feeds future customers." }] : []),
    ];
  }
  const summary =
    input.family === "awareness" || input.family === "visits"
      ? `${lead} recommends spending it on reaching the right local people often.`
      : monthly < 300_000
        ? `${lead} recommends focusing most spend on ${goalPurpose.toLowerCase()} before adding a larger awareness campaign.`
        : `${lead} recommends putting most spend on ${goalPurpose.toLowerCase()}, with smaller shares for ${allocation.slice(1).map((a) => a.purpose.toLowerCase()).join(" and ")}.`;
  return { monthlyCents: monthly, dailyCents: daily, allocation, summary, note: "A recommendation, not a promise of results. You can change it, and MAIRO never raises your budget on its own." };
}

export type Confidence = { level: "low" | "medium" | "high"; customer: string };

/**
 * How sure MAIRO is, from how much of this business's own data stands behind
 * the strategy. Shown to the customer in words, never as a percentage.
 */
export function engineConfidence(input: { spendCents: number; results: number; strongInsights: number; anyInsights: number }): Confidence {
  if (input.spendCents >= 50_000 && input.results >= 30 && input.strongInsights >= 1) {
    return { level: "high", customer: "This strategy is built on your own results." };
  }
  if (input.spendCents >= 5_000 || input.anyInsights >= 1) {
    return { level: "medium", customer: "MAIRO is becoming more confident in this strategy as your results come in." };
  }
  return { level: "low", customer: "MAIRO needs more data. Until your own results come in, this follows what works for businesses like yours." };
}

// --- 4. Learnings, as the strategy reads them ----------------------------------------

export type EngineInsight = {
  /** What's compared: format, hook, offer, audience, cta. */
  attribute: "format" | "hook" | "offer" | "audience" | "cta" | "meta-feature";
  winner: string;
  loser: string;
  /** e.g. "cost per lead". */
  metric: string;
  /** How much better, as a fraction (0.32 = 32%). */
  improvement: number;
  confidence: "MEDIUM" | "HIGH";
  statement: string;
  adjustment: string;
};

// --- 5. The strategy --------------------------------------------------------------------

export type CreativeDirection = { angle: string; objective: MarketingObjective; format: "IMAGE" | "CAROUSEL" | "VIDEO"; why: string };

export type EngineStrategy = {
  objective: StructuredObjective;
  headline: string;
  statement: string;
  priorities: string[];
  creativeDirection: CreativeDirection[];
  audienceDirection: string;
  messaging: string[];
  cta: string;
  offer: { use: boolean; guidance: string };
  testingPlan: string;
  optimizationFocus: string;
  retargeting: string;
  launch: LaunchStage[] | null;
  promotion: PromotionPlan | null;
  budget: BudgetPlan;
  confidence: Confidence;
  learningsApplied: string[];
  organic: string | null;
  /**
   * Meta's optional tools (Advantage+ placements, audience…) MAIRO may use for
   * this goal — validated, rolled out to this account, and not contradicted by
   * this business's own results (Meta Intelligence).
   */
  metaTools: { name: string; why: string }[];
};

const ADJ: Record<MarketingObjective, string> = {
  Awareness: "brand",
  Education: "educational",
  Trust: "proof-based",
  Consideration: "demonstration",
  "Lead generation": "free-estimate",
  Conversion: "offer-led",
  Booking: "availability-led",
  Retention: "loyalty",
  Promotion: "promotion",
  "Product launch": "launch",
};

const CAMPAIGN_WORD: Record<MetricFamily, string> = {
  sales: "sales campaigns",
  leads: "lead generation",
  bookings: "booking campaigns",
  calls: "call campaigns",
  traffic: "traffic campaigns",
  awareness: "awareness campaigns",
  social: "engagement campaigns",
  visits: "local reach campaigns",
};

const RESULT_WORD: Record<MetricFamily, string> = { sales: "purchase", leads: "lead", bookings: "booking", calls: "call", traffic: "visit", awareness: "person reached", social: "engagement", visits: "person reached" };

export function resultWordFor(family: MetricFamily): string {
  return RESULT_WORD[family];
}

export type StrategyInput = {
  objective: StructuredObjective;
  business: { name: string; offers: string[]; pixelActive: boolean; hasVideo: boolean; scale: boolean; location: string | null };
  marketing: {
    monthlyBudgetCents: number | null;
    currentDailyCents: number;
    campaignsRunning: number;
    promotion: { start: string; end: string | null; discount: string | null } | null;
    promotionsLast30Days: number;
    hasPromoCreative: boolean;
  };
  data: { spendCents: number; results: number };
  insights: EngineInsight[];
  today: string;
  /** From Meta Intelligence: the Meta tools that fit this goal and account. */
  metaOptions?: { featureKey: string; name: string; why: string }[];
};

export function buildStrategy(input: StrategyInput): EngineStrategy {
  const o = input.objective;
  const play = playbookFor(o.primaryGoal, o.category);
  const local = LOCAL.includes(o.category);
  const allowed = new Set(ALLOWED_OBJECTIVES[o.family]);
  if (o.primaryGoal === "NEW_PRODUCT" || o.primaryGoal === "NEW_SERVICE") allowed.add("Product launch");
  if (o.primaryGoal === "REPEAT_CUSTOMERS") allowed.add("Retention");

  // Creative direction: the playbook, filtered to what serves the goal, then
  // re-ordered by what this business's own results showed.
  let creative: CreativeDirection[] = play.creative
    .filter((c) => allowed.has(c.objective))
    .map((c) => ({ ...c, why: `Serves ${o.goalLabel.toLowerCase()}: ${c.objective === "Trust" ? "people need proof before they act" : c.objective === "Education" ? "it helps people recognise the problem you solve" : c.objective === "Consideration" ? "seeing it in action builds intent" : `it asks for the ${RESULT_WORD[o.family]} directly`}.` }));
  const learningsApplied: string[] = [];
  const formatWin = input.insights.find((i) => i.attribute === "format");
  if (formatWin) {
    const want = /video/i.test(formatWin.winner) ? "VIDEO" : /carousel/i.test(formatWin.winner) ? "CAROUSEL" : /image|static|graphic/i.test(formatWin.winner) ? "IMAGE" : null;
    if (want) {
      creative = [...creative.filter((c) => c.format === want), ...creative.filter((c) => c.format !== want)];
      learningsApplied.push(formatWin.adjustment);
    }
  }
  const offerWin = input.insights.find((i) => i.attribute === "offer");
  if (offerWin) learningsApplied.push(offerWin.adjustment);
  for (const m of input.insights.filter((i) => i.attribute === "meta-feature")) learningsApplied.push(m.adjustment);

  const promo = input.marketing.promotion;
  const promotion = promo ? promotionPlan({ start: promo.start, end: promo.end, today: input.today, campaignsRunning: input.marketing.campaignsRunning, promotionsLast30Days: input.marketing.promotionsLast30Days, hasPromoCreative: input.marketing.hasPromoCreative }) : null;
  const offerRested = input.marketing.promotionsLast30Days >= 3 || (offerWin && /no offer|without/i.test(offerWin.winner));
  const offer = promo
    ? { use: true, guidance: `Feature ${promo.discount ?? "the offer"} while it runs; urgency only in the last days.` }
    : offerRested
      ? { use: false, guidance: "MAIRO is resting discount messaging so customers don't learn to wait for sales." }
      : input.business.offers.length && ["sales", "visits", "bookings"].includes(o.family)
        ? { use: true, guidance: `Use your current offer ("${input.business.offers[0]}") as a reason to act — not in every ad.` }
        : { use: false, guidance: "No offer needed to start. MAIRO may suggest testing one later." };

  const launch = o.primaryGoal === "NEW_PRODUCT" || o.primaryGoal === "NEW_SERVICE"
    ? launchStages({
        daysUntilLaunch: o.timing.start ? dayDiff(input.today, o.timing.start) : null,
        hasEndOrLimited: Boolean(o.timing.end) || Boolean(o.discount),
        hasVideo: input.business.hasVideo,
        isService: o.primaryGoal === "NEW_SERVICE",
        windowDays: o.timing.start && o.timing.end ? dayDiff(o.timing.start, o.timing.end) + 1 : 10,
      })
    : null;

  const [a, b] = creative;
  const lowBudget = (input.marketing.monthlyBudgetCents ?? input.marketing.currentDailyCents * 30) > 0 && (input.marketing.monthlyBudgetCents ?? input.marketing.currentDailyCents * 30) < 45_000;
  const testingPlan = !a || !b
    ? "One strong ad first; MAIRO adds a second angle once the first has results."
    : lowBudget
      ? `Run the ${a.angle.toLowerCase()} ad first, then test it against ${b.angle.toLowerCase()} after a week — splitting a small budget slows learning.`
      : `Test ${ADJ[a.objective]} creative (${a.angle.toLowerCase()}) against ${ADJ[b.objective]} creative (${b.angle.toLowerCase()}).`;

  const headlineGoal: Record<MetricFamily, string> = { sales: "Sell More", leads: "Generate", bookings: "Get More", calls: "Get More Calls", traffic: "Drive Website Traffic", awareness: "Grow Awareness", social: "Grow Social", visits: "Bring People In" };
  const headline =
    o.family === "leads" ? `Generate ${o.industry === "Your business" ? "" : `${o.industry} `}Leads`
    : o.family === "bookings" ? `Get More ${/table/.test(o.desiredAction.toLowerCase()) ? "Reservations" : "Appointments"}${o.item ? `: ${titleCase(o.item)}` : ""}`
    : o.primaryGoal === "NEW_PRODUCT" && o.item ? `Launch ${titleCase(o.item)}`
    : o.family === "sales" && o.item ? `Sell More ${titleCase(o.item)}`
    : headlineGoal[o.family];

  const confidence = engineConfidence({
    spendCents: input.data.spendCents,
    results: input.data.results,
    strongInsights: input.insights.filter((i) => i.confidence === "HIGH").length,
    anyInsights: input.insights.length,
  });

  return {
    objective: o,
    headline,
    statement: `${local ? "Local " : ""}Meta ${CAMPAIGN_WORD[o.family]} supported by ${[a, b].filter(Boolean).map((c) => ADJ[c!.objective]).filter((v, i, arr) => arr.indexOf(v) === i).join(" and ")} creatives${input.business.scale ? ", plus organic social content" : ""}.`,
    priorities: GOAL_PRIORITIES[o.family].filter((p) => !/retargeting/i.test(p) || input.business.pixelActive),
    creativeDirection: creative,
    audienceDirection: local && input.business.location ? `${play.audience.replace(/\.$/, "")} — around ${input.business.location}.` : play.audience,
    messaging: MESSAGING[o.category]?.[o.family] ?? GENERIC_MESSAGING[o.family],
    cta: CTA_FOR[o.desiredAction] ?? play.cta,
    offer,
    testingPlan,
    optimizationFocus: `Cost per ${RESULT_WORD[o.family]}${o.family === "sales" && input.business.pixelActive ? " and return on ad spend" : ""}. MAIRO suggests moves toward what works; you approve them.`,
    retargeting: input.business.pixelActive ? "People who visited but didn't act see proof-led ads." : "Starts once your website's tracking is set up.",
    launch,
    promotion,
    budget: recommendBudget({ monthlyCents: input.marketing.monthlyBudgetCents, currentDailyCents: input.marketing.currentDailyCents, family: o.family, pixelActive: input.business.pixelActive, hasLearnings: input.insights.length > 0 }),
    confidence,
    learningsApplied,
    metaTools: (input.metaOptions ?? []).map((m) => ({ name: m.name, why: m.why })),
    organic: input.business.scale ? `Social Manager posts ${play.focus.slice(0, 3).map((f) => f.toLowerCase()).join(", ")} toward the same goal.` : null,
  };
}

const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

// --- 6. The core rule: every action serves the objective ---------------------------

export type ActionCheck = { ok: true; objective: MarketingObjective; reason: string } | { ok: false; reason: string };

/**
 * "What business objective is this action helping accomplish?" If there's no
 * meaningful answer, MAIRO doesn't recommend it.
 */
export function justifyAction(
  strategy: Pick<EngineStrategy, "objective" | "offer" | "budget">,
  action: { kind: "creative" | "post" | "campaign" | "promotion" | "budget"; objective?: MarketingObjective | null; discount?: boolean; adGoal?: string | null },
): ActionCheck {
  const o = strategy.objective;
  const allowed = new Set(ALLOWED_OBJECTIVES[o.family]);
  if (o.primaryGoal === "NEW_PRODUCT" || o.primaryGoal === "NEW_SERVICE") allowed.add("Product launch");
  if (o.primaryGoal === "REPEAT_CUSTOMERS") allowed.add("Retention");
  if (action.discount && !strategy.offer.use) return { ok: false, reason: strategy.offer.guidance };
  if (action.kind === "campaign" && action.adGoal === "AWARENESS" && ["sales", "leads", "bookings", "calls"].includes(o.family)) {
    // The budget split gives awareness a share only at larger budgets.
    return strategy.budget.monthlyCents < 300_000
      ? { ok: false, reason: `At this budget an awareness campaign would take spend away from ${o.goalLabel.toLowerCase()}.` }
      : { ok: true, objective: "Awareness", reason: "At this budget a small awareness share feeds future customers." };
  }
  if (!action.objective) return { ok: false, reason: "MAIRO can't say which business objective this would serve, so it doesn't recommend it." };
  if (!allowed.has(action.objective)) {
    return { ok: false, reason: `${action.objective} doesn't serve your current goal (${o.goalLabel.toLowerCase()}).` };
  }
  return { ok: true, objective: action.objective, reason: `Serves your goal — ${o.goalLabel.toLowerCase()} — through ${action.objective.toLowerCase()}.` };
}

// --- 7. The brief every creative carries -------------------------------------------

export type CreativeBrief = {
  goal: string;
  objective: MarketingObjective;
  audience: string;
  hook: string;
  message: string;
  cta: string;
  format: string;
  reason: string;
};

export function briefFor(strategy: EngineStrategy, direction: CreativeDirection | null, extra: { hook?: string | null; message?: string | null; cta?: string | null; format?: string | null; reason?: string | null } = {}): CreativeBrief {
  const d = direction ?? strategy.creativeDirection[0];
  return {
    goal: missionGoal(strategy.objective.primaryGoal).label,
    objective: d?.objective ?? "Consideration",
    audience: strategy.audienceDirection,
    hook: (extra.hook ?? strategy.messaging[0] ?? "").slice(0, 160),
    message: (extra.message ?? strategy.messaging.join(". ")).slice(0, 400),
    cta: extra.cta ?? strategy.cta,
    format: extra.format ?? (d ? d.format.toLowerCase() : "image"),
    reason: (extra.reason ?? d?.why ?? strategy.statement).slice(0, 300),
  };
}
