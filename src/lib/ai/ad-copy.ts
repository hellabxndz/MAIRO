import { generateObject } from "ai";
import { z } from "zod";
import { agentModel } from "@/lib/ai/model";
import type { AdDestination } from "@/generated/prisma/enums";
import { ctaChoicesFor, fitCta, unsupportedNumbers, type CopyOption } from "@/lib/campaigns/ad-copy";
import { HEADLINE_MAX, PRIMARY_TEXT_MAX } from "@/lib/meta/creative-copy";

// Three versions of an ad's words, for the customer to pick from and edit.
//
// Written only from what the business told MAIRO. The model is told not to
// invent prices, discounts, reviews or numbers — and then that's checked, not
// trusted: a sentence carrying a number the business never mentioned is
// dropped before anyone sees it.

export type CopyFacts = {
  businessName: string;
  offering: string;
  targetAudience: string;
  differentiator: string;
  /** What's being advertised this time, e.g. "A specific product — Black hoodie". */
  advertising: string;
  goal: string;
  destination: AdDestination | null;
  website: string;
  /** A public address of the ad's picture (or a video still), to write words that fit it. */
  imageUrl?: string | null;
};

const SYSTEM = [
  "You write Facebook and Instagram ad copy for small businesses.",
  "",
  "Write exactly three versions, each with a different angle — for example the main benefit, the problem it solves, and what makes this business different. Give each a short angle label (2–5 words).",
  "",
  "Hard rules:",
  "- Use ONLY the facts provided. Never invent prices, discounts, offers, deadlines, reviews, ratings, customer counts, awards, years in business or guarantees.",
  "- Never imply you know personal things about the reader (health, finances, religion, sexuality, age, etc.). Say what the business offers, not what the reader is.",
  "- No fake urgency or scarcity. No ALL CAPS. At most one exclamation mark.",
  "- Primary text: one to three short sentences, the point first, under 200 characters.",
  "- Headline: under 40 characters.",
  "- Plain, warm, specific language. No hashtags. At most one emoji, only if it fits.",
].join("\n");

export async function writeAdCopyOptions(facts: CopyFacts): Promise<CopyOption[]> {
  const ctas = ctaChoicesFor(facts.destination);
  const schema = z.object({
    versions: z
      .array(
        z.object({
          angle: z.string(),
          primaryText: z.string(),
          headline: z.string(),
          // Not an enum: one off-list pick would throw away all three
          // versions. fitCta() below corrects it instead.
          cta: z.string().describe(`One of: ${ctas.map((c) => c.value).join(", ")}`),
        })
      )
      .min(1)
      .max(3),
  });

  const factText = [
    `Business: ${facts.businessName}`,
    `What it sells or offers: ${facts.offering || "(not given)"}`,
    `Typical customers: ${facts.targetAudience || "(not given)"}`,
    `What makes it different: ${facts.differentiator || "(not given)"}`,
    `Advertising this time: ${facts.advertising || "the business as a whole"}`,
    `Goal of the ad: ${facts.goal}`,
    facts.website ? `Website: ${facts.website}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ask = `${factText}\n\nButton options: ${ctas.map((c) => `${c.value} (${c.label})`).join(", ")}. Pick the one that fits each version.`;
  const image = facts.imageUrl && /^https:\/\//.test(facts.imageUrl) ? new URL(facts.imageUrl) : null;
  const { object } = await generateObject({
    model: agentModel,
    schema,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: image
          ? [
              { type: "text" as const, text: `${ask}\n\nThe attached picture is the business's own ad creative. Write words that fit what it shows — but state only facts given above, never ones read off the picture (no prices, offers or claims from it).` },
              { type: "image" as const, image },
            ]
          : [{ type: "text" as const, text: ask }],
      },
    ],
  });

  return object.versions.slice(0, 3).map((v) => {
    const primaryText = dropInvented(v.primaryText, factText).slice(0, PRIMARY_TEXT_MAX);
    const headline = unsupportedNumbers(v.headline, factText).length ? facts.businessName : v.headline;
    return {
      angle: v.angle.trim().slice(0, 40),
      primaryText: primaryText || headline,
      headline: headline.trim().slice(0, HEADLINE_MAX),
      cta: fitCta(v.cta, facts.destination),
    };
  });
}

/** Removes any sentence with a number the facts don't contain. */
function dropInvented(text: string, facts: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => unsupportedNumbers(sentence, facts).length === 0)
    .join(" ")
    .trim();
}
