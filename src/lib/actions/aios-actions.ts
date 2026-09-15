"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { runSafetyReview } from "@/lib/creatives/review-run";
import type { CreativeStatus } from "@/generated/prisma/enums";

async function requireOwner() {
  const session = await auth();
  if (!session?.user || session.user.role !== "OWNER") {
    throw new Error("Owner access required");
  }
  return session;
}

// The statuses a person is allowed to set by hand.
//
// APPROVED, BLOCKED and IN_REVIEW are deliberately not on this list. Those are
// the safety reviewer's verdicts, and a dropdown that can overwrite them makes
// the review decorative: anything it blocks can be waved through by whoever is
// having a bad day, and anything it approves can be second-guessed by someone
// with no policy in front of them. The way to change a verdict is to ask for
// the check again — rerunSafetyReviewAction — and take the answer.
//
// What is left is the fulfilment track: where the work has got to, which is a
// real thing a person knows and the reviewer does not.
const MANUAL_STATUSES = ["REQUESTED", "IN_PROGRESS", "DELIVERED"] as const;

export async function updateCreativeStatusAction(
  requestId: string,
  organizationId: string,
  formData: FormData
) {
  await requireOwner();
  const status = formData.get("status") as CreativeStatus;

  if (!(MANUAL_STATUSES as readonly string[]).includes(status)) {
    throw new Error(
      `${status} is decided by the safety check, not by hand. Re-run the check instead.`
    );
  }

  // A blocked request does not get quietly reopened into the fulfilment track
  // either. It stays blocked until the reviewer says otherwise.
  const current = await db.creativeRequest.findUnique({
    where: { id: requestId },
    select: { status: true },
  });
  if (current?.status === "BLOCKED") {
    throw new Error("This request was blocked by the safety check. Re-run the check to change it.");
  }

  await db.creativeRequest.update({ where: { id: requestId }, data: { status } });
  revalidatePath("/aios/creatives");
  revalidatePath(`/aios/organizations/${organizationId}`);
}

/**
 * Asks the safety reviewer to look at a request again.
 *
 * IN_REVIEW is not "waiting for the owner to decide" — the reviewer decides,
 * and a request only lands here when the reviewer could not be reached at all.
 * So the useful button on one of these rows is not approve or reject, it is
 * "go ask again", which is this.
 *
 * The verdict it writes is the reviewer's, never the operator's.
 */
export async function rerunSafetyReviewAction(
  requestId: string,
  organizationId: string
): Promise<{ message: string }> {
  await requireOwner();
  const outcome = await runSafetyReview(requestId);
  revalidatePath("/aios/creatives");
  revalidatePath(`/aios/organizations/${organizationId}`);

  switch (outcome.state) {
    case "approved":
      return { message: "Approved." };
    case "blocked":
      return { message: `Blocked — ${outcome.reason}` };
    case "no_concept":
      return { message: "There is no concept to check yet." };
    case "not_found":
      return { message: "That request no longer exists." };
    default:
      return { message: `The checker still isn't answering: ${outcome.detail}` };
  }
}

export async function updatePlanStatusAction(
  planId: string,
  organizationId: string,
  formData: FormData
) {
  await requireOwner();
  const status = formData.get("status") as import("@/generated/prisma/enums").PlanStatus;
  await db.monthlyPlan.update({ where: { id: planId }, data: { status } });
  revalidatePath(`/aios/organizations/${organizationId}`);
}

// Until billing is wired up, tiers are assigned by hand here after payment is
// collected however you collect it. This is what actually raises a client's
// campaign and creative limits.
export async function updateSubscriptionTierAction(organizationId: string, formData: FormData) {
  await requireOwner();
  const subscriptionTier = formData.get(
    "subscriptionTier"
  ) as import("@/generated/prisma/enums").SubscriptionTier;
  await db.organization.update({ where: { id: organizationId }, data: { subscriptionTier } });
  revalidatePath(`/aios/organizations/${organizationId}`);
  revalidatePath("/aios/organizations");
}

/**
 * Moves a managed account setup along, and records what MAIRO did.
 *
 * The owner-side half of the "we'll build your TikTok for you" promise. The
 * fields here are deliberately the ones the customer sees — the handle they
 * ended up with, and a note explaining anything they need to do — because a
 * queue nobody reports back through is just a list of people waiting.
 *
 * There is no password field, and there should never be one. The account
 * belongs to the customer and the handoff happens out of band; storing a
 * platform login here would make MAIRO the custodian of a credential its own
 * Terms say it never keeps.
 */
export async function updateManagedSetupAction(setupId: string, formData: FormData) {
  await requireOwner();

  const status = formData.get("status") as import("@/generated/prisma/enums").ManagedSetupStatus;
  const read = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === "string" ? raw.trim() || null : undefined;
  };

  const { advanceSetup } = await import("@/lib/tiktok/managed-setup");
  await advanceSetup(setupId, status, {
    internalNotes: read("internalNotes"),
    createdHandle: read("createdHandle"),
    handoffUrl: read("handoffUrl"),
  });

  revalidatePath("/aios/account-setups");
  revalidatePath("/dashboard/integrations");
}
