import { generateObject } from "ai";
import { z } from "zod";
import { agentModel } from "@/lib/ai/model";
import { CAPTION_MAX } from "@/lib/instagram/constants";

// Captions for MAIRO's weekly posting plan, on Instagram or the Facebook
// Page. The business approves every one before anything is posted. Without an
// AI key, the plan uses the ad copy already written for each picture instead.

const schema = z.object({
  captions: z.array(z.string().min(10).max(CAPTION_MAX)),
});

const FACEBOOK_SYSTEM = `You write posts for a small business's own Facebook Page (not ads).

Rules:
- Sound like the business: warm, clear, human. 1–3 short paragraphs; Facebook readers like a little more context than Instagram.
- Use only facts given about the business. Never invent prices, discounts, awards, reviews, customer names or claims.
- End with a simple call to action that fits (visit, book, message, shop, comment) — only if the business does that.
- At most 2 hashtags, or none.
- Each post must be different in angle: e.g. behind the scenes, the product itself, a tip, a question for people to answer in the comments.`;

const SYSTEM = `You write Instagram captions for a small business's own feed (not ads).

Rules:
- Sound like the business: warm, clear, human. 1–4 short paragraphs.
- Use only facts given about the business. Never invent prices, discounts, awards, reviews, customer names or claims.
- End with a simple call to action that fits (visit, book, message, shop) — only if the business does that.
- Add 3–6 relevant hashtags on the last line.
- Each caption must be different in angle: e.g. behind the scenes, the product itself, a tip, a question to followers.`;

export async function writeCaptions(input: { brief: string; items: { kind: string; label: string; existing: string }[]; network?: "INSTAGRAM" | "FACEBOOK" }): Promise<{ captions: string[]; ai: boolean }> {
  const fallback = input.items.map((i) => i.existing || i.label);
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return { captions: fallback, ai: false };
  try {
    const { object } = await generateObject({
      model: agentModel,
      schema,
      system: input.network === "FACEBOOK" ? FACEBOOK_SYSTEM : SYSTEM,
      prompt: `${input.brief}\n\nWrite ${input.items.length} captions, one per item, in order:\n${input.items
        .map((i, n) => `${n + 1}. A ${i.kind}: ${i.label}${i.existing ? ` (ad copy for reference: ${i.existing.slice(0, 300)})` : ""}`)
        .join("\n")}`,
    });
    const captions = input.items.map((_, n) => object.captions[n] ?? fallback[n]);
    return { captions, ai: true };
  } catch (error) {
    console.error("Social captions AI failed:", error);
    return { captions: fallback, ai: false };
  }
}
