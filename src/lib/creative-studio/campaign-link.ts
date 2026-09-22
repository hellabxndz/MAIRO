import { db } from "@/lib/db";
import { currentMonthKey } from "@/lib/utils/month";
import { generateCreativeConcept } from "@/lib/ai/creative";
import { reviewCreative } from "@/lib/ai/review";
import { chooseImageAction } from "@/lib/actions/image-actions";
import { fetchImageBytes } from "@/lib/storage/blob";
import { presetInfo } from "@/lib/creative-studio/presets";

// Where a Studio image becomes something a campaign can actually run.
//
// The launch code (src/lib/campaigns/launch.ts) has never known anything
// about the Creative Studio and does not need to learn: it already reads
// "the most recently approved creative" from CreativeRequest/CreativeImage,
// through the exact same safety review every picture on the older Creatives
// page goes through. So attaching a Studio image to a campaign means exactly
// one thing — making it into a real, reviewed, approved CreativeRequest —
// and once that exists, the whole rest of the pipeline (the ad payload built
// for Meta and TikTok, the approval gate, the launch itself) needs no change
// at all. That is deliberate: it is the smallest integration that could
// possibly work, and it means a bug in this bridge cannot corrupt the launch
// path that every other customer's campaigns already depend on.
//
// Two reviews run here, matching the two the manual Creatives page always
// runs: reviewCreative checks the AI-WRITTEN AD COPY for policy problems,
// reviewAdImage (inside chooseImageAction) checks the PICTURE. Both have to
// pass. Neither is skipped just because the picture came from a newer part
// of the product.

export type AttachResult =
  | { ok: true; creativeRequestId: string; alreadyLinked: boolean }
  | { ok: false; error: string };

/**
 * Makes one Studio version into an approved creative the campaign pipeline
 * will pick up. Idempotent: calling it twice on the same asset returns the
 * CreativeRequest made the first time rather than creating a second one.
 */
export async function attachAssetToCampaign(
  organizationId: string,
  assetId: string,
): Promise<AttachResult> {
  const asset = await db.creativeStudioAsset.findFirst({
    where: { id: assetId, organizationId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!asset) return { ok: false, error: "That creative wasn't found." };

  if (asset.linkedCreativeRequestId) {
    return { ok: true, creativeRequestId: asset.linkedCreativeRequestId, alreadyLinked: true };
  }

  const version = asset.versions[0];
  if (!version || version.status !== "COMPLETE" || !version.imageUrl) {
    return { ok: false, error: "This creative isn't finished yet." };
  }

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, industry: true, intake: true },
  });
  if (!organization) return { ok: false, error: "Organization not found." };

  const brief =
    version.instruction?.trim() ||
    (asset.preset ? presetInfo(asset.preset).description : "An advertising image") ||
    "An advertising image made in Mairo AI Creative Studio";

  let imageDataUrl: string;
  try {
    const bytes = await fetchImageBytes(version.imageUrl);
    imageDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    return { ok: false, error: "Couldn't read that image to attach it. Try again." };
  }

  // Written the same way requestCreativeAction writes one — see
  // tryGenerateConcept in src/lib/actions/creative-actions.ts — so the ad
  // copy this produces parses with the same parseAdCopy() the launch code
  // already trusts.
  let concept: string;
  try {
    concept = await generateCreativeConcept({
      type: "IMAGE",
      brief,
      businessName: organization.name,
      referenceImage: imageDataUrl,
      clientNotes: null,
      goal: organization.intake?.primaryGoal ?? null,
      brandVoice: organization.intake?.brandVoice ?? null,
      targetAudience: organization.intake?.targetAudience ?? null,
    });
  } catch (error) {
    console.error("Ad copy generation failed for a Studio creative:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Couldn't write ad copy for this image.",
    };
  }

  let status: "APPROVED" | "IN_REVIEW" | "BLOCKED" = "IN_REVIEW";
  let reviewCategory: string | null = null;
  let reviewNotes: string | null = null;
  try {
    const review = await reviewCreative({
      type: "IMAGE",
      brief,
      concept,
      businessName: organization.name,
      referenceImage: imageDataUrl,
    });
    if (review.verdict === "BLOCK") {
      status = "BLOCKED";
      reviewCategory = review.category || "policy";
      reviewNotes = review.reason || "This can't be turned into an ad we can run.";
    } else {
      status = "APPROVED";
    }
  } catch (error) {
    // Unreachable reviewer, same rule as the manual flow: parked for a person
    // rather than approved unchecked.
    console.error("Copy safety review failed for a Studio creative:", error);
  }

  const request = await db.creativeRequest.create({
    data: {
      organizationId,
      month: currentMonthKey(),
      type: "IMAGE",
      brief,
      aiConcept: concept,
      status,
      reviewedAt: status === "IN_REVIEW" ? null : new Date(),
      reviewCategory,
      reviewNotes,
    },
  });

  if (status === "BLOCKED") {
    return {
      ok: false,
      error: reviewNotes ?? "This image can't be used as an ad — it didn't pass the safety review.",
    };
  }

  const image = await db.creativeImage.create({
    data: {
      creativeRequestId: request.id,
      version: 1,
      imageData: imageDataUrl,
      instruction: "Made in Mairo AI Creative Studio",
    },
  });

  // The picture's own review — reused exactly as the Creatives page runs it
  // when a customer clicks "use this in the campaign".
  const chosen = await chooseImageAction(image.id);
  if (chosen?.error) {
    return { ok: false, error: chosen.error };
  }

  await db.creativeStudioAsset.update({
    where: { id: assetId },
    data: { linkedCreativeRequestId: request.id },
  });

  return { ok: true, creativeRequestId: request.id, alreadyLinked: false };
}
