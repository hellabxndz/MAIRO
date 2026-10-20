import { db } from "@/lib/db";
import { DEFAULT_ENTITLEMENTS, entitlementsForTier } from "@/lib/entitlements";
import { STOPPED_STATUSES, stopUnpaidExecution } from "@/lib/billing/stop-unpaid";
import { pauseSocialIfLocked } from "@/lib/social/pause";
import type { SubscriptionTier } from "@/generated/prisma/enums";

// More than one business under one MAIRO Scale subscription.
//
// MAIRO Scale covers up to three Meta ad accounts (ad_account_limit). Each ad
// account belongs to one business in MAIRO (MetaAdAccount.organizationId is
// unique), so "three ad accounts" is three businesses: the one that pays, and
// up to two more — brands — added under it. A brand is an ordinary BUSINESS
// organization whose parent is another BUSINESS (a freelancer's clients hang
// off a WORKSPACE instead, and are untouched by this file).
//
// A brand has no Stripe customer of its own. Its plan columns are a copy of
// the paying business's, written when the brand is made and again every
// time Stripe changes the parent (syncBrands, called from the webhook and the
// daily review). Copying rather than resolving through the parent on every
// read keeps every existing check — entitlements, Social Manager, the
// payment gate, the readiness screens — working on a brand unchanged.
//
// If the parent's plan stops covering a brand (a move to MAIRO Pro, or the
// subscription ending), the brand is written as having no plan. That locks
// building, changing and launching there — the same as any business without
// a subscription — but never pauses its running campaigns: they keep running
// at the budgets the owner approved until the owner pauses them, which still
// works. Nothing is deleted.

/** The plan columns a brand copies from the business that pays for it. */
const MIRRORED = {
  subscriptionTier: true,
  subscriptionStatus: true,
  currentPeriodEnd: true,
  subscriptionCancelAt: true,
  hasPaid: true,
  executionStoppedAt: true,
  executionStoppedReason: true,
} as const;

type Mirrored = {
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  subscriptionCancelAt: Date | null;
  hasPaid: boolean;
  executionStoppedAt: Date | null;
  executionStoppedReason: string | null;
};

/** What a brand beyond the plan's allowance is written as: no plan. */
const UNCOVERED = { subscriptionTier: "NONE" as const, subscriptionStatus: null, currentPeriodEnd: null, subscriptionCancelAt: null };

/**
 * How many extra businesses a tier may add under itself (ad accounts minus
 * the paying business's own). Read from the compiled-in plan so it can't be
 * widened by a database row.
 */
export function extraBusinessesFor(tier: SubscriptionTier): number {
  return Math.max(0, (DEFAULT_ENTITLEMENTS[tier]?.ad_account_limit ?? 1) - 1);
}

/** The brands under a business, oldest first — the order the allowance covers them in. */
export async function brandsOf(parentId: string) {
  return db.organization.findMany({
    where: { parentId, kind: "BUSINESS", parent: { kind: "BUSINESS" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, website: true, subscriptionTier: true, createdAt: true, metaAdAccount: { select: { id: true } } },
  });
}

/** The business that pays for this one, if it is a brand; null if it pays for itself. */
export async function payingBusinessOf(organizationId: string): Promise<{ id: string; name: string } | null> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { kind: true, parent: { select: { id: true, name: true, kind: true } } },
  });
  if (!org || org.kind !== "BUSINESS" || !org.parent || org.parent.kind !== "BUSINESS") return null;
  return { id: org.parent.id, name: org.parent.name };
}

/**
 * Copies the paying business's plan onto each of its brands, covering as many
 * as the plan allows (oldest first) and writing the rest as having no plan.
 * Absolute writes, so running it twice changes nothing. Returns how many
 * brands are covered and how many aren't.
 */
export async function syncBrands(parentId: string): Promise<{ covered: number; uncovered: number }> {
  const parent = await db.organization.findUnique({ where: { id: parentId }, select: { kind: true, parentId: true, ...MIRRORED } });
  // Only a business that pays for itself has brands.
  if (!parent || parent.kind !== "BUSINESS" || parent.parentId) return { covered: 0, uncovered: 0 };
  const brands = await brandsOf(parentId);
  if (brands.length === 0) return { covered: 0, uncovered: 0 };

  const ent = await entitlementsForTier(parent.subscriptionTier, true);
  const allowance = Math.max(0, Math.min(ent.ad_account_limit, DEFAULT_ENTITLEMENTS[parent.subscriptionTier]?.ad_account_limit ?? 1) - 1);
  const mirror: Mirrored = {
    subscriptionTier: parent.subscriptionTier,
    subscriptionStatus: parent.subscriptionStatus,
    currentPeriodEnd: parent.currentPeriodEnd,
    subscriptionCancelAt: parent.subscriptionCancelAt,
    hasPaid: parent.hasPaid,
    executionStoppedAt: parent.executionStoppedAt,
    executionStoppedReason: parent.executionStoppedReason,
  };

  const covered = brands.slice(0, allowance).map((b) => b.id);
  const uncovered = brands.slice(allowance).map((b) => b.id);
  await db.$transaction([
    ...(covered.length ? [db.organization.updateMany({ where: { id: { in: covered } }, data: { ...mirror, paymentRequired: true } })] : []),
    ...(uncovered.length ? [db.organization.updateMany({ where: { id: { in: uncovered } }, data: { ...UNCOVERED, paymentRequired: true } })] : []),
  ]);

  // What follows a plan change on the paying business follows on its brands:
  // Social Manager pauses where it's no longer included, and a subscription
  // that never paid stops what MAIRO runs (stop-unpaid.ts) — the same rule,
  // not a new one.
  for (const id of [...covered, ...uncovered]) {
    await pauseSocialIfLocked(id).catch((error) => console.error("Pausing Social Manager on a brand failed:", error));
  }
  if (!parent.hasPaid && parent.subscriptionStatus && STOPPED_STATUSES.includes(parent.subscriptionStatus) && parent.executionStoppedAt) {
    for (const id of covered) {
      const running = await db.platformCampaign.count({ where: { mairoCampaign: { organizationId: id }, status: { in: ["ACTIVE", "PENDING_REVIEW"] } } });
      if (running) await stopUnpaidExecution(id).catch((error) => console.error("Stopping a brand failed:", error));
    }
  }
  return { covered: covered.length, uncovered: uncovered.length };
}

/** The plan columns a new brand starts with: its parent's, as syncBrands would write them. */
export async function brandStartingPlan(parentId: string): Promise<Mirrored & { paymentRequired: true }> {
  const parent = await db.organization.findUniqueOrThrow({ where: { id: parentId }, select: MIRRORED });
  return { ...parent, paymentRequired: true };
}

/** Backstop for a missed webhook: re-copies every paying business's plan onto its brands. Runs with the daily review. */
export async function syncAllBrands(limit = 100): Promise<{ parents: number }> {
  const parents = await db.organization.findMany({
    where: { kind: "BUSINESS", parentId: null, clients: { some: { kind: "BUSINESS" } } },
    select: { id: true },
    take: limit,
  });
  for (const p of parents) await syncBrands(p.id).catch((error) => console.error("Brand sync failed:", p.id, error));
  return { parents: parents.length };
}
