import { db } from "@/lib/db";
import type { AdGoal, AdPlatform } from "@/generated/prisma/enums";
import { getAdapter, platformName } from "@/lib/ad-platforms/registry";
import { loadCredentials } from "@/lib/ad-platforms/connections";
import type { Allocation } from "@/lib/budget/allocation";

// Turning one Mairo campaign into real campaigns on real networks.
//
// The hard part here is not the API calls, it is what to do when some of them
// work and some do not. A customer who picked Meta and TikTok and got a
// half-launched campaign needs to be told exactly that, and the record needs
// to match reality closely enough that retrying finishes the job instead of
// creating a second campaign on the network that already succeeded.
//
// So: the parent and all its children are written first, as DRAFT, before
// anything is sent anywhere. Then each network is attempted, and each child
// records its own outcome independently. A child that reaches its network gets
// an external id and stops being a draft; one that fails keeps its budget, its
// share, and the reason, and can be retried on its own. Nothing is rolled
// back — a campaign that exists on Meta is not un-created because TikTok was
// down, because it does exist, and pretending otherwise is how you end up with
// orphaned campaigns spending money outside the dashboard.

export type LaunchOutcome = {
  mairoCampaignId: string;
  results: {
    platform: AdPlatform;
    /** True when this network now has a real campaign. */
    launched: boolean;
    externalCampaignId: string | null;
    /** Set when this network refused or was unreachable. Safe to show. */
    error: string | null;
  }[];
};

export type CreateMairoCampaignInput = {
  organizationId: string;
  name: string;
  objective: AdGoal;
  totalDailyBudgetCents: number;
  allocations: Allocation[];
  tiktokGrowthMode?: boolean;
  /** Campaigns are created paused; this is here for a future "launch now". */
  activate?: boolean;
};

/**
 * Creates the Mairo campaign and everything under it.
 *
 * Never throws for a network failure — the outcome describes what happened on
 * each one, and the caller renders it.
 */
export async function createMairoCampaign(
  input: CreateMairoCampaignInput
): Promise<LaunchOutcome> {
  // Written first, all of it, before a single network is contacted. If the
  // process dies halfway through the launches, what is in the database is a
  // campaign with some children still marked DRAFT — which is recoverable and
  // true. The alternative, writing rows as each network succeeds, loses the
  // record of a campaign that was created on Meta and then crashed.
  const campaign = await db.mairoCampaign.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      objective: input.objective,
      totalDailyBudgetCents: input.totalDailyBudgetCents,
      tiktokGrowthMode: input.tiktokGrowthMode ?? false,
      status: "DRAFT",
      platformCampaigns: {
        create: input.allocations.map((a) => ({
          platform: a.platform,
          budgetPercent: a.percent,
          dailyBudgetCents: a.dailyBudgetCents,
          status: "DRAFT" as const,
        })),
      },
    },
    include: { platformCampaigns: true },
  });

  const results = await Promise.all(
    campaign.platformCampaigns.map((child) =>
      launchOne({
        organizationId: input.organizationId,
        platformCampaignId: child.id,
        platform: child.platform,
        name: input.name,
        objective: input.objective,
        dailyBudgetCents: child.dailyBudgetCents,
        activate: input.activate ?? false,
      })
    )
  );

  // The parent's status is the honest summary of its children: live if any
  // network took it, draft if none did.
  const anyLaunched = results.some((r) => r.launched);
  await db.mairoCampaign.update({
    where: { id: campaign.id },
    data: { status: anyLaunched ? "PENDING_REVIEW" : "DRAFT" },
  });

  return { mairoCampaignId: campaign.id, results };
}

/**
 * Pushes one platform campaign to its network and records what happened.
 *
 * Exported because retrying a single failed platform is exactly this, and a
 * customer whose TikTok half failed should be able to retry that half without
 * touching the Meta campaign that already works.
 */
export async function launchOne(input: {
  organizationId: string;
  platformCampaignId: string;
  platform: AdPlatform;
  name: string;
  objective: AdGoal;
  dailyBudgetCents: number;
  activate: boolean;
}): Promise<LaunchOutcome["results"][number]> {
  const adapter = getAdapter(input.platform);

  if (!adapter) {
    const error = `MAIRO can't run campaigns on ${platformName(input.platform)} yet.`;
    await recordFailure(input.platformCampaignId, error);
    return { platform: input.platform, launched: false, externalCampaignId: null, error };
  }

  const result = await adapter.createCampaign({
    organizationId: input.organizationId,
    name: input.name,
    goal: input.objective,
    dailyBudgetCents: input.dailyBudgetCents,
    activate: input.activate,
  });

  if (!result.ok) {
    await recordFailure(input.platformCampaignId, result.error.message);
    return {
      platform: input.platform,
      launched: false,
      externalCampaignId: null,
      error: result.error.message,
    };
  }

  // Link the child to the connection it went out on, so that later reads know
  // which credentials produced it — a customer can reconnect a different ad
  // account, and a campaign created on the old one is not reachable from the
  // new one.
  const creds = await loadCredentials(input.organizationId, input.platform);

  await db.platformCampaign.update({
    where: { id: input.platformCampaignId },
    data: {
      externalCampaignId: result.data.externalId,
      status: result.data.status === "ACTIVE" ? "ACTIVE" : "PENDING_REVIEW",
      connectionId: input.platform === "META" ? null : (creds?.connectionId ?? null),
      lastError: null,
    },
  });

  return {
    platform: input.platform,
    launched: true,
    externalCampaignId: result.data.externalId,
    error: null,
  };
}

async function recordFailure(platformCampaignId: string, message: string): Promise<void> {
  await db.platformCampaign.update({
    where: { id: platformCampaignId },
    data: { status: "DRAFT", lastError: message },
  });
}

/**
 * Applies a new budget split to a campaign that is already running.
 *
 * Order matters here and is deliberate. Every network is told before anything
 * is written down, and the database only records the platforms that actually
 * accepted the change. Writing first and calling second would leave the
 * dashboard showing a split that is not the one running — which, for a screen
 * whose entire job is to be believed, is worse than the change failing.
 */
export async function applyAllocation(input: {
  organizationId: string;
  mairoCampaignId: string;
  allocations: Allocation[];
}): Promise<{ applied: AdPlatform[]; failed: { platform: AdPlatform; error: string }[] }> {
  const children = await db.platformCampaign.findMany({
    where: { mairoCampaignId: input.mairoCampaignId },
  });

  const applied: AdPlatform[] = [];
  const failed: { platform: AdPlatform; error: string }[] = [];

  for (const allocation of input.allocations) {
    const child = children.find((c) => c.platform === allocation.platform);
    if (!child) continue;

    // A child that never reached its network has no budget to change out
    // there; updating the row is the whole job.
    if (!child.externalCampaignId) {
      await db.platformCampaign.update({
        where: { id: child.id },
        data: {
          budgetPercent: allocation.percent,
          dailyBudgetCents: allocation.dailyBudgetCents,
        },
      });
      applied.push(allocation.platform);
      continue;
    }

    const adapter = getAdapter(allocation.platform);
    if (!adapter) {
      failed.push({
        platform: allocation.platform,
        error: `MAIRO can't reach ${platformName(allocation.platform)}.`,
      });
      continue;
    }

    const result = await adapter.updateBudget({
      organizationId: input.organizationId,
      externalCampaignId: child.externalCampaignId,
      dailyBudgetCents: allocation.dailyBudgetCents,
    });

    if (!result.ok) {
      failed.push({ platform: allocation.platform, error: result.error.message });
      continue;
    }

    await db.platformCampaign.update({
      where: { id: child.id },
      data: {
        budgetPercent: allocation.percent,
        dailyBudgetCents: allocation.dailyBudgetCents,
        lastError: null,
      },
    });
    applied.push(allocation.platform);
  }

  return { applied, failed };
}
