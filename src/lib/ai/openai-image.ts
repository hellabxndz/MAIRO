import OpenAI, { toFile } from "openai";

// Ad picture generation and editing, via OpenAI's image models.
//
// This is a second provider next to src/lib/ai/image.ts, which already does
// the same job through Google's Gemini image model for the older Creatives
// page. That file is untouched — this one exists because the product spec for
// AI Creative Studio explicitly asks for OpenAI, and the two are kept genuinely
// separate rather than merged behind one interface: they have different
// request shapes (Google takes an inline base64 image in a chat message;
// OpenAI's edit endpoint takes a multipart file upload), different size
// vocabularies, and reusing one client for both would mean every change to
// either provider risks breaking the other's callers.
//
// Model name, not hard-coded. gpt-image-1 — the model this integration would
// have defaulted to a few months ago — deprecates 23 October 2026, a matter
// of weeks from when this was written, in favour of gpt-image-2. Both speak
// the same Images API (generate/edit, the same size and quality enums), so
// the default below is the current one and the escape hatch is the same
// pattern src/lib/ai/image.ts already uses for exactly this reason: a rename
// gets fixed by changing an environment variable, not shipping a deploy.
const MODEL = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";

function client(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export function openAiImageConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function currentImageModel(): string {
  return MODEL;
}

/**
 * The two canvases gpt-image models generate natively. Every advertising
 * format Creative Studio offers is produced by generating the closer of these
 * two and cropping — see creative-studio/format.ts — never by asking the
 * model for a size it does not support and never by stretching one it does.
 */
export type NativeSize = "1024x1024" | "1024x1536" | "1536x1024";

export type Quality = "standard" | "premium";

function qualityParam(quality: Quality): "medium" | "high" {
  return quality === "premium" ? "high" : "medium";
}

// The same rule src/lib/ai/image.ts enforces for the Google path, restated
// for OpenAI's models — kept as its own constant rather than imported, so a
// change to one provider's wording is never mistaken for a change to both.
const PRODUCT_TRUTH_RULE = [
  "Absolute rule: the product itself must stay truthful.",
  "You may change lighting, background, setting, colour grade, composition, crop, and you may add text, price tags, badges and graphic elements.",
  "You must NOT change what the product actually is: not its shape, its colour, its material, its branding, its condition, or how many of it there are.",
  "Someone who buys this product after seeing the ad must recognise it as the thing in the original photo.",
].join(" ");

export type GeneratedImage = {
  /** Raw bytes, base64-decoded from the API response. */
  bytes: Buffer;
  contentType: "image/png";
  model: string;
};

/**
 * A brand-new image from a written description. No product photo involved —
 * this is Creative Studio's "Generate with AI" option.
 */
export async function generateFromPrompt(input: {
  prompt: string;
  size: NativeSize;
  quality: Quality;
}): Promise<GeneratedImage> {
  const openai = client();
  if (!openai) throw new Error("OpenAI isn't configured on this deployment.");

  try {
    const result = await openai.images.generate({
      model: MODEL,
      prompt: input.prompt,
      size: input.size,
      quality: qualityParam(input.quality),
      n: 1,
    });

    return toGeneratedImage(result);
  } catch (error) {
    throw friendlyOpenAiError(error);
  }
}

/**
 * Turns an uploaded product photo into an advertising image, or applies one
 * natural-language change to an image Creative Studio already made.
 *
 * Both are the same OpenAI call — the edit endpoint takes whatever image is
 * handed to it as the canvas and a text instruction for what to do with it.
 * The difference between "transform my product photo" and "make the
 * background darker" is only which image and which instruction get passed
 * in, which is exactly what keeps a multi-turn editing session coherent: each
 * edit is applied to the PREVIOUS RESULT, never back to the original, so
 * "make it darker" then "now more dramatic lighting" compounds correctly
 * instead of losing the first change.
 */
export async function editImage(input: {
  imageBytes: Buffer;
  imageContentType: string;
  instruction: string;
  size: NativeSize;
  quality: Quality;
  /** True the first time a product photo is transformed, to state the truth rule. */
  isProductTransform: boolean;
}): Promise<GeneratedImage> {
  const openai = client();
  if (!openai) throw new Error("OpenAI isn't configured on this deployment.");

  const prompt = input.isProductTransform
    ? [
        "Turn the attached product photo into a finished advertising image.",
        "",
        "The creative direction to follow:",
        input.instruction,
        "",
        PRODUCT_TRUTH_RULE,
        "",
        "Produce one finished image suitable for a paid social ad. No watermarks, no placeholder text, no lorem ipsum.",
      ].join("\n")
    : [
        "Edit the attached advertising image.",
        "",
        "The change requested:",
        input.instruction,
        "",
        "Change only what was asked for. Everything else in the image — the product, the composition, every earlier change already applied — stays exactly as it is.",
        "",
        PRODUCT_TRUTH_RULE,
      ].join("\n");

  try {
    const file = await toFile(input.imageBytes, "image.png", {
      type: input.imageContentType || "image/png",
    });

    const result = await openai.images.edit({
      model: MODEL,
      image: file,
      prompt,
      size: input.size,
      quality: qualityParam(input.quality),
    });

    return toGeneratedImage(result);
  } catch (error) {
    throw friendlyOpenAiError(error);
  }
}

function toGeneratedImage(
  result: OpenAI.Images.ImagesResponse,
): GeneratedImage {
  const first = result.data?.[0];
  const b64 = first?.b64_json;
  if (!b64) {
    throw new Error("The image model didn't return a picture. Try describing it differently.");
  }
  return { bytes: Buffer.from(b64, "base64"), contentType: "image/png", model: MODEL };
}

/**
 * Turns an OpenAI SDK error into something a business owner can act on.
 *
 * Mirrors friendlyImageError in src/lib/ai/image.ts — same job, different
 * provider's error shapes — so the two AI-provider integrations in this
 * codebase fail in a way that reads the same to whoever is debugging them.
 */
function friendlyOpenAiError(error: unknown): Error {
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    const message = error.message || "";

    if (status === 401 || status === 403) {
      return new Error(
        "The OpenAI key was rejected. Check OPENAI_API_KEY in your environment variables.",
      );
    }
    if (status === 429 || /rate.?limit/i.test(message)) {
      return new Error("The image service is rate limiting us right now. Wait a minute and try again.");
    }
    if (/insufficient_quota|billing|credit/i.test(message)) {
      return new Error(
        "The OpenAI account behind this key is out of credit. Add billing at platform.openai.com and try again.",
      );
    }
    if (status === 404 || /model.*not.*found|does not exist/i.test(message)) {
      return new Error(
        `The image model "${MODEL}" wasn't accepted. Set OPENAI_IMAGE_MODEL to a model your key can use, then redeploy.`,
      );
    }
    if (/moderation|safety|content_policy|flagged/i.test(message)) {
      return new Error(
        "OpenAI's own content filter refused this one. Try describing the image differently.",
      );
    }
    if (status === 400) {
      return new Error(message || "OpenAI rejected that request.");
    }
    return new Error(message || `OpenAI request failed (HTTP ${status ?? "?"}).`);
  }
  if (error instanceof Error) return error;
  return new Error(String(error));
}
