import { generateObject } from "ai";
import { z } from "zod";
import { agentModel } from "@/lib/ai/model";
import { FACT_LABEL, type FactKey } from "@/lib/preview/build";
import type { SavedPlan } from "@/lib/preview/saved-plan";
import { GOAL_OPTIONS, budgetLabel } from "@/lib/preview/strategy";
import { REFINE_FACTS, readRequest, ruleReply, settleChanges, type RefineAnswer, type RefineChanges } from "@/lib/preview/refine";

// Reads the owner's answer to "Do you like it? What would you change?" under
// their free ad plan, into changes MAIRO can make to it. The model proposes;
// lib/preview/refine.ts keeps only what the owner's own words support. Without
// the AI (no key, or it fails) MAIRO's rules read the request instead, and the
// answer says which did. Nothing here is stored or logged.

const SYSTEM = [
  "You are MAIRO, an AI advertising assistant for small businesses. You just wrote a free Facebook and Instagram advertising plan for a business owner and asked: \"Do you like it? What would you change?\" Read their reply.",
  "",
  "What you can change in the plan:",
  "- monthly: their monthly Meta ad budget in US dollars, only if they gave a figure. A daily figure is monthly ÷ 30 (so $20 a day is 600).",
  `- goal: one of ${GOAL_OPTIONS.map((g) => `${g.value} (${g.label})`).join(", ")} — only if they ask for a different goal.`,
  `- facts: ${REFINE_FACTS.map((k) => `${k} (${FACT_LABEL[k]})`).join(", ")}. Only what they ask to change, in THEIR words — tidy grammar, never add anything. Never invent prices, offers, numbers, reviews, guarantees, years, awards or places.`,
  "- remove: facts they ask to take out.",
  "",
  "Rules:",
  "- Change only what they asked for. Leave everything else null or empty.",
  "- If they say they like it and ask for nothing, set likes to true, change nothing, and invite them to press \"Get started\".",
  "- MAIRO runs Meta ads (Facebook and Instagram) only. It doesn't post to social media profiles, doesn't run TikTok or Google ads, doesn't make videos with AI, and never promises results. If they ask for any of that, say so plainly and change nothing for it.",
  "- If they ask something you can't change here (e.g. the ad pictures or the 30-day schedule), say what you can change and that the rest is done with them after they get started.",
  "- reply: one or two short, warm sentences saying what you changed (or why not). Plain words, no emoji, no hype. Never claim results.",
].join("\n");

const schema = z.object({
  reply: z.string(),
  likes: z.boolean(),
  monthly: z.number().nullable(),
  goal: z.enum(["sales", "leads", "bookings", "traffic", "awareness"]).nullable(),
  facts: z.object(Object.fromEntries(REFINE_FACTS.map((k) => [k, z.string().nullable()])) as Record<FactKey, z.ZodNullable<z.ZodString>>),
  remove: z.array(z.enum(["name", "offering", "customer", "location", "offer", "proof", "problem"])),
});

/** Local browser checks only, never in production. */
const fixture = () => process.env.NODE_ENV !== "production" && process.env.MAIRO_PLAN_FIXTURE === "1";

export function refineAiAvailable(): boolean {
  return !fixture() && Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function byRules(plan: SavedPlan, message: string, by: "rules" | "fixture"): RefineAnswer {
  const { raw, likes } = readRequest(message);
  const { changes, dropped } = settleChanges(raw, plan, message);
  return { reply: ruleReply(changes, likes, dropped), changes, likes, by, dropped };
}

function planForModel(p: SavedPlan): string {
  return [
    `Goal: ${GOAL_OPTIONS.find((g) => g.value === p.inputs.goal)?.label ?? p.inputs.goal}`,
    `Monthly Meta ad budget: ${budgetLabel(p.inputs.monthly)}`,
    ...REFINE_FACTS.filter((k) => p.facts[k]).map((k) => `${FACT_LABEL[k]}: ${p.facts[k]}`),
    p.written?.concepts.length ? `Ad concepts: ${p.written.concepts.map((c) => `"${c.headline}"`).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Never throws: on any failure MAIRO's rules answer, and say so. */
export async function refinePlan(plan: SavedPlan, message: string, opts: { rulesOnly?: boolean } = {}): Promise<RefineAnswer> {
  if (fixture()) return byRules(plan, message, "fixture");
  if (opts.rulesOnly || !refineAiAvailable()) return byRules(plan, message, "rules");
  try {
    const { object } = await generateObject({
      model: agentModel,
      schema,
      system: SYSTEM,
      prompt: `The plan as it stands:\n${planForModel(plan)}\n\nWhat the owner replied:\n"""${message}"""`,
      maxOutputTokens: 4_000,
      abortSignal: AbortSignal.timeout(40_000),
    });
    const facts = Object.fromEntries(Object.entries(object.facts).filter(([, v]) => typeof v === "string" && v.trim())) as RefineChanges["facts"];
    const { changes, dropped } = settleChanges({ monthly: object.monthly, goal: object.goal, facts, remove: object.remove }, plan, message);
    const reply = object.reply.replace(/\s+/g, " ").trim().slice(0, 400) || ruleReply(changes, object.likes, dropped);
    return { reply, changes, likes: object.likes, by: "ai", dropped };
  } catch (error) {
    // What the owner typed is never logged — only that it failed.
    console.error("Free plan refine failed:", error instanceof Error ? error.name : "unknown");
    return byRules(plan, message, "rules");
  }
}
