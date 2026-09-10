"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { planFor } from "@/lib/plans";
import {
  checkPlatformSelection,
  entitlementsFor,
  type EntitlementFlag,
} from "@/lib/entitlements";
import { activeOrganizationId } from "@/lib/active-org";
import {
  recommendAllocation,
  splitBudget,
  validateAllocation,
} from "@/lib/budget/allocation";
import { createMairoCampaign } from "@/lib/campaigns/launch";
import { platformName } from "@/lib/ad-platforms/registry";
import type { AdPlatform } from "@/generated/prisma/enums";

const PLATFORM_VALUES = ["META", "TIKTOK", "GOOGLE", "SNAPCHAT", "PINTEREST", "LINKEDIN"] as const;

const createCampaignSchema = z.object({
  name: z.string().min(1),
  objective: z.enum(["LEADS", "SALES", "AWARENESS", "TRAFFIC", "APP_PROMOTION"]),
  dailyBudget: z.coerce.number().min(1),
  platforms: z.array(z.enum(PLATFORM_VALUES)).min(1, "Pick at least one place to advertise."),
  /** Whole per cent per platform, in the same order as `platforms`. */
  percents: z.array(z.coerce.number().min(0).max(100)),
  tiktokGrowthMode: z.boolean().default(false),
});

export type CampaignActionState =
  | {
      error?: string;
      /**
       * Set when the plan is what stopped this, rather than the input. The
       * form opens the upgrade modal on this instead of showing a red error —
       * a customer clicking TikTok on Starter is expressing intent to buy, not
       * making a mistake.
       */
      upgradeNeeded?: EntitlementFlag;
      /** Per-platform outcome after a launch that partly worked. */
      partial?: { platform: string; error: string }[];
    }
  | undefined;

/**
 * Creates one Mairo campaign, on however many networks the customer chose.
 *
 * The shape of this used to be "create a campaign on Meta". The change is not
 * that it loops: it is that the customer's campaign and the networks' campaigns
 * are now different things, and this creates the first and asks the adapters
 * for the second. What comes back can be a partial success, and that is a
 * normal outcome rather than an error — see src/lib/campaigns/launch.ts.
 */
export async function createCampaignAction(
  _prevState: CampaignActionState,
  formData: FormData
): Promise<CampaignActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const parsed = createCampaignSchema.safeParse({
    name: formData.get("name"),
    objective: formData.get("objective"),
    dailyBudget: formData.get("dailyBudget"),
    platforms: formData.getAll("platforms"),
    percents: formData.getAll("percents"),
    tiktokGrowthMode: formData.get("tiktokGrowthMode") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, objective, dailyBudget, platforms, percents, tiktokGrowthMode } = parsed.data;
  const totalDailyBudgetCents = Math.round(dailyBudget * 100);

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionTier: true },
  });
  if (!organization) return { error: "Organization not found" };

  // What the plan allows, asked once and in one place.
  const entitlements = await entitlementsFor(organizationId);
  const permission = checkPlatformSelection(platforms as AdPlatform[], entitlements);
  if (!permission.allowed) {
    return { upgradeNeeded: permission.missing };
  }
  if (tiktokGrowthMode && !entitlements.tiktok_growth) {
    return { upgradeNeeded: "tiktok_growth" };
  }

  // An archived campaign has been retired, so it doesn't hold a slot.
  const plan = planFor(organization.subscriptionTier);
  const activeCount = await db.mairoCampaign.count({
    where: { organizationId, status: { not: "ARCHIVED" } },
  });
  if (activeCount >= entitlements.campaign_limit) {
    return {
      error: `The ${plan.name} plan runs ${entitlements.campaign_limit} campaign${
        entitlements.campaign_limit === 1 ? "" : "s"
      } at a time. Archive one to free up a slot, or upgrade for more.`,
    };
  }

  // The customer may have dragged the split, or left MAIRO's suggestion alone.
  // Either way it is re-derived here rather than trusted: percentages arriving
  // from a form are user input, and the money is computed from them server-side.
  const allocations =
    percents.length === platforms.length && percents.reduce((a, b) => a + b, 0) === 100
      ? splitBudget(
          totalDailyBudgetCents,
          platforms.map((p, i) => ({ platform: p as AdPlatform, percent: percents[i] }))
        )
      : recommendAllocation(platforms as AdPlatform[], objective, totalDailyBudgetCents);

  const problems = validateAllocation(allocations);
  if (problems.length > 0) {
    return { error: problems[0].message };
  }

  const outcome = await createMairoCampaign({
    organizationId,
    name,
    objective,
    totalDailyBudgetCents,
    allocations,
    tiktokGrowthMode,
  });

  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard");

  const failures = outcome.results.filter((r) => !r.launched);

  // Everything failed: the campaign is saved as a draft and the customer is
  // told why, in the network's own words.
  if (failures.length === outcome.results.length) {
    return {
      error:
        failures.length === 1
          ? failures[0].error ?? "Couldn't create the campaign."
          : "Couldn't reach any of the selected networks. The campaign is saved as a draft.",
      partial: failures.map((f) => ({
        platform: platformName(f.platform),
        error: f.error ?? "Unknown error",
      })),
    };
  }

  // Some worked. Not an error — the campaign exists and is running where it
  // could — but the customer needs to know which half didn't.
  if (failures.length > 0) {
    return {
      partial: failures.map((f) => ({
        platform: platformName(f.platform),
        error: f.error ?? "Unknown error",
      })),
    };
  }

  return undefined;
}

/**
 * MAIRO's suggested split, for the form to show before anything is created.
 *
 * Server-side so the weighting logic has one home rather than being duplicated
 * into the client for the preview and then again on the server for the real
 * thing — which is exactly how a preview ends up disagreeing with what gets
 * created.
 */
export async function suggestAllocationAction(input: {
  platforms: AdPlatform[];
  objective: "LEADS" | "SALES" | "AWARENESS" | "TRAFFIC" | "APP_PROMOTION";
  dailyBudget: number;
}): Promise<{ platform: AdPlatform; percent: number; dailyBudgetCents: number }[]> {
  const total = Math.round(input.dailyBudget * 100);
  return recommendAllocation(input.platforms, input.objective, total);
}
