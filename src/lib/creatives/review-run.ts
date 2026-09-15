import { db } from "@/lib/db";
import { reviewCreative } from "@/lib/ai/review";

// Re-running the safety check on a creative that never got one.
//
// The automated review already decides APPROVED or BLOCKED on its own — see
// generateConcept in src/lib/actions/creative-actions.ts. IN_REVIEW is not a
// third verdict. It is what happens when the reviewer could not be reached at
// all: no key configured, a timeout, the model refusing to return the shape.
// Rather than approve an ad nobody checked, the request stops and waits.
//
// What was missing is the other half of that. Nothing ever tried again, so a
// single bad minute left a request parked in a queue forever, waiting for a
// person to make exactly the judgement the product exists to make for them.
// This is the retry: same checker, same rules, applied to a request that is
// already sitting in the pile.
//
// It never approves anything itself. It asks the reviewer and writes down the
// answer — and if the reviewer is still unreachable, the request stays exactly
// where it is.

export type ReviewRunOutcome =
  | { state: "approved" }
  | { state: "blocked"; category: string; reason: string }
  /** The checker still could not be reached. The request has not moved. */
  | { state: "unavailable"; detail: string }
  /** Nothing to review — no concept was ever written. */
  | { state: "no_concept" }
  | { state: "not_found" };

/**
 * Asks the safety reviewer about one creative request and records the verdict.
 *
 * Safe to call on anything: a request that is already APPROVED or BLOCKED is
 * re-reviewed and the answer re-applied, which is what makes this usable as a
 * "check this again" button as well as a retry.
 */
export async function runSafetyReview(
  creativeRequestId: string
): Promise<ReviewRunOutcome> {
  const request = await db.creativeRequest.findUnique({
    where: { id: creativeRequestId },
    include: { organization: { select: { name: true } } },
  });
  if (!request) return { state: "not_found" };

  // The reviewer judges the concept that would actually run. Without one there
  // is nothing to judge, and the fix is to generate the concept, not to review.
  if (!request.aiConcept?.trim()) return { state: "no_concept" };

  let review: Awaited<ReturnType<typeof reviewCreative>>;
  try {
    review = await reviewCreative({
      type: request.type,
      brief: request.brief,
      concept: request.aiConcept,
      businessName: request.organization.name,
      referenceImage: request.referenceImage,
    });
  } catch (error) {
    // Deliberately leaves the row untouched. An unreachable checker must never
    // turn into an approval, and must not turn into a block either — the ad
    // has not been found wanting, it has not been looked at.
    const detail = error instanceof Error ? error.message : "The safety checker didn't answer.";
    console.error(`Safety review retry failed for ${creativeRequestId}:`, error);
    return { state: "unavailable", detail };
  }

  if (review.verdict === "BLOCK") {
    const category = review.category || "policy";
    const reason =
      review.reason || "This request can't be turned into an ad we can run.";
    await db.creativeRequest.update({
      where: { id: creativeRequestId },
      data: {
        status: "BLOCKED",
        reviewedAt: new Date(),
        reviewCategory: category,
        reviewNotes: reason,
      },
    });
    return { state: "blocked", category, reason };
  }

  await db.creativeRequest.update({
    where: { id: creativeRequestId },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewCategory: null,
      reviewNotes: null,
    },
  });
  return { state: "approved" };
}

/**
 * Retries every request that is stuck waiting on a check that never ran.
 *
 * Bounded rather than unbounded: each one is a model call, and a queue that
 * built up over a week of a missing API key should not turn into a hundred
 * calls the moment the key is added. The rest are picked up on the next run.
 *
 * Pass an organizationId to sweep just one account. That is the version the
 * customer's own creatives page runs after rendering, so their stuck request
 * clears on the next page load instead of waiting for the nightly sweep.
 */
export async function retryStuckReviews(
  options: { limit?: number; organizationId?: string } = {}
): Promise<{
  checked: number;
  approved: number;
  blocked: number;
  stillStuck: number;
}> {
  const { limit = 25, organizationId } = options;

  const stuck = await db.creativeRequest.findMany({
    where: {
      status: "IN_REVIEW",
      aiConcept: { not: null },
      ...(organizationId ? { organizationId } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let approved = 0;
  let blocked = 0;
  let stillStuck = 0;

  // Sequential. These are model calls, and firing twenty-five at once is how
  // you get rate-limited into failing the very retry that is meant to unstick
  // things.
  for (const { id } of stuck) {
    const outcome = await runSafetyReview(id);
    if (outcome.state === "approved") approved++;
    else if (outcome.state === "blocked") blocked++;
    else stillStuck++;
  }

  return { checked: stuck.length, approved, blocked, stillStuck };
}
