import { db } from "@/lib/db";
import type {
  AdDestination,
  AdGoal,
  AdPlatform,
  CampaignAdKind,
  CampaignAdSource,
  LeadFormDelivery,
  MessageChannel,
  MetaPlacement,
  SpecialAdCategory,
} from "@/generated/prisma/enums";
import { getAdapter, platformName } from "@/lib/ad-platforms/registry";
import { loadCredentials } from "@/lib/ad-platforms/connections";
import { splitBudget, type Allocation } from "@/lib/budget/allocation";
import { nicheById, primaryAction } from "@/lib/tracking/niches";
import { canOptimizeTowards } from "@/lib/tracking/pixels";
import { parseAdCopy } from "@/lib/meta/creative-copy";
import { describeMissing, resolveDestination, type Destination } from "@/lib/campaigns/destination";
import { metaPostToRun, type MetaPostToRun } from "@/lib/campaigns/sales-source";
import {
  metaTargeting,
  normalizeAudience,
  restrictForSpecialCategory,
  type Audience,
} from "@/lib/campaigns/audience";
import { metaPlacementTargeting } from "@/lib/campaigns/placements";
import { fetchImageBytes } from "@/lib/storage/blob";
import { uploadAdVideo, waitForVideo } from "@/lib/meta/videos";
import { creativeOfAccountAd } from "@/lib/meta/existing-ads";
import type { CreateAdInput } from "@/lib/ad-platforms/types";

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
  /**
   * Who should see it.
   *
   * Optional so nothing that creates a campaign another way has to know about
   * it; omitted means the whole country at every age, which is what every
   * campaign got before the form asked.
   */
  audience?: Partial<Audience>;
  /** When delivery stops. Null runs until someone stops it. */
  endAt?: Date | null;
  /** How the Meta ad is made. Null follows the business-wide setting. */
  adSource?: CampaignAdSource | null;
  boostPostId?: string | null;
  boostInstagramMediaId?: string | null;
  /** Where the Meta ad shows. Empty lets Meta choose. */
  placements?: MetaPlacement[];
  specialAdCategory?: SpecialAdCategory | null;
  /** Let Meta widen the audience past the choices (Advantage+ audience). */
  advantageAudience?: boolean;
  /** One total for the whole run instead of a daily amount. Needs endAt. */
  lifetimeBudgetCents?: number | null;
  /** The advertised app's Meta app id; its store link travels as destination.url. */
  metaAppId?: string | null;
  /** What the customer said they're advertising. */
  promotes?: string | null;
  /**
   * The ads this campaign runs, main one first. Omitted or empty follows the
   * business-wide approved creative, as every campaign before this did.
   */
  ads?: CampaignAdInput[];
};

export type CampaignAdInput = {
  kind: CampaignAdKind;
  creativeRequestId?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  videoPosterUrl?: string | null;
  sourceAdId?: string | null;
  sourceAdName?: string | null;
  headline?: string | null;
  primaryText?: string | null;
  callToAction?: string | null;
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
  // Saved already inside Meta's rules for a special category, so what the
  // campaign page shows is what actually runs.
  const audience = normalizeAudience(input.audience ?? {});
  const lifetime = input.lifetimeBudgetCents
    ? splitBudget(
        input.lifetimeBudgetCents,
        input.allocations.map((a) => ({ platform: a.platform, percent: a.percent }))
      )
    : null;

  const campaign = await db.mairoCampaign.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      objective: input.objective,
      totalDailyBudgetCents: input.totalDailyBudgetCents,
      tiktokGrowthMode: input.tiktokGrowthMode ?? false,
      startDate: input.startAt ?? null,
      startTimeZone: input.startTimeZone ?? null,
      endDate: input.endAt ?? null,
      adSource: input.adSource ?? null,
      boostPostId: input.boostPostId ?? null,
      boostInstagramMediaId: input.boostInstagramMediaId ?? null,
      placements: input.placements ?? [],
      specialAdCategory: input.specialAdCategory ?? null,
      // Meta doesn't offer Advantage+ audience on special-category ads.
      advantageAudience: input.specialAdCategory ? false : (input.advantageAudience ?? false),
      budgetType: input.lifetimeBudgetCents ? "LIFETIME" : "DAILY",
      lifetimeBudgetCents: input.lifetimeBudgetCents ?? null,
      metaAppId: input.metaAppId ?? null,
      promotes: input.promotes ?? null,
      destinationType: input.destination?.type ?? "WEBSITE",
      destinationUrl: input.destination?.url ?? null,
      destinationPhone: input.destination?.phone ?? null,
      messageChannel: input.destination?.channel ?? "MESSENGER",
      leadFormDelivery: input.destination?.delivery ?? "HOSTED_PAGE",
      ...(input.specialAdCategory ? restrictForSpecialCategory(audience) : audience),
      status: "DRAFT",
      ads: {
        create: (input.ads ?? []).map((ad, position) => ({ ...ad, position })),
      },
      platformCampaigns: {
        create: input.allocations.map((a) => ({
          platform: a.platform,
          budgetPercent: a.percent,
          dailyBudgetCents: a.dailyBudgetCents,
          lifetimeBudgetCents:
            lifetime?.find((l) => l.platform === a.platform)?.dailyBudgetCents ?? null,
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
        lifetimeBudgetCents: child.lifetimeBudgetCents,
        specialAdCategory: campaign.specialAdCategory,
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
  lifetimeBudgetCents?: number | null;
  specialAdCategory?: SpecialAdCategory | null;
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
    lifetimeBudgetCents: input.lifetimeBudgetCents ?? null,
    specialAdCategory: input.specialAdCategory ?? null,
    activate: input.activate,
    hasConversionTracking: Boolean(conversion),
    conversionEvent: conversion?.event ?? null,
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

  const options = await deliveryOptionsFor(input.mairoCampaignId, input.platformCampaignId);

  // An end date that has already passed is refused by the network, and a
  // campaign that ended before it was built has nothing left to do.
  if (options.endAt && options.endAt.getTime() <= Date.now()) {
    const blocker = "This campaign's end date has passed, so MAIRO didn't finish building it.";
    await db.platformCampaign.update({
      where: { id: input.platformCampaignId },
      data: { lastError: blocker },
    });
    return { stage: input.existingAdGroupId ? "ad_set" : "campaign", blocker };
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
      // Who sees it. Without this every ad set fell back to the whole of the
      // United States at every age, which is the default nobody chose.
      targeting: {
        ...metaTargeting(
          options.specialAdCategory
            ? restrictForSpecialCategory(await audienceFor(input.mairoCampaignId))
            : await audienceFor(input.mairoCampaignId)
        ),
        ...(input.platform === "META" ? metaPlacementTargeting(options.placements) : {}),
      },
      advantageAudience: options.advantageAudience && !options.specialAdCategory,
      // MAIRO's own terms, for networks that don't use Meta's targeting shape.
      audience: options.specialAdCategory
        ? restrictForSpecialCategory(await audienceFor(input.mairoCampaignId))
        : await audienceFor(input.mairoCampaignId),
      lifetimeBudgetCents: options.lifetimeBudgetCents,
      destination: destination ?? undefined,
      pageId: await pageIdFor(input.organizationId, input.platform),
      // The booked start, which becomes the network's own start_time. MAIRO
      // also holds the campaign paused until then, but only while it is
      // running — this is what keeps the schedule when it is not.
      startAt: input.startAt ?? null,
      endAt: options.endAt,
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
  // Only Meta can run one — the post lives on its Page or Instagram — so another
  // network in the same campaign still builds from an approved creative.
  const post: MetaPostToRun =
    input.platform === "META"
      ? await metaPostFor(input.organizationId, options)
      : { facebookPostId: null, instagramMediaId: null };
  const boosting = Boolean(post.facebookPostId || post.instagramMediaId);

  // The campaign's own ads, when the customer chose them in Create.
  if (!boosting) {
    const own = await buildCampaignAds({
      organizationId: input.organizationId,
      platform: input.platform,
      adapter: input.adapter,
      mairoCampaignId: input.mairoCampaignId,
      adGroupId,
      name: input.name,
      destination,
    });
    if (own) {
      await db.platformCampaign.update({
        where: { id: input.platformCampaignId },
        data: own.ok
          ? { externalAdId: own.mainAdId, extraExternalAdIds: own.extraAdIds, lastError: own.note }
          : { lastError: own.blocker },
      });
      return own.ok ? { stage: "ready", blocker: null } : { stage: "ad_set", blocker: own.blocker };
    }
  }

  // The bar for a generated ad: somebody approved a picture. A post that is
  // already published has cleared a higher one — the business wrote it, posted
  // it under its own name, and picked it out of its own feed — so requiring an
  // approved creative as well would block the ad on producing something nothing
  // will ever use.
  const creative = boosting ? null : await approvedCreativeFor(input.organizationId);
  if (!creative && !boosting) {
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
    boostPostId: post.facebookPostId,
    boostInstagramMediaId: post.instagramMediaId,
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

type OwnAdsOutcome =
  | { ok: true; mainAdId: string; extraAdIds: string[]; note: string | null }
  | { ok: false; blocker: string };

/**
 * Builds the ads the customer chose for this campaign, main one first.
 *
 * Null when the campaign has none of its own (it then follows the approved
 * creative, as before), or when none of its ads can run on this network — a
 * video or an existing Meta ad has no TikTok form, so TikTok's half of a
 * two-network campaign falls back the same way.
 *
 * The main ad has to succeed; a test version that fails is reported, not
 * fatal, because the campaign still has an ad to run.
 */
async function buildCampaignAds(input: {
  organizationId: string;
  platform: AdPlatform;
  adapter: NonNullable<ReturnType<typeof getAdapter>>;
  mairoCampaignId: string;
  adGroupId: string;
  name: string;
  destination: Destination;
}): Promise<OwnAdsOutcome | null> {
  const all = await db.campaignAd.findMany({
    where: { mairoCampaignId: input.mairoCampaignId },
    orderBy: { position: "asc" },
  });
  // TikTok runs video only — every version of it, so a test runs there too.
  // A campaign whose ads are all pictures or existing Meta ads can't run on
  // TikTok, and says so rather than building an ad TikTok would refuse.
  const ads = input.platform === "META" ? all : all.filter((a) => a.kind === "VIDEO");
  if (ads.length === 0) {
    if (input.platform === "TIKTOK" && all.length > 0) {
      return { ok: false, blocker: "TikTok ads have to be videos. Upload a video for this campaign to run it on TikTok." };
    }
    return null;
  }
  const business = await db.mairoCampaign.findUnique({
    where: { id: input.mairoCampaignId },
    select: { organization: { select: { name: true } } },
  });

  const creds = input.platform === "META" ? await loadCredentials(input.organizationId, "META") : null;
  const ids: string[] = [];
  const failures: string[] = [];

  for (const [index, ad] of ads.entries()) {
    const name = index === 0 ? input.name : `${input.name} — version ${index + 1}`;
    const built = await adInputFor(input.organizationId, ad, creds, input.platform);
    if (!built.ok) {
      if (index === 0) return { ok: false, blocker: built.blocker };
      failures.push(built.blocker);
      continue;
    }
    const created = await input.adapter.createAd({
      organizationId: input.organizationId,
      externalAdGroupId: input.adGroupId,
      name,
      destination: input.destination,
      displayName: business?.organization.name ?? null,
      ...built.input,
    });
    if (!created.ok) {
      if (index === 0) return { ok: false, blocker: created.error.message };
      failures.push(created.error.message);
      continue;
    }
    ids.push(created.data.externalId);
  }

  return {
    ok: true,
    mainAdId: ids[0],
    extraAdIds: ids.slice(1),
    note: failures.length
      ? `${failures.length} of ${ads.length} ad versions couldn't be built, so the test runs with fewer: ${failures[0]}`
      : null,
  };
}

type CampaignAdRow = Awaited<ReturnType<typeof db.campaignAd.findMany>>[number];

async function adInputFor(
  organizationId: string,
  ad: CampaignAdRow,
  creds: Awaited<ReturnType<typeof loadCredentials>>,
  platform: AdPlatform = "META"
): Promise<
  | { ok: true; input: Pick<CreateAdInput, "creative" | "metaVideoId" | "reuseCreativeId" | "video"> }
  | { ok: false; blocker: string }
> {
  const words = { headline: ad.headline, primaryText: ad.primaryText, cta: ad.callToAction };

  // TikTok fetches the video and its cover itself, by address.
  if (platform === "TIKTOK") {
    if (ad.kind !== "VIDEO" || !ad.videoUrl || !ad.videoPosterUrl) {
      return { ok: false, blocker: "TikTok ads have to be videos. Upload a video for this campaign in Create." };
    }
    return {
      ok: true,
      input: {
        creative: { aspectRatio: "VERTICAL_9_16", ...words },
        video: { url: ad.videoUrl, posterUrl: ad.videoPosterUrl },
      },
    };
  }

  if (ad.kind === "EXISTING_AD") {
    if (!creds || !ad.sourceAdId) return { ok: false, blocker: "Connect Meta to run an existing ad." };
    const creative = await creativeOfAccountAd(creds.externalAccountId, creds.accessToken, ad.sourceAdId);
    if (!creative.ok) return { ok: false, blocker: creative.error };
    return {
      ok: true,
      input: { creative: { aspectRatio: "SQUARE_1_1" }, reuseCreativeId: creative.data },
    };
  }

  if (ad.kind === "VIDEO") {
    if (!creds || !ad.videoUrl || !ad.videoPosterUrl) {
      return { ok: false, blocker: "The video for this ad is missing. Upload it again in Create." };
    }
    let videoId = ad.metaVideoId;
    try {
      if (!videoId) {
        videoId = await uploadAdVideo(creds.externalAccountId, creds.accessToken, ad.videoUrl, `mairo-${ad.id}`);
        // Saved at once, so a retry reuses this upload rather than making another.
        await db.campaignAd.update({ where: { id: ad.id }, data: { metaVideoId: videoId } });
      }
      const state = await waitForVideo(videoId, creds.accessToken);
      if (state === "processing") {
        return {
          ok: false,
          blocker: "Meta is still processing your video. MAIRO finishes the ad by itself as soon as it's ready — usually within a few minutes.",
        };
      }
      if (state === "error") {
        await db.campaignAd.update({ where: { id: ad.id }, data: { metaVideoId: null } });
        return { ok: false, blocker: "Meta couldn't process that video. Try exporting it again as an MP4 and uploading it." };
      }
    } catch (error) {
      console.error("Meta video upload failed:", error);
      return { ok: false, blocker: "MAIRO couldn't send your video to Meta. It will try again shortly." };
    }
    let poster: string;
    try {
      poster = `data:image/jpeg;base64,${(await fetchImageBytes(ad.videoPosterUrl)).toString("base64")}`;
    } catch {
      return { ok: false, blocker: "MAIRO couldn't read your video's thumbnail. Upload the video again in Create." };
    }
    return {
      ok: true,
      input: { creative: { aspectRatio: "SQUARE_1_1", ...words, imageData: poster }, metaVideoId: videoId },
    };
  }

  // IMAGE, their own upload: fetched and sent as it is, with their words.
  if (ad.imageUrl) {
    try {
      const response = await fetch(ad.imageUrl, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(String(response.status));
      const type = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      const imageData = `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
      return { ok: true, input: { creative: { aspectRatio: "SQUARE_1_1", ...words, imageData } } };
    } catch {
      return { ok: false, blocker: "MAIRO couldn't read your picture for this ad. Upload it again in Create." };
    }
  }

  // IMAGE: an approved picture, with the words the customer chose over the
  // ones written when the picture was approved.
  const request = ad.creativeRequestId
    ? await db.creativeRequest.findFirst({
        where: {
          id: ad.creativeRequestId,
          organizationId,
          status: { in: ["APPROVED", "DELIVERED"] },
        },
        include: { images: { where: { isFinal: true }, orderBy: { version: "desc" }, take: 1 } },
      })
    : null;
  const image = request?.images[0];
  if (!request || !image) {
    return { ok: false, blocker: "The picture for this ad isn't approved yet, so the ad hasn't been built." };
  }
  const parsed = parseAdCopy(request.aiConcept);
  return {
    ok: true,
    input: {
      creative: {
        aspectRatio: "SQUARE_1_1",
        headline: words.headline ?? parsed.headline,
        primaryText: words.primaryText ?? parsed.primaryText,
        cta: words.cta ?? parsed.callToAction,
        imageData: image.imageData,
      },
    },
  };
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
 * Who this campaign is for, as the customer answered it.
 *
 * Normalized on the way out as well as on the way in: a row written before the
 * form asked carries the defaults, and a row edited directly in the database
 * carries whatever somebody typed there.
 */
async function audienceFor(mairoCampaignId: string): Promise<Audience> {
  const campaign = await db.mairoCampaign.findUnique({
    where: { id: mairoCampaignId },
    select: {
      geoKey: true,
      geoLabel: true,
      geoRadius: true,
      ageMin: true,
      ageMax: true,
      genders: true,
    },
  });
  return normalizeAudience(campaign ?? {});
}

type DeliveryOptions = {
  endAt: Date | null;
  placements: MetaPlacement[];
  adSource: CampaignAdSource | null;
  boostPostId: string | null;
  boostInstagramMediaId: string | null;
  specialAdCategory: SpecialAdCategory | null;
  advantageAudience: boolean;
  /** This network's share of a total budget, or null for a daily budget. */
  lifetimeBudgetCents: number | null;
};

/** What the customer chose in the Create flow beyond the audience. */
async function deliveryOptionsFor(
  mairoCampaignId: string,
  platformCampaignId: string
): Promise<DeliveryOptions> {
  const [campaign, child] = await Promise.all([
    db.mairoCampaign.findUnique({
      where: { id: mairoCampaignId },
      select: {
        endDate: true,
        placements: true,
        adSource: true,
        boostPostId: true,
        boostInstagramMediaId: true,
        specialAdCategory: true,
        advantageAudience: true,
      },
    }),
    db.platformCampaign.findUnique({
      where: { id: platformCampaignId },
      select: { lifetimeBudgetCents: true },
    }),
  ]);
  return {
    endAt: campaign?.endDate ?? null,
    placements: campaign?.placements ?? [],
    adSource: campaign?.adSource ?? null,
    boostPostId: campaign?.boostPostId ?? null,
    boostInstagramMediaId: campaign?.boostInstagramMediaId ?? null,
    specialAdCategory: campaign?.specialAdCategory ?? null,
    advantageAudience: campaign?.advantageAudience ?? false,
    lifetimeBudgetCents: child?.lifetimeBudgetCents ?? null,
  };
}

/**
 * The post this campaign's Meta ad runs, if any: the campaign's own choice,
 * or the business-wide one when the campaign never answered.
 */
async function metaPostFor(
  organizationId: string,
  options: DeliveryOptions
): Promise<MetaPostToRun> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { salesAdSource: true, boostPostId: true },
  });
  return metaPostToRun(options, organization ?? { salesAdSource: "MAIRO_CREATES", boostPostId: null });
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
        metaAppId: true,
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
      metaAppId: campaign.metaAppId,
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

  // Every move below is a daily amount. Sending one to a total-budget campaign
  // would quietly turn it into a daily one and change what the customer agreed
  // to spend, so these keep the split they launched with.
  const parent = await db.mairoCampaign.findUnique({
    where: { id: input.mairoCampaignId },
    select: { budgetType: true },
  });
  if (parent?.budgetType === "LIFETIME") {
    return {
      applied,
      failed: input.allocations.map((a) => ({
        platform: a.platform,
        error: "This campaign has a total budget, so MAIRO keeps the split it launched with.",
      })),
    };
  }

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
