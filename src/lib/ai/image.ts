import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

// Ad picture generation and editing.
//
// This is a different provider from the rest of the app on purpose: Claude
// reads pictures but does not make them, so the images come from Google's
// Gemini image model while every judgement call — the concept, the safety
// review — stays with Claude.
//
// `gemini-2.5-flash-image` is the general-availability name; Google shipped it
// as `gemini-2.5-flash-image-preview` first and the two names have overlapped
// across provider releases. It is overridable by env so a rename can be fixed
// by changing a variable rather than shipping a deploy.
const MODEL = process.env.IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";

function googleProvider() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) return null;
  return createGoogleGenerativeAI({ apiKey });
}

export function imageGenerationConfigured(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
}

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

// The rule that keeps this out of deceptive-advertising territory. An edited
// background or an added price tag is presentation; a product that doesn't
// look like the real product is a false advertisement, and it is the
// advertiser's account that gets restricted for it.
const PRODUCT_TRUTH_RULE = [
  "Absolute rule: the product itself must stay truthful.",
  "You may change lighting, background, setting, colour grade, composition, crop, and you may add text, price tags, badges and graphic elements.",
  "You must NOT change what the product actually is: not its shape, its colour, its material, its branding, its condition, or how many of it there are.",
  "Someone who buys this product after seeing the ad must recognise it as the thing in the original photo.",
].join(" ");

export type AdImageResult = { dataUrl: string; note: string };

/**
 * Produces the first ad picture from the client's own photo and the approved
 * concept. Their photo is the subject; the concept describes the treatment.
 */
export async function createAdImage(input: {
  sourceImage: string;
  concept: string;
  businessName: string;
}): Promise<AdImageResult> {
  const google = googleProvider();
  if (!google) throw new Error("Image generation isn't configured on this deployment.");

  const source = parseDataUrl(input.sourceImage);
  if (!source) throw new Error("That reference picture couldn't be read.");

  const prompt = [
    `Make a single advertising image for ${input.businessName} from the attached photo.`,
    "",
    "The creative direction to follow:",
    input.concept,
    "",
    PRODUCT_TRUTH_RULE,
    "",
    "Produce one finished image suitable for a Facebook or Instagram feed ad. No watermarks, no placeholder text, no lorem ipsum.",
  ].join("\n");

  return runImageModel(google, prompt, source);
}

/**
 * Applies one plain-language change to the picture the client is looking at.
 * The current picture goes in, the edited one comes out.
 */
export async function editAdImage(input: {
  currentImage: string;
  instruction: string;
  businessName: string;
}): Promise<AdImageResult> {
  const google = googleProvider();
  if (!google) throw new Error("Image generation isn't configured on this deployment.");

  const source = parseDataUrl(input.currentImage);
  if (!source) throw new Error("That picture couldn't be read.");

  const prompt = [
    `Edit the attached advertising image for ${input.businessName}.`,
    "",
    "The change requested:",
    input.instruction,
    "",
    "Change only what was asked for. Everything else in the image stays as it is.",
    "",
    PRODUCT_TRUTH_RULE,
    "",
    "Return the edited image.",
  ].join("\n");

  return runImageModel(google, prompt, source);
}

async function runImageModel(
  google: ReturnType<typeof createGoogleGenerativeAI>,
  prompt: string,
  source: { mediaType: string; base64: string }
): Promise<AdImageResult> {
  const result = await generateText({
    model: google(MODEL),
    providerOptions: {
      // Without this the model answers with text about the picture instead of
      // returning a picture.
      google: { responseModalities: ["TEXT", "IMAGE"] },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image", image: source.base64, mediaType: source.mediaType },
        ],
      },
    ],
  });

  const file = result.files.find((f) => f.mediaType?.startsWith("image/"));
  if (!file) {
    // The model refused, or answered in words. Its text is the most useful
    // thing to show — it usually says why.
    throw new Error(
      result.text?.trim() ||
        "The image model didn't return a picture. Try describing the change differently."
    );
  }

  return {
    dataUrl: `data:${file.mediaType};base64,${file.base64}`,
    note: result.text?.trim() ?? "",
  };
}
