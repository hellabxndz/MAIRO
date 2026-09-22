import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { CreativeFormat, CreativeStylePreset } from "@/generated/prisma/enums";
import { generateFromPrompt, editImage, type Quality } from "@/lib/ai/openai-image";
import { storeImage, fetchImageBytes } from "@/lib/storage/blob";
import { cropToFormat } from "@/lib/creative-studio/format";
import { nativeSizeFor } from "@/lib/creative-studio/format-info";
import { buildPrompt } from "@/lib/creative-studio/presets";

// Where an image actually gets made: the model called, the result cropped to
// the asset's format, both the raw and the formatted copy saved, and the
// version row updated to say so.
//
// This is the one module that touches the OpenAI client and blob storage
// together. Everything above it — the server actions in actions.ts — handles
// auth, credits and campaign-linking and never talks to either directly,
// which is what keeps "a credit is only spent on a real, stored image" true
// without every action having to re-implement the save step correctly.
//
// Nothing here decides whether a customer is allowed to do this or has
// credit to pay for it — that is reserved before this runs and confirmed or
// released after, in actions.ts. This module only ever answers "can an image
// be made", never "should one be charged for".

export type PipelineOutcome =
  | { ok: true; assetId: string; versionId: string; imageUrl: string; width: number; height: number }
  | { ok: false; error: string; assetId?: string };

async function storeBoth(
  organizationId: string,
  assetId: string,
  version: number,
  raw: Buffer,
  format: CreativeFormat,
): Promise<{ rawUrl: string; imageUrl: string; width: number; height: number }> {
  const cropped = await cropToFormat(raw, format);
  const base = `creative-studio/${organizationId}/${assetId}/v${version}`;
  const [rawStored, formatted] = await Promise.all([
    storeImage(`${base}-raw.png`, raw, "image/png"),
    storeImage(`${base}-${format.toLowerCase()}.png`, cropped.bytes, "image/png"),
  ]);
  return { rawUrl: rawStored.url, imageUrl: formatted.url, width: cropped.width, height: cropped.height };
}

async function markFailed(versionId: string, message: string): Promise<void> {
  await db.creativeStudioVersion
    .update({ where: { id: versionId }, data: { status: "FAILED", errorMessage: message } })
    .catch((error) => console.error("Couldn't mark a Studio version failed:", error));
}

/** A brand-new image from a written description — "Generate with AI". */
export async function runGenerate(input: {
  organizationId: string;
  createdByUserId: string;
  prompt: string;
  preset: CreativeStylePreset | null;
  format: CreativeFormat;
  quality: Quality;
}): Promise<PipelineOutcome> {
  const asset = await db.creativeStudioAsset.create({
    data: {
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      source: "PROMPT",
      preset: input.preset,
      format: input.format,
    },
  });

  const fullPrompt = buildPrompt(input.preset, input.prompt);
  const version = await db.creativeStudioVersion.create({
    data: { assetId: asset.id, version: 1, kind: "GENERATE", instruction: fullPrompt, status: "PENDING" },
  });

  try {
    const result = await generateFromPrompt({
      prompt: fullPrompt,
      size: nativeSizeFor(input.format),
      quality: input.quality,
    });
    const stored = await storeBoth(input.organizationId, asset.id, 1, result.bytes, input.format);
    await db.creativeStudioVersion.update({
      where: { id: version.id },
      data: { status: "COMPLETE", model: result.model, rawImageUrl: stored.rawUrl, imageUrl: stored.imageUrl, width: stored.width, height: stored.height },
    });
    return { ok: true, assetId: asset.id, versionId: version.id, imageUrl: stored.imageUrl, width: stored.width, height: stored.height };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The AI couldn't make that picture.";
    await markFailed(version.id, message);
    return { ok: false, error: message, assetId: asset.id };
  }
}

/** Turns an uploaded product photo into an advertising image — "Upload & Transform". */
export async function runProductTransform(input: {
  organizationId: string;
  createdByUserId: string;
  productImage: Buffer;
  productImageContentType: string;
  prompt: string;
  preset: CreativeStylePreset | null;
  format: CreativeFormat;
  quality: Quality;
}): Promise<PipelineOutcome> {
  let sourceStored: Awaited<ReturnType<typeof storeImage>>;
  try {
    sourceStored = await storeImage(
      `creative-studio/${input.organizationId}/uploads/${randomUUID()}.png`,
      input.productImage,
      input.productImageContentType || "image/png",
    );
  } catch (error) {
    // No version row exists yet at this point, so there's nothing to mark
    // failed — this just has to come back as an ordinary outcome instead of
    // an uncaught exception, the same as every failure below it.
    const message = error instanceof Error ? error.message : "Couldn't save that upload.";
    return { ok: false, error: message };
  }

  const asset = await db.creativeStudioAsset.create({
    data: {
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      source: "PRODUCT_UPLOAD",
      preset: input.preset,
      format: input.format,
      sourceImageUrl: sourceStored.url,
    },
  });

  const instruction = buildPrompt(input.preset, input.prompt) || "A professional advertising image featuring this product.";
  const version = await db.creativeStudioVersion.create({
    data: { assetId: asset.id, version: 1, kind: "GENERATE", instruction, status: "PENDING" },
  });

  try {
    const result = await editImage({
      imageBytes: input.productImage,
      imageContentType: input.productImageContentType || "image/png",
      instruction,
      size: nativeSizeFor(input.format),
      quality: input.quality,
      isProductTransform: true,
    });
    const stored = await storeBoth(input.organizationId, asset.id, 1, result.bytes, input.format);
    await db.creativeStudioVersion.update({
      where: { id: version.id },
      data: { status: "COMPLETE", model: result.model, rawImageUrl: stored.rawUrl, imageUrl: stored.imageUrl, width: stored.width, height: stored.height },
    });
    return { ok: true, assetId: asset.id, versionId: version.id, imageUrl: stored.imageUrl, width: stored.width, height: stored.height };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The AI couldn't make that picture.";
    await markFailed(version.id, message);
    return { ok: false, error: message, assetId: asset.id };
  }
}

/**
 * One natural-language change to an asset's most recent version. This is the
 * conversational editing loop: "make the background darker", then "now make
 * the lighting more dramatic" — each call edits whatever the LAST call
 * produced, never the original, so changes compound instead of resetting.
 */
export async function runEdit(input: {
  organizationId: string;
  assetId: string;
  instruction: string;
  quality: Quality;
}): Promise<PipelineOutcome> {
  const asset = await db.creativeStudioAsset.findFirst({
    where: { id: input.assetId, organizationId: input.organizationId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!asset) return { ok: false, error: "That creative wasn't found." };

  const latest = asset.versions[0];
  if (!latest || latest.status !== "COMPLETE" || !latest.rawImageUrl) {
    return { ok: false, error: "There's nothing finished yet to edit." };
  }

  const nextVersionNumber = latest.version + 1;
  const version = await db.creativeStudioVersion.create({
    data: { assetId: asset.id, version: nextVersionNumber, kind: "EDIT", instruction: input.instruction, status: "PENDING" },
  });

  try {
    const previousBytes = await fetchImageBytes(latest.rawImageUrl);
    const result = await editImage({
      imageBytes: previousBytes,
      imageContentType: "image/png",
      instruction: input.instruction,
      size: nativeSizeFor(asset.format),
      quality: input.quality,
      isProductTransform: false,
    });
    const stored = await storeBoth(input.organizationId, asset.id, nextVersionNumber, result.bytes, asset.format);
    await db.creativeStudioVersion.update({
      where: { id: version.id },
      data: { status: "COMPLETE", model: result.model, rawImageUrl: stored.rawUrl, imageUrl: stored.imageUrl, width: stored.width, height: stored.height },
    });
    return { ok: true, assetId: asset.id, versionId: version.id, imageUrl: stored.imageUrl, width: stored.width, height: stored.height };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The AI couldn't make that change.";
    await markFailed(version.id, message);
    return { ok: false, error: message, assetId: asset.id };
  }
}

/** A handful of different angles to take on the same brief, for real variety in a batch. */
const VARIATION_ANGLES = [
  "in a natural urban city setting",
  "as a clean, minimal studio product shot",
  "in a dramatic, moody nighttime setting",
  "in a real, lived-in lifestyle setting",
  "as a close-up, texture-focused detail shot",
  "in bright, high-energy daylight",
];

/** N sibling concepts from one brief, grouped for the variations grid. */
export async function runVariations(input: {
  organizationId: string;
  createdByUserId: string;
  prompt: string;
  preset: CreativeStylePreset | null;
  format: CreativeFormat;
  quality: Quality;
  count: number;
}): Promise<{ groupId: string; results: PipelineOutcome[] }> {
  const groupId = randomUUID();
  const basePrompt = buildPrompt(input.preset, input.prompt);

  // Sequential, not Promise.all: each is a paid OpenAI call, and running them
  // one after another keeps a single Studio session from firing N requests
  // at once — the same restraint a person clicking "generate" four separate
  // times would exercise on their own.
  const results: PipelineOutcome[] = [];
  for (let i = 0; i < input.count; i++) {
    const angle = VARIATION_ANGLES[i % VARIATION_ANGLES.length];
    const prompt = `${basePrompt}\n\nFor this variation specifically: ${angle}.`;

    const asset = await db.creativeStudioAsset.create({
      data: {
        organizationId: input.organizationId,
        createdByUserId: input.createdByUserId,
        source: "PROMPT",
        preset: input.preset,
        format: input.format,
        variationGroupId: groupId,
      },
    });
    const version = await db.creativeStudioVersion.create({
      data: { assetId: asset.id, version: 1, kind: "VARIATION", instruction: prompt, status: "PENDING" },
    });

    try {
      const result = await generateFromPrompt({ prompt, size: nativeSizeFor(input.format), quality: input.quality });
      const stored = await storeBoth(input.organizationId, asset.id, 1, result.bytes, input.format);
      await db.creativeStudioVersion.update({
        where: { id: version.id },
        data: { status: "COMPLETE", model: result.model, rawImageUrl: stored.rawUrl, imageUrl: stored.imageUrl, width: stored.width, height: stored.height },
      });
      results.push({ ok: true, assetId: asset.id, versionId: version.id, imageUrl: stored.imageUrl, width: stored.width, height: stored.height });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The AI couldn't make that variation.";
      await markFailed(version.id, message);
      results.push({ ok: false, error: message, assetId: asset.id });
    }
  }

  return { groupId, results };
}

/**
 * "Upload My Own Creative" — no model call. The business's own finished ad,
 * saved exactly as it was given, with no crop applied: it is not raw model
 * output waiting to be fitted to a format, it is a finished piece somebody
 * already made choices about.
 */
export async function saveOwnUpload(input: {
  organizationId: string;
  createdByUserId: string;
  imageBytes: Buffer;
  imageContentType: string;
  format: CreativeFormat;
}): Promise<PipelineOutcome> {
  const asset = await db.creativeStudioAsset.create({
    data: {
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      source: "OWN_UPLOAD",
      format: input.format,
    },
  });

  const version = await db.creativeStudioVersion.create({
    data: { assetId: asset.id, version: 1, kind: "UPLOAD", status: "PENDING" },
  });

  try {
    const stored = await storeImage(
      `creative-studio/${input.organizationId}/${asset.id}/v1-own.png`,
      input.imageBytes,
      input.imageContentType || "image/png",
    );
    const sharpMeta = await import("sharp").then((m) => m.default(input.imageBytes).metadata());

    await db.creativeStudioVersion.update({
      where: { id: version.id },
      data: {
        status: "COMPLETE",
        provider: "upload",
        model: null,
        rawImageUrl: stored.url,
        imageUrl: stored.url,
        width: sharpMeta.width ?? null,
        height: sharpMeta.height ?? null,
      },
    });
    return { ok: true, assetId: asset.id, versionId: version.id, imageUrl: stored.url, width: sharpMeta.width ?? 0, height: sharpMeta.height ?? 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't save that image.";
    await markFailed(version.id, message);
    return { ok: false, error: message, assetId: asset.id };
  }
}
