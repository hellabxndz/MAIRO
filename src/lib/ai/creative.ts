import { generateText } from "ai";
import { agentModel } from "@/lib/ai/model";
import type { CreativeType } from "@/generated/prisma/enums";

// Turns a client's brief — and optionally a picture they uploaded — into a
// concrete ad creative concept they can react to.
//
// The picture is the point of this: a small business owner is far better at
// showing you the jacket they want to sell than at describing the ad they want
// made of it. Claude reads the image alongside the brief.

const TYPE_GUIDANCE: Record<CreativeType, string> = {
  IMAGE: "a single-image ad",
  VIDEO: "a short video ad (up to 15 seconds)",
  COPY: "ad copy only — no visual production",
  CAROUSEL: "a multi-card carousel ad",
};

export type CreativeConceptInput = {
  type: CreativeType;
  brief: string;
  businessName: string;
  /** A data URL, as stored on CreativeRequest.referenceImage. */
  referenceImage?: string | null;
  goal?: string | null;
  brandVoice?: string | null;
  targetAudience?: string | null;
  /** Follow-ups the client typed after reading an earlier concept. */
  clientNotes?: string | null;
};

/**
 * Splits a `data:image/png;base64,AAAA` URL into the parts the model needs.
 * Returns null for anything that isn't a base64 image data URL, so a malformed
 * value degrades to a text-only concept rather than throwing.
 */
function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

export async function generateCreativeConcept(
  input: CreativeConceptInput
): Promise<string> {
  const image = input.referenceImage ? parseDataUrl(input.referenceImage) : null;

  const context = [
    `Business: ${input.businessName}`,
    input.goal ? `Advertising goal: ${input.goal}` : null,
    input.targetAudience ? `Target audience: ${input.targetAudience}` : null,
    input.brandVoice ? `Brand voice: ${input.brandVoice}` : null,
    `Format requested: ${TYPE_GUIDANCE[input.type]}`,
    `What they asked for: ${input.brief}`,
    input.clientNotes
      ? `\nSince reading your first concept they have told you:\n${input.clientNotes}\n\nThese corrections take priority over anything you assumed before. Rewrite the concept properly around them.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const instruction = image
    ? "The attached picture is what they have in mind — a product, a style, or a reference they like. Look at it closely and build the concept around what you actually see in it."
    : "No reference picture was provided, so work from the brief alone.";

  const system = [
    "You are MAIRO's creative director. You write ad concepts for small business owners who do not know advertising jargon and do not want to.",
    "Give them one concrete concept they can say yes or no to — not a menu of options, not a strategy lecture.",
    "",
    "NEVER ask the client a question, and never withhold the concept waiting for information. They came here to be handed an ad, not to be interviewed. Missing details are normal: a blank or placeholder business name, a vague goal, no audience. Fill the gap with a sensible assumption drawn from the picture and the brief, and write the concept anyway.",
    "Where you had to assume something, just write the concept using that assumption and put ONE short line at the very end under the heading **Assumed** naming what you assumed, so they can correct it if you got it wrong. Nothing else goes in that section.",
    "If the business name looks like placeholder or junk text, do not repeat it and do not comment on it — write the ad so it works without naming the business.",
    "",
    "Structure your answer with these headings and nothing else:",
    "**The idea** — two or three sentences on what the ad is.",
    "**What you'll see** — describe the visual concretely enough that someone could shoot or design it.",
    "**Headline** — one line, under 40 characters.",
    "**Primary text** — the copy that runs above the ad, 2-3 short sentences.",
    "**Call to action** — which button, and why that one.",
    "**Assumed** — only if you had to assume something. One line. Omit the heading entirely otherwise.",
    "",
    "Write plainly. No buzzwords, no 'elevate your brand', no em-dash-heavy ad-speak. Be specific about this business rather than generic about advertising.",
  ].join("\n");

  const { text } = await generateText({
    model: agentModel,
    system,
    messages: [
      {
        role: "user",
        content: image
          ? [
              { type: "text" as const, text: `${context}\n\n${instruction}` },
              {
                type: "image" as const,
                image: image.base64,
                mediaType: image.mediaType,
              },
            ]
          : [{ type: "text" as const, text: `${context}\n\n${instruction}` }],
      },
    ],
  });

  return text;
}
