import { generateObject } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { agentModel } from "@/lib/ai/model";
import { brainPrompt, loadBrainState } from "@/lib/brain/store";
import { learningsBrief } from "@/lib/reports/learnings";
import { mediaLibrary } from "@/lib/instagram/library";
import { canOptimizeTowards } from "@/lib/tracking/pixels";
import { socialAccess } from "@/lib/social/access";
import { socialLearnings } from "@/lib/social/manager";
import { SEQUENCES } from "@/lib/social/goals";
import { runStrategyEngine } from "@/lib/engine";
import { metaKnowledgeBrief } from "@/lib/meta-intelligence/knowledge-base/store";
import { justifyAction, type EngineStrategy } from "@/lib/engine/core";
import {
  CUSTOMER_ACTIONS,
  MARKETING_OBJECTIVES,
  MISSION_GOAL_KEYS,
  adSetupFor,
  businessCategory,
  goalPhrase,
  missionGoal,
  playbookFor,
  readRequest,
  type Category,
  type CustomerAction,
  type MissionGoal,
  type Understood,
} from "./goals";

// The MAIRO marketing strategist: understand the business, read what it
// asked for, and build one plan — ads and (on Scale) social as one strategy.
// AI when available; a rule-based plan from goals.ts otherwise, so the
// product still works and still never plans anything without a reason.

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

// --- Understand the business --------------------------------------------------

export type BusinessFacts = {
  name: string;
  industry: string;
  category: Category;
  website: string | null;
  phone: string | null;
  sells: boolean;
  location: string | null;
  products: { name: string; price: string | null }[];
  offers: string[];
  brief: string;
  metaConnected: boolean;
  pixelActive: boolean;
  campaigns: { name: string; objective: string; status: string }[];
  media: { images: number; videos: number };
  scale: boolean;
  notes: { kind: string; text: string }[];
  unavailable: string[];
  learnings: string[];
  monthlyBudget: number | null;
};

export async function understandBusiness(organizationId: string): Promise<BusinessFacts> {
  const [org, brain, meta, pixel, campaigns, library, access, notes, intake, learned, social] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, industry: true, website: true, phone: true } }),
    loadBrainState(organizationId),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { id: true } }),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } }, select: { status: true } }),
    db.mairoCampaign.findMany({ where: { organizationId, status: { not: "ARCHIVED" } }, orderBy: { createdAt: "desc" }, take: 10, select: { name: true, objective: true, status: true } }),
    mediaLibrary(organizationId).catch(() => []),
    socialAccess(organizationId),
    db.missionNote.findMany({ where: { organizationId, active: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { monthlyBudgetCents: true } }),
    learningsBrief(organizationId),
    socialLearnings(organizationId),
  ]);
  const p = brain.profile;
  const location = (p.location || p.serviceArea) || notes.find((n) => n.kind === "INFO" && n.detailsJson.includes('"location"'))?.text || null;
  const sellsNote = notes.some((n) => n.kind === "INFO" && n.detailsJson.includes('"sells"'));
  return {
    name: org?.name ?? p.businessName,
    industry: org?.industry ?? p.industry,
    category: businessCategory([org?.industry, p.industry, p.categories.join(" "), p.overview, org?.name, notes.map((n) => n.text).join(" ")].join(" ")),
    website: org?.website || p.website || null,
    phone: org?.phone ?? null,
    sells: Boolean(p.overview || p.products.length || sellsNote),
    location,
    products: p.products.slice(0, 12).map((x) => ({ name: x.name, price: x.price })),
    offers: p.offers,
    // The whole Business Brain: facts with their sources, the goal, what's
    // temporary, what used to be true, and what MAIRO learned from results.
    brief: brainPrompt(brain),
    metaConnected: Boolean(meta),
    pixelActive: pixel ? canOptimizeTowards(pixel.status) : false,
    campaigns: campaigns.map((c) => ({ name: c.name, objective: c.objective, status: c.status })),
    media: { images: library.filter((m) => m.kind === "image").length, videos: library.filter((m) => m.kind === "video").length },
    scale: access.ok,
    notes: notes.map((n) => ({ kind: n.kind, text: n.text })),
    unavailable: [...new Set([...notes.filter((n) => n.kind === "UNAVAILABLE").map((n) => n.text), ...p.products.filter((x) => x.status === "unavailable").map((x) => x.name)])],
    learnings: [...(learned ? learned.split("\n").slice(1).map((l) => l.replace(/^- /, "")) : []), ...(social.measured >= 4 ? social.notes : [])],
    monthlyBudget: intake?.monthlyBudgetCents ? Math.round(intake.monthlyBudgetCents / 100) : null,
  };
}

// --- Reading a request ------------------------------------------------------------

const understoodSchema = z.object({
  intent: z.enum(["goal", "promotion", "launch", "unavailable", "info"]),
  goal: z.enum(MISSION_GOAL_KEYS).nullable(),
  item: z.string().max(120).nullable(),
  price: z.string().max(40).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  discount: z.string().max(60).nullable(),
});

/** What the business meant. AI when available; the rule reader otherwise or on failure. */
export async function interpretRequest(text: string, today: string, facts?: Pick<BusinessFacts, "name" | "industry"> | null): Promise<Understood> {
  const rules = readRequest(text, today);
  if (!aiAvailable()) return rules;
  try {
    const { object } = await generateObject({
      model: agentModel,
      schema: understoodSchema,
      abortSignal: AbortSignal.timeout(15_000),
      system: `You read what a small-business owner tells their AI marketing manager and classify it.
- intent "goal": they want an outcome (more sales, bookings, leads, calls, website traffic, people coming in, followers, awareness, repeat customers). Pick the closest goal. "More customers" with no detail → RECOMMEND.
- intent "launch": they're launching something new (goal NEW_PRODUCT or NEW_SERVICE). item = what it is (null if they didn't say), price and date if given.
- intent "promotion": a sale, discount or offer running now or soon. goal PROMOTE_SALE. discount, item, date (start), endDate.
- intent "unavailable": something sold out or no longer offered. item = what.
- intent "info": anything else worth remembering.
Today is ${today}. Resolve weekdays and "this weekend" to dates on or after today. Never invent details they didn't give.`,
      prompt: `${facts ? `Business: ${facts.name} (${facts.industry || "industry unknown"}).\n` : ""}They said: "${text.slice(0, 800)}"`,
    });
    return { ...object, goal: object.goal ?? rules.goal };
  } catch (error) {
    console.error("Mission request reading failed:", error);
    return rules;
  }
}

// --- The plan -------------------------------------------------------------------

const ACTION_KEYS = CUSTOMER_ACTIONS.map((a) => a.key) as [CustomerAction, ...CustomerAction[]];
const OBJECTIVE_KEYS = [...MARKETING_OBJECTIVES] as [string, ...string[]];

export const missionPlanSchema = z.object({
  title: z.string().min(3).max(70),
  mission: z.string().min(10).max(240),
  strategy: z.string().min(10).max(400),
  why: z.string().min(10).max(500),
  focus: z.array(z.string().max(80)).min(3).max(8),
  tactics: z.object({
    customerAction: z.enum(ACTION_KEYS),
    audience: z.string().max(300),
    creative: z.string().max(300),
    messaging: z.string().max(300),
    cta: z.string().max(60),
    budget: z.string().max(300),
    channels: z.string().max(200),
    frequency: z.string().max(200),
    promotion: z.string().max(300),
    retargeting: z.string().max(300),
    testing: z.string().max(300),
    optimization: z.string().max(300),
  }),
  adConcepts: z
    .array(
      z.object({
        name: z.string().max(60),
        objective: z.enum(OBJECTIVE_KEYS),
        format: z.enum(["IMAGE", "CAROUSEL", "VIDEO"]),
        headline: z.string().max(60),
        primaryText: z.string().max(400),
        cta: z.string().max(40),
        why: z.string().min(10).max(300),
      }),
    )
    .min(2)
    .max(4),
  organic: z.string().max(400).nullable(),
  timeline: z.array(z.object({ when: z.string().max(40), what: z.string().max(160), channel: z.enum(["Ads", "Social", "Both"]) })).max(10),
  secondaryNote: z.string().max(300).nullable(),
  dailyBudget: z.number().min(5).max(1000),
});

export type MissionPlanContent = z.infer<typeof missionPlanSchema>;

export type MissionPlan = MissionPlanContent & {
  goal: Exclude<MissionGoal, "RECOMMEND">;
  chosenGoal: MissionGoal;
  secondaryGoal: MissionGoal | null;
  category: Category;
  focusItem: string | null;
  adSetup: ReturnType<typeof adSetupFor>;
  scale: boolean;
  launch: { item: string | null; price: string | null; date: string | null; endDate: string | null; discount: string | null } | null;
  /** The Strategy Engine's strategy this plan was built from. Missing on plans made before it existed. */
  engine?: EngineStrategy;
};

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}
const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function rulePlan(input: PlanInput, goal: Exclude<MissionGoal, "RECOMMEND">, facts: BusinessFacts, engine: EngineStrategy): MissionPlanContent {
  const g = missionGoal(goal);
  const play = playbookFor(goal, engine.objective.category);
  const item = input.launch?.item ?? input.focusItem;
  const budget = Math.max(5, Math.round(engine.budget.dailyCents / 100));
  const kind = facts.category === "general" ? "your kind of business" : `a ${facts.category.replace("_", " & ").replace("realestate", "real estate").replace("auto", "car care")} business`;
  const reasonByFamily: Record<string, string> = {
    sales: "people buy once they've seen the product working and seen that others are happy with it",
    leads: "people get in touch when they recognise their problem and trust you can fix it",
    bookings: "people book when they can see the result and booking feels easy",
    calls: "people call when they're confident you'll pick up and sort it out",
    traffic: "a reason to click beats a generic ad",
    awareness: "being seen often by the right local people is what makes them think of you first",
    social: "people follow accounts that teach, entertain or show something real",
    visits: "local people come in when they see what's waiting and that it's close by",
  };
  const timeline: MissionPlanContent["timeline"] = [];
  if (input.launch?.date && (goal === "NEW_PRODUCT" || goal === "NEW_SERVICE")) {
    for (const step of SEQUENCES[goal === "NEW_PRODUCT" ? "NEW_PRODUCT" : "NEW_SERVICE"]) {
      if (step.fromEnd) continue;
      const date = addDays(input.launch.date, step.offset);
      timeline.push({ when: fmtDay(date), what: step.step, channel: step.step === "Teaser" || step.step === "Product reveal" || step.step === "Introduction" || /Buy|Book/.test(step.step) ? "Both" : facts.scale ? "Social" : "Ads" });
    }
  }
  return {
    title: (!item ? engine.headline : /^Launch/.test(g.title) ? `Launch ${titleCase(item)}` : `${g.title}: ${titleCase(item)}`).slice(0, 70),
    mission: item ? `${g.sentence.replace(/\.$/, "")} — ${item}.` : g.sentence,
    strategy: facts.scale
      ? `MAIRO combines Meta ads with organic social content, both built around ${goalPhrase(goal)} for ${kind}.`
      : `MAIRO runs Meta ads built around ${goalPhrase(goal)} for ${kind}.`,
    why: `For ${kind}, ${reasonByFamily[g.metrics]}. So MAIRO leads with ${play.focus.slice(0, 2).map((f) => f.toLowerCase()).join(" and ")}, then a clear "${engine.cta}".`,
    focus: play.focus,
    tactics: {
      customerAction: engine.objective.customerAction,
      audience: engine.audienceDirection.slice(0, 300),
      creative: engine.creativeDirection.map((c) => c.angle).join(", ").slice(0, 300),
      messaging: engine.messaging.join(". ").slice(0, 300),
      cta: engine.cta.slice(0, 60),
      budget: `About $${budget}/day. ${engine.budget.summary} MAIRO shows you the budget before anything launches and never raises it on its own.`.slice(0, 300),
      channels: [facts.metaConnected ? "Facebook and Instagram ads" : "Facebook and Instagram ads (connect Meta to run them)", facts.scale ? "your Instagram and Facebook Page (Social Manager)" : null].filter(Boolean).join(" + "),
      frequency: facts.scale ? "Ads run continuously; 3–5 organic posts a week." : "Ads run continuously; MAIRO refreshes creatives as they tire.",
      promotion: engine.offer.guidance.slice(0, 300),
      retargeting: engine.retargeting.slice(0, 300),
      testing: engine.testingPlan.slice(0, 300),
      optimization: engine.optimizationFocus.slice(0, 300),
    },
    adConcepts: (engine.creativeDirection.length >= 2 ? engine.creativeDirection : play.creative).slice(0, 4).map((c) => ({
      name: c.angle,
      objective: c.objective,
      format: c.format,
      headline: `${c.angle}${item ? `: ${item}` : ""}`.slice(0, 60),
      primaryText: `${facts.name}${item ? ` — ${item}` : ""}. ${facts.offers[0] ?? ""}`.trim().slice(0, 400),
      cta: engine.cta.slice(0, 40),
      why: `Your goal is ${goalPhrase(goal)}. This ${c.angle.toLowerCase()} ad builds ${c.objective.toLowerCase()}, which ${c.objective === "Trust" ? "people need before they act" : c.objective === "Education" ? "helps people recognise they need you" : "turns interest into action"}.`,
    })),
    organic: facts.scale ? `Social Manager posts ${play.focus.slice(0, 3).map((f) => f.toLowerCase()).join(", ")} on your own feed, so people who see your ads find proof when they check you out.` : null,
    timeline,
    secondaryNote: input.secondary ? `Your second goal, ${goalPhrase(input.secondary)}, gets a smaller share and never at the expense of ${goalPhrase(goal)}.` : null,
    dailyBudget: budget,
  };
}

const PLAN_SYSTEM = `You are MAIRO, an AI marketing manager for a small business. The owner told you what they want to achieve; you decide the marketing approach. Write for someone with no marketing knowledge.

Rules:
- One strategy: paid Meta ads plus, only when "scale" is true, organic Instagram/Facebook content. If scale is false, organic must be null and never promise social posting.
- Tailor it to this industry: clothing (lifestyle, drops, UGC, details, offers), restaurants (food video, local offers, menu highlights, reviews, local targeting), contractors (before/after, education, testimonials, estimate CTA, local leads), barbers/salons (transformations, availability, style examples, booking CTA), real estate (property, neighborhood, buyer/seller education, leads), car care (transformations, proof, benefits, local, booking). Never generic.
- Match creative to goal: sales → benefits, demonstration, social proof, objection handling, offers; leads → pain points, education, proof, free estimate/consultation, contact CTA; bookings → results, service demo, trust, availability, booking CTA; new product → teaser, reveal, benefits, demo, proof, purchase CTA, urgency when appropriate.
- Every ad concept has an objective and a one-sentence "why" tied to the goal. If you can't explain why something serves the goal, leave it out.
- The primary goal comes first. A secondary goal gets a smaller share and must never hurt the primary.
- Use only facts given. Never invent prices, offers, reviews, awards or results. Never promise outcomes.
- Never plan marketing for anything listed as unavailable.
- Budget: recommend a sensible daily amount; say MAIRO shows it before launch and never raises it alone.
- Retargeting only "when the site's tracking is set up" unless pixelActive is true.
- Keep every field short and plain. Title is the mission name, e.g. "Get More Ceramic Coating Bookings".`;

export type PlanInput = {
  goal: MissionGoal;
  /** The business's local date, for launch and promotion timing. */
  today?: string;
  /** What MAIRO understood from their words, when they used words. */
  understood?: Understood | null;
  secondary?: MissionGoal | null;
  request: string;
  focusItem?: string | null;
  launch?: MissionPlan["launch"];
};

export async function buildMissionPlan(organizationId: string, input: PlanInput, facts?: BusinessFacts): Promise<{ plan: MissionPlan; ai: boolean }> {
  const f = facts ?? (await understandBusiness(organizationId));
  // The Strategy Engine decides; the plan (rules or AI) puts it into words.
  const engine = await runStrategyEngine(organizationId, f, {
    goal: input.goal,
    secondary: input.secondary ?? null,
    request: input.request,
    understood: input.understood ?? null,
    launch: input.launch ?? null,
    today: input.today ?? new Date().toISOString().slice(0, 10),
  });
  const goal: Exclude<MissionGoal, "RECOMMEND"> = input.goal === "RECOMMEND" ? engine.objective.primaryGoal : input.goal;
  const fallback = rulePlan(input, goal, f, engine);
  let content = fallback;
  let ai = false;
  if (aiAvailable()) {
    try {
      const { object } = await generateObject({
        model: agentModel,
        schema: missionPlanSchema,
        system: PLAN_SYSTEM,
        abortSignal: AbortSignal.timeout(45_000),
        prompt: [
          f.brief,
          `Industry: ${f.industry || "unknown"} (category: ${f.category}). Website: ${f.website ?? "none"}. Location: ${f.location ?? "unknown"}.`,
          `Meta connected: ${f.metaConnected}. pixelActive: ${f.pixelActive}. scale: ${f.scale}. Media available: ${f.media.images} pictures, ${f.media.videos} videos.`,
          f.campaigns.length ? `Existing campaigns: ${f.campaigns.map((c) => `${c.name} (${c.objective}, ${c.status})`).join("; ")}` : "No campaigns yet.",
          f.learnings.length ? `What MAIRO has learned from their results:\n- ${f.learnings.join("\n- ")}` : "",
          await metaKnowledgeBrief().catch(() => ""),
          f.notes.length ? `What they've told MAIRO:\n- ${f.notes.map((n) => `${n.kind}: ${n.text}`).join("\n- ")}` : "",
          f.unavailable.length ? `Unavailable — never promote: ${f.unavailable.join("; ")}` : "",
          `\nPrimary goal: ${missionGoal(goal).label}${input.goal === "RECOMMEND" ? " (MAIRO's recommendation for this business)" : ""}.`,
          input.secondary ? `Secondary goal: ${missionGoal(input.secondary).label}.` : "",
          input.request ? `In their words: "${input.request.slice(0, 600)}"` : "",
          input.launch ? `Launch/promotion details: ${JSON.stringify(input.launch)}` : "",
          `\nMAIRO's Strategy Engine already decided the strategy. Follow it; write it in plain words for this business:`,
          engineBrief(engine),
        ]
          .filter(Boolean)
          .join("\n"),
      });
      // The engine's decisions stand: budget, the customer action, and only
      // ad concepts that serve the goal.
      const concepts = object.adConcepts.filter((c) => justifyAction(engine, { kind: "creative", objective: c.objective as never }).ok);
      content = {
        ...object,
        organic: f.scale ? object.organic : null,
        dailyBudget: fallback.dailyBudget,
        tactics: { ...object.tactics, customerAction: engine.objective.customerAction },
        adConcepts: concepts.length >= 2 ? concepts : fallback.adConcepts,
      };
      ai = true;
    } catch (error) {
      console.error("Mission plan AI failed:", error);
    }
  }
  return {
    plan: {
      ...content,
      goal,
      chosenGoal: input.goal,
      secondaryGoal: input.secondary ?? null,
      category: f.category,
      focusItem: input.focusItem ?? input.launch?.item ?? null,
      adSetup: adSetupFor(content.tactics.customerAction, { hasWebsite: Boolean(f.website), hasPhone: Boolean(f.phone), pixelActive: f.pixelActive }),
      scale: f.scale,
      launch: input.launch ?? null,
      engine,
    },
    ai,
  };
}

/** The engine's strategy, for the AI writing the plan. */
function engineBrief(e: EngineStrategy): string {
  const o = e.objective;
  return [
    `- Objective: ${o.goalLabel}; desired action: ${o.desiredAction}; industry: ${o.industry}; intent: ${o.intent}; focus: ${o.marketingFocus}.`,
    `- Strategy: ${e.statement}`,
    `- Priorities: ${e.priorities.join(", ")}.`,
    `- Creative direction (in this order): ${e.creativeDirection.map((c) => `${c.angle} (${c.objective}, ${c.format})`).join("; ")}.`,
    `- Audience: ${e.audienceDirection}`,
    `- Messaging: ${e.messaging.join("; ")}. CTA: ${e.cta}.`,
    `- Offer: ${e.offer.guidance}`,
    `- Testing: ${e.testingPlan}`,
    `- Budget: about $${Math.round(e.budget.dailyCents / 100)}/day. ${e.budget.summary}`,
    e.launch ? `- Launch stages: ${e.launch.filter((s) => s.include).map((s) => s.stage).join(", ")} (skip the rest).` : "",
    e.promotion ? `- Promotion: ${e.promotion.introduce} Mention it about ${e.promotion.mentionsPerWeek}× a week.${e.promotion.restraint ? ` ${e.promotion.restraint}` : ""}` : "",
    e.learningsApplied.length ? `- From their own results: ${e.learningsApplied.join(" ")}` : "",
    e.metaTools?.length ? `- Meta tools MAIRO may use (validated for this goal and account): ${e.metaTools.map((t) => t.name).join(", ")}. Don't promise others.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
