import { generateObject } from "ai";
import { z } from "zod";
import { agentModel } from "@/lib/ai/model";
import { BUTTONS, settleRewrite, type RewriteOutcome, type Words } from "@/lib/creative/rewrite-rules";

// "Make the hook stronger", "Make this more luxurious", "Focus more on our
// offer": one change to a suggested ad's words, asked for in plain language.
//
// The model proposes; nothing is saved. Its proposal is then checked, not
// trusted (lib/creative/rewrite-rules.ts), and the owner sees it beside the
// current words before choosing to keep it as a new version.

const SYSTEM = [
  "You revise the words of one Facebook and Instagram ad for a small business, following the owner's instruction.",
  "",
  "Hard rules:",
  "- Use ONLY the facts provided. Never invent prices, discounts, offers, deadlines, reviews, ratings, customer counts, awards, years in business, guarantees or products.",
  "- If the instruction needs something the facts don't contain (an offer, a new product, a result), don't make it up: keep the words close to the current ones and say in the note what MAIRO would need to know.",
  "- Keep the ad's angle. Change what the instruction asks for and little else.",
  "- Never imply you know personal things about the reader. No fake urgency or scarcity. No ALL CAPS. At most one exclamation mark. No hashtags.",
  `- Opening line: one sentence, under 90 characters. The rest: one to three short sentences, under 300 characters.`,
  `- Button: exactly one of ${BUTTONS.join(", ")}. Keep the current one unless the instruction is about the button.`,
  "- The note is one short sentence to the owner: what you changed, or why you couldn't.",
].join("\n");

/** Local browser checks only, never in production: a fixed proposal, labelled as one, run through the same checks. */
const fixture = () => process.env.NODE_ENV !== "production" && process.env.MAIRO_REWRITE_FIXTURE === "1";

export function rewriteAvailable(): boolean {
  return fixture() || Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** Asks the model for one revision of the words. Saves nothing. */
export async function rewriteWords(input: { current: Words; instruction: string; title: string; factText: string; brain: string; avoid: string[] }): Promise<RewriteOutcome> {
  if (!rewriteAvailable()) return { ok: false, error: "Rewriting with AI isn't switched on for this deployment yet. You can still change the words yourself." };
  if (fixture()) {
    const c = input.current;
    return settleRewrite({ hook: `${c.hook.replace(/[.!?]+$/, "")} — fixed price, agreed first.`, body: `${c.body} Trusted by 500 neighbours.`.trim(), cta: c.cta, note: "Local test fixture, not an AI rewrite: a fixed proposal for checking this screen." }, c, input.factText, input.avoid);
  }
  const schema = z.object({
    hook: z.string(),
    body: z.string(),
    cta: z.string().describe(`One of: ${BUTTONS.join(", ")}`),
    note: z.string(),
    couldNot: z.boolean().describe("True when the facts don't support the change asked for."),
  });
  const ask = [
    `The ad's angle: ${input.title}`,
    `Current opening line: ${input.current.hook}`,
    `Current text: ${input.current.body || "(none)"}`,
    `Current button: ${input.current.cta}`,
    "",
    `The owner's instruction: ${input.instruction}`,
    "",
    "Confirmed facts about the business — the only things the ad may state:",
    input.factText,
    input.brain ? `\nWhat else MAIRO knows (its voice and what to avoid — never state anything here as a fact unless it's also above, never promote anything marked unavailable):\n${input.brain.slice(0, 4000)}` : "",
  ].join("\n");
  try {
    const { object } = await generateObject({ model: agentModel, schema, system: SYSTEM, prompt: ask });
    return settleRewrite(object, input.current, input.factText, input.avoid);
  } catch (error) {
    console.error("Rewrite failed:", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: "MAIRO couldn't rewrite it just now. Nothing was changed — try again in a moment." };
  }
}
