import type { AdGoal } from "@/generated/prisma/enums";
import type { CampaignContext } from "@/lib/campaigns/plan";
import type { Category } from "@/lib/social/goals";
import type { GroupKey } from "@/lib/score/rules";
import type { PlanEdit } from "@/lib/score/edits";

// "Help MAIRO learn your business": the questions the Campaign Review asks,
// a few at a time, only where an answer can improve the creative, audience,
// offer, messaging or conversion strategy.
//
//   - Personal to the business: a restaurant is asked which dish to promote,
//     a contractor whether they offer free estimates, software whether there's
//     a trial. Never one questionnaire for everyone.
//   - Two kinds of answer. Business Profile answers are long-term (what makes
//     you different, who buys) and are saved to the Business Brain once.
//     Campaign answers are temporary (this sale, when it ends) and stay on the
//     campaign — "20% off this weekend" never becomes a fact about the business.
//   - Asked once. When MAIRO already knows the answer it asks "Is that still
//     correct?" instead of asking again.
//   - Answering never changes the score by itself. It gives MAIRO what it
//     needs to improve the campaign; the score moves when the campaign does.
//
// Pure and free of the database, so the browser can turn a campaign answer
// into an edit and scripts/check-ad-score.ts can assert every rule.

export type BrainListField = "usps" | "painPoints" | "customerResults" | "objections" | "customerPraise" | "bestProducts" | "offers" | "creativeAssets";
export type BrainTextField = "targetCustomer" | "serviceArea" | "customerAges" | "bestCustomers" | "excludedCustomers" | "mostProfitable";
type ContextField = "promotion" | "promotionEnds" | "urgency";

/** The part of the Business Brain profile the questions read and write. */
export type KnownBusiness = Record<BrainListField, string[]> & Record<BrainTextField, string> & { declinedQuestions: string[] };

type ByCategory = Partial<Record<Category, string>> & { default: string };

type Def = {
  id: string;
  area: GroupKey;
  scope: "business" | "campaign";
  text: ByCategory;
  why: string;
  placeholder?: ByCategory;
  /** What MAIRO calls the saved answer: "We currently have your {label} as …". */
  label: string;
  brain?: BrainListField | BrainTextField;
  context?: ContextField;
  /** Only asked of these kinds of business. */
  categories?: Category[];
  /** Only asked for these campaign goals. */
  goals?: AdGoal[];
  /** A yes/no question: "yes" alone saves this value; "no" is remembered and not asked again. */
  yesValue?: ByCategory;
  /** For a yes/no offer question: an offer already in the profile that answers it. */
  matches?: RegExp;
  /** Pick any that apply, instead of typing. */
  choices?: string[];
  /** Asked only when this holds. */
  when?: (c: CampaignContext) => boolean;
};

const said = (v: string) => v.trim() !== "" && !/^(no|none|nope|n\/a|not right now)\.?$/i.test(v.trim());

const DEFS: Def[] = [
  // --- Hook ------------------------------------------------------------------------
  {
    id: "hook-why-us",
    area: "hook",
    scope: "business",
    label: "main selling point",
    brain: "usps",
    text: {
      default: "What makes customers choose you over a competitor?",
      food: "Why do regulars keep coming back instead of going somewhere else?",
      software: "What does your software do better than the alternatives?",
    },
    why: "This can help MAIRO create a stronger advertising hook.",
    placeholder: {
      default: "In your own words — e.g. what customers say when they recommend you",
      auto: 'e.g. "Ceramic coating that lasts years, done in a day"',
      trades: 'e.g. "Licensed, insured, and we turn up when we say"',
      food: 'e.g. "Everything made fresh every morning"',
      retail: 'e.g. "Made in small batches from organic cotton"',
      software: 'e.g. "Set up in ten minutes, no developer needed"',
      beauty_fitness: 'e.g. "Walk-ins welcome, no waiting"',
    },
  },
  {
    id: "hook-problem",
    area: "hook",
    scope: "business",
    label: "the main problem you solve",
    brain: "painPoints",
    text: {
      default: "What's the biggest problem your product or service solves?",
      software: "What's the main problem your software solves?",
      trades: "What problem usually makes people call you?",
      health: "What problem usually brings people in?",
      auto: "What problem does your service fix for car owners?",
    },
    why: "Ads that open with the customer's problem stop more people scrolling.",
  },
  {
    id: "hook-result",
    area: "hook",
    scope: "business",
    label: "strongest customer result",
    brain: "customerResults",
    text: { default: "What's the strongest result customers get?", food: "What do people say after they've eaten with you?" },
    why: "A real result makes a more convincing first line.",
  },
  {
    id: "hook-misunderstood",
    area: "hook",
    scope: "business",
    label: "what customers misunderstand",
    brain: "objections",
    text: { default: "Is there something customers often misunderstand about what you do?" },
    why: "MAIRO can clear it up in the ad before it stops someone buying.",
  },

  // --- Offer -----------------------------------------------------------------------
  {
    id: "offer-promo",
    area: "offer",
    scope: "campaign",
    label: "promotion",
    context: "promotion",
    text: {
      default: "Are you running a promotion for this campaign? A discount, a bundle, a bonus — or just say “no”.",
      food: "Is there a special you want to promote — a dish, a deal, a weekday offer? Or say “no”.",
      retail: "Is there a sale, bundle or first-order offer for this campaign? Or say “no”.",
    },
    why: "A clear reason to act now helps. MAIRO only puts offers you confirm in the ad — and it never has to be a discount.",
  },
  {
    id: "offer-ends",
    area: "offer",
    scope: "campaign",
    label: "end date",
    context: "promotionEnds",
    text: { default: "When does this offer end?" },
    why: "A real deadline can be mentioned honestly near the end — MAIRO never invents urgency.",
    when: (c) => said(c.promotion),
  },
  {
    id: "offer-urgency",
    area: "offer",
    scope: "campaign",
    label: "reason to act now",
    context: "urgency",
    categories: ["retail"],
    text: { default: "Is this a new drop, or is stock limited?" },
    why: "Limited stock is a real reason to act now — MAIRO only says it if it's true.",
  },
  {
    id: "offer-standing",
    area: "offer",
    scope: "business",
    label: "standing offer",
    brain: "offers",
    text: {
      default: "Do you offer a free consultation, quote or trial?",
      trades: "Do you offer free estimates?",
      services: "Do you offer a free consultation?",
      health: "Do you offer a free consultation?",
      realestate: "Do you offer a free home valuation or consultation?",
      retail: "Do you offer free shipping, or free shipping over an amount?",
      software: "Do you offer a free trial or a demo?",
      beauty_fitness: "Is there a first-visit offer?",
      auto: "Do you offer a package or a maintenance plan?",
      food: "Is there a first-visit or loyalty offer?",
    },
    yesValue: {
      default: "Free consultation",
      trades: "Free estimates",
      services: "Free consultation",
      health: "Free consultation",
      realestate: "Free consultation",
      retail: "Free shipping",
      software: "Free trial",
      beauty_fitness: "First-visit offer",
      auto: "Packages and maintenance plans",
      food: "Loyalty offer",
    },
    matches: /free\s+(estimate|quote|consultation|trial|shipping|delivery|valuation|class|inspection)|first[- ]visit|\bdemo\b|package|maintenance plan|loyalty/i,
    why: "Offers that aren't discounts — a free estimate, a trial — give people a low-risk first step.",
  },
  {
    id: "offer-guarantee",
    area: "offer",
    scope: "business",
    label: "guarantee",
    brain: "offers",
    text: { default: "Do you offer a guarantee, warranty or easy returns?" },
    yesValue: { default: "Satisfaction guarantee" },
    matches: /guarantee|warrant|returns?\b/i,
    why: "Taking the risk away is often stronger than a discount.",
  },
  {
    id: "offer-financing",
    area: "offer",
    scope: "business",
    label: "payment options",
    brain: "offers",
    categories: ["trades", "auto", "health", "realestate", "services"],
    text: { default: "Do you offer financing or payment plans?" },
    yesValue: { default: "Financing available" },
    matches: /financ|payment plan|pay (later|monthly)|instal/i,
    why: "For bigger purchases, payment options can be the reason someone acts now.",
  },

  // --- Audience --------------------------------------------------------------------
  {
    id: "aud-who",
    area: "audience",
    scope: "business",
    label: "main customer",
    brain: "targetCustomer",
    text: { default: "Who usually buys from you?", software: "Who usually signs up — what kind of team or person?" },
    why: "MAIRO writes the ad for the people most likely to buy.",
  },
  {
    id: "aud-where",
    area: "audience",
    scope: "business",
    label: "customer area",
    brain: "serviceArea",
    text: {
      default: "Where are most of your customers located?",
      food: "Which towns or neighbourhoods do most customers come from?",
      trades: "Which towns or areas do you cover?",
      beauty_fitness: "Which towns or neighbourhoods do most clients come from?",
      auto: "Which towns or areas do most customers come from?",
      health: "Which towns or areas do most patients come from?",
    },
    why: "For a local business, MAIRO makes sure the ad reaches people close enough to come.",
  },
  {
    id: "aud-ages",
    area: "audience",
    scope: "business",
    label: "typical customer age",
    brain: "customerAges",
    text: { default: "What age range buys most often?" },
    why: "A guide for the words and pictures — MAIRO doesn't narrow your targeting just to raise the score.",
  },
  {
    id: "aud-valuable",
    area: "audience",
    scope: "business",
    label: "most valuable customers",
    brain: "bestCustomers",
    text: { default: "What kind of customer is most valuable to you?" },
    why: "Lets MAIRO aim the message at the customers worth the most.",
  },
  {
    id: "aud-exclude",
    area: "audience",
    scope: "business",
    label: "customers to avoid",
    brain: "excludedCustomers",
    text: { default: "Are there customers you don't want to reach?" },
    why: "MAIRO avoids wording that attracts the wrong people.",
  },

  // --- Creative --------------------------------------------------------------------
  {
    id: "cre-assets",
    area: "creative",
    scope: "business",
    label: "ad material",
    brain: "creativeAssets",
    text: {
      default: "Which of these do you have for ads?",
      beauty_fitness: "Do you have before/after photos, or videos of your work?",
      trades: "Do you have before/after photos of finished jobs?",
      food: "Do you have photos or videos of your food?",
      software: "Do you have screenshots, a demo video or customer quotes?",
    },
    choices: ["Real product photos", "Customer videos", "Before/after photos", "Testimonials", "Customer-made content (UGC)", "Product demonstration videos"],
    why: "MAIRO recommends the strongest kind of creative for your goal from what you already have.",
  },
  {
    id: "cre-best",
    area: "creative",
    scope: "business",
    label: "best seller",
    brain: "bestProducts",
    categories: ["retail", "auto", "general", "services", "software", "health", "realestate"],
    text: { default: "What's your best-selling product or service?" },
    why: "Leading with what already sells is usually the strongest ad.",
  },
  {
    id: "cre-dish",
    area: "creative",
    scope: "campaign",
    label: "dish to promote",
    categories: ["food"],
    text: { default: "Which menu item do you most want to promote?" },
    why: "MAIRO builds the picture and words around it.",
  },
  {
    id: "cre-service",
    area: "creative",
    scope: "campaign",
    label: "service to promote",
    categories: ["beauty_fitness"],
    text: { default: "Which service do you want more bookings for?" },
    why: "MAIRO builds the ad around the service you want to fill.",
  },
  {
    id: "cre-praise",
    area: "creative",
    scope: "business",
    label: "what customers compliment",
    brain: "customerPraise",
    text: { default: "What do customers compliment most?" },
    why: "Real praise makes the most believable ad.",
  },

  // --- Landing page ------------------------------------------------------------------
  {
    id: "land-action",
    area: "landing",
    scope: "campaign",
    label: "action after the ad",
    text: { default: "What should someone do after seeing this ad?" },
    placeholder: { default: 'e.g. "Book a first visit" or "Buy the starter kit"' },
    why: "MAIRO checks that the button and the page lead to that one action.",
  },
  {
    id: "land-objection",
    area: "landing",
    scope: "business",
    label: "most common reason people don't buy",
    brain: "objections",
    text: { default: "What's the most common reason someone doesn't buy?" },
    why: "MAIRO can answer it in the ad, and suggest what the page should show.",
  },

  // --- Setup -------------------------------------------------------------------------
  {
    id: "setup-slow",
    area: "setup",
    scope: "campaign",
    label: "days to fill",
    categories: ["food", "beauty_fitness"],
    text: { default: "Are there slower days you want more customers?" },
    why: "MAIRO can focus the message on the days you need most.",
  },
  {
    id: "setup-profit",
    area: "setup",
    scope: "business",
    label: "most profitable work",
    brain: "mostProfitable",
    categories: ["trades", "services", "auto", "health", "beauty_fitness"],
    text: { default: "Which jobs or services make you the most money?", beauty_fitness: "Which services make you the most money?" },
    why: "MAIRO can put the campaign's attention behind what pays best.",
  },
];

export type ReviewQuestion = {
  id: string;
  area: GroupKey;
  scope: "business" | "campaign";
  /** "ask": not known yet. "confirm": known — "Is that still correct?" */
  mode: "ask" | "confirm";
  text: string;
  why: string;
  placeholder: string | null;
  label: string;
  /** What MAIRO has now, for a confirmation. */
  current: string | null;
  choices: string[] | null;
  yesNo: boolean;
  context: ContextField | null;
};

const pick = (by: ByCategory | undefined, category: Category): string | null => (by ? (by[category] ?? by.default) : null);

function knownValue(def: Def, known: KnownBusiness): string | null {
  if (!def.brain) return null;
  const v = known[def.brain as keyof KnownBusiness];
  if (Array.isArray(v)) {
    if (def.matches) return v.find((o) => def.matches!.test(o)) ?? null;
    return v.length ? v.slice(0, 3).join("; ") : null;
  }
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function answeredOnCampaign(def: Def, c: CampaignContext): boolean {
  if (c.answers[def.id] !== undefined) return true;
  return def.context ? c[def.context].trim() !== "" : false;
}

/**
 * The questions worth asking now, for one area or across the areas MAIRO
 * wants to improve first. New questions before confirmations, and at most one
 * confirmation at a time, so the owner isn't re-quizzed on what MAIRO knows.
 */
export function questionsFor(input: {
  areas: GroupKey[];
  category: Category;
  goal: AdGoal | null;
  known: KnownBusiness;
  context: CampaignContext;
  limit?: number;
  /** Ids already answered in this session. */
  skip?: string[];
}): ReviewQuestion[] {
  const { category, known, context } = input;
  const asks: ReviewQuestion[] = [];
  const confirms: ReviewQuestion[] = [];
  const usedFields = new Set<string>();
  for (const area of input.areas) {
    for (const def of DEFS) {
      if (def.area !== area || input.skip?.includes(def.id)) continue;
      if (def.categories && !def.categories.includes(category)) continue;
      if (def.goals && (!input.goal || !def.goals.includes(input.goal))) continue;
      if (def.when && !def.when(context)) continue;
      if (def.scope === "campaign") {
        if (answeredOnCampaign(def, context)) continue;
      } else if (known.declinedQuestions.includes(def.id)) {
        continue;
      }
      const base = {
        id: def.id,
        area: def.area,
        scope: def.scope,
        why: def.why,
        placeholder: pick(def.placeholder, category),
        label: def.label,
        choices: def.choices ?? null,
        yesNo: Boolean(def.yesValue),
        context: def.context ?? null,
      };
      const current = def.scope === "business" ? knownValue(def, known) : null;
      if (current) {
        // The same field asked two ways (e.g. objections) is confirmed once.
        if (usedFields.has(def.brain!)) continue;
        usedFields.add(def.brain!);
        confirms.push({ ...base, mode: "confirm", current, text: `We currently have your ${def.label} as “${current.length > 90 ? `${current.slice(0, 87)}…` : current}”. Is that still correct?` });
      } else {
        if (def.brain && usedFields.has(def.brain) && !def.yesValue) continue;
        if (def.brain) usedFields.add(def.brain);
        asks.push({ ...base, mode: "ask", current: null, text: pick(def.text, category)! });
      }
    }
  }
  const limit = input.limit ?? 3;
  const out = asks.slice(0, limit);
  if (out.length < limit && confirms[0]) out.push(confirms[0]);
  return out;
}

export function questionDef(id: string): Def | undefined {
  return DEFS.find((d) => d.id === id);
}

/** Every question id, for the checks. */
export const QUESTION_IDS = DEFS.map((d) => d.id);

const YES = /^(yes|yep|yeah|we do|sure)\b[\s,.:;—–-]*/i;
const NO = /^(no|nope|not (really|yet|right now)|we don'?t)\b/i;

export type BusinessAnswer =
  | { kind: "save"; field: BrainListField | BrainTextField; value: string | string[]; mode: "append" | "replace" | "set" }
  | { kind: "decline" }
  | { kind: "invalid"; error: string };

/**
 * How a Business Profile answer changes the profile. "replace" puts a
 * corrected answer in front of what MAIRO had (a confirmation the owner
 * updated). Pure; the server action saves the result.
 */
export function businessAnswer(id: string, raw: string, category: Category, replace = false): BusinessAnswer {
  const def = questionDef(id);
  if (!def || def.scope !== "business" || !def.brain) return { kind: "invalid", error: "That question isn't about your business profile." };
  const answer = raw.trim().slice(0, 300);
  if (!answer) return { kind: "invalid", error: "Type an answer first." };
  if (def.choices) {
    const picked = answer.split(";").map((x) => x.trim()).filter((x) => def.choices!.includes(x));
    return picked.length ? { kind: "save", field: def.brain, value: picked, mode: "set" } : { kind: "decline" };
  }
  if (def.yesValue) {
    if (NO.test(answer)) return { kind: "decline" };
    const rest = answer.replace(YES, "").trim();
    const value = rest || pick(def.yesValue, category)!;
    return { kind: "save", field: def.brain, value: value.charAt(0).toUpperCase() + value.slice(1), mode: "append" };
  }
  if (NO.test(answer) && answer.split(/\s+/).length <= 3) return { kind: "decline" };
  const list: BrainListField[] = ["usps", "painPoints", "customerResults", "objections", "customerPraise", "bestProducts", "offers", "creativeAssets"];
  const isList = list.includes(def.brain as BrainListField);
  return { kind: "save", field: def.brain, value: answer, mode: isList ? (replace ? "replace" : "append") : "set" };
}

/** Applies a saved answer to the known profile. Pure. */
export function applyBusinessAnswer<T extends KnownBusiness>(known: T, id: string, a: BusinessAnswer): T {
  if (a.kind === "decline") return { ...known, declinedQuestions: [...new Set([...known.declinedQuestions, id])] };
  if (a.kind !== "save") return known;
  const current = known[a.field as keyof KnownBusiness];
  if (Array.isArray(current)) {
    const add = Array.isArray(a.value) ? a.value : [a.value];
    const next =
      a.mode === "set"
        ? add
        : a.mode === "replace"
          ? [...add, ...current.slice(1)]
          : [...current, ...add.filter((x) => !current.some((c) => c.toLowerCase() === x.toLowerCase()))];
    return { ...known, [a.field]: next.slice(0, 30) };
  }
  return { ...known, [a.field]: Array.isArray(a.value) ? a.value.join("; ") : a.value };
}

/**
 * A campaign answer, as an edit to this campaign only — never the profile.
 * "No" to a promotion is remembered as answered with no promotion.
 */
export function campaignAnswerEdit(q: Pick<ReviewQuestion, "id" | "context">, raw: string): PlanEdit {
  const answer = raw.trim().slice(0, 300);
  if (q.context) {
    const value = said(answer) ? answer : "";
    return { op: "context", patch: { [q.context]: value }, answers: { [q.id]: value || "no" } };
  }
  return { op: "context", patch: {}, answers: { [q.id]: answer } };
}
