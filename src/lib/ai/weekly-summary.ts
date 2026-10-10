import { generateObject } from "ai";
import { z } from "zod";
import { agentModel } from "@/lib/ai/model";

// The Weekly Report's "MAIRO summary": the week's facts, told the way an
// advertising manager would tell them. The AI is given the facts and the
// plain version already written from them, and may reword — never add a
// figure, a cause or a promise. Any failure falls back to the plain version.

const schema = z.object({
  simple: z.string().min(20).max(900),
  advanced: z.string().min(20).max(1200),
});

const SYSTEM = `You write the short summary at the top of a business owner's weekly advertising report.

Rules:
- 3 to 5 sentences each.
- "simple": plain English for someone who has never used Ads Manager. No jargon (no CTR, CPA, CPM, ROAS — say "cost per sale", "return on ad spend" only if needed).
- "advanced": the same story with the key figures and standard terms.
- Use ONLY the facts given. Never add a number, a cause, a platform, or an ad that is not in the facts.
- Never promise results. No "will increase sales". If you suggest anything, say MAIRO recommends testing it.
- Don't call higher spend good or bad in itself.
- If the facts say there wasn't enough data, say so plainly.`;

export async function summarizeWeek(facts: string, plainSimple: string, plainAdvanced: string): Promise<{ simple: string; advanced: string; ai: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return { simple: plainSimple, advanced: plainAdvanced, ai: false };
  try {
    const { object } = await generateObject({
      model: agentModel,
      schema,
      system: SYSTEM,
      prompt: `Facts for the week:\n${facts}\n\nPlain summary already written from these facts (reword it, don't contradict it):\nSimple: ${plainSimple}\nAdvanced: ${plainAdvanced}`,
    });
    return { ...object, ai: true };
  } catch (error) {
    console.error("Weekly summary AI failed:", error);
    return { simple: plainSimple, advanced: plainAdvanced, ai: false };
  }
}
