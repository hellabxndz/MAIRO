import type { AdGoal, AdPlatform, CreativeAspect } from "@/generated/prisma/enums";

// The one interface every advertising network is reached through.
//
// The point of this file is that nothing above it knows what a network is. A
// campaign is created, a budget is changed, performance is read — and whether
// that meant a Graph API call to Meta or a POST to TikTok's business endpoint
// is the adapter's business and nobody else's. Adding Google later is a new
// folder implementing this and a new entry in the registry; no call site above
// changes.
//
// Two decisions here are worth explaining, because both were tempting to skip.
//
// Nothing returns a raw network response. Every method returns MAIRO's own
// shape, so Meta's `spend: "24.31"` string-dollars and TikTok's integer cents
// both arrive as cents, and a caller cannot accidentally grow a dependency on
// one network's field names.
//
// Nothing throws for an ordinary failure. A revoked token, a rejected budget,
// a network having a bad afternoon — these are all normal and all end up on a
// customer's dashboard, so they are returned as values. `PlatformResult` makes
// the failure case impossible to forget, which a thrown exception does not.

/** A network call that is expected to fail sometimes. */
export type PlatformResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PlatformError };

export type PlatformErrorKind =
  /** No connection, or the token has expired or been revoked. Reconnect. */
  | "not_connected"
  /** Connected, but the granted scopes don't cover this call. */
  | "insufficient_scope"
  /** The network refused the request itself — bad budget, policy, etc. */
  | "rejected"
  /** Timeout, 5xx, or anything else worth retrying. */
  | "unavailable"
  /** MAIRO hasn't finished this platform yet. */
  | "not_implemented";

export type PlatformError = {
  kind: PlatformErrorKind;
  /** Safe to show a business owner. Names the fix where there is one. */
  message: string;
  /** The network's own response, for logs. Never rendered. */
  detail?: unknown;
};

export function ok<T>(data: T): PlatformResult<T> {
  return { ok: true, data };
}

export function fail<T>(
  kind: PlatformErrorKind,
  message: string,
  detail?: unknown
): PlatformResult<T> {
  return { ok: false, error: { kind, message, detail } };
}

// --- account connection ----------------------------------------------------

/** An advertising account the connected login can spend from. */
export type PlatformAccount = {
  /** The network's own id. advertiser_id on TikTok, act_xxx on Meta. */
  id: string;
  name: string;
  /** Business/portfolio the account sits under, where the network has one. */
  businessId?: string | null;
  currency?: string | null;
  /** False when the network says the account can't currently run ads. */
  usable?: boolean;
};

export type ConnectAccountInput = {
  organizationId: string;
  /** The authorization code from the network's OAuth redirect. */
  code: string;
  redirectUri: string;
};

export type ConnectedAccount = {
  account: PlatformAccount;
  scopes: string[];
};

// --- campaigns -------------------------------------------------------------

export type PlatformCampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

export type CreateCampaignInput = {
  organizationId: string;
  name: string;
  goal: AdGoal;
  dailyBudgetCents: number;
  /**
   * Campaigns are created paused unless told otherwise, on every network.
   * A campaign with no ad group and no creative under it cannot spend, but
   * "created it live by default" is the kind of default that eventually
   * spends someone's money by accident.
   */
  activate?: boolean;
};

export type CreatedCampaign = {
  /** The network's campaign id. */
  externalId: string;
  status: PlatformCampaignStatus;
};

export type CreateAdGroupInput = {
  organizationId: string;
  externalCampaignId: string;
  name: string;
  dailyBudgetCents: number;
  goal: AdGoal;
  /** Free-form targeting, interpreted per network. */
  targeting?: Record<string, unknown>;
  /**
   * True when the campaign above already carries the budget.
   *
   * Not a detail. MAIRO sets the budget on the campaign, and Meta rejects an
   * ad set that also carries one — "you can't set a budget at the ad set level
   * when campaign budget optimization is on". An adapter that sends both fails
   * every launch, so the caller says which level owns it and the adapter obeys.
   */
  campaignOwnsBudget?: boolean;
  /**
   * The conversion to optimize towards, when the business has a pixel.
   *
   * Absent means there is nothing to optimize for yet, and the adapter falls
   * back to something the network can actually deliver — rather than asking
   * for purchase optimization on an account that has never reported a
   * purchase, which Meta accepts and then under-delivers indefinitely.
   */
  conversion?: {
    pixelId: string;
    /** The network's own event name, e.g. Meta's "Purchase". */
    event: string;
  } | null;
  /**
   * When the customer wants delivery to begin, as an absolute instant.
   *
   * Absent means "as soon as the network approves it", which is the default.
   * A date here is a floor rather than a promise — ad review is asynchronous
   * and nothing delivers before it passes, so the real start is the later of
   * this and the approval.
   *
   * Adapters must send this to the network rather than relying on MAIRO to
   * hold the campaign paused until the time arrives. MAIRO does that too, but
   * it only acts while it is running; the network's own schedule keeps working
   * when MAIRO is not.
   */
  startAt?: Date | null;
};

export type CreateAdInput = {
  organizationId: string;
  externalAdGroupId: string;
  name: string;
  creative: {
    aspectRatio: CreativeAspect;
    hook?: string | null;
    primaryText?: string | null;
    headline?: string | null;
    cta?: string | null;
    /** An https URL, for networks that fetch the asset themselves. */
    mediaUrl?: string | null;
    /** The picture itself, as a data URL, for networks that want the bytes. */
    imageData?: string | null;
  };
  /** Where the ad sends people. Meta will not build a link ad without it. */
  destinationUrl?: string | null;
};

export type CreatedEntity = { externalId: string };

// --- performance -----------------------------------------------------------

/**
 * The figures every network can answer for, in MAIRO's units.
 *
 * Money is always integer cents. Rates are always fractions, not percentages,
 * so 0.0134 is a 1.34% click-through rate — networks disagree about which they
 * return and converting at the edge means the rest of the app never has to ask.
 *
 * Every field is nullable and that is load-bearing. A campaign that has never
 * been switched on has no impressions because nothing ran; reporting that as
 * zero reads as failure when the truth is "this hasn't started". Null means
 * not known, zero means measured and it was zero.
 */
export type PlatformMetrics = {
  spendCents: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  cpcCents: number | null;
  cpmCents: number | null;
  conversions: number | null;
  purchases: number | null;
  costPerPurchaseCents: number | null;
  revenueCents: number | null;
  roas: number | null;

  /**
   * Video and profile figures.
   *
   * Meta returns none of these and never will for most of them, so they stay
   * null there rather than being faked as zero. They are on the shared type
   * rather than a TikTok-only extension because the analytics screen renders
   * one table across platforms, and an optional field it can skip is simpler
   * than a union it has to narrow.
   */
  videoViews: number | null;
  videoViews2s: number | null;
  videoViews6s: number | null;
  averageWatchTimeSeconds: number | null;
  videoCompletionRate: number | null;
  profileVisits: number | null;
  followersGained: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};

export const EMPTY_METRICS: PlatformMetrics = {
  spendCents: null,
  impressions: null,
  reach: null,
  clicks: null,
  ctr: null,
  cpcCents: null,
  cpmCents: null,
  conversions: null,
  purchases: null,
  costPerPurchaseCents: null,
  revenueCents: null,
  roas: null,
  videoViews: null,
  videoViews2s: null,
  videoViews6s: null,
  averageWatchTimeSeconds: null,
  videoCompletionRate: null,
  profileVisits: null,
  followersGained: null,
  likes: null,
  comments: null,
  shares: null,
};

export type DateRange = { since: Date; until: Date };

export type CampaignPerformance = {
  externalCampaignId: string;
  metrics: PlatformMetrics;
};

export type CreativePerformance = {
  externalAdId: string;
  metrics: PlatformMetrics;
};

// --- the interface ---------------------------------------------------------

export interface AdPlatformAdapter {
  readonly platform: AdPlatform;

  /**
   * Finishes an OAuth handshake and stores the resulting credentials.
   *
   * Takes an authorization code, never a username and password. No network
   * here is given a customer's login and none ever should be — MAIRO holds
   * revocable, scoped tokens or it holds nothing.
   */
  connectAccount(input: ConnectAccountInput): Promise<PlatformResult<ConnectedAccount>>;

  /** The advertising accounts the stored connection can spend from. */
  getAccounts(organizationId: string): Promise<PlatformResult<PlatformAccount[]>>;

  createCampaign(input: CreateCampaignInput): Promise<PlatformResult<CreatedCampaign>>;
  /**
   * Which level of the hierarchy carries the budget on this network.
   *
   * Not cosmetic. Meta refuses an ad set budget when the campaign has one;
   * TikTok expects the ad group to carry it unless campaign optimization is
   * explicitly turned on. Getting it wrong fails every launch, so the adapter
   * states it and the launcher obeys rather than each guessing about the other.
   */
  readonly budgetLevel: "campaign" | "adgroup";

  createAdGroup(input: CreateAdGroupInput): Promise<PlatformResult<CreatedEntity>>;
  createAd(input: CreateAdInput): Promise<PlatformResult<CreatedEntity>>;

  /**
   * Moves the start time of an ad group that already exists.
   *
   * Separate from createAdGroup because a customer who books a launch for
   * Friday and then changes their mind on Wednesday must not have a second
   * campaign built for them. Passing null clears the schedule, which means
   * "start as soon as it is approved".
   *
   * Networks generally refuse to move the start of something already
   * delivering, so this is only called on a campaign that has not begun.
   */
  updateSchedule(input: {
    organizationId: string;
    externalAdGroupId: string;
    startAt: Date | null;
  }): Promise<PlatformResult<void>>;

  updateBudget(input: {
    organizationId: string;
    externalCampaignId: string;
    dailyBudgetCents: number;
  }): Promise<PlatformResult<void>>;

  pauseCampaign(input: {
    organizationId: string;
    externalCampaignId: string;
  }): Promise<PlatformResult<void>>;

  resumeCampaign(input: {
    organizationId: string;
    externalCampaignId: string;
  }): Promise<PlatformResult<void>>;

  getCampaignPerformance(input: {
    organizationId: string;
    externalCampaignIds: string[];
    range?: DateRange;
  }): Promise<PlatformResult<CampaignPerformance[]>>;

  getCreativePerformance(input: {
    organizationId: string;
    externalCampaignId: string;
    range?: DateRange;
  }): Promise<PlatformResult<CreativePerformance[]>>;
}
