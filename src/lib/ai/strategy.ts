import { generateObject } from "ai";
import { z } from "zod";
import { agentModel } from "@/lib/ai/model";
import {
  AGE_MAX,
  AGE_MIN,
  CAMPAIGN_TYPE_VALUES,
  PLATFORMS,
  SECTION_KEYS,
  budgetWhyFor,
  campaignTypeInfo,
  conceptSchema,
  defaultCampaignType,
  recommendedRetargeting,
  recommendedSplit,
  recommendedStructure,
  strategySchema,
  usd,
  type PlanGoal,
  type SectionKey,
  type StrategyContent,
} from "@/lib/strategy/plan-logic";

// Writing the free MAIRO Advertising Plan, and revising it when the business
// asks. The AI writes the words — audience, product, creative, hooks, website
// advice. The numbers that follow from the budget (split, structure,
// retargeting) are worked out by plan-logic, so they always agree with it.
//
// Without an API key, or when the AI fails, a plain plan is written from the
// business's own answers instead. It says less, but nothing in it is invented.

export type StrategyInput = {
  businessName: string;
  industry: string | null;
  goal: PlanGoal;
  monthlyBudgetCents: number;
  destination: string | null;
  website: string | null;
  targetAudience: string | null;
  brandVoice: string | null;
  competitors: string | null;
  notes: string | null;
  offering: string | null;
  offer: string | null;
  location: string | null;
  /** What the Business Analyzer read off the website, when it ran. */
  brainBrief: string | null;
  /** Problems the analyzer found on the website, with its suggested fixes. */
  siteIssues: { issue: string; fix: string }[];
  purchaseTracking: boolean;
};

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function dailyFromMonthly(cents: number): number {
  return Math.max(5, Math.round(cents / 100 / 30));
}

const generated = z.object({
  summary: z.string().describe("3-4 sentences: what this plan does and why, for an owner with no ads experience. No promises of results."),
  goalWhy: z.string().describe("One sentence on why this goal fits the business."),
  platforms: z.array(z.enum(PLATFORMS)).min(1).max(2),
  platformsWhy: z.string(),
  audience: z.object({
    summary: z.string().describe("One or two sentences describing who the ads reach."),
    location: z.string().describe("City/region/country. Use the business's own answer when given; empty if unknown."),
    ageMin: z.number().int().min(AGE_MIN).max(AGE_MAX),
    ageMax: z.number().int().min(AGE_MIN).max(AGE_MAX),
    interests: z.array(z.string()).max(8).describe("Meta-style interests, e.g. 'Yoga', 'Home improvement'"),
  }),
  campaignType: z.enum(CAMPAIGN_TYPE_VALUES),
  campaignTypeWhy: z.string(),
  product: z.string().describe("The one product or service to lead with."),
  productWhy: z.string(),
  offer: z.string().describe("The offer to lead with. Only an offer the business mentioned; empty string if none."),
  offerWhy: z.string(),
  creativeStrategy: z.string().describe("2-3 sentences: the angle and style of the ads."),
  concepts: z.array(conceptSchema).min(2).max(3),
  hooks: z.array(z.string()).min(3).max(5).describe("Opening lines for the ads, under 120 characters each."),
  website: z.array(z.string()).min(1).max(5).describe("Concrete things to fix or add on the website/landing page before ads run."),
});

const SYSTEM = `You are MAIRO's advertising strategist. You write a first Meta (Facebook + Instagram) advertising plan for a small business owner who has never run ads.

Rules:
- MAIRO only runs Facebook and Instagram. Never mention TikTok, Google or other networks.
- Be realistic for the budget. Never promise results or quote expected numbers of sales, leads or ROAS.
- Only use facts the business gave or the website showed. Never invent prices, discounts, awards, reviews or claims.
- An offer must come from the business's own words or website; if there is none, return an empty offer and say in offerWhy that the ads lead with the product.
- Website recommendations must be specific to what is known. If the website wasn't read, give practical landing-page basics and say they are general.
- The campaign type must fit the goal.
- Plain English. No jargon like CPM, CTR or ROAS in anything the owner reads.`;

export function strategyFacts(i: StrategyInput): string {
  const budget = dailyFromMonthly(i.monthlyBudgetCents);
  return [
    `Business: ${i.businessName}`,
    `Industry: ${i.industry || "not given"}`,
    `Goal chosen at setup: ${i.goal}`,
    `How customers respond: ${i.destination || "not given"}`,
    `Budget: about ${usd(budget)}/day (${usd(Math.round(i.monthlyBudgetCents / 100))}/month)`,
    `Website: ${i.website || "none"}`,
    `What they want to advertise: ${i.offering || "not given"}`,
    `Current offer: ${i.offer || "none given"}`,
    `Where their customers are: ${i.location || "not given"}`,
    `Who they want to reach: ${i.targetAudience || "not given"}`,
    `Brand voice: ${i.brandVoice || "not given"}`,
    `Competitors: ${i.competitors || "none given"}`,
    `Notes: ${i.notes || "none"}`,
    `Purchase tracking (Meta Pixel) set up: ${i.purchaseTracking ? "yes" : "no"}`,
    i.brainBrief ? `What the website showed:\n${i.brainBrief}` : "The website has not been read.",
    i.siteIssues.length ? `Website problems found:\n${i.siteIssues.map((s) => `- ${s.issue} → ${s.fix}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

/** Fills in everything that follows from the budget, so the numbers always agree. */
export function finishPlan(base: Omit<StrategyContent, "split" | "structure" | "retargeting" | "budgetWhy" | "v">): StrategyContent {
  const plan = strategySchema.parse({ ...base, v: 1, split: [], structure: [], retargeting: "", budgetWhy: "" });
  plan.budgetWhy = budgetWhyFor(plan.dailyBudget, plan.platforms);
  plan.split = recommendedSplit(plan);
  plan.retargeting = recommendedRetargeting(plan);
  plan.structure = recommendedStructure(plan);
  if (plan.audience.ageMin > plan.audience.ageMax) plan.audience = { ...plan.audience, ageMin: plan.audience.ageMax, ageMax: plan.audience.ageMin };
  return plan;
}

function goalFor(input: StrategyInput): PlanGoal {
  return input.goal;
}

/** The plan from the business's own answers, with no AI. */
export function plainStrategy(i: StrategyInput): StrategyContent {
  const goal = goalFor(i);
  const product = (i.offering || i.industry || i.businessName).slice(0, 200);
  const type = defaultCampaignType(goal, i.destination);
  return finishPlan({
    summary: `A first Facebook and Instagram campaign for ${i.businessName}, aimed at ${goalLabelLower(goal)}. It starts with one clear message about ${product}, learns who responds, and grows from there.`,
    goal,
    goalWhy: "The goal you chose at setup.",
    platforms: ["FACEBOOK", "INSTAGRAM"],
    platformsWhy: "Facebook and Instagram together, so Meta can show each ad where it costs least.",
    dailyBudget: dailyFromMonthly(i.monthlyBudgetCents),
    audience: {
      summary: i.targetAudience || "People near you who are likely to need what you offer; Meta narrows it down as results come in.",
      location: i.location ?? "",
      ageMin: 25,
      ageMax: 65,
      interests: [],
    },
    campaignType: type,
    campaignTypeWhy: `Fits the goal and how your customers get in touch: ${campaignTypeInfo(type).label.split(" — ")[1] ?? ""}.`,
    product,
    productWhy: i.offering ? "What you told MAIRO you want to advertise." : "Your business as a whole — tell MAIRO if you'd rather lead with one product.",
    offer: i.offer ?? "",
    offerWhy: i.offer ? "The offer you mentioned at setup." : "No offer yet — the ads lead with the product itself.",
    creativeStrategy: "Show the product or service clearly in the first second, say who it's for, and end with one simple next step. MAIRO tests a few versions and keeps the one people respond to.",
    concepts: [
      { title: "The product up close", description: `A clear photo or short video of ${product}, with one line on why it's worth it.`, format: "image" },
      { title: "Before and after", description: "Show the problem your customer has, then how things look once you've helped.", format: "video" },
      { title: "Real customers", description: "A customer's own words or photo — only real ones, with their permission.", format: "image" },
    ],
    hooks: [
      `Looking for ${product.toLowerCase()}${i.location ? ` in ${i.location}` : ""}?`,
      `Here's why people choose ${i.businessName}.`,
      i.offer ? `${i.offer} — for a limited time.` : `See what ${i.businessName} can do for you.`,
    ],
    website: i.siteIssues.length
      ? i.siteIssues.slice(0, 5).map((s) => s.fix)
      : [
          "General advice (MAIRO hasn't read your site yet): make sure the page the ad opens says the same thing as the ad.",
          "Put one clear button near the top — Buy, Book or Call.",
          "Check the page loads quickly on a phone; most people will see your ads there.",
        ],
  });
}

function goalLabelLower(goal: PlanGoal): string {
  return {
    SALES: "more online sales",
    LEADS: "more leads and enquiries",
    TRAFFIC: "more website visits",
    AWARENESS: "more people knowing your brand",
    ENGAGEMENT: "more messages",
    APP_PROMOTION: "more app installs",
  }[goal];
}

export async function generateStrategy(i: StrategyInput): Promise<{ plan: StrategyContent; ai: boolean }> {
  if (!aiAvailable()) return { plan: plainStrategy(i), ai: false };
  try {
    const { object } = await generateObject({
      model: agentModel,
      schema: generated,
      system: SYSTEM,
      prompt: `${strategyFacts(i)}\n\nWrite this business's first MAIRO Advertising Plan. Keep the goal they chose (${i.goal}).`,
    });
    const goal = goalFor(i);
    const type = campaignTypeInfo(object.campaignType).goal === goal ? object.campaignType : defaultCampaignType(goal, i.destination);
    const plan = finishPlan({
      ...object,
      goal,
      dailyBudget: dailyFromMonthly(i.monthlyBudgetCents),
      campaignType: type,
      // Their own answer wins over the AI's guess.
      audience: { ...object.audience, location: i.location || object.audience.location, interests: object.audience.interests.slice(0, 8) },
      offer: i.offer || object.offer,
    });
    return { plan, ai: true };
  } catch (error) {
    console.error("Strategy AI failed:", error);
    return { plan: plainStrategy(i), ai: false };
  }
}

// --- Revising ---------------------------------------------------------------

const nullable = <T extends z.ZodTypeAny>(s: T) => s.nullable();

const revision = z.object({
  reply: z.string().describe("A short reply to the owner. If you changed something, start with 'Got it.' If it was a question, answer it."),
  updates: z.object({
    goal: nullable(z.enum(["SALES", "LEADS", "TRAFFIC", "AWARENESS", "ENGAGEMENT", "APP_PROMOTION"])),
    platforms: nullable(z.array(z.enum(PLATFORMS)).min(1).max(2)),
    dailyBudget: nullable(z.number().min(5).max(5000)),
    audience: nullable(
      z.object({
        summary: z.string(),
        location: z.string(),
        ageMin: z.number().int().min(AGE_MIN).max(AGE_MAX),
        ageMax: z.number().int().min(AGE_MIN).max(AGE_MAX),
        interests: z.array(z.string()).max(8),
      }),
    ),
    campaignType: nullable(z.enum(CAMPAIGN_TYPE_VALUES)),
    product: nullable(z.string()),
    offer: nullable(z.string()),
    creativeStrategy: nullable(z.string()),
    concepts: nullable(z.array(conceptSchema).min(1).max(3)),
    hooks: nullable(z.array(z.string()).min(1).max(5)),
    retargeting: nullable(z.string()),
    website: nullable(z.array(z.string()).min(1).max(5)),
  }).describe("Only the sections that should change. Everything else must be null."),
  reasons: z.array(z.object({ section: z.enum(SECTION_KEYS as [SectionKey, ...SectionKey[]]), reason: z.string() })).describe("One short reason per changed section."),
});

export type RevisionOutcome =
  | { kind: "changed"; reply: string; next: StrategyContent; reasons: Partial<Record<SectionKey, string>> }
  | { kind: "answer"; reply: string }
  | { kind: "unavailable" };

const REVISE_SYSTEM = `${SYSTEM}

You are now revising a plan the owner is reviewing. Change only what they ask for, plus parts that must change because of it (for example hooks when the product changes). Never change the budget unless they ask about budget or money. If they ask a question, answer it and change nothing. Keep everything else exactly as it is (null).`;

export async function reviseStrategy(plan: StrategyContent, request: string, context: string): Promise<RevisionOutcome> {
  if (!aiAvailable()) return { kind: "unavailable" };
  try {
    const { object } = await generateObject({
      model: agentModel,
      schema: revision,
      system: REVISE_SYSTEM,
      prompt: `About the business:\n${context}\n\nThe current plan (JSON):\n${JSON.stringify({ ...plan, split: undefined, structure: undefined })}\n\nThe owner asks: "${request}"`,
    });
    const u = object.updates;
    const next: StrategyContent = { ...plan };
    if (u.goal) next.goal = u.goal;
    if (u.platforms) next.platforms = PLATFORMS.filter((p) => u.platforms!.includes(p));
    // A budget change needs the owner to have talked about money.
    if (u.dailyBudget !== null && /\$|budget|spend|dollar|money|cheaper|afford|\d/i.test(request)) next.dailyBudget = Math.round(u.dailyBudget * 100) / 100;
    if (u.audience) next.audience = { ...u.audience, interests: u.audience.interests.slice(0, 8) };
    if (u.campaignType) next.campaignType = u.campaignType;
    if (u.product) next.product = u.product;
    if (u.offer !== null) next.offer = u.offer;
    if (u.creativeStrategy) next.creativeStrategy = u.creativeStrategy;
    if (u.concepts) next.concepts = u.concepts;
    if (u.hooks) next.hooks = u.hooks;
    if (u.retargeting) next.retargeting = u.retargeting;
    if (u.website) next.website = u.website;
    const checked = strategySchema.safeParse(next);
    if (!checked.success) return { kind: "unavailable" };
    const reasons: Partial<Record<SectionKey, string>> = {};
    for (const r of object.reasons) reasons[r.section] = r.reason;
    if (JSON.stringify(checked.data) === JSON.stringify(plan)) return { kind: "answer", reply: object.reply };
    return { kind: "changed", reply: object.reply, next: checked.data, reasons };
  } catch (error) {
    console.error("Strategy revision AI failed:", error);
    return { kind: "unavailable" };
  }
}
