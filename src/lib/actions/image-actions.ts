"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAdImage, editAdImage, imageGenerationConfigured } from "@/lib/ai/image";
import { reviewAdImage } from "@/lib/ai/review";
import { MAX_FINAL_IMAGES, MAX_REVISIONS } from "@/lib/creative-limits";

export type ImageActionState = { error?: string } | undefined;

async function loadOwnedRequest(creativeRequestId: string) {
  const session = await auth();
  if (!session?.user?.organizationId) return null;

  return db.creativeRequest.findFirst({
    where: { id: creativeRequestId, organizationId: session.user.organizationId },
    include: {
      organization: { select: { name: true } },
      images: { orderBy: { version: "desc" } },
    },
  });
}

/**
 * Makes the next version of the picture.
 *
 * With no instruction this is the first pass, built from the client's own
 * photo and the approved concept. With an instruction it edits whatever they
 * are currently looking at.
 */
export async function generateAdImageAction(
  creativeRequestId: string,
  _prevState: ImageActionState,
  formData: FormData
): Promise<ImageActionState> {
  if (!imageGenerationConfigured()) {
    return {
      error:
        "Picture generation isn't switched on for this deployment yet. Add GOOGLE_GENERATIVE_AI_API_KEY in your hosting environment variables and redeploy.",
    };
  }

  const request = await loadOwnedRequest(creativeRequestId);
  if (!request) return { error: "Not found" };

  if (request.status === "BLOCKED") {
    return { error: "This request was blocked, so pictures can't be made for it." };
  }
  if (!request.aiConcept) {
    return { error: "The concept has to be written before a picture can be made." };
  }
  if (request.images.length >= MAX_REVISIONS) {
    return {
      error: `That's ${MAX_REVISIONS} passes on this picture. Start a new creative request if you want to keep going in a different direction.`,
    };
  }

  const rawInstruction = formData.get("instruction");
  const instruction = typeof rawInstruction === "string" ? rawInstruction.trim() : "";

  const current = request.images[0];
  if (!current && !request.referenceImage) {
    return { error: "Upload a picture with the request first — the AI edits your photo." };
  }
  if (current && !instruction) {
    return { error: "Tell the AI what to change." };
  }

  try {
    const result = current
      ? await editAdImage({
          currentImage: current.imageData,
          instruction,
          businessName: request.organization.name,
        })
      : await createAdImage({
          // Guarded above: with no current version there is a reference image.
          sourceImage: request.referenceImage!,
          concept: request.aiConcept,
          businessName: request.organization.name,
        });

    const nextVersion = (request.images[0]?.version ?? 0) + 1;

    await db.$transaction(async (tx) => {
      await tx.creativeImage.create({
        data: {
          creativeRequestId,
          version: nextVersion,
          imageData: result.dataUrl,
          instruction: instruction || null,
        },
      });

      // Drop superseded drafts. Chosen pictures are kept; everything else is
      // a step along the way, and keeping every step would put megabytes of
      // dead images in the database per request.
      await tx.creativeImage.deleteMany({
        where: {
          creativeRequestId,
          isFinal: false,
          version: { not: nextVersion },
        },
      });
    });

    revalidatePath("/dashboard/creatives");
    return undefined;
  } catch (error) {
    console.error("Ad image generation failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "The AI couldn't make that picture. Try describing it differently.",
    };
  }
}

/**
 * Chooses a picture to actually run. This is the point the safety review
 * happens — drafts are nothing, a chosen picture is an advertisement.
 */
export async function chooseImageAction(imageId: string): Promise<ImageActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };

  const image = await db.creativeImage.findFirst({
    where: {
      id: imageId,
      creativeRequest: { organizationId: session.user.organizationId },
    },
    include: {
      creativeRequest: {
        include: { organization: { select: { name: true } } },
      },
    },
  });
  if (!image) return { error: "Not found" };
  if (image.isFinal) return undefined;

  const alreadyChosen = await db.creativeImage.count({
    where: { creativeRequestId: image.creativeRequestId, isFinal: true },
  });
  if (alreadyChosen >= MAX_FINAL_IMAGES) {
    return {
      error: `You've already chosen ${MAX_FINAL_IMAGES} pictures for this campaign. Remove one to swap it out.`,
    };
  }

  try {
    const review = await reviewAdImage({
      imageDataUrl: image.imageData,
      brief: image.creativeRequest.brief,
      businessName: image.creativeRequest.organization.name,
    });

    if (review.verdict === "BLOCK") {
      await db.creativeImage.update({
        where: { id: imageId },
        data: { reviewedAt: new Date(), reviewNotes: review.reason },
      });
      revalidatePath("/dashboard/creatives");
      return {
        error:
          review.reason ||
          "That picture can't run as an ad. Ask for a change and try again.",
      };
    }

    await db.creativeImage.update({
      where: { id: imageId },
      data: { isFinal: true, reviewedAt: new Date(), reviewNotes: null },
    });
    revalidatePath("/dashboard/creatives");
    return undefined;
  } catch (error) {
    // A picture that could not be checked is not approved for use. Same rule
    // as the concept review: unreviewable never means allowed.
    console.error("Ad image review failed:", error);
    return {
      error: "The safety check couldn't run just now, so this picture wasn't added. Try again in a moment.",
    };
  }
}

export async function unchooseImageAction(imageId: string): Promise<ImageActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };

  const image = await db.creativeImage.findFirst({
    where: {
      id: imageId,
      creativeRequest: { organizationId: session.user.organizationId },
    },
    select: { id: true },
  });
  if (!image) return { error: "Not found" };

  await db.creativeImage.update({
    where: { id: imageId },
    data: { isFinal: false, reviewedAt: null, reviewNotes: null },
  });
  revalidatePath("/dashboard/creatives");
  return undefined;
}
