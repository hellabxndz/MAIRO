import { generateObject } from "ai";
import { z } from "zod";
import { planModel } from "@/lib/ai/model";
import { BUTTONS } from "@/lib/creative/rewrite-rules";
import { FACT_LABEL, type FactKey, type PreviewFacts, type PreviewGoal } from "@/lib/preview/build";
import { FORMATS, settlePlan, type PlanConcept, type PlanSource, type RawPlan, type WrittenPlan } from "@/lib/preview/plan-writing";
import { GOAL_OPTIONS } from "@/lib/preview/strategy";

// The free AI ad plan's writing: what makes the business appealing, who is
// likely to buy, what the ads should say, and three ad concepts — written by
// the model from the facts the visitor confirmed and nothing else, then
// checked (lib/preview/plan-writing.ts) before anyone sees it. Nothing is
// saved here; the caller (/api/tools/ad-plan) limits how often it runs.

const SYSTEM = [
  "You are MAIRO's advertising strategist. You write a free, first Facebook and Instagram advertising plan for a small business, from the facts given.",
  "",
  "Hard rules:",
  "- Use ONLY the facts provided. Never invent prices, discounts, offers, deadlines, reviews, ratings, customer counts, awards, years in business, guarantees, certifications, locations or products.",
  "- No forecasts: never say how many sales, leads, visits or people an ad or budget will bring, and never promise a return.",
  "- Where a fact is missing, write around it — don't fill it in. You may suggest who is likely to buy, but say it plainly as a suggestion.",
  "- Never imply you know personal things about the reader (\"Are you struggling with…\"). No fake urgency or scarcity. No superlatives you can't prove (best, #1, cheapest). No ALL CAPS. At most one exclamation mark per ad. No hashtags or emoji.",
  "- Write for this business's goal. A sale, an enquiry, a booking, a website visit and brand awareness need different ads.",
  "- Three concepts, each a genuinely different angle (for example: the offer, the problem it solves, who it's for, proof, how it works) — only angles the facts support.",
  `- Headline: under 40 characters if you can, never over 60. Ad text: one to three short sentences, under 300 characters, the point first. Button: exactly one of ${BUTTONS.join(", ")}. Format: exactly one of ${FORMATS.join(", ")}.`,
  "- Visual direction: what the picture or video should show, using the business's own photos or video. Describe it; never claim a picture exists.",
  "- Every \"why\" is one short sentence a business owner would understand.",
].join("\n");

const schema = z.object({
  appeal: z.array(z.string()).describe("Up to three short points on what makes the offering appealing, each drawn from the facts."),
  customers: z.string().describe("Who is most likely to buy, as a short suggestion."),
  messaging: z.array(z.string()).describe("Two to four short points on what the ads should say."),
  concepts: z
    .array(
      z.object({
        label: z.string().describe("The angle, in two to four words."),
        headline: z.string(),
        primaryText: z.string(),
        format: z.string(),
        visual: z.string(),
        cta: z.string(),
        targetCustomer: z.string().describe("The customer this ad speaks to."),
        why: z.string().describe("Why MAIRO recommends testing it."),
      }),
    )
    .describe("Exactly three concepts."),
  firstIndex: z.number().describe("Which concept (0, 1 or 2) to test first."),
  firstWhy: z.string().describe("One sentence: why that one first."),
});

/** Local browser checks only, never in production: a fixed proposal from the facts, labelled as one, through the same checks. */
const fixture = () => process.env.NODE_ENV !== "production" && process.env.MAIRO_PLAN_FIXTURE === "1";

export function planWriterAvailable(): boolean {
  return fixture() || Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function factsForModel(f: PreviewFacts): string {
  const keys: FactKey[] = ["name", "offering", "customer", "location", "offer", "proof", "problem"];
  return keys
    .filter((k) => f[k].trim())
    .map((k) => `${FACT_LABEL[k]}: ${f[k].trim()} (${f.sources[k]?.from === "website" ? "from their website" : f.sources[k]?.from === "instagram" ? "from their Instagram" : "they told MAIRO"})`)
    .join("\n");
}

function fixturePlan(f: PreviewFacts, goal: PreviewGoal): RawPlan {
  const what = f.offering.trim().replace(/[.!]+$/, "");
  const who = f.customer.trim() || "people looking for this";
  const cta = goal === "sales" ? "Shop now" : goal === "bookings" ? "Book now" : goal === "leads" ? "Get a quote" : "Learn more";
  return {
    appeal: [`${what}, in your own words — the plainest reason to look twice.`, f.offer.trim() ? `A real offer: ${f.offer.trim()}.` : ""].filter(Boolean),
    customers: who,
    messaging: [`Say what you offer first: ${what}.`, f.proof.trim() ? `Back it up with: ${f.proof.trim()}.` : "Show your own work or product, not stock photos."],
    concepts: [
      { label: "Straight to the point", headline: what.slice(0, 40), primaryText: `${what}. ${f.name.trim() || "Find out more"}.`, format: "Single image", visual: "Your product or your work, clear and well lit.", cta, targetCustomer: who, why: "Says plainly what you offer to people already looking." },
      { label: "Who it's for", headline: `For ${who}`.slice(0, 40), primaryText: `Made for ${who}: ${what}.`, format: "Short video", visual: "The kind of customer you serve, in their own setting.", cta, targetCustomer: who, why: "Speaks to one kind of customer directly." },
      { label: "How it works", headline: "How it works", primaryText: `How ${what.toLowerCase()} works — in plain words.`, format: "Carousel", visual: "Three simple frames: first, next, and what they get.", cta, targetCustomer: who, why: "For people who don't know how it works yet." },
    ],
    firstIndex: 0,
    firstWhy: "It's the clearest of the three for someone seeing you for the first time.",
  };
}

export type PlanWriting = { source: PlanSource; plan: WrittenPlan | null; dropped: string[]; filled: number };

/** Asks the model for the plan's writing and keeps only what the facts support. Never throws. */
export async function writePlan(input: { facts: PreviewFacts; goal: PreviewGoal; monthly: number; kindLabel: string; fallback: PlanConcept[] }): Promise<PlanWriting> {
  const { facts: f, goal } = input;
  if (!planWriterAvailable()) return { source: { by: "templates", why: "off" }, plan: null, dropped: [], filled: 0 };
  if (fixture()) {
    const s = settlePlan(fixturePlan(f, goal), f, input.fallback);
    return { source: { by: "fixture", note: "Local test fixture, not MAIRO's AI: fixed wording built from your facts, for checking this screen." }, ...s };
  }
  const goalLabel = GOAL_OPTIONS.find((g) => g.value === goal)?.label ?? goal;
  const prompt = [
    `The business's goal: ${goalLabel}.`,
    `What they plan to spend on Meta ads: about $${Math.round(input.monthly).toLocaleString("en-US")} a month. (Don't put this figure in any ad.)`,
    `Kind of business: ${input.kindLabel}.`,
    "",
    "The facts — the only things the plan and the ads may state:",
    factsForModel(f) || "(only what's above)",
    "",
    "Write the plan: what makes it appealing, who's likely to buy, what the ads should say, three ad concepts and which to test first.",
  ].join("\n");
  try {
    const { object } = await generateObject({
      model: planModel,
      schema,
      system: SYSTEM,
      prompt,
      // Thinking counts toward this; low effort keeps a visitor's wait short for what is a writing task.
      maxOutputTokens: 12_000,
      abortSignal: AbortSignal.timeout(75_000),
      providerOptions: { anthropic: { structuredOutputMode: "outputFormat", effort: "low" } },
    });
    const s = settlePlan(object as RawPlan, f, input.fallback);
    return { source: { by: "ai" }, ...s };
  } catch (error) {
    // The facts are never logged — only that it failed.
    console.error("Free plan writing failed:", error instanceof Error ? error.name : "unknown");
    return { source: { by: "templates", why: "failed" }, plan: null, dropped: [], filled: 0 };
  }
}
