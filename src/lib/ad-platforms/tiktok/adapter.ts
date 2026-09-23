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
  fetchAdvertiserTimeZone,
  grantedScopes,
} from "./oauth";
import {
  tiktokAdText,
  tiktokAgeGroups,
  tiktokCta,
  tiktokDelivery,
  tiktokGender,
  US_LOCATION_ID,
} from "./delivery";
import { ensureIdentity, findTikTokCity, uploadImageByUrl, uploadVideoByUrl, waitForTikTokVideo } from "./media";
import { isSchedulable, wallClockInZone } from "@/lib/campaigns/schedule";

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
 * The objective TikTok is told, from the goal and whether there's a working
 * pixel event to optimise for — see tiktokDelivery in ./delivery.
 */
export function tiktokObjectiveFor(goal: AdGoal, conversionEvent?: string | null): string {
  return tiktokDelivery(goal, conversionEvent ? { event: conversionEvent } : null).objective;
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
  // TikTok expects the ad group to carry the budget unless campaign budget
  // optimization is switched on, which MAIRO does not do.
  budgetLevel: "adgroup",

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
          objective_type: tiktokObjectiveFor(input.goal, input.hasConversionTracking ? input.conversionEvent : null),
          ...(input.lifetimeBudgetCents
            ? { budget_mode: "BUDGET_MODE_TOTAL", budget: centsToUnits(input.lifetimeBudgetCents) }
            : { budget_mode: "BUDGET_MODE_DAY", budget: centsToUnits(input.dailyBudgetCents) }),
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

    // TikTok ads send people to a website; there's no call or message
    // destination here. Refused plainly rather than as a TikTok error.
    if (input.destination && input.destination.type !== "WEBSITE") {
      return fail("rejected", "TikTok ads send people to a website. Choose a website as the destination for this campaign.");
    }

    const delivery = tiktokDelivery(input.goal, input.conversion ?? null);
    const audience = input.audience ?? null;
    const a = { accessToken: loaded.creds.accessToken, advertiserId: loaded.creds.externalAccountId };

    try {
      // A chosen town when TikTok knows it; otherwise the whole US. TikTok
      // has no radius targeting, so the town itself is the area.
      const city = audience?.geoLabel ? await findTikTokCity(a, audience.geoLabel, delivery.objective) : null;
      const ages = audience ? tiktokAgeGroups(audience.ageMin, audience.ageMax) : [];

      const res = await tiktokRequest<{ adgroup_id: string }>("/adgroup/create/", {
        method: "POST",
        accessToken: loaded.creds.accessToken,
        body: {
          advertiser_id: a.advertiserId,
          campaign_id: input.externalCampaignId,
          adgroup_name: input.name,
          // A total budget runs to a fixed end, which tiktokSchedule turns
          // into SCHEDULE_START_END — TikTok requires that pairing.
          ...(input.lifetimeBudgetCents
            ? { budget_mode: "BUDGET_MODE_TOTAL", budget: centsToUnits(input.lifetimeBudgetCents) }
            : { budget_mode: "BUDGET_MODE_DAY", budget: centsToUnits(input.dailyBudgetCents) }),
          ...(delivery.objective === "REACH" ? {} : { promotion_type: "WEBSITE" }),
          placement_type: "PLACEMENT_TYPE_NORMAL",
          placements: ["PLACEMENT_TIKTOK"],
          location_ids: [city ?? US_LOCATION_ID],
          ...(ages.length ? { age_groups: ages } : {}),
          gender: tiktokGender(audience?.genders ?? 0),
          optimization_goal: delivery.optimizationGoal,
          billing_event: delivery.billingEvent,
          bid_type: "BID_TYPE_NO_BID",
          pacing: "PACING_MODE_SMOOTH",
          ...(delivery.optimizationGoal === "CONVERT" && input.conversion
            ? { pixel_id: input.conversion.pixelId, optimization_event: delivery.optimizationEvent }
            : {}),
          operation_status: "DISABLE",
          ...(await tiktokSchedule(a.accessToken, a.advertiserId, input.startAt, input.endAt)),
        },
      });
      return ok({ externalId: res.adgroup_id });
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't create the ad group on TikTok.");
    }
  },

  /**
   * Builds a video ad: the video and its cover go into the advertiser's
   * library (TikTok fetches both by URL), the ad appears under the business's
   * own name, and it links to the campaign's website. The ad group above it
   * is created switched off, so nothing delivers until it's switched on.
   */
  async createAd(input: CreateAdInput): Promise<PlatformResult<CreatedEntity>> {
    const loaded = await credentialsOr<CreatedEntity>(input.organizationId);
    if (!loaded.ok) return loaded.result;

    if (!input.video?.url || !input.video.posterUrl) {
      return fail("rejected", "TikTok ads have to be videos. Upload a video for this campaign in Create.");
    }
    if (input.destination.type !== "WEBSITE") {
      return fail("rejected", "TikTok ads send people to a website. Choose a website as the destination for this campaign.");
    }
    const text = tiktokAdText(input.creative.primaryText ?? input.creative.headline ?? "");
    if (!text) return fail("rejected", "This ad has no text for TikTok. Add the words in Create.");

    const a = { accessToken: loaded.creds.accessToken, advertiserId: loaded.creds.externalAccountId };
    try {
      const identityId = await ensureIdentity(input.organizationId, a, input.displayName ?? input.name);
      const videoId = await uploadVideoByUrl(a, input.video.url, input.name);
      const ready = await waitForTikTokVideo(a, videoId);
      if (!ready) {
        return fail(
          "unavailable",
          "TikTok is still processing your video. MAIRO finishes the ad by itself as soon as it's ready — usually within a few minutes."
        );
      }
      const coverId = await uploadImageByUrl(a, input.video.posterUrl, `${input.name}-cover`);

      const res = await tiktokRequest<{ ad_ids?: string[] }>("/ad/create/", {
        method: "POST",
        accessToken: a.accessToken,
        body: {
          advertiser_id: a.advertiserId,
          adgroup_id: input.externalAdGroupId,
          creatives: [
            {
              ad_name: input.name.slice(0, 100),
              identity_type: "CUSTOMIZED_USER",
              identity_id: identityId,
              ad_format: "SINGLE_VIDEO",
              video_id: videoId,
              image_ids: [coverId],
              ad_text: text,
              call_to_action: tiktokCta(input.creative.cta),
              landing_page_url: input.destination.url,
            },
          ],
        },
      });
      const adId = res.ad_ids?.[0];
      if (!adId) return fail("rejected", "TikTok accepted the ad but returned no ad id.");
      return ok({ externalId: adId });
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't build the ad on TikTok.");
    }
  },

  /**
   * Moves an ad group's start time after it has been created.
   *
   * Clearing the schedule means switching back to SCHEDULE_FROM_NOW with no
   * start, which is TikTok's way of saying "run once it is approved".
   */
  async updateSchedule(input): Promise<PlatformResult<void>> {
    const loaded = await credentialsOr<void>(input.organizationId);
    if (!loaded.ok) return loaded.result;

    try {
      const schedule = await tiktokSchedule(
        loaded.creds.accessToken,
        loaded.creds.externalAccountId,
        input.startAt,
        input.endAt
      );
      await tiktokRequest("/adgroup/update/", {
        method: "POST",
        accessToken: loaded.creds.accessToken,
        body: {
          advertiser_id: loaded.creds.externalAccountId,
          adgroup_id: input.externalAdGroupId,
          schedule_type: "SCHEDULE_FROM_NOW",
          ...schedule,
        },
      });
      return ok(undefined);
    } catch (error) {
      return toFailure(
        input.organizationId,
        error,
        "Couldn't move the start time on TikTok."
      );
    }
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
    return setStatus(input.organizationId, "campaign", input.externalCampaignId, "DISABLE");
  },

  async resumeCampaign(input): Promise<PlatformResult<void>> {
    // The ad group is built DISABLE and has to be switched on too; ads are
    // created enabled. Campaign last, so a failure leaves nothing running.
    if (input.externalAdGroupId) {
      const result = await setStatus(input.organizationId, "adgroup", input.externalAdGroupId, "ENABLE");
      if (!result.ok) return result;
    }
    return setStatus(input.organizationId, "campaign", input.externalCampaignId, "ENABLE");
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
  level: "campaign" | "adgroup",
  externalId: string,
  operation: "ENABLE" | "DISABLE"
): Promise<PlatformResult<void>> {
  const loaded = await credentialsOr<void>(organizationId);
  if (!loaded.ok) return loaded.result;

  try {
    await tiktokRequest(`/${level}/status/update/`, {
      method: "POST",
      accessToken: loaded.creds.accessToken,
      body: {
        advertiser_id: loaded.creds.externalAccountId,
        [`${level}_ids`]: [externalId],
        operation_status: operation,
      },
    });
    return ok(undefined);
  } catch (error) {
    return toFailure(
      organizationId,
      error,
      `Couldn't change the ${level === "adgroup" ? "ad group" : "campaign"} status on TikTok.`
    );
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


/**
 * The schedule fields for an ad group, or nothing.
 *
 * TikTok wants a bare "YYYY-MM-DD HH:MM:SS" read in the advertiser account's
 * own timezone — unlike Meta, which takes an offset and converts. So the zone
 * has to be looked up, and if it cannot be, no schedule is sent at all.
 *
 * That refusal is the important part. A start time written in the wrong zone
 * is a campaign that begins up to a day away from what the customer asked for,
 * and they would have no way to tell from the screen. Falling back to "starts
 * when TikTok approves it" is both safe and what MAIRO does by default — and
 * MAIRO holds the campaign paused until the chosen time regardless, so the
 * schedule is enforced even when TikTok is not told about it.
 */
async function tiktokSchedule(
  accessToken: string,
  advertiserId: string,
  startAt: Date | null | undefined,
  endAt?: Date | null
): Promise<Record<string, string>> {
  // TikTok requires a schedule type and start on every ad group, even one
  // that should simply start as soon as it's approved. An unreadable time zone
  // falls back to UTC — for a US advertiser that puts the start a few hours
  // later, never earlier.
  const zone = (await fetchAdvertiserTimeZone(accessToken, advertiserId).catch(() => null)) ?? "UTC";
  const soon = new Date(Date.now() + 10 * 60 * 1000);

  // An end date means START_END, which needs a start too; with none booked it
  // starts a few minutes out, which TikTok treats as now.
  if (endAt) {
    const start = isSchedulable(startAt) ? startAt : soon;
    return {
      schedule_type: "SCHEDULE_START_END",
      schedule_start_time: wallClockInZone(start, zone),
      schedule_end_time: wallClockInZone(endAt, zone),
    };
  }
  if (!isSchedulable(startAt)) {
    return { schedule_type: "SCHEDULE_FROM_NOW", schedule_start_time: wallClockInZone(soon, zone) };
  }

  return {
    // FROM_NOW rather than START_END: the customer picked when to begin and
    // said nothing about when to stop, and inventing an end date would quietly
    // switch their campaign off one day.
    schedule_type: "SCHEDULE_FROM_NOW",
    schedule_start_time: wallClockInZone(startAt, zone),
  };
}
