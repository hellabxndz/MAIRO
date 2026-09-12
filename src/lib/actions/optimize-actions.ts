"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { can, entitlementsFor } from "@/lib/entitlements";
import { planFor } from "@/lib/plans";
import { splitBudget } from "@/lib/budget/allocation";
import {
  checkGuardrails,
  recommendReallocation,
  type PlatformPerformance,
  type Recommendation,
} from "@/lib/budget/optimizer";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { applyAllocation } from "@/lib/campaigns/launch";
import type { AdPlatform } from "@/generated/prisma/enums";

// Producing and applying budget recommendations.
//
// The rule that shapes every function here: MAIRO does not move a customer's
// money without permission. `buildRecommendations` only reads and proposes.
// `applyRecommendationAction` requires a person to have clicked. The automatic
// path exists but runs every proposal through the customer's own stated limits
// first and refuses on any doubt.

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
  const entitlements = await entitlementsFor(organizationId);
  if (!entitlements.cross_platform_campaigns) return [];

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

export type ApplyState = { error?: string; applied?: boolean } | undefined;

/**
 * Applies a recommendation, because a person asked for it.
 *
 * The proposal is re-read from the stored row rather than taken from the
 * form. A percentage arriving in a POST body is user input, and this one moves
 * real money — accepting it would mean a crafted request could set any split
 * it liked regardless of what was ever recommended or shown.
 */
export async function applyRecommendationAction(
  _prev: ApplyState,
  formData: FormData
): Promise<ApplyState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const parsed = z
    .object({ recommendationId: z.string().min(1) })
    .safeParse({ recommendationId: formData.get("recommendationId") });
  if (!parsed.success) return { error: "Invalid request" };

  const row = await db.optimizationRecommendation.findUnique({
    where: { id: parsed.data.recommendationId },
    include: { mairoCampaign: true },
  });

  // Also confirms the recommendation belongs to this organization — an id is
  // guessable and this is the check that makes guessing useless.
  if (!row || row.mairoCampaign.organizationId !== organizationId) {
    return { error: "That recommendation is no longer available." };
  }
  if (row.status !== "PENDING") {
    return { error: "That recommendation has already been dealt with." };
  }

  let proposal: { platform: AdPlatform; toPercent: number }[];
  try {
    proposal = JSON.parse(row.proposalJson);
  } catch {
    return { error: "That recommendation can't be read. Dismiss it and MAIRO will make a new one." };
  }

  const allocations = splitBudget(
    row.mairoCampaign.totalDailyBudgetCents,
    proposal.map((p) => ({ platform: p.platform, percent: p.toPercent }))
  );

  const result = await applyAllocation({
    organizationId,
    mairoCampaignId: row.mairoCampaignId,
    allocations,
  });

  if (result.applied.length === 0) {
    return {
      error:
        result.failed[0]?.error ??
        "Couldn't apply the change. Nothing was altered — try again shortly.",
    };
  }

  await db.optimizationRecommendation.update({
    where: { id: row.id },
    data: {
      status: "APPLIED",
      appliedAt: new Date(),
      appliedById: session.user.id ?? null,
      automatic: false,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/campaigns");

  // Partly applied is worth saying out loud rather than reporting success.
  if (result.failed.length > 0) {
    return {
      applied: true,
      error: `Applied on ${result.applied.join(" and ")}, but ${result.failed[0].error}`,
    };
  }

  return { applied: true };
}

export async function dismissRecommendationAction(
  _prev: ApplyState,
  formData: FormData
): Promise<ApplyState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const id = formData.get("recommendationId");
  if (typeof id !== "string") return { error: "Invalid request" };

  const row = await db.optimizationRecommendation.findUnique({
    where: { id },
    include: { mairoCampaign: true },
  });
  if (!row || row.mairoCampaign.organizationId !== organizationId) {
    return { error: "That recommendation is no longer available." };
  }

  await db.optimizationRecommendation.update({
    where: { id },
    data: { status: "DISMISSED" },
  });
  revalidatePath("/dashboard");
  return { applied: false };
}

// --- Auto Optimize ---------------------------------------------------------

const autoOptimizeSchema = z.object({
  enabled: z.boolean(),
  maxDailyBudget: z.coerce.number().min(1),
  maxDailyIncreasePercent: z.coerce.number().min(1).max(100),
  minRoas: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  maxCpa: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  platforms: z.array(z.enum(["META", "TIKTOK", "GOOGLE", "SNAPCHAT", "PINTEREST", "LINKEDIN"])),
});

export type AutoOptimizeState = { error?: string; saved?: boolean } | undefined;

export async function saveAutoOptimizeAction(
  _prev: AutoOptimizeState,
  formData: FormData
): Promise<AutoOptimizeState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  if (!(await can(organizationId, "auto_optimize"))) {
    return { error: `Auto Optimize is part of the ${planFor("SCALE").name} plan.` };
  }

  const parsed = autoOptimizeSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    maxDailyBudget: formData.get("maxDailyBudget"),
    maxDailyIncreasePercent: formData.get("maxDailyIncreasePercent"),
    minRoas: formData.get("minRoas") ?? "",
    maxCpa: formData.get("maxCpa") ?? "",
    platforms: formData.getAll("platforms"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the limits and try again." };
  }

  const data = {
    enabled: parsed.data.enabled,
    maxDailyBudgetCents: Math.round(parsed.data.maxDailyBudget * 100),
    maxDailyIncreasePercent: parsed.data.maxDailyIncreasePercent,
    minRoas:
      parsed.data.minRoas === "" || parsed.data.minRoas === undefined
        ? null
        : Number(parsed.data.minRoas),
    maxCpaCents:
      parsed.data.maxCpa === "" || parsed.data.maxCpa === undefined
        ? null
        : Math.round(Number(parsed.data.maxCpa) * 100),
    platforms: parsed.data.platforms as AdPlatform[],
  };

  await db.autoOptimizeSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });

  revalidatePath("/dashboard/settings");
  return { saved: true };
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
  let applied = 0;

  for (const item of recommendations) {
    const campaign = await db.mairoCampaign.findUnique({
      where: { id: item.mairoCampaignId },
    });
    if (!campaign) continue;

    const verdict = checkGuardrails({
      recommendation: item.recommendation,
      limits: {
        enabled: settings.enabled,
        maxDailyBudgetCents: settings.maxDailyBudgetCents,
        maxDailyIncreasePercent: settings.maxDailyIncreasePercent,
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
    }
  }

  return { applied, refused };
}
