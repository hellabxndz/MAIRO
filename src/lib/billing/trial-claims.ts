import { db } from "@/lib/db";

// One MAIRO Pro free trial per business, and one per Meta ad account — for
// good. Without the second rule, the trial is free forever: start a trial,
// cancel before day 7, sign up again with another email, connect the same ad
// account, repeat.
//
// Three places ask:
//   checkout          gives the trial only to a business that hasn't had one
//                     and whose connected ad account hasn't either
//   connecting Meta   during a trial, an ad account another business already
//                     had its trial on is refused until they start paying
//   the webhook       records the trial (and the ad account, if connected)
//
// The claims outlive the business (TrialClaim has no relation to it), so
// deleting an account doesn't bring the trial back.

/** Why a business gets no trial at checkout. Null: it gets one. Pure. */
export function trialRefusal(input: { trialUsedAt: Date | null; adAccountClaimedBy: string | null; organizationId: string }): "business" | "ad_account" | null {
  if (input.trialUsedAt) return "business";
  if (input.adAccountClaimedBy && input.adAccountClaimedBy !== input.organizationId) return "ad_account";
  return null;
}

/** Whether checkout may start this business with a free trial. */
export async function trialEligible(organizationId: string): Promise<boolean> {
  const [org, meta] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { trialUsedAt: true } }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { metaAdAccountId: true } }),
  ]);
  const claim = meta?.metaAdAccountId ? await db.trialClaim.findUnique({ where: { metaAdAccountId: meta.metaAdAccountId }, select: { organizationId: true } }) : null;
  return trialRefusal({ trialUsedAt: org?.trialUsedAt ?? null, adAccountClaimedBy: claim?.organizationId ?? null, organizationId }) === null;
}

/**
 * Claims an ad account for this business's trial. True when it's this
 * business's (now or already); false when another business had its trial on
 * it. The unique index settles two businesses racing for the same account.
 */
export async function claimAdAccount(organizationId: string, metaAdAccountId: string): Promise<boolean> {
  const existing = await db.trialClaim.findUnique({ where: { metaAdAccountId }, select: { organizationId: true } });
  if (existing) return existing.organizationId === organizationId;
  try {
    await db.trialClaim.create({ data: { metaAdAccountId, organizationId } });
    return true;
  } catch {
    const winner = await db.trialClaim.findUnique({ where: { metaAdAccountId }, select: { organizationId: true } });
    return winner?.organizationId === organizationId;
  }
}

/**
 * Before an ad account is connected (or switched to): refused when this
 * business is in its free trial and another business already had a trial on
 * that ad account. Outside a trial there's nothing to protect — a paying
 * business can connect any account it manages.
 */
export async function adAccountAllowedDuringTrial(organizationId: string, metaAdAccountId: string): Promise<boolean> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { subscriptionStatus: true } });
  if (org?.subscriptionStatus !== "trialing") return true;
  return claimAdAccount(organizationId, metaAdAccountId);
}

/**
 * The trial has started: recorded on the business, and on the ad account it
 * has connected, if any. Called from the webhook; idempotent.
 */
export async function recordTrialStart(organizationId: string): Promise<void> {
  await db.organization.updateMany({ where: { id: organizationId, trialUsedAt: null }, data: { trialUsedAt: new Date() } });
  const meta = await db.metaAdAccount.findUnique({ where: { organizationId }, select: { metaAdAccountId: true } });
  if (meta?.metaAdAccountId && !(await claimAdAccount(organizationId, meta.metaAdAccountId))) {
    // Checkout checks first, so this is a race or a trial started outside
    // MAIRO's checkout. Said loudly; the connection rule still holds.
    console.warn(`Trial started for ${organizationId} on ad account ${meta.metaAdAccountId}, which another business already had a trial on.`);
  }
}
