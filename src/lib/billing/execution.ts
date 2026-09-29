import { db } from "@/lib/db";
import { hasActivePlan } from "@/lib/readiness";

// The paid line, enforced on the server.
//
// FREE: Mairo shows what it would do — the plan, the analysis, edits, and
// connecting an ad account. PAID: Mairo does it — building campaigns, ad
// sets and ads, changing budgets and schedules, switching delivery on,
// generating creatives and publishing.
//
// Every one of those paid actions asks this first, and the Meta adapter asks
// it again before any write, so no screen, cron or automation can skip it.
// Pausing is never blocked: stopping spend is always allowed.

export const CHOOSE_PLAN_PATH = "/plan/activate";

export const NEEDS_PLAN_MESSAGE =
  "Choose a Mairo plan to activate your strategy. After subscribing, Mairo builds and launches the real campaign.";

/** Null when paid execution is allowed, otherwise the reason to show. */
export async function executionBlock(organizationId: string): Promise<string | null> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionTier: true, subscriptionStatus: true, paymentRequired: true, executionStoppedAt: true, executionStoppedReason: true },
  });
  if (!org) return "Account not found.";
  if (hasActivePlan(org)) return null;
  if (org.executionStoppedAt) return org.executionStoppedReason ?? NEEDS_PLAN_MESSAGE;
  return NEEDS_PLAN_MESSAGE;
}

export async function executionAllowed(organizationId: string): Promise<boolean> {
  return (await executionBlock(organizationId)) === null;
}
