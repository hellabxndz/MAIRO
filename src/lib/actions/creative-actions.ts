"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentMonthKey } from "@/lib/utils/month";
import { planFor } from "@/lib/plans";
import { generateCreativeConcept } from "@/lib/ai/creative";
import { reviewCreative } from "@/lib/ai/review";

const requestSchema = z.object({
  type: z.enum(["IMAGE", "VIDEO", "COPY", "CAROUSEL"]),
  brief: z.string().min(5, "Give us a bit more detail"),
});

// The browser downscales pictures before upload (see creative-request-form),
// so anything arriving much above this is either a bug or someone bypassing
// the form. Checked server-side regardless — the client is not a gatekeeper.
const MAX_REFERENCE_CHARS = 2_800_000; // ~2MB of base64
const DATA_URL_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/;

export type CreativeActionState = { error?: string } | undefined;

function readReferenceImage(formData: FormData): { value: string | null; error?: string } {
  const raw = formData.get("referenceImage");
  if (typeof raw !== "string" || !raw.trim()) return { value: null };

  const value = raw.trim();
  if (!DATA_URL_RE.test(value)) {
    return { value: null, error: "That file isn't an image we can read. Try a PNG or JPEG." };
  }
  if (value.length > MAX_REFERENCE_CHARS) {
    return { value: null, error: "That image is too large. Try one under 2MB." };
  }
  return { value };
}

export async function requestCreativeAction(
  _prevState: CreativeActionState,
  formData: FormData
): Promise<CreativeActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };

  const parsed = requestSchema.safeParse({
    type: formData.get("type"),
    brief: formData.get("brief"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const reference = readReferenceImage(formData);
  if (reference.error) return { error: reference.error };

  const organizationId = session.user.organizationId;
  const month = currentMonthKey();

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionTier: true, name: true, intake: true },
  });
  if (!organization) return { error: "Organization not found" };

  const plan = planFor(organization.subscriptionTier);
  // Blocked requests don't count against the allowance. A policy refusal —
  // including a false positive — shouldn't cost someone one of the two
  // creatives their plan gives them. The tradeoff is that a blocked brief can
  // be retried freely, so repeat offenders show up in the AIOS pipeline
  // rather than being rate-limited here.
  const usedThisMonth = await db.creativeRequest.count({
    where: { organizationId, month, status: { not: "BLOCKED" } },
  });

  if (usedThisMonth >= plan.limits.creativesPerMonth) {
    return {
      error: `You've used all ${plan.limits.creativesPerMonth} creative requests on the ${plan.name} plan this month. They reset on the 1st — or upgrade for more.`,
    };
  }

  const created = await db.creativeRequest.create({
    data: {
      organizationId,
      month,
      type: parsed.data.type,
      brief: parsed.data.brief,
      referenceImage: reference.value,
    },
  });

  // The request is already saved, so a failure here costs the concept and not
  // the request itself. The page offers a retry button when aiConcept is null.
  await tryGenerateConcept(created.id);

  revalidatePath("/dashboard/creatives");
  return undefined;
}

/**
 * Writes the concept for one request, then puts it through the automated
 * safety and advertising-policy review that decides whether it is approved.
 *
 * Returns an error string for the caller to surface, or null on success.
 * "Success" includes a BLOCK — the pipeline worked, the answer was no.
 */
async function tryGenerateConcept(creativeRequestId: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return "The AI isn't configured on this deployment yet.";

  const request = await db.creativeRequest.findUnique({
    where: { id: creativeRequestId },
    include: { organization: { include: { intake: true } } },
  });
  if (!request) return "That request no longer exists.";

  let concept: string;
  try {
    concept = await generateCreativeConcept({
      type: request.type,
      brief: request.brief,
      businessName: request.organization.name,
      referenceImage: request.referenceImage,
      goal: request.organization.intake?.primaryGoal ?? null,
      brandVoice: request.organization.intake?.brandVoice ?? null,
      targetAudience: request.organization.intake?.targetAudience ?? null,
    });
  } catch (error) {
    console.error("Creative concept generation failed:", error);
    return error instanceof Error ? error.message : "The AI couldn't write a concept.";
  }

  // Nothing reaches APPROVED without passing this. If the review itself fails,
  // the request lands in IN_REVIEW for a person to look at — an unreviewable ad
  // is never auto-approved just because the checker was unavailable.
  let review: Awaited<ReturnType<typeof reviewCreative>> | null = null;
  try {
    review = await reviewCreative({
      type: request.type,
      brief: request.brief,
      concept,
      businessName: request.organization.name,
      referenceImage: request.referenceImage,
    });
  } catch (error) {
    console.error("Creative safety review failed:", error);
  }

  if (!review) {
    await db.creativeRequest.update({
      where: { id: creativeRequestId },
      data: { aiConcept: concept, status: "IN_REVIEW", reviewedAt: null },
    });
    return null;
  }

  if (review.verdict === "BLOCK") {
    await db.creativeRequest.update({
      where: { id: creativeRequestId },
      data: {
        // The concept is kept for the record but not shown to the client, so a
        // blocked idea can't be lifted straight off the page and run anyway.
        aiConcept: concept,
        status: "BLOCKED",
        reviewedAt: new Date(),
        reviewCategory: review.category || "policy",
        reviewNotes: review.reason || "This request can't be turned into an ad we can run.",
      },
    });
    return null;
  }

  await db.creativeRequest.update({
    where: { id: creativeRequestId },
    data: {
      aiConcept: concept,
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewCategory: null,
      reviewNotes: null,
    },
  });
  return null;
}

export async function regenerateConceptAction(
  creativeRequestId: string
): Promise<CreativeActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };

  // Scoped to the caller's own organization so an id from elsewhere can't be
  // used to spend someone else's AI budget or read their brief.
  const owned = await db.creativeRequest.findFirst({
    where: { id: creativeRequestId, organizationId: session.user.organizationId },
    select: { id: true },
  });
  if (!owned) return { error: "Not found" };

  const error = await tryGenerateConcept(creativeRequestId);
  revalidatePath("/dashboard/creatives");
  return error ? { error } : undefined;
}
