"use server";

import { executionBlock } from "@/lib/billing/execution";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { can } from "@/lib/entitlements";
import { planFor } from "@/lib/plans";
import { splitBudget } from "@/lib/budget/allocation";
import { applyAllocation } from "@/lib/campaigns/launch";
import type { AdPlatform } from "@/generated/prisma/enums";

// Producing and applying budget recommendations.
//
// The rule that shapes every function here: MAIRO does not move a customer's
// money without permission. `applyRecommendationAction` requires a person to
// have clicked. Building recommendations, and the automatic path, are in
// lib/budget/recommendations.ts — they trust the organization id they're
// given, so they must not be exported from this "use server" file.

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
  const blocked = await executionBlock(organizationId);
  if (blocked) return { error: blocked };

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
  level: z.enum(["MANUAL", "ASSISTED", "AUTOPILOT"]),
  maxDailyBudget: z.coerce.number().min(1),
  maxDailyIncreasePercent: z.coerce.number().min(1).max(100),
  maxBudgetShiftPercent: z.coerce.number().min(1).max(100),
  minRoas: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  maxCpa: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  platforms: z.array(z.enum(["META"])),
  maxDailyDecreasePercent: z.coerce.number().min(1).max(100).default(30),
  requireApprovalNewCreatives: z.boolean(),
  requireApprovalAudience: z.boolean(),
  requireApprovalPlatformShift: z.boolean(),
});

export type AutoOptimizeState = { error?: string; saved?: boolean } | undefined;

export async function saveAutoOptimizeAction(
  _prev: AutoOptimizeState,
  formData: FormData
): Promise<AutoOptimizeState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  // Manual is always allowed: it is the setting where MAIRO does nothing on
  // its own, so gating it would mean a customer whose plan lapsed could not
  // turn automation OFF — the exact wrong way round for a feature that spends
  // money. Only the two levels that act are gated.
  const wantsLevel = String(formData.get("level") ?? "MANUAL");
  if (wantsLevel !== "MANUAL" && !(await can(organizationId, "auto_optimize"))) {
    return { error: `Letting MAIRO act on its own comes with a plan.` };
  }
  // Autopilot is gated separately, and enforced here rather than only in the
  // UI — a disabled card somebody can walk around by posting the form is not
  // a gate, and this one decides whether MAIRO may widen who sees an ad.
  if (wantsLevel === "AUTOPILOT" && !(await can(organizationId, "autopilot"))) {
    return { error: `Full Autopilot is part of the ${planFor("SCALE").name} plan.` };
  }

  const parsed = autoOptimizeSchema.safeParse({
    level: formData.get("level"),
    maxDailyBudget: formData.get("maxDailyBudget"),
    maxDailyIncreasePercent: formData.get("maxDailyIncreasePercent"),
    maxBudgetShiftPercent: formData.get("maxBudgetShiftPercent"),
    minRoas: formData.get("minRoas") ?? "",
    maxCpa: formData.get("maxCpa") ?? "",
    platforms: formData.getAll("platforms"),
    maxDailyDecreasePercent: formData.get("maxDailyDecreasePercent") ?? 30,
    // A checkbox that isn't ticked isn't sent at all, so absence is "off".
    requireApprovalNewCreatives: formData.get("requireApprovalNewCreatives") === "on",
    requireApprovalAudience: formData.get("requireApprovalAudience") === "on",
    requireApprovalPlatformShift: formData.get("requireApprovalPlatformShift") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the limits and try again." };
  }

  const data = {
    level: parsed.data.level,
    // Kept in step with the level rather than stored separately. Older code
    // reads `enabled`, and a second field that can disagree with the level is
    // a way for the product to act against what the settings page promises.
    enabled: parsed.data.level !== "MANUAL",
    maxDailyBudgetCents: Math.round(parsed.data.maxDailyBudget * 100),
    maxDailyIncreasePercent: parsed.data.maxDailyIncreasePercent,
    maxBudgetShiftPercent: parsed.data.maxBudgetShiftPercent,
    minRoas:
      parsed.data.minRoas === "" || parsed.data.minRoas === undefined
        ? null
        : Number(parsed.data.minRoas),
    maxCpaCents:
      parsed.data.maxCpa === "" || parsed.data.maxCpa === undefined
        ? null
        : Math.round(Number(parsed.data.maxCpa) * 100),
    platforms: parsed.data.platforms as AdPlatform[],
    maxDailyDecreasePercent: parsed.data.maxDailyDecreasePercent,
    requireApprovalNewCreatives: parsed.data.requireApprovalNewCreatives,
    requireApprovalAudience: parsed.data.requireApprovalAudience,
    requireApprovalPlatformShift: parsed.data.requireApprovalPlatformShift,
  };

  await db.autoOptimizeSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });

  revalidatePath("/dashboard/settings");
  return { saved: true };
}
