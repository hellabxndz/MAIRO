import { db } from "@/lib/db";
import type {
  AdDestination,
  AdGoal,
  AdPlatform,
  LeadFormDelivery,
  MessageChannel,
} from "@/generated/prisma/enums";
import { getAdapter, platformName } from "@/lib/ad-platforms/registry";
import { loadCredentials } from "@/lib/ad-platforms/connections";
import type { Allocation } from "@/lib/budget/allocation";
import { nicheById, primaryAction } from "@/lib/tracking/niches";
import { canOptimizeTowards } from "@/lib/tracking/pixels";
import { parseAdCopy } from "@/lib/meta/creative-copy";
import { describeMissing, resolveDestination, type Destination } from "@/lib/campaigns/destination";
import { postToBoost } from "@/lib/campaigns/sales-source";

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
  /**
   * Where this campaign's clicks should go.
   *
   * Optional because a business that answered at signup does not have to
   * answer again; omitted means "whatever this business normally does".
   */
  destination?: {
    type: AdDestination;
    url?: string | null;
    phone?: string | null;
    channel?: MessageChannel | null;
    delivery?: LeadFormDelivery | null;
  };
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
      destinationType: input.destination?.type ?? "WEBSITE",
      destinationUrl: input.destination?.url ?? null,
      destinationPhone: input.destination?.phone ?? null,
      messageChannel: input.destination?.channel ?? "MESSENGER",
      leadFormDelivery: input.destination?.delivery ?? "HOSTED_PAGE",
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
        mairoCampaignId: campaign.id,
        platform: child.platform,
        name: input.name,
        objective: input.objective,
        destinationType: campaign.destinationType,
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
  mairoCampaignId: string;
  platform: AdPlatform;
  name: string;
  objective: AdGoal;
  destinationType: AdDestination;
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

  // Looked up before the campaign is created, not after. The objective sent to
  // the network depends on whether there is anything to optimize towards, and
  // an objective cannot be changed once the campaign exists.
  const conversion = await conversionTargetFor(input.organizationId, input.platform);

  // Resolved before the campaign, not only before the ad set. An instant form
  // is a lead objective whatever the customer's goal said, and an objective
  // cannot be changed once the campaign exists on the network.
  const campaignDestination = await destinationFor(
    input.organizationId,
    input.mairoCampaignId
  );

  const result = await adapter.createCampaign({
    organizationId: input.organizationId,
    name: input.name,
    goal: input.objective,
    dailyBudgetCents: input.dailyBudgetCents,
    activate: input.activate,
    hasConversionTracking: Boolean(conversion),
    destination: campaignDestination ?? undefined,
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
    mairoCampaignId: input.mairoCampaignId,
    destinationType: input.destinationType,
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
 * Finishes campaigns that reached the network but never got an ad.
 *
 * The dashboard has always promised this step "happens on its own once the
 * steps above are done". It did not. A campaign stopped for a reason that was
 * true at the time — no approved picture yet, no website to send people to,
 * the network refusing the ad set — and then nothing ever tried again. Fixing
 * the reason changed nothing, because the only code that builds an ad runs
 * when a campaign is created, and the campaign already existed.
 *
 * So a customer who added the missing piece watched the same message sit
 * there, and the only way forward anyone could find was to delete a campaign
 * that was most of the way built and start again. Three times over, in one
 * afternoon, for three different missing pieces.
 *
 * This is the other half. It is safe to call on every render: a campaign with
 * an ad is skipped without a single network call, and one without an ad is
 * resumed from exactly where it stopped — an ad set that already exists is
 * reused rather than duplicated, so a retry cannot split the budget across two
 * of them.
 */
export async function finishHalfBuilt(organizationId: string): Promise<number> {
  const halfBuilt = await db.platformCampaign.findMany({
    where: {
      mairoCampaign: { organizationId, status: { not: "ARCHIVED" } },
      status: { not: "ARCHIVED" },
      externalCampaignId: { not: null },
      // The definition of half-built: it reached the network, and nothing can
      // be shown from it.
      externalAdId: null,
      // A short breather after a failure, so this stays safe on a render path.
      //
      // Most reasons an ad cannot be built are checked locally and cost
      // nothing to re-check — no approved picture, no website, no Page. But a
      // network that refuses the ad set costs a real call each time, and a
      // dashboard can render several times in a few seconds. One minute is
      // long enough to stop that and short enough that somebody who has just
      // fixed the problem does not notice it.
      OR: [{ lastError: null }, { updatedAt: { lt: new Date(Date.now() - 60_000) } }],
    },
    include: {
      mairoCampaign: {
        select: { name: true, objective: true, startDate: true, destinationType: true },
      },
    },
  });

  if (halfBuilt.length === 0) return 0;

  let finished = 0;

  // Sequential: each one is several calls that create things on a real ad
  // account, and a burst of those is how you get rate-limited into failing the
  // retry that was meant to fix things.
  for (const child of halfBuilt) {
    const adapter = getAdapter(child.platform);
    if (!adapter) continue;

    const outcome = await buildDeliverable({
      organizationId,
      platformCampaignId: child.id,
      platform: child.platform,
      adapter,
      name: child.mairoCampaign.name,
      objective: child.mairoCampaign.objective,
      dailyBudgetCents: child.dailyBudgetCents,
      externalCampaignId: child.externalCampaignId!,
      mairoCampaignId: child.mairoCampaignId,
      destinationType: child.mairoCampaign.destinationType,
      startAt: child.mairoCampaign.startDate,
      existingAdGroupId: child.externalAdGroupId,
    });

    if (outcome.stage === "ready") finished++;
  }

  return finished;
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
  mairoCampaignId: string;
  /** What the campaign says it wants, so a missing value can be named. */
  destinationType: AdDestination;
  startAt?: Date | null;
  /**
   * An ad set that already reached the network on an earlier attempt.
   *
   * Passed when finishing a half-built campaign. Without it a retry would
   * create a second ad set beside the first and split the budget between one
   * that has an ad and one that never will.
   */
  existingAdGroupId?: string | null;
}): Promise<{ stage: LaunchStage; blocker: string | null }> {
  // What this business can honestly optimize towards. A pixel is what makes
  // "optimize for purchases" mean anything; without one the adapter falls back
  // to clicks and says so here rather than silently under-delivering.
  const conversion = await conversionTargetFor(input.organizationId, input.platform);

  // Asked for, not inferred — and resolved before the ad set rather than just
  // before the ad, because a click-to-message ad is a property of the ad set
  // too. One built without knowing that delivers as an ordinary link ad
  // whatever button the creative carries.
  const destination = await destinationFor(input.organizationId, input.mairoCampaignId);
  if (!destination) {
    const blocker = describeMissing(input.destinationType);
    await db.platformCampaign.update({
      where: { id: input.platformCampaignId },
      data: { lastError: blocker },
    });
    return { stage: "campaign", blocker };
  }

  let adGroupId = input.existingAdGroupId ?? null;

  if (!adGroupId) {
    const adGroup = await input.adapter.createAdGroup({
      organizationId: input.organizationId,
      externalCampaignId: input.externalCampaignId,
      name: `${input.name} — audience`,
      dailyBudgetCents: input.dailyBudgetCents,
      goal: input.objective,
      campaignOwnsBudget: input.adapter.budgetLevel === "campaign",
      conversion,
      destination: destination ?? undefined,
      pageId: await pageIdFor(input.organizationId, input.platform),
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

    adGroupId = adGroup.data.externalId;

    await db.platformCampaign.update({
      where: { id: input.platformCampaignId },
      data: { externalAdGroupId: adGroupId, lastError: null },
    });
  }

  // A post the business already published, when that is what they asked for.
  // Only Meta can run one — the post lives on a Facebook Page — so another
  // network in the same campaign still builds from an approved creative.
  const boostPostId =
    input.platform === "META" ? await boostPostFor(input.organizationId) : null;

  // The bar for a generated ad: somebody approved a picture. A post that is
  // already published has cleared a higher one — the business wrote it, posted
  // it under its own name, and picked it out of its own feed — so requiring an
  // approved creative as well would block the ad on producing something nothing
  // will ever use.
  const creative = boostPostId ? null : await approvedCreativeFor(input.organizationId);
  if (!creative && !boostPostId) {
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
    externalAdGroupId: adGroupId,
    name: input.name,
    creative: {
      aspectRatio: "SQUARE_1_1",
      headline: creative?.headline ?? null,
      primaryText: creative?.primaryText ?? null,
      cta: creative?.cta ?? null,
      imageData: creative?.imageData ?? null,
    },
    boostPostId,
    destination,
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

  // Existing is not the same as working, and the difference decides whether
  // the campaign delivers. A pixel row means MAIRO created one on the ad
  // account; it says nothing about whether the code ever reached a website.
  // PixelStatus spells this out — ACTIVE is documented as "the only good
  // state" — and the tracking page shows "Not seeing anything" for the rest.
  //
  // Optimizing towards an event the network has never once observed is
  // accepted without complaint and then under-delivers indefinitely: Meta
  // hunts for people likely to do a thing it has no examples of. On a small
  // daily budget that is the difference between an ad that serves and an ad
  // that does not, and the customer sees only the second one.
  //
  // So an unfired pixel is treated as no pixel. The campaign asks for traffic,
  // which is honest and which runs. The moment the pixel reports its first
  // event, the next campaign asks for conversions properly.
  if (!canOptimizeTowards(pixel.status)) return null;

  const profile = await db.trackingProfile.findUnique({ where: { organizationId } });
  const niche = nicheById(profile?.nicheId ?? "general");
  const action = primaryAction(niche);

  return {
    pixelId: pixel.externalPixelId,
    event: platform === "TIKTOK" ? action.tiktokEvent : action.metaEvent,
  };
}

/**
 * The post this business wants run as its ads, when it asked for one.
 *
 * Both halves are required and the pair is the point: a business that picked
 * "run one of my posts" but never chose which has nothing to run, and a post id
 * left behind by somebody who has since switched back to MAIRO writing the ads
 * must not quietly keep boosting.
 */
async function boostPostFor(organizationId: string): Promise<string | null> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { salesAdSource: true, boostPostId: true },
  });
  return organization ? postToBoost(organization) : null;
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
  };
}

/**
 * Where this campaign's clicks go.
 *
 * The campaign's own answer, falling back to the business's. Resolved here
 * rather than read off the organization, which is what the launch path used to
 * do — that is how a plumber whose customers want to phone him got an ad
 * pointing at a homepage, and how a business with no website got no ad at all.
 */
async function destinationFor(
  organizationId: string,
  mairoCampaignId: string
): Promise<Destination | null> {
  const [campaign, organization] = await Promise.all([
    db.mairoCampaign.findUnique({
      where: { id: mairoCampaignId },
      select: {
        destinationType: true,
        destinationUrl: true,
        destinationPhone: true,
        messageChannel: true,
        leadFormDelivery: true,
      },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { defaultDestination: true, website: true, phone: true },
    }),
  ]);
  if (!campaign || !organization) return null;

  return resolveDestination(
    {
      type: campaign.destinationType,
      url: campaign.destinationUrl,
      phone: campaign.destinationPhone,
      channel: campaign.messageChannel,
      // Only when the campaign asked for the native form. A business with a
      // form pushed to Meta for one campaign should not have another campaign
      // silently switch to it.
      metaFormId:
        campaign.leadFormDelivery === "META_NATIVE"
          ? ((await db.leadForm.findFirst({
              where: { organizationId, metaFormId: { not: null } },
              select: { metaFormId: true },
            }))?.metaFormId ?? null)
          : null,
    },
    { type: organization.defaultDestination, url: organization.website, phone: organization.phone }
  );
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

/**
 * The Page an ad publishes as, for the networks that have one.
 *
 * The ad already looked this up for itself; the ad set needs it too now that an
 * instant form has to name the Page its form belongs to.
 */
async function pageIdFor(organizationId: string, platform: AdPlatform): Promise<string | null> {
  if (platform !== "META") return null;
  const connection = await db.metaAdAccount.findUnique({
    where: { organizationId },
    select: { pageId: true },
  });
  return connection?.pageId ?? null;
}
