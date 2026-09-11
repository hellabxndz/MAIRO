import { db } from "@/lib/db";
import type { AdGoal, AdPlatform } from "@/generated/prisma/enums";
import { getAdapter, platformName } from "@/lib/ad-platforms/registry";
import { loadCredentials } from "@/lib/ad-platforms/connections";
import type { Allocation } from "@/lib/budget/allocation";
import { nicheById, primaryAction } from "@/lib/tracking/niches";
import { parseAdCopy } from "@/lib/meta/creative-copy";

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
    /**
     * How far the launch actually got.
     *
     * The distinction that matters: a campaign on its own delivers nothing.
     * Meta and TikTok both need a campaign, an ad set beneath it and an ad
     * beneath that before a single impression can be served, and a product
     * that reports "launched" after the first of those three is lying by
     * omission — the customer sees a campaign in their dashboard, waits, and
     * nothing ever happens.
     */
    stage: LaunchStage;
    /** What is still missing, in the customer's words. Null when ready. */
    blocker: string | null;
  }[];
};

export type LaunchStage =
  /** Nothing reached the network. */
  | "none"
  /** A campaign exists and cannot deliver. */
  | "campaign"
  /** Campaign and ad set exist. Still cannot deliver — there is no ad. */
  | "ad_set"
  /** Campaign, ad set and ad. This one can run once it is switched on. */
  | "ready";

export type CreateMairoCampaignInput = {
  organizationId: string;
  name: string;
  objective: AdGoal;
  totalDailyBudgetCents: number;
  allocations: Allocation[];
  tiktokGrowthMode?: boolean;
  /** Campaigns are created paused; this is here for a future "launch now". */
  activate?: boolean;
  /**
   * When the customer wants it to begin. Null means as soon as it is approved.
   *
   * Travels all the way down to the ad set, where it becomes the network's own
   * start_time — so the schedule survives MAIRO not being running.
   */
  startAt?: Date | null;
  /** The zone they picked that time in, kept so every screen echoes it back. */
  startTimeZone?: string | null;
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
      startDate: input.startAt ?? null,
      startTimeZone: input.startTimeZone ?? null,
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
        startAt: input.startAt ?? null,
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
  startAt?: Date | null;
}): Promise<LaunchOutcome["results"][number]> {
  const adapter = getAdapter(input.platform);

  if (!adapter) {
    const error = `MAIRO can't run campaigns on ${platformName(input.platform)} yet.`;
    await recordFailure(input.platformCampaignId, error);
    return {
      platform: input.platform,
      launched: false,
      externalCampaignId: null,
      error,
      stage: "none",
      blocker: error,
    };
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
      stage: "none",
      blocker: result.error.message,
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

  // The campaign exists. On its own it delivers nothing, so the rest of the
  // hierarchy is built here rather than left to the customer to finish in an
  // ads manager they were promised they would never have to open.
  const finish = await buildDeliverable({
    organizationId: input.organizationId,
    platformCampaignId: input.platformCampaignId,
    platform: input.platform,
    adapter,
    name: input.name,
    objective: input.objective,
    dailyBudgetCents: input.dailyBudgetCents,
    externalCampaignId: result.data.externalId,
    startAt: input.startAt ?? null,
  });

  return {
    platform: input.platform,
    launched: true,
    externalCampaignId: result.data.externalId,
    error: null,
    stage: finish.stage,
    blocker: finish.blocker,
  };
}

/**
 * Builds the ad set and the ad beneath a campaign that already exists.
 *
 * Never throws and never undoes the campaign. A campaign that reached the
 * network exists whether or not the ad set follows, and deleting it to keep
 * the record tidy would be a worse failure than an incomplete one — the
 * customer would have a campaign in their ads manager that MAIRO has no memory
 * of. So each step records what it achieved and the caller reports the truth.
 */
async function buildDeliverable(input: {
  organizationId: string;
  platformCampaignId: string;
  platform: AdPlatform;
  adapter: NonNullable<ReturnType<typeof getAdapter>>;
  name: string;
  objective: AdGoal;
  dailyBudgetCents: number;
  externalCampaignId: string;
  startAt?: Date | null;
}): Promise<{ stage: LaunchStage; blocker: string | null }> {
  // What this business can honestly optimize towards. A pixel is what makes
  // "optimize for purchases" mean anything; without one the adapter falls back
  // to clicks and says so here rather than silently under-delivering.
  const conversion = await conversionTargetFor(input.organizationId, input.platform);

  const adGroup = await input.adapter.createAdGroup({
    organizationId: input.organizationId,
    externalCampaignId: input.externalCampaignId,
    name: `${input.name} — audience`,
    dailyBudgetCents: input.dailyBudgetCents,
    goal: input.objective,
    campaignOwnsBudget: input.adapter.budgetLevel === "campaign",
    conversion,
    // The booked start, which becomes the network's own start_time. MAIRO
    // also holds the campaign paused until then, but only while it is
    // running — this is what keeps the schedule when it is not.
    startAt: input.startAt ?? null,
  });

  if (!adGroup.ok) {
    await db.platformCampaign.update({
      where: { id: input.platformCampaignId },
      data: { lastError: adGroup.error.message },
    });
    return { stage: "campaign", blocker: adGroup.error.message };
  }

  await db.platformCampaign.update({
    where: { id: input.platformCampaignId },
    data: { externalAdGroupId: adGroup.data.externalId, lastError: null },
  });

  const creative = await approvedCreativeFor(input.organizationId);
  if (!creative) {
    const blocker =
      "There is no approved creative to run yet, so the ad hasn't been built. Approve a picture on the Creatives page and launch again.";
    await db.platformCampaign.update({
      where: { id: input.platformCampaignId },
      data: { lastError: blocker },
    });
    return { stage: "ad_set", blocker };
  }

  const ad = await input.adapter.createAd({
    organizationId: input.organizationId,
    externalAdGroupId: adGroup.data.externalId,
    name: input.name,
    creative: {
      aspectRatio: "SQUARE_1_1",
      headline: creative.headline,
      primaryText: creative.primaryText,
      cta: creative.cta,
      imageData: creative.imageData,
    },
    destinationUrl: creative.destinationUrl,
  });

  if (!ad.ok) {
    await db.platformCampaign.update({
      where: { id: input.platformCampaignId },
      data: { lastError: ad.error.message },
    });
    return { stage: "ad_set", blocker: ad.error.message };
  }

  await db.platformCampaign.update({
    where: { id: input.platformCampaignId },
    data: { externalAdId: ad.data.externalId, lastError: null },
  });

  return { stage: "ready", blocker: null };
}

/**
 * The pixel and event this campaign should be optimized towards.
 *
 * Comes from the tracking setup: the niche's primary conversion is the thing
 * the business actually wants, so it is the thing the campaign chases. Null
 * when there is no pixel, which is a real answer and not an error.
 */
async function conversionTargetFor(
  organizationId: string,
  platform: AdPlatform
): Promise<{ pixelId: string; event: string } | null> {
  const pixel = await db.trackingPixel.findUnique({
    where: { organizationId_platform: { organizationId, platform } },
  });
  if (!pixel) return null;

  const profile = await db.trackingProfile.findUnique({ where: { organizationId } });
  const niche = nicheById(profile?.nicheId ?? "general");
  const action = primaryAction(niche);

  return {
    pixelId: pixel.externalPixelId,
    event: platform === "TIKTOK" ? action.tiktokEvent : action.metaEvent,
  };
}

/**
 * The most recent creative the customer actually approved, with its copy.
 *
 * Approved is the bar on purpose: a concept that has not been through the
 * safety review, or a picture the customer never chose, is not something to
 * spend their money showing to strangers. Returns null rather than falling
 * back to anything.
 */
async function approvedCreativeFor(organizationId: string): Promise<{
  headline: string | null;
  primaryText: string | null;
  cta: string | null;
  imageData: string;
  destinationUrl: string | null;
} | null> {
  const request = await db.creativeRequest.findFirst({
    where: {
      organizationId,
      status: { in: ["APPROVED", "DELIVERED"] },
      images: { some: { isFinal: true } },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      images: { where: { isFinal: true }, orderBy: { version: "desc" }, take: 1 },
      organization: { select: { website: true } },
    },
  });

  const image = request?.images[0];
  if (!request || !image) return null;

  const copy = parseAdCopy(request.aiConcept);
  return {
    headline: copy.headline,
    primaryText: copy.primaryText,
    cta: copy.callToAction,
    imageData: image.imageData,
    destinationUrl: request.organization.website ?? null,
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
