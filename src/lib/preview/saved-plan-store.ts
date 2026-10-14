import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { parseDraft } from "@/lib/onboarding/draft";
import { draftFromPlan, savedPlanSchema, UNCLAIMED_DAYS, type SavedPlan } from "@/lib/preview/saved-plan";

// Where saved and shared free AI ad plans live (the FreeAdPlan table).
//
// A plan is stored only when the visitor presses Save, Share or Put MAIRO to
// Work. Before an account it belongs to no business and is reachable only by
// its unguessable link; once claimed — at sign-up, or saved while signed in —
// it belongs to that business, which also opens setup with its answers for
// the owner to confirm. Unclaimed plans are deleted after UNCLAIMED_DAYS.

const token = () => randomBytes(18).toString("base64url");

export async function savePlan(plan: SavedPlan, organizationId: string | null = null): Promise<{ id: string; shareToken: string }> {
  const row = await db.freeAdPlan.create({
    data: { shareToken: token(), organizationId, claimedAt: organizationId ? new Date() : null, inputsJson: JSON.stringify(plan.inputs), planJson: JSON.stringify(plan) },
    select: { id: true, shareToken: true },
  });
  if (organizationId) await prefillSetup(organizationId, plan);
  return row;
}

function parse(planJson: string): SavedPlan | null {
  try {
    const r = savedPlanSchema.safeParse(JSON.parse(planJson));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** A shared plan by its link, or null — also null once an unclaimed plan has expired. */
export async function readSharedPlan(shareToken: string): Promise<{ plan: SavedPlan; createdAt: Date } | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(shareToken)) return null;
  const row = await db.freeAdPlan.findUnique({ where: { shareToken }, select: { planJson: true, createdAt: true, claimedAt: true } });
  if (!row) return null;
  if (!row.claimedAt && row.createdAt.getTime() < Date.now() - UNCLAIMED_DAYS * 864e5) return null;
  const plan = parse(row.planJson);
  return plan ? { plan, createdAt: row.createdAt } : null;
}

/**
 * Gives an unclaimed plan to a business — at sign-up, or when a signed-in
 * owner presses Put MAIRO to Work — and opens setup with its answers. A plan
 * another business already claimed is never moved, and an expired one can't
 * be claimed.
 */
export async function claimPlan(shareToken: string, organizationId: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(shareToken)) return false;
  const fresh = new Date(Date.now() - UNCLAIMED_DAYS * 864e5);
  const claimed = await db.freeAdPlan.updateMany({ where: { shareToken, OR: [{ organizationId: null, createdAt: { gte: fresh } }, { organizationId }] }, data: { organizationId, claimedAt: new Date() } });
  if (!claimed.count) return false;
  const row = await db.freeAdPlan.findUnique({ where: { shareToken }, select: { planJson: true } });
  const plan = row ? parse(row.planJson) : null;
  if (plan) await prefillSetup(organizationId, plan);
  return true;
}

/** Setup's draft, filled from the plan where it's still empty — never once setup is finished. */
async function prefillSetup(organizationId: string, plan: SavedPlan) {
  const [org, intake] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { onboardingDraft: true } }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { id: true } }),
  ]);
  if (!org || intake) return;
  await db.organization.update({ where: { id: organizationId }, data: { onboardingDraft: draftFromPlan(plan, parseDraft(org.onboardingDraft)) } });
}

/** The business's saved plans, newest first. */
export async function plansFor(organizationId: string): Promise<{ shareToken: string; createdAt: Date; plan: SavedPlan }[]> {
  const rows = await db.freeAdPlan.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 10, select: { shareToken: true, createdAt: true, planJson: true } });
  return rows.flatMap((r) => {
    const plan = parse(r.planJson);
    return plan ? [{ shareToken: r.shareToken, createdAt: r.createdAt, plan }] : [];
  });
}

/** The daily run: unclaimed plans older than UNCLAIMED_DAYS are deleted. */
export async function sweepUnclaimedPlans(): Promise<number> {
  const r = await db.freeAdPlan.deleteMany({ where: { organizationId: null, createdAt: { lt: new Date(Date.now() - UNCLAIMED_DAYS * 864e5) } } });
  return r.count;
}
