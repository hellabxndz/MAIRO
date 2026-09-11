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
import {
  instantFromLocal,
  SCHEDULE_PROBLEM_MESSAGE,
  validateStart,
} from "@/lib/campaigns/schedule";
import { getAdapter, platformName } from "@/lib/ad-platforms/registry";
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
  /**
   * When to start, as the wall-clock time the customer typed plus the zone
   * their browser is in. Both or neither — a time with no zone is not a time,
   * and reading it in the server's zone would put a launch hours out.
   */
  // nullish, not optional: an absent form field reads back as null rather
  // than undefined, and a schema that only accepts undefined rejects every
  // campaign created without a schedule — which is most of them.
  startLocal: z.string().trim().nullish(),
  startTimeZone: z.string().trim().max(64).nullish(),
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
    startLocal: formData.get("startLocal"),
    startTimeZone: formData.get("startTimeZone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, objective, dailyBudget, platforms, percents, tiktokGrowthMode } = parsed.data;
  const totalDailyBudgetCents = Math.round(dailyBudget * 100);

  // When they want it to begin. Empty means "as soon as Meta approves it",
  // which is the default and what most people pick.
  //
  // The conversion happens here rather than in the browser because the browser
  // is where a Date is easiest to get wrong — and a start time an hour out is
  // a day's budget spent overnight, with nothing on any screen to explain it.
  let startAt: Date | null = null;
  const startTimeZone = parsed.data.startTimeZone?.trim() || null;
  if (parsed.data.startLocal) {
    if (!startTimeZone) {
      return { error: "MAIRO couldn't tell what timezone that time is in. Try again." };
    }
    startAt = instantFromLocal(parsed.data.startLocal, startTimeZone);
    if (!startAt) {
      return { error: SCHEDULE_PROBLEM_MESSAGE.unreadable };
    }
    const problem = validateStart(startAt);
    if (problem) return { error: SCHEDULE_PROBLEM_MESSAGE[problem] };
  }

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
    startAt,
    startTimeZone: startAt ? startTimeZone : null,
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

/**
 * Moves — or clears — a campaign's booked start.
 *
 * Only while it hasn't started. Once ads are delivering, "when does it start"
 * is no longer a question, and Meta refuses to move the start of something
 * already running anyway.
 *
 * The database is updated first and the networks after. That order is
 * deliberate: MAIRO's own gate is what actually holds a campaign paused, so
 * saving it first means the new time is honoured even if Meta is unreachable
 * this second. The network call is the belt to that pair of braces — it stops
 * delivery beginning early if MAIRO isn't running when the time arrives — and
 * a failure there is reported rather than rolled back.
 */
export async function rescheduleCampaignAction(
  mairoCampaignId: string,
  startLocal: string | null,
  startTimeZone: string | null
): Promise<{ error?: string; saved?: boolean; warning?: string }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const campaign = await db.mairoCampaign.findFirst({
    // Scoped to the organization in the query rather than checked afterwards,
    // so a campaign id from another account reads as missing.
    where: { id: mairoCampaignId, organizationId },
    include: { platformCampaigns: true },
  });
  if (!campaign) return { error: "Campaign not found" };

  if (campaign.status === "ACTIVE") {
    return {
      error:
        "This campaign is already running, so its start time can't be moved. Pause it instead if you want it to stop.",
    };
  }

  let startAt: Date | null = null;
  if (startLocal) {
    if (!startTimeZone) {
      return { error: "MAIRO couldn't tell what timezone that time is in. Try again." };
    }
    startAt = instantFromLocal(startLocal, startTimeZone);
    if (!startAt) return { error: SCHEDULE_PROBLEM_MESSAGE.unreadable };
    const problem = validateStart(startAt);
    if (problem) return { error: SCHEDULE_PROBLEM_MESSAGE[problem] };
  }

  await db.mairoCampaign.update({
    where: { id: campaign.id },
    data: { startDate: startAt, startTimeZone: startAt ? startTimeZone : null },
  });

  // Tell each network that already has an ad set. One that doesn't will be
  // given the new time when it is built.
  const failures: string[] = [];
  for (const child of campaign.platformCampaigns) {
    if (!child.externalAdGroupId) continue;
    const adapter = getAdapter(child.platform);
    if (!adapter) continue;

    const result = await adapter.updateSchedule({
      organizationId,
      externalAdGroupId: child.externalAdGroupId,
      startAt,
    });
    if (!result.ok) failures.push(`${platformName(child.platform)}: ${result.error.message}`);
  }

  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard");

  if (failures.length > 0) {
    return {
      saved: true,
      // Saved, and MAIRO will hold it — but the network holds its old copy of
      // the start time, so the customer should know the two disagree.
      warning: `Saved. MAIRO will hold the campaign until then, but couldn't update the schedule on ${failures.join("; ")}`,
    };
  }

  return { saved: true };
}
