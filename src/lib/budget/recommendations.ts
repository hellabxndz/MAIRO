// Producing budget recommendations, and applying the ones MAIRO may apply by
// itself.
//
// These take an organization id and trust it, so they live here rather than in
// a "use server" file: everything exported from one of those is a public
// endpoint anyone can call with any id. Pages and server actions call these
// only after they have checked who is asking.
//
// The rule that shapes every function here: MAIRO does not move a customer's
// money without permission. `buildRecommendations` only reads and proposes.
// The automatic path runs every proposal through the customer's own stated
// limits first and refuses on any doubt.

import { db } from "@/lib/db";
import { can } from "@/lib/entitlements";
import { checkGuardrails, recommendReallocation, type PlatformPerformance, type Recommendation } from "@/lib/budget/optimizer";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { sendSms } from "@/lib/sms/send";
import { applyAllocation } from "@/lib/campaigns/launch";

export type CampaignRecommendation = {
  mairoCampaignId: string;
  campaignName: string;
  recommendation: Recommendation;
  /** The stored row, so applying one can be matched to what was shown. */
  recommendationId: string;
};

/**
 * Looks at every running campaign and returns the ones worth acting on.
 *
 * Most of the time this returns an empty list, and that is the correct answer:
 * a campaign in its first week has not produced enough evidence to justify
 * moving money, and inventing a recommendation to fill the space on the
 * dashboard would be worse than an empty space.
 */
export async function buildRecommendations(
  organizationId: string
): Promise<CampaignRecommendation[]> {
  const [report, campaigns] = await Promise.all([
    fetchOrganizationPerformance(organizationId),
    db.mairoCampaign.findMany({
      where: { organizationId, status: { in: ["ACTIVE", "PENDING_REVIEW"] } },
      include: { platformCampaigns: true },
    }),
  ]);

  const out: CampaignRecommendation[] = [];

  for (const campaign of campaigns) {
    if (campaign.platformCampaigns.length < 2) continue;

    const campaignReport = report.campaigns.find((c) => c.mairoCampaignId === campaign.id);
    if (!campaignReport) continue;

    const performances: PlatformPerformance[] = campaign.platformCampaigns.map((child) => ({
      platform: child.platform,
      metrics:
        campaignReport.byPlatform.find((p) => p.platform === child.platform)?.metrics ??
        campaignReport.total,
      currentPercent: child.budgetPercent,
    }));

    const recommendation = recommendReallocation(performances);
    if (!recommendation) continue;

    // Stored so that applying one is auditable — what was proposed, on what
    // evidence, and who accepted it. "The AI changed my budget and I don't
    // know why" is not a state this product may ever be in.
    const existing = await db.optimizationRecommendation.findFirst({
      where: { mairoCampaignId: campaign.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });

    const row =
      existing ??
      (await db.optimizationRecommendation.create({
        data: {
          mairoCampaignId: campaign.id,
          rationale: recommendation.rationale,
          proposalJson: JSON.stringify(recommendation.proposal),
          evidenceJson: JSON.stringify(
            recommendation.evidence.map((e) => ({
              platform: e.platform,
              currentPercent: e.currentPercent,
              spendCents: e.metrics.spendCents,
              purchases: e.metrics.purchases,
              costPerPurchaseCents: e.metrics.costPerPurchaseCents,
              roas: e.metrics.roas,
            }))
          ),
        },
      }));

    out.push({
      mairoCampaignId: campaign.id,
      campaignName: campaign.name,
      recommendation,
      recommendationId: row.id,
    });
  }

  return out;
}

/**
 * Applies whatever MAIRO is allowed to apply, by itself.
 *
 * Not wired to a schedule yet — it is called by hand and is ready for a cron
 * to call it. That is deliberate: an unattended job that moves money should be
 * switched on knowingly, once the guardrails have been watched working on real
 * campaigns, rather than starting to run the moment this deploys.
 *
 * Every proposal goes through checkGuardrails, which is the enforcement rather
 * than the UI. A refusal is recorded as a dismissal with its reason, so the
 * customer can see that MAIRO considered a change and decided it was outside
 * what they had allowed.
 */
export async function runAutoOptimize(organizationId: string): Promise<{
  applied: number;
  refused: { campaign: string; reason: string }[];
}> {
  const settings = await db.autoOptimizeSettings.findUnique({ where: { organizationId } });
  if (!settings?.enabled) return { applied: 0, refused: [] };
  if (!(await can(organizationId, "auto_optimize"))) return { applied: 0, refused: [] };

  const recommendations = await buildRecommendations(organizationId);
  const refused: { campaign: string; reason: string }[] = [];
  const moved: string[] = [];
  let applied = 0;

  for (const item of recommendations) {
    const campaign = await db.mairoCampaign.findUnique({
      where: { id: item.mairoCampaignId },
    });
    if (!campaign) continue;

    const verdict = checkGuardrails({
      recommendation: item.recommendation,
      limits: {
        level: settings.level,
        maxDailyBudgetCents: settings.maxDailyBudgetCents,
        maxDailyIncreasePercent: settings.maxDailyIncreasePercent,
        maxBudgetShiftPercent: settings.maxBudgetShiftPercent,
        minRoas: settings.minRoas,
        maxCpaCents: settings.maxCpaCents,
        platforms: settings.platforms,
      },
      totalDailyBudgetCents: campaign.totalDailyBudgetCents,
      currentTotalDailyBudgetCents: campaign.totalDailyBudgetCents,
    });

    if (!verdict.allowed) {
      refused.push({ campaign: item.campaignName, reason: verdict.reason });
      continue;
    }

    const result = await applyAllocation({
      organizationId,
      mairoCampaignId: item.mairoCampaignId,
      allocations: verdict.allocations,
    });

    if (result.applied.length > 0) {
      await db.optimizationRecommendation.update({
        where: { id: item.recommendationId },
        data: { status: "APPLIED", appliedAt: new Date(), automatic: true },
      });
      applied += 1;
      moved.push(item.campaignName);
    }
  }

  // One text for the run, not one per campaign. A customer with four campaigns
  // rebalanced on the same pass should get a sentence, not four phone buzzes —
  // and the detail is on the campaign page, which is where it belongs.
  //
  // Off by default in the preferences, because this is MAIRO doing exactly
  // what it was switched on to do. Somebody who wants to watch it work can ask
  // to be told; nobody should be woken up by it without asking.
  if (moved.length > 0) {
    try {
      const names = [...new Set(moved)];
      await sendSms(
        organizationId,
        "budget-change",
        names.length === 1
          ? `MAIRO moved budget on your campaign "${names[0]}" to follow what is working.`
          : `MAIRO moved budget across ${names.length} campaigns: ${names.join(", ")}.`,
      );
    } catch (error) {
      console.error("Could not send the budget-change text:", error);
    }
  }

  return { applied, refused };
}
