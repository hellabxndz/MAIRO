import { generateObject } from "ai";
import { z } from "zod";
import { agentModel } from "@/lib/ai/model";
import type { CreativeType } from "@/generated/prisma/enums";

// The safety and policy gate that stands between a generated concept and it
// being marked approved.
//
// This runs as its own call rather than as part of generation on purpose: a
// model asked to write an ad and then judge its own ad tends to approve it.
// Reviewing with a fresh context, and a prompt whose whole job is to look for
// problems, catches things generation talked itself into.
//
// It reviews the client's brief AND their uploaded picture AND the generated
// concept. The brief is where a bad request enters the system, the picture can
// carry things no text mentions, and the concept is what would actually run.

const verdictSchema = z.object({
  verdict: z
    .enum(["APPROVE", "BLOCK"])
    .describe("APPROVE if this ad is safe and policy-compliant, BLOCK if not."),
  category: z
    .string()
    .describe(
      "If BLOCK, the short category of the problem (e.g. 'weapons', 'health claims', 'threats'). If APPROVE, the empty string."
    ),
  reason: z
    .string()
    .describe(
      "If BLOCK, one or two plain sentences the business owner will read, saying what the problem is and what would make it acceptable. Do not lecture. If APPROVE, the empty string."
    ),
});

export type CreativeReview = z.infer<typeof verdictSchema>;

const SYSTEM = [
  "You review advertisements before they are approved to run on Facebook and Instagram, for a platform whose customers are small business owners.",
  "",
  "You are the only check on this ad. Nobody reviews it after you. Block anything that is genuinely harmful or that would get the advertiser's account restricted.",
  "",
  "BLOCK if the ad, the brief, or the uploaded picture involves any of:",
  "- Weapons, firearms, ammunition, explosives, or weapon accessories",
  "- Recreational drugs, drug paraphernalia, or unlicensed pharmaceuticals",
  "- Threats, intimidation, violence, or content that targets or harasses a person or group",
  "- Hate speech, or content demeaning people over race, ethnicity, religion, disability, sex, gender identity, sexual orientation, or serious illness",
  "- Sexual content, nudity, or anything sexualising a minor. Anything involving minors sexually is an absolute block.",
  "- Adult services, escort services, or sexual enhancement products",
  "- Tobacco, vaping, or alcohol sold irresponsibly (age-restricted goods promoted without restraint)",
  "- Medical or health claims that promise cures, guaranteed weight loss, or discourage medical treatment",
  "- Get-rich-quick schemes, guaranteed financial returns, crypto pump promotions, payday loan predation",
  "- Counterfeit goods, stolen goods, hacking or account-takeover services, fake documents",
  "- Deceptive claims: promising results the business plainly cannot deliver, fake urgency about non-existent stock, fake reviews or endorsements",
  "- Personal-attribute targeting: text that addresses the viewer's assumed health condition, race, religion, sexual orientation, financial hardship, or criminal history ('struggling with debt?', 'are you diabetic?')",
  "- Before-and-after body imagery, or content implying the viewer's body is inadequate",
  "- Discriminatory exclusion in housing, employment, or credit advertising",
  "",
  "APPROVE ordinary commerce. A clothing sale, a restaurant promotion, a plumber advertising callouts, a gym offering a trial, a discount, a limited-time offer with real stock, confident brand language, humour, and strong opinions are all fine. Being edgy, loud, or unpolished is not a reason to block.",
  "",
  "You are the last line, not a taste filter. Do not block for weak copy, an unusual aesthetic, a niche product, or writing you would have phrased differently. If it is lawful commerce that would not get the account restricted, approve it.",
  "",
  "When you block, write the reason for the business owner in plain language: what the problem is, and what would make it acceptable if anything would.",
].join("\n");

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

export async function reviewCreative(input: {
  type: CreativeType;
  brief: string;
  concept: string;
  businessName: string;
  referenceImage?: string | null;
}): Promise<CreativeReview> {
  const image = input.referenceImage ? parseDataUrl(input.referenceImage) : null;

  const text = [
    `Business: ${input.businessName}`,
    `Ad format: ${input.type}`,
    "",
    "WHAT THE BUSINESS ASKED FOR:",
    input.brief,
    "",
    "THE AD CONCEPT THAT WOULD RUN:",
    input.concept,
    "",
    image
      ? "The attached picture is the reference the business uploaded. Review it as part of the ad."
      : "No picture was uploaded.",
  ].join("\n");

  const { object } = await generateObject({
    model: agentModel,
    schema: verdictSchema,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: image
          ? [
              { type: "text" as const, text },
              { type: "image" as const, image: image.base64, mediaType: image.mediaType },
            ]
          : [{ type: "text" as const, text }],
      },
    ],
  });

  return object;
}
