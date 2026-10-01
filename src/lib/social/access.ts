import { db } from "@/lib/db";
import { entitlementsForTier } from "@/lib/entitlements";
import { planFor } from "@/lib/plans";
import type { SubscriptionTier } from "@/generated/prisma/enums";

// Who may use MAIRO Social Manager: active Scale customers, and nobody else.
//
// Stricter on purpose than the rest of the product's plan checks:
//   - The tier must be SCALE itself. A plan row in the database that switched
//     social_posting on for another tier still doesn't open it.
//   - The subscription must be live (active, or the trialing week the
//     customer gave a card for), whatever BILLING_ENFORCED says. The
//     free-access fallback that lets everyone try ads while billing is off
//     never reaches Social Manager.
//   - Execution must not be stopped (an unpaid trial).
//
// Checked again on the server for every action and before every publish.
// The screens use it too, but they are not the lock.

export const LIVE_STATUSES = ["active", "trialing"] as const;

export type SocialAccess =
  | { ok: true }
  | {
      ok: false;
      /** not_scale: never had it or on another plan. inactive: Scale, but not paid up. */
      reason: "not_scale" | "inactive";
      message: string;
    };

export type SocialAccessInput = {
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: string | null;
  executionStoppedAt?: Date | null;
};

const SCALE = planFor("SCALE").name;

export const SOCIAL_UPGRADE_MESSAGE = `Social Manager is available exclusively with MAIRO ${SCALE}. Upgrade to ${SCALE} to unlock AI social media management.`;
export const SOCIAL_PAUSED_MESSAGE = `Social Manager is available exclusively with MAIRO ${SCALE}. Your existing content and history are saved. Upgrade back to ${SCALE} to continue.`;

/** The rule, without the database — so it can be checked line by line. */
export function socialAccessFrom(org: SocialAccessInput | null, flagGranted = true): SocialAccess {
  if (!org || org.subscriptionTier !== "SCALE" || !flagGranted) {
    return { ok: false, reason: "not_scale", message: SOCIAL_UPGRADE_MESSAGE };
  }
  if (!(LIVE_STATUSES as readonly string[]).includes(org.subscriptionStatus ?? "") || org.executionStoppedAt) {
    return { ok: false, reason: "inactive", message: SOCIAL_PAUSED_MESSAGE };
  }
  return { ok: true };
}

/** Reads the organization fresh every time; never from a session or the browser. */
export async function socialAccess(organizationId: string): Promise<SocialAccess> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionTier: true, subscriptionStatus: true, executionStoppedAt: true, paymentRequired: true },
  });
  if (!org) return socialAccessFrom(null);
  const ent = await entitlementsForTier(org.subscriptionTier, org.paymentRequired);
  return socialAccessFrom(org, ent.social_posting);
}
