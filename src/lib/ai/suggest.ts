import { generateText } from "ai";
import { agentModel } from "@/lib/ai/model";
import type { AdPlatform, CreativeType } from "@/generated/prisma/enums";
import { creativeSpecFor } from "@/lib/ai/creative-briefs";

// MAIRO offering an idea of its own, rather than waiting to be told.
//
// The gap this fills is the one a blank text box always leaves. A business
// owner knows their business and does not know advertising, so "what do you
// want the ad to say?" is a question they are the wrong person to answer — and
// the empty field is where most of them stop. Somebody who sells jackets can
// tell you everything about the jacket and nothing about which fact belongs in
// the first line of an ad.
//
// So MAIRO offers. It speaks in the first person here on purpose, because it
// is making a suggestion rather than presenting output: "I'd lead with the
// weatherproofing" reads as an opinion you can disagree with, and "SUGGESTED
// BRIEF: lead with weatherproofing" reads as a form that has been filled in
// for you. The first invites the correction that makes the second attempt
// better; the second gets accepted unread.

export type SuggestIdeaInput = {
  businessName: string;
  industry?: string | null;
  goal?: string | null;
  targetAudience?: string | null;
  brandVoice?: string | null;
  type: CreativeType;
  platform?: AdPlatform | null;
  /** A data URL, when the customer has a picture to work from. */
  referenceImage?: string | null;
  /** Briefs they have already used, so a second ask is a different idea. */
  previousBriefs?: string[];
};

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

/**
 * One idea, in a sentence or two, written as MAIRO would say it out loud.
 *
 * Deliberately short. This lands in a text field the customer is about to edit,
 * so it has to be something they can read at a glance and change a word of —
 * not a brief that has to be deleted before they can type their own.
 */
export async function suggestCreativeIdea(input: SuggestIdeaInput): Promise<string> {
  const image = input.referenceImage ? parseDataUrl(input.referenceImage) : null;
  const spec = creativeSpecFor(input.platform ?? "META");

  const context = [
    `Business: ${input.businessName}`,
    input.industry ? `Industry: ${input.industry}` : null,
    input.goal ? `What they want from advertising: ${input.goal}` : null,
    input.targetAudience ? `Who they sell to: ${input.targetAudience}` : null,
    input.brandVoice ? `How they sound: ${input.brandVoice}` : null,
    `Format: ${input.type.toLowerCase()}`,
    spec.placements.length > 0 ? `Running on: ${spec.placements.join(", ")}` : null,
    input.previousBriefs && input.previousBriefs.length > 0
      ? `They have already run ads about: ${input.previousBriefs.slice(0, 5).join("; ")}. Suggest something different.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const instruction = image
    ? "They have attached a photo. Look at what is actually in it and suggest how to advertise THAT — the specific object, product or scene in the picture, not the business in general."
    : "They have no photo. Suggest something worth advertising based on what this business is and who it sells to.";

  const system = [
    "You are MAIRO, and you are suggesting an idea to a small business owner who does not know advertising and does not want to learn it.",
    "",
    "Answer in the first person, one or two sentences, as if you were saying it across a table. 'I'd show...', 'I'd lead with...'. It is a suggestion, not a deliverable.",
    "Be specific to this business. 'Showcase your quality products' is worthless; 'the boots covered in mud with the caption that they clean up in thirty seconds' is an idea.",
    "Name the one thing the ad is about and, if it is obvious, the angle. Nothing else — no headline, no call to action, no structure, no explanation of why it works.",
    "Never ask them a question and never say you need more information. If something is missing, assume the most likely thing and suggest anyway.",
    "No advertising jargon. No 'elevate', 'unlock', 'leverage', 'game-changing'. Write the way a person talks.",
    "Do not use markdown, headings, bullets or quotation marks. Plain sentences.",
    "Under 40 words.",
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
              { type: "image" as const, image: image.base64, mediaType: image.mediaType },
            ]
          : [{ type: "text" as const, text: `${context}\n\n${instruction}` }],
      },
    ],
  });

  return text.trim();
}
