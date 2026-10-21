import { db } from "@/lib/db";
import { entitlementsForTier } from "@/lib/entitlements";
import type { SubscriptionTier } from "@/generated/prisma/enums";

// Who may use MAIRO Social Manager: nobody. MAIRO discontinued posting to a
// business's own Instagram or Facebook profile (October 2026) — it runs
// Facebook and Instagram ads. Meta never approved the posting permissions
// (instagram_content_publish, pages_manage_posts), so the feature could not
// publish for a customer anyway; switching it off for every plan, the earlier
// Scale plan included, takes nothing away that worked. Saved posts and
// history are kept in the database, never published.
//
// The rule below still requires a tier in SOCIAL_TIERS (now none), a live
// subscription and no stopped execution, and every action and the publisher
// still ask it on the server — so nothing can post even if a screen or job
// were reached.

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

/** The tiers Social Manager belongs to: none — it was discontinued. */
export const SOCIAL_TIERS: readonly SubscriptionTier[] = [];

export const SOCIAL_UPGRADE_MESSAGE = "Social media posting isn't part of MAIRO's plans. MAIRO runs your Facebook and Instagram ads.";
export const SOCIAL_PAUSED_MESSAGE = "MAIRO no longer posts to Instagram or Facebook profiles — it runs your Facebook and Instagram ads. Your saved posts and history are kept, and nothing will be published.";

/** The rule, without the database — so it can be checked line by line. */
export function socialAccessFrom(org: SocialAccessInput | null, flagGranted = true): SocialAccess {
  if (!org || !SOCIAL_TIERS.includes(org.subscriptionTier) || !flagGranted) {
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
