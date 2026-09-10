import type { AdGoal } from "@/generated/prisma/enums";
import {
  EMPTY_METRICS,
  fail,
  ok,
  type AdPlatformAdapter,
  type CampaignPerformance,
  type ConnectAccountInput,
  type ConnectedAccount,
  type CreateAdGroupInput,
  type CreateAdInput,
  type CreateCampaignInput,
  type CreatedCampaign,
  type CreatedEntity,
  type CreativePerformance,
  type DateRange,
  type PlatformAccount,
  type PlatformMetrics,
  type PlatformResult,
} from "../types";
import {
  loadCredentials,
  markConnectionProblem,
  saveConnection,
} from "../connections";
import { TikTokApiError, tiktokConfigured, tiktokRequest } from "./client";
import {
  exchangeCodeForToken,
  explainTikTokError,
  fetchAdvertisers,
  grantedScopes,
} from "./oauth";

// TikTok's half of the AdPlatform interface.
//
// Everything in here talks to the real TikTok Business API. There is no mock
// path and no "pretend it worked" branch: when TikTok is not configured on the
// deployment, or the customer has not connected an account, these methods
// return a not_connected failure that says so. A campaign that did not reach
// TikTok is never recorded as if it had — the whole product rests on the
// dashboard being true, and a fake success is the one bug that would make
// every number on it a lie.

/**
 * MAIRO's goals mapped onto TikTok's objectives.
 *
 * TikTok's vocabulary is close to Meta's but not the same, and the differences
 * matter. There is no direct equivalent of an app-promotion outcome that also
 * works for web advertisers, so APP_PROMOTION maps to TikTok's app objective
 * and will fail for an advertiser with no app registered — which is the honest
 * outcome, rather than quietly running a traffic campaign instead.
 */
const OBJECTIVE_MAP: Record<AdGoal, string> = {
  LEADS: "LEAD_GENERATION",
  SALES: "CONVERSIONS",
  AWARENESS: "REACH",
  TRAFFIC: "TRAFFIC",
  APP_PROMOTION: "APP_PROMOTION",
};

export function tiktokObjectiveFor(goal: AdGoal): string {
  return OBJECTIVE_MAP[goal];
}

/**
 * TikTok quotes money in whole currency units as a string, MAIRO holds cents.
 *
 * Both directions are here rather than inline because getting one of them
 * wrong is a hundredfold budget error, and a hundredfold budget error is
 * somebody's month of ad spend gone in an afternoon.
 */
function centsToUnits(cents: number): string {
  return (cents / 100).toFixed(2);
}

function unitsToCents(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function num(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** TikTok reports rates as percentages; MAIRO holds fractions. */
function percentToFraction(value: string | number | undefined | null): number | null {
  const n = num(value);
  return n === null ? null : n / 100;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Turns anything thrown by the transport into a typed failure.
 *
 * The auth cases also write the problem onto the connection, so the settings
 * screen can say "reconnect TikTok" rather than every dashboard just showing
 * nothing with no explanation of why.
 */
async function toFailure<T>(
  organizationId: string,
  error: unknown,
  fallback: string
): Promise<PlatformResult<T>> {
  if (error instanceof TikTokApiError) {
    if (error.isAuthProblem) {
      await markConnectionProblem(
        organizationId,
        "TIKTOK",
        "TOKEN_EXPIRED",
        "TikTok's permission for MAIRO has expired or been revoked. Reconnect to keep campaigns running."
      );
      return fail(
        "not_connected",
        "TikTok's permission for MAIRO has expired or been revoked. Reconnect TikTok in Settings.",
        error.body
      );
    }
    if (error.isScopeProblem) {
      return fail(
        "insufficient_scope",
        "This TikTok account didn't grant MAIRO permission for that. Reconnect TikTok and approve every permission it asks for.",
        error.body
      );
    }
    if (error.isTransient) {
      return fail("unavailable", "TikTok didn't respond. Nothing was changed — try again shortly.", error.body);
    }
    return fail("rejected", `TikTok rejected this: ${error.message}`, error.body);
  }
  return fail("unavailable", fallback, error);
}

/** Loads credentials, or the reason there are none. */
async function credentialsOr<T>(
  organizationId: string
): Promise<{ ok: true; creds: NonNullable<Awaited<ReturnType<typeof loadCredentials>>> } | { ok: false; result: PlatformResult<T> }> {
  if (!tiktokConfigured()) {
    return {
      ok: false,
      result: fail(
        "not_implemented",
        "TikTok isn't configured on this deployment yet. Add TIKTOK_APP_ID and TIKTOK_APP_SECRET to enable it."
      ),
    };
  }
  const creds = await loadCredentials(organizationId, "TIKTOK");
  if (!creds) {
    return {
      ok: false,
      result: fail("not_connected", "No TikTok account is connected. Connect one in Settings."),
    };
  }
  if (creds.status !== "CONNECTED") {
    return {
      ok: false,
      result: fail("not_connected", "The TikTok connection needs attention. Reconnect it in Settings."),
    };
  }
  return { ok: true, creds };
}

export const tiktokAdapter: AdPlatformAdapter = {
  platform: "TIKTOK",

  async connectAccount(input: ConnectAccountInput): Promise<PlatformResult<ConnectedAccount>> {
    if (!tiktokConfigured()) {
      return fail(
        "not_implemented",
        "TikTok isn't configured on this deployment yet. Add TIKTOK_APP_ID and TIKTOK_APP_SECRET to enable it."
      );
    }

    try {
      const token = await exchangeCodeForToken(input.code);
      const advertiserIds = token.advertiser_ids ?? [];

      if (advertiserIds.length === 0) {
        return fail(
          "rejected",
          "That TikTok login has no advertiser account attached. Create one in TikTok Ads Manager first, then connect again."
        );
      }

      const accounts = await fetchAdvertisers(token.access_token, advertiserIds);
      // Prefer an account that can actually run ads — TikTok will happily
      // authorize one that is suspended or still in review.
      const chosen = accounts.find((a) => a.usable !== false) ?? accounts[0];

      await saveConnection({
        organizationId: input.organizationId,
        platform: "TIKTOK",
        externalAccountId: chosen.id,
        externalAccountName: chosen.name,
        externalBusinessId: chosen.businessId ?? null,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : null,
        refreshExpiresAt: token.refresh_token_expires_in
          ? new Date(Date.now() + token.refresh_token_expires_in * 1000)
          : null,
        scopes: grantedScopes(token),
      });

      return ok({ account: chosen, scopes: grantedScopes(token) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect TikTok.";
      return fail("rejected", explainTikTokError(message), error);
    }
  },

  async getAccounts(organizationId: string): Promise<PlatformResult<PlatformAccount[]>> {
    const loaded = await credentialsOr<PlatformAccount[]>(organizationId);
    if (!loaded.ok) return loaded.result;

    try {
      const accounts = await fetchAdvertisers(loaded.creds.accessToken, [
        loaded.creds.externalAccountId,
      ]);
      return ok(accounts);
    } catch (error) {
      return toFailure(organizationId, error, "Couldn't read your TikTok advertiser account.");
    }
  },

  async createCampaign(input: CreateCampaignInput): Promise<PlatformResult<CreatedCampaign>> {
    const loaded = await credentialsOr<CreatedCampaign>(input.organizationId);
    if (!loaded.ok) return loaded.result;

    try {
      const res = await tiktokRequest<{ campaign_id: string }>("/campaign/create/", {
        method: "POST",
        accessToken: loaded.creds.accessToken,
        body: {
          advertiser_id: loaded.creds.externalAccountId,
          campaign_name: input.name,
          objective_type: tiktokObjectiveFor(input.goal),
          budget_mode: "BUDGET_MODE_DAY",
          budget: centsToUnits(input.dailyBudgetCents),
          // Paused unless explicitly told otherwise. A campaign with no ad
          // group under it cannot spend anyway, but defaulting to live is how
          // money gets spent by accident.
          operation_status: input.activate ? "ENABLE" : "DISABLE",
        },
      });

      return ok({
        externalId: res.campaign_id,
        status: input.activate ? "ACTIVE" : "PAUSED",
      });
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't create the campaign on TikTok.");
    }
  },

  async createAdGroup(input: CreateAdGroupInput): Promise<PlatformResult<CreatedEntity>> {
    const loaded = await credentialsOr<CreatedEntity>(input.organizationId);
    if (!loaded.ok) return loaded.result;

    try {
      const res = await tiktokRequest<{ adgroup_id: string }>("/adgroup/create/", {
        method: "POST",
        accessToken: loaded.creds.accessToken,
        body: {
          advertiser_id: loaded.creds.externalAccountId,
          campaign_id: input.externalCampaignId,
          adgroup_name: input.name,
          budget_mode: "BUDGET_MODE_DAY",
          budget: centsToUnits(input.dailyBudgetCents),
          placement_type: "PLACEMENT_TYPE_NORMAL",
          placements: ["PLACEMENT_TIKTOK"],
          operation_status: "DISABLE",
          ...(input.targeting ?? {}),
        },
      });
      return ok({ externalId: res.adgroup_id });
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't create the ad group on TikTok.");
    }
  },

  async createAd(input: CreateAdInput): Promise<PlatformResult<CreatedEntity>> {
    const loaded = await credentialsOr<CreatedEntity>(input.organizationId);
    if (!loaded.ok) return loaded.result;

    // TikTok will not create an ad without a video already uploaded to its own
    // media library — there is no "here is a URL, fetch it" form. Uploading is
    // a separate multi-step flow (upload, poll for processing, then reference
    // the returned video_id) and MAIRO has no video pipeline yet, so this
    // reports honestly instead of posting an ad that cannot render.
    if (!input.creative.mediaUrl) {
      return fail(
        "rejected",
        "A TikTok ad needs a video. Add one to this creative before publishing it."
      );
    }

    return fail(
      "not_implemented",
      "Publishing finished videos to TikTok isn't switched on yet. The campaign and ad group are live; " +
        "the video has to be uploaded in TikTok Ads Manager for now."
    );
  },

  async updateBudget(input): Promise<PlatformResult<void>> {
    const loaded = await credentialsOr<void>(input.organizationId);
    if (!loaded.ok) return loaded.result;

    try {
      await tiktokRequest("/campaign/update/", {
        method: "POST",
        accessToken: loaded.creds.accessToken,
        body: {
          advertiser_id: loaded.creds.externalAccountId,
          campaign_id: input.externalCampaignId,
          budget: centsToUnits(input.dailyBudgetCents),
        },
      });
      return ok(undefined);
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't change the budget on TikTok.");
    }
  },

  async pauseCampaign(input): Promise<PlatformResult<void>> {
    return setStatus(input.organizationId, input.externalCampaignId, "DISABLE");
  },

  async resumeCampaign(input): Promise<PlatformResult<void>> {
    return setStatus(input.organizationId, input.externalCampaignId, "ENABLE");
  },

  async getCampaignPerformance(input): Promise<PlatformResult<CampaignPerformance[]>> {
    const loaded = await credentialsOr<CampaignPerformance[]>(input.organizationId);
    if (!loaded.ok) return loaded.result;
    if (input.externalCampaignIds.length === 0) return ok([]);

    try {
      const rows = await fetchReport(
        loaded.creds.accessToken,
        loaded.creds.externalAccountId,
        "campaign_id",
        input.externalCampaignIds,
        input.range
      );
      return ok(
        rows.map((row) => ({
          externalCampaignId: String(row.id),
          metrics: row.metrics,
        }))
      );
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't read TikTok performance.");
    }
  },

  async getCreativePerformance(input): Promise<PlatformResult<CreativePerformance[]>> {
    const loaded = await credentialsOr<CreativePerformance[]>(input.organizationId);
    if (!loaded.ok) return loaded.result;

    try {
      const rows = await fetchReport(
        loaded.creds.accessToken,
        loaded.creds.externalAccountId,
        "ad_id",
        [],
        input.range,
        input.externalCampaignId
      );
      return ok(rows.map((row) => ({ externalAdId: String(row.id), metrics: row.metrics })));
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't read TikTok creative performance.");
    }
  },
};

async function setStatus(
  organizationId: string,
  externalCampaignId: string,
  operation: "ENABLE" | "DISABLE"
): Promise<PlatformResult<void>> {
  const loaded = await credentialsOr<void>(organizationId);
  if (!loaded.ok) return loaded.result;

  try {
    await tiktokRequest("/campaign/status/update/", {
      method: "POST",
      accessToken: loaded.creds.accessToken,
      body: {
        advertiser_id: loaded.creds.externalAccountId,
        campaign_ids: [externalCampaignId],
        operation_status: operation,
      },
    });
    return ok(undefined);
  } catch (error) {
    return toFailure(organizationId, error, "Couldn't change the campaign status on TikTok.");
  }
}

type ReportDimension = "campaign_id" | "ad_id";

type ReportRow = { id: string; metrics: PlatformMetrics };

/**
 * TikTok's synchronous reporting endpoint, normalized into MAIRO's metrics.
 *
 * The metric names asked for here are the union of what the analytics screen
 * shows. Asking for a metric the advertiser's objective doesn't produce is not
 * an error on TikTok's side — it comes back absent — which is why every field
 * goes through `num`/`unitsToCents` and lands as null rather than zero.
 */
async function fetchReport(
  accessToken: string,
  advertiserId: string,
  dimension: ReportDimension,
  ids: string[],
  range?: DateRange,
  filterCampaignId?: string
): Promise<ReportRow[]> {
  const filtering: Record<string, unknown>[] = [];
  if (ids.length > 0) {
    filtering.push({ field_name: dimension, filter_type: "IN", filter_value: JSON.stringify(ids) });
  }
  if (filterCampaignId) {
    filtering.push({
      field_name: "campaign_ids",
      filter_type: "IN",
      filter_value: JSON.stringify([filterCampaignId]),
    });
  }

  const res = await tiktokRequest<{ list?: TikTokReportRow[] }>("/report/integrated/get/", {
    accessToken,
    params: {
      advertiser_id: advertiserId,
      report_type: "BASIC",
      data_level: dimension === "campaign_id" ? "AUCTION_CAMPAIGN" : "AUCTION_AD",
      dimensions: JSON.stringify([dimension]),
      metrics: JSON.stringify([
        "spend",
        "impressions",
        "reach",
        "clicks",
        "ctr",
        "cpc",
        "cpm",
        "conversion",
        "cost_per_conversion",
        "complete_payment",
        "complete_payment_roas",
        "total_complete_payment_rate",
        "video_play_actions",
        "video_watched_2s",
        "video_watched_6s",
        "average_video_play",
        "video_views_p100",
        "profile_visits",
        "follows",
        "likes",
        "comments",
        "shares",
      ]),
      ...(range
        ? { start_date: ymd(range.since), end_date: ymd(range.until) }
        : { lifetime: "true" }),
      ...(filtering.length > 0 ? { filtering: JSON.stringify(filtering) } : {}),
      page_size: 1000,
    },
  });

  return (res.list ?? []).map((row) => {
    const m = row.metrics ?? {};
    const spendCents = unitsToCents(m.spend);
    const purchases = num(m.complete_payment);
    const roas = num(m.complete_payment_roas);

    return {
      id: String(row.dimensions?.[dimension] ?? ""),
      metrics: {
        ...EMPTY_METRICS,
        spendCents,
        impressions: num(m.impressions),
        reach: num(m.reach),
        clicks: num(m.clicks),
        ctr: percentToFraction(m.ctr),
        cpcCents: unitsToCents(m.cpc),
        cpmCents: unitsToCents(m.cpm),
        conversions: num(m.conversion),
        purchases,
        costPerPurchaseCents:
          purchases && purchases > 0 && spendCents !== null
            ? Math.round(spendCents / purchases)
            : unitsToCents(m.cost_per_conversion),
        // TikTok reports ROAS directly and revenue not at all, so revenue is
        // derived. Only when both parts are known — deriving it from a null
        // would produce a confident zero out of two unknowns.
        revenueCents: roas !== null && spendCents !== null ? Math.round(spendCents * roas) : null,
        roas,
        videoViews: num(m.video_play_actions),
        videoViews2s: num(m.video_watched_2s),
        videoViews6s: num(m.video_watched_6s),
        averageWatchTimeSeconds: num(m.average_video_play),
        videoCompletionRate: percentToFraction(m.video_views_p100),
        profileVisits: num(m.profile_visits),
        followersGained: num(m.follows),
        likes: num(m.likes),
        comments: num(m.comments),
        shares: num(m.shares),
      },
    };
  });
}

type TikTokReportRow = {
  dimensions?: Record<string, string>;
  metrics?: Record<string, string | number | undefined>;
};
