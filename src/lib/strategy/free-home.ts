import { db } from "@/lib/db";
import { hasActivePlan } from "@/lib/readiness";

/** The free home's state, or null when this account has full access. */
export async function freeHomeState(organizationId: string) {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, subscriptionTier: true, subscriptionStatus: true, paymentRequired: true, executionStoppedReason: true, executionStoppedAt: true, parentId: true },
  });
  if (!org || !org.paymentRequired || org.parentId || hasActivePlan(org)) return null;
  const [plan, meta] = await Promise.all([
    db.strategyPlan.findUnique({ where: { organizationId }, select: { status: true } }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true } }),
  ]);
  return {
    approved: plan?.status === "APPROVED",
    connected: meta?.status === "CONNECTED",
    businessName: org.name,
    stoppedReason: org.executionStoppedAt ? org.executionStoppedReason : null,
  };
}
