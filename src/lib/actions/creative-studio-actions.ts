"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { openAiImageConfigured } from "@/lib/ai/openai-image";
import { costFor } from "@/lib/creative-studio/pricing";
import { reserveCredits, confirmCredits, releaseCredits } from "@/lib/creative-studio/credits";
import {
  runGenerate,
  runProductTransform,
  runEdit,
  runVariations,
  saveOwnUpload,
  type PipelineOutcome,
} from "@/lib/creative-studio/pipeline";
import { attachAssetToCampaign } from "@/lib/creative-studio/campaign-link";
import { storageConfigured } from "@/lib/storage/blob";
import type { CreativeFormat, CreativeStylePreset } from "@/generated/prisma/enums";

// The Creative Studio server actions.
//
// Every one of these follows the same shape: authenticate, validate, reserve
// credits, run the pipeline, confirm or release the reservation, respond.
// That order is not a convention to remember — reserveCredits is the only
// thing in the codebase allowed to write a CreativeCreditLedger row, so an
// action that called the pipeline first and reserved after would simply not
// be enforcing a limit at all, whatever the code around it implied.

export type StudioActionState =
  | {
      error?: string;
      assetId?: string;
      versionId?: string;
      imageUrl?: string;
      width?: number;
      height?: number;
    }
  | undefined;

const PRESET_VALUES = [
  "LUXURY_STUDIO", "STREETWEAR", "MINIMALIST", "LIFESTYLE", "CINEMATIC",
  "PRODUCT_PHOTOGRAPHY", "URBAN", "HIGH_FASHION", "FITNESS", "FOOD_PHOTOGRAPHY",
  "TECHNOLOGY", "CUSTOM",
] as const;
const FORMAT_VALUES = ["SQUARE", "PORTRAIT", "STORY", "LANDSCAPE"] as const;
const QUALITY_VALUES = ["standard", "premium"] as const;

// A server action's body is capped at 4MB (next.config.ts) and a data URL is
// roughly a third larger than the bytes it encodes, so this leaves headroom
// for the rest of the form. The browser-side dropzone downscales before this
// is ever reached; this check is what actually enforces it.
const MAX_UPLOAD_CHARS = 3_500_000;
const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/;

function decodeDataUrl(raw: string): { bytes: Buffer; contentType: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(raw.trim());
  if (!match) return null;
  return { bytes: Buffer.from(match[2], "base64"), contentType: match[1] };
}

async function context(): Promise<
  { ok: true; organizationId: string; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) {
    return { ok: false, error: "Not authenticated" };
  }
  if (!openAiImageConfigured()) {
    return {
      ok: false,
      error:
        "AI Creative Studio isn't switched on for this deployment yet. Add OPENAI_API_KEY in your hosting environment variables and redeploy.",
    };
  }
  if (!storageConfigured()) {
    return {
      ok: false,
      error:
        "Image storage isn't configured for this deployment yet. Add BLOB_READ_WRITE_TOKEN in your hosting environment variables and redeploy.",
    };
  }
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  return { ok: true, organizationId, userId: session.user.id };
}

/** Shared tail of every generating action: confirm on success, release on failure. */
async function settle(ledgerId: string, outcome: PipelineOutcome): Promise<StudioActionState> {
  if (outcome.ok) {
    await confirmCredits(ledgerId, outcome.assetId, outcome.versionId);
    revalidatePath("/dashboard/creative-studio");
    return {
      assetId: outcome.assetId,
      versionId: outcome.versionId,
      imageUrl: outcome.imageUrl,
      width: outcome.width,
      height: outcome.height,
    };
  }
  await releaseCredits(ledgerId);
  return { error: outcome.error, assetId: outcome.assetId };
}

const generateSchema = z.object({
  prompt: z.string().trim().min(3, "Describe the advertisement you want.").max(2000),
  preset: z.enum(PRESET_VALUES).nullable(),
  format: z.enum(FORMAT_VALUES),
  quality: z.enum(QUALITY_VALUES),
});

/** Option 1: Generate with AI — a brand-new image from a written description. */
export async function generateCreativeAction(
  _prev: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const ctx = await context();
  if (!ctx.ok) return { error: ctx.error };

  const presetRaw = formData.get("preset");
  const parsed = generateSchema.safeParse({
    prompt: formData.get("prompt"),
    preset: presetRaw && presetRaw !== "" ? presetRaw : null,
    format: formData.get("format") || "SQUARE",
    quality: formData.get("quality") || "standard",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your description." };

  const cost = await costFor("GENERATE", parsed.data.quality);
  const reservation = await reserveCredits(ctx.organizationId, "GENERATE", cost);
  if (!reservation.ok) return { error: reservation.reason };

  const outcome = await runGenerate({
    organizationId: ctx.organizationId,
    createdByUserId: ctx.userId,
    prompt: parsed.data.prompt,
    preset: parsed.data.preset as CreativeStylePreset | null,
    format: parsed.data.format as CreativeFormat,
    quality: parsed.data.quality,
  });

  if (outcome.ok) {
    await db.creativeStudioVersion.update({
      where: { id: outcome.versionId },
      data: { creditsSpent: cost },
    });
  }

  return settle(reservation.ledgerId, outcome);
}

const transformSchema = z.object({
  productImage: z.string().min(1, "Upload a product photo."),
  prompt: z.string().trim().max(2000),
  preset: z.enum(PRESET_VALUES).nullable(),
  format: z.enum(FORMAT_VALUES),
  quality: z.enum(QUALITY_VALUES),
});

/** Option 2: Upload Product & Transform. */
export async function transformProductAction(
  _prev: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const ctx = await context();
  if (!ctx.ok) return { error: ctx.error };

  const presetRaw = formData.get("preset");
  const parsed = transformSchema.safeParse({
    productImage: formData.get("productImage"),
    prompt: formData.get("prompt") ?? "",
    preset: presetRaw && presetRaw !== "" ? presetRaw : null,
    format: formData.get("format") || "SQUARE",
    quality: formData.get("quality") || "standard",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your upload." };

  if (parsed.data.productImage.length > MAX_UPLOAD_CHARS) {
    return { error: "That image is too large. Try one under 2.5MB." };
  }
  if (!DATA_URL_RE.test(parsed.data.productImage.trim())) {
    return { error: "That file isn't an image we can read. Try a PNG, JPEG or WEBP." };
  }
  const decoded = decodeDataUrl(parsed.data.productImage);
  if (!decoded) return { error: "That file isn't an image we can read." };

  const cost = await costFor("GENERATE", parsed.data.quality);
  const reservation = await reserveCredits(ctx.organizationId, "GENERATE", cost);
  if (!reservation.ok) return { error: reservation.reason };

  const outcome = await runProductTransform({
    organizationId: ctx.organizationId,
    createdByUserId: ctx.userId,
    productImage: decoded.bytes,
    productImageContentType: decoded.contentType,
    prompt: parsed.data.prompt,
    preset: parsed.data.preset as CreativeStylePreset | null,
    format: parsed.data.format as CreativeFormat,
    quality: parsed.data.quality,
  });

  if (outcome.ok) {
    await db.creativeStudioVersion.update({ where: { id: outcome.versionId }, data: { creditsSpent: cost } });
  }

  return settle(reservation.ledgerId, outcome);
}

const editSchema = z.object({
  instruction: z.string().trim().min(2, "Tell the AI what to change.").max(1000),
  quality: z.enum(QUALITY_VALUES),
});

/** The conversational editing loop — "make the background darker", then more. */
export async function editCreativeAction(
  assetId: string,
  _prev: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const ctx = await context();
  if (!ctx.ok) return { error: ctx.error };

  const parsed = editSchema.safeParse({
    instruction: formData.get("instruction"),
    quality: formData.get("quality") || "standard",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Say what to change." };

  const owned = await db.creativeStudioAsset.findFirst({
    where: { id: assetId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!owned) return { error: "That creative wasn't found." };

  const cost = await costFor("EDIT", parsed.data.quality);
  const reservation = await reserveCredits(ctx.organizationId, "EDIT", cost);
  if (!reservation.ok) return { error: reservation.reason };

  const outcome = await runEdit({
    organizationId: ctx.organizationId,
    assetId,
    instruction: parsed.data.instruction,
    quality: parsed.data.quality,
  });

  if (outcome.ok) {
    await db.creativeStudioVersion.update({ where: { id: outcome.versionId }, data: { creditsSpent: cost } });
  }

  return settle(reservation.ledgerId, outcome);
}

const variationsSchema = z.object({
  prompt: z.string().trim().min(3, "Describe the advertisement you want.").max(2000),
  preset: z.enum(PRESET_VALUES).nullable(),
  format: z.enum(FORMAT_VALUES),
  quality: z.enum(QUALITY_VALUES),
  count: z.coerce.number().int().min(2).max(6),
});

export type VariationsState = { error?: string; groupId?: string; failures?: number } | undefined;

/** "Generate 4 Variations" — N sibling concepts from one brief. */
export async function generateVariationsAction(
  _prev: VariationsState,
  formData: FormData,
): Promise<VariationsState> {
  const ctx = await context();
  if (!ctx.ok) return { error: ctx.error };

  const presetRaw = formData.get("preset");
  const parsed = variationsSchema.safeParse({
    prompt: formData.get("prompt"),
    preset: presetRaw && presetRaw !== "" ? presetRaw : null,
    format: formData.get("format") || "SQUARE",
    quality: formData.get("quality") || "standard",
    count: formData.get("count") || 4,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your description." };

  const perImage = await costFor("VARIATION", parsed.data.quality);
  const totalCost = perImage * parsed.data.count;
  const reservation = await reserveCredits(ctx.organizationId, "VARIATION", totalCost);
  if (!reservation.ok) return { error: reservation.reason };

  const { groupId, results } = await runVariations({
    organizationId: ctx.organizationId,
    createdByUserId: ctx.userId,
    prompt: parsed.data.prompt,
    preset: parsed.data.preset as CreativeStylePreset | null,
    format: parsed.data.format as CreativeFormat,
    quality: parsed.data.quality,
    count: parsed.data.count,
  });

  const succeeded = results.filter((r) => r.ok);
  const failed = results.length - succeeded.length;

  // Charged only for what actually generated. A variation batch's single
  // reservation does not map to one asset — several were made — so it is
  // confirmed directly here rather than through confirmCredits, which assumes
  // exactly one. The confirmed amount is trimmed down to cover only the
  // images that exist; a partial failure never charges for the ones that
  // don't, which is the whole reason the reservation held the FULL batch cost
  // up front rather than charging per image as each one finished.
  if (succeeded.length > 0) {
    await db.creativeCreditLedger.update({
      where: { id: reservation.ledgerId },
      data: { status: "CONFIRMED", credits: perImage * succeeded.length },
    });
    for (const r of succeeded) {
      if (r.ok) await db.creativeStudioVersion.update({ where: { id: r.versionId }, data: { creditsSpent: perImage } });
    }
  } else {
    await releaseCredits(reservation.ledgerId);
  }

  revalidatePath("/dashboard/creative-studio");

  if (succeeded.length === 0) {
    return { error: "None of the variations could be made. Try again in a moment." };
  }
  return { groupId, failures: failed };
}

const uploadOwnSchema = z.object({
  image: z.string().min(1, "Upload an image."),
  format: z.enum(FORMAT_VALUES),
});

/** Option 3: Upload My Own Creative. No AI, no credits — the file, saved as-is. */
export async function uploadOwnCreativeAction(
  _prev: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) return { error: "Not authenticated" };
  if (!storageConfigured()) {
    return { error: "Image storage isn't configured for this deployment yet." };
  }
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const parsed = uploadOwnSchema.safeParse({
    image: formData.get("image"),
    format: formData.get("format") || "SQUARE",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your upload." };
  if (parsed.data.image.length > MAX_UPLOAD_CHARS) return { error: "That image is too large. Try one under 2.5MB." };
  if (!DATA_URL_RE.test(parsed.data.image.trim())) {
    return { error: "That file isn't an image we can read. Try a PNG, JPEG or WEBP." };
  }
  const decoded = decodeDataUrl(parsed.data.image);
  if (!decoded) return { error: "That file isn't an image we can read." };

  const outcome = await saveOwnUpload({
    organizationId,
    createdByUserId: session.user.id,
    imageBytes: decoded.bytes,
    imageContentType: decoded.contentType,
    format: parsed.data.format as CreativeFormat,
  });

  if (!outcome.ok) return { error: outcome.error, assetId: outcome.assetId };
  revalidatePath("/dashboard/creative-studio");
  return { assetId: outcome.assetId };
}

/** Puts a finished Studio image on the road to actually running as an ad. */
export async function attachCreativeToCampaignAction(assetId: string): Promise<StudioActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const result = await attachAssetToCampaign(organizationId, assetId);
  revalidatePath("/dashboard/creative-studio");
  revalidatePath("/dashboard/create");
  if (!result.ok) return { error: result.error };
  return undefined;
}

/** Removes an asset from the library view. The files stay; nothing is deleted inline. */
export async function archiveAssetAction(assetId: string): Promise<StudioActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const owned = await db.creativeStudioAsset.findFirst({ where: { id: assetId, organizationId }, select: { id: true } });
  if (!owned) return { error: "Not found" };

  await db.creativeStudioAsset.update({ where: { id: assetId }, data: { archivedAt: new Date() } });
  revalidatePath("/dashboard/creative-studio");
  return undefined;
}
