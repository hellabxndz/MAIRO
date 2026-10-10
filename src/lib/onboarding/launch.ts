import { db } from "@/lib/db";
import { hasActivePlan } from "@/lib/readiness";
import { maybeGoLive } from "@/lib/campaigns/auto-launch";
import { recordRun } from "@/lib/team/runs";
import { UNEXPECTED, explainCampaignError, type Problem } from "./problems";

// Approving and cancelling the first campaign's launch. The server actions in
// strategy-actions.ts check who's asking and call these; the tests call them
// directly against a pretend Meta.

export type LaunchResult = { ok: true; live: boolean; message: string | null; problem: Problem | null } | { ok: false; error: string };
export type CancelResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * "Approve and launch": the one press that lets the first campaign spend.
 *
 * Safe to press twice — a double click, a second tab, a retry after a slow
 * network. The approval is recorded once, and maybeGoLive claims the campaign
 * before calling Meta, so only one request ever switches it on. "Live" is
 * reported only when Meta accepted the change; anything else says what it's
 * waiting for, or what Meta refused, in plain words.
 */
export async function launchPlanCampaign(organizationId: string): Promise<LaunchResult> {
  const ctx = { organizationId };
  try {
    const [row, org] = await Promise.all([
      db.strategyPlan.findUnique({ where: { organizationId: ctx.organizationId } }),
      db.organization.findUnique({ where: { id: ctx.organizationId }, select: { subscriptionTier: true, subscriptionStatus: true, paymentRequired: true } }),
    ]);
    if (!row?.campaignId) return { ok: false, error: "The campaign hasn't been built yet." };
    if (!org || !hasActivePlan(org)) return { ok: false, error: "Choose a MAIRO plan first — your subscription isn't active, so nothing can be launched." };
    const campaign = await db.mairoCampaign.findFirst({
      where: { id: row.campaignId, organizationId: ctx.organizationId },
      select: { status: true, platformCampaigns: { select: { status: true, externalAdId: true } } },
    });
    if (!campaign) return { ok: false, error: "Campaign not found." };
    if (campaign.status === "ACTIVE" && campaign.platformCampaigns.some((p) => p.status === "ACTIVE")) {
      return { ok: true, live: true, message: "It's already live — Meta confirmed it earlier, so nothing was done twice.", problem: null };
    }
    if (!campaign.platformCampaigns.some((p) => p.externalAdId)) {
      return { ok: false, error: "The campaign isn't fully built on Meta yet, so there's nothing to switch on. Finish building it first." };
    }

    // Recorded once. A second press finds it already there.
    const first = await db.mairoCampaign.updateMany({
      where: { id: row.campaignId, organizationId: ctx.organizationId, launchApprovedAt: null },
      data: { launchApprovedAt: new Date() },
    });

    const outcome = await maybeGoLive(ctx.organizationId, { onlyCampaignId: row.campaignId, approvedByPerson: true });
    if (outcome.launched) {
      await db.strategyPlan.update({ where: { id: row.id }, data: { launchedAt: new Date() } });
    }
    if (outcome.launched) return { ok: true, live: true, message: null, problem: null };

    // Meta refused to switch it on: maybeGoLive put it back and kept Meta's words.
    const refused = await db.platformCampaign.findFirst({ where: { mairoCampaignId: row.campaignId, lastError: { not: null } }, select: { lastError: true } });
    if (refused?.lastError) {
      return { ok: true, live: false, message: null, problem: explainCampaignError(refused.lastError, { campaignHref: `/dashboard/campaigns/${row.campaignId}`, returnTo: "/dashboard/launch" }) };
    }
    return {
      ok: true,
      live: false,
      message:
        outcome.heldBecause ??
        (first.count === 0
          ? "You'd already approved this, so it wasn't approved twice. MAIRO switches it on as soon as Meta clears the ad."
          : "Approved. Meta is still reviewing the ad — MAIRO switches it on as soon as the review clears, because you've already said yes."),
      problem: null,
    };
  } catch (error) {
    console.error("Launch failed:", error);
    return { ok: false, error: `${UNEXPECTED.title}. ${UNEXPECTED.kept} ${UNEXPECTED.message}` };
  }
}

/**
 * "Cancel launch": takes back the approval before the campaign goes live.
 *
 * The campaign stays built and switched off in the ad account. Cleared in one
 * statement that also checks nothing went live, and the launch claim checks
 * the approval in its own statement — so a cancel and a launch can't both win.
 */
export async function cancelPlanLaunch(organizationId: string): Promise<CancelResult> {
  const ctx = { organizationId };
  const row = await db.strategyPlan.findUnique({ where: { organizationId: ctx.organizationId }, select: { campaignId: true } });
  if (!row?.campaignId) return { ok: false, error: "There's no campaign to cancel." };
  const cancelled = await db.mairoCampaign.updateMany({
    where: { id: row.campaignId, organizationId: ctx.organizationId, launchApprovedAt: { not: null }, platformCampaigns: { none: { status: "ACTIVE" } } },
    data: { launchApprovedAt: null },
  });
  if (cancelled.count === 0) {
    const c = await db.mairoCampaign.findFirst({ where: { id: row.campaignId, organizationId: ctx.organizationId }, select: { launchApprovedAt: true, platformCampaigns: { select: { status: true } } } });
    if (!c) return { ok: false, error: "Campaign not found." };
    if (c.platformCampaigns.some((p) => p.status === "ACTIVE")) {
      return { ok: false, error: "It went live a moment ago, so the launch can't be cancelled. You can pause it from Campaigns — spending stops as soon as Meta confirms the pause." };
    }
    return { ok: true, message: "It wasn't approved to launch, so nothing was going to start." };
  }
  const name = (await db.mairoCampaign.findFirst({ where: { id: row.campaignId, organizationId: ctx.organizationId }, select: { name: true } }))?.name ?? "your campaign";
  await recordRun({
    organizationId: ctx.organizationId,
    agent: "ARCHITECT",
    task: "cancel-launch",
    status: "DONE",
    summary: `Kept “${name}” switched off after you cancelled the launch. Nothing was spent.`,
    href: "/dashboard/launch",
  });
  return { ok: true, message: "Launch cancelled. The campaign stays switched off in your ad account and nothing is spent. Approve it again whenever you're ready." };
}
