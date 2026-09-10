"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { CreativeStatus } from "@/generated/prisma/enums";

async function requireOwner() {
  const session = await auth();
  if (!session?.user || session.user.role !== "OWNER") {
    throw new Error("Owner access required");
  }
  return session;
}

export async function updateCreativeStatusAction(
  requestId: string,
  organizationId: string,
  formData: FormData
) {
  await requireOwner();
  const status = formData.get("status") as CreativeStatus;
  await db.creativeRequest.update({ where: { id: requestId }, data: { status } });
  revalidatePath("/aios/creatives");
  revalidatePath(`/aios/organizations/${organizationId}`);
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
