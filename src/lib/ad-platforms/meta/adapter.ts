import {
  EMPTY_METRICS,
  fail,
  ok,
  type AdPlatformAdapter,
  type CampaignPerformance,
  type ConnectedAccount,
  type CreateAdGroupInput,
  type CreateAdInput,
  type CreateCampaignInput,
  type CreatedCampaign,
  type CreatedEntity,
  type CreativePerformance,
  type PlatformAccount,
  type PlatformResult,
} from "../types";
import { loadCredentials, markConnectionProblem } from "../connections";
import { MetaApiError, metaGraphRequest } from "@/lib/meta/client";
import { createMetaCampaign, metaObjectiveFor } from "@/lib/meta/campaigns";
import { loadMetaConnection } from "@/lib/meta/connection";
import { isSchedulable, metaStartTime } from "@/lib/campaigns/schedule";
import { CHANNEL_META } from "@/lib/campaigns/destination";
import { findInstagramAccount } from "@/lib/instagram/publish";
import {
  createAdCreative,
  createMetaAd,
  metaCustomEventType,
  uploadAdImage,
} from "@/lib/meta/creatives";

// Meta behind the shared interface.
//
// This is a wrapper, not a rewrite. The Graph calls it makes are the ones in
// src/lib/meta/* that have been running in production — createCampaign is
// literally the existing helper. What this file adds is the shape: the same
// method names, the same units and the same never-throw contract as every
// other network, so the code above can hold a list of adapters and not care
// which is which.
//
// Meta's own OAuth is not routed through here. It has a working callback at
// /api/meta/callback that predates this interface and does more than the
// interface describes (Page discovery, long-lived token exchange), so
// connectAccount reports that rather than offering a second, worse path to the
// same thing. The interface is for the code that runs campaigns; connecting
// Meta stays where it is.

function toFailureKind(error: MetaApiError) {
  // Meta signals a dead token with 190, and permission problems with 200/10.
  const code = (error.body as { error?: { code?: number } } | null)?.error?.code;
  if (code === 190 || error.status === 401) return "not_connected" as const;
  if (code === 10 || code === 200) return "insufficient_scope" as const;
  if (error.status >= 500) return "unavailable" as const;
  return "rejected" as const;
}

async function toFailure<T>(
  organizationId: string,
  error: unknown,
  fallback: string
): Promise<PlatformResult<T>> {
  if (error instanceof MetaApiError) {
    const kind = toFailureKind(error);
    if (kind === "not_connected") {
      await markConnectionProblem(
        organizationId,
        "META",
        "TOKEN_EXPIRED",
        "Meta's permission for MAIRO has expired. Reconnect to keep campaigns running."
      );
      return fail(
        kind,
        "Meta's permission for MAIRO has expired or been revoked. Reconnect Meta in Settings.",
        error.body
      );
    }
    if (kind === "insufficient_scope") {
      return fail(
        kind,
        "This Meta account didn't grant MAIRO permission for that. Reconnect Meta and approve every permission it asks for.",
        error.body
      );
    }
    if (kind === "unavailable") {
      return fail(kind, "Meta didn't respond. Nothing was changed — try again shortly.", error.body);
    }
    return fail("rejected", `Meta rejected this: ${error.message}`, error.body);
  }
  return fail("unavailable", fallback, error);
}

async function credentialsOr<T>(organizationId: string) {
  const creds = await loadCredentials(organizationId, "META");
  if (!creds) {
    return {
      ok: false as const,
      result: fail<T>("not_connected", "No Meta account is connected. Connect one in Settings."),
    };
  }
  if (creds.status !== "CONNECTED") {
    return {
      ok: false as const,
      result: fail<T>("not_connected", "The Meta connection needs attention. Reconnect it in Settings."),
    };
  }
  return { ok: true as const, creds };
}

/** Meta reports money as a decimal string of whole currency units. */
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

type MetaAction = { action_type: string; value: string };

type MetaInsightRow = {
  campaign_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  purchase_roas?: MetaAction[];
};

/**
 * Pulls one action type out of Meta's actions array.
 *
 * Meta reports conversions as a list of {action_type, value} rather than as
 * columns, and the action type that means "a purchase" differs by how the
 * advertiser set up their pixel — omni_purchase covers both web and offline,
 * purchase covers only the pixel. Trying them in order is what makes the
 * number match what the advertiser sees in Ads Manager.
 */
function actionValue(actions: MetaAction[] | undefined, types: string[]): number | null {
  if (!actions) return null;
  for (const type of types) {
    const hit = actions.find((a) => a.action_type === type);
    if (hit) return num(hit.value);
  }
  return null;
}

const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

export const metaAdapter: AdPlatformAdapter = {
  platform: "META",
  // The campaign carries daily_budget, so the ad set must not.
  budgetLevel: "campaign",

  async connectAccount(): Promise<PlatformResult<ConnectedAccount>> {
    return fail(
      "not_implemented",
      "Meta connects through its own flow at /api/meta/connect, which also finds the business's Page and exchanges for a long-lived token."
    );
  },

  async getAccounts(organizationId: string): Promise<PlatformResult<PlatformAccount[]>> {
    const loaded = await credentialsOr<PlatformAccount[]>(organizationId);
    if (!loaded.ok) return loaded.result;

    try {
      const res = await metaGraphRequest<{
        data: { id: string; name?: string; currency?: string; account_status?: number }[];
      }>("/me/adaccounts", {
        accessToken: loaded.creds.accessToken,
        params: { fields: "id,name,currency,account_status" },
      });
      return ok(
        res.data.map((a) => ({
          id: a.id,
          name: a.name ?? a.id,
          currency: a.currency ?? null,
          // Meta's account_status 1 is ACTIVE; everything else can't spend.
          usable: a.account_status === undefined ? true : a.account_status === 1,
        }))
      );
    } catch (error) {
      return toFailure(organizationId, error, "Couldn't read your Meta ad accounts.");
    }
  },

  async createCampaign(input: CreateCampaignInput): Promise<PlatformResult<CreatedCampaign>> {
    const loaded = await credentialsOr<CreatedCampaign>(input.organizationId);
    if (!loaded.ok) return loaded.result;

    try {
      const campaign = await createMetaCampaign({
        adAccountId: loaded.creds.externalAccountId,
        accessToken: loaded.creds.accessToken,
        name: input.name,
        goal: input.goal,
        dailyBudgetCents: input.dailyBudgetCents,
        status: input.activate ? "ACTIVE" : "PAUSED",
        hasConversionTracking: input.hasConversionTracking ?? false,
        usesInstantForm: input.destination?.type === "INSTANT_FORM",
      });
      return ok({
        externalId: campaign.id,
        status: input.activate ? "ACTIVE" : "PAUSED",
      });
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't create the campaign on Meta.");
    }
  },

  async createAdGroup(input: CreateAdGroupInput): Promise<PlatformResult<CreatedEntity>> {
    const loaded = await credentialsOr<CreatedEntity>(input.organizationId);
    if (!loaded.ok) return loaded.result;

    // An Instagram thread needs an Instagram account on the Page. Checked here
    // because Meta's refusal for this names destination_type and not Instagram,
    // and because the answer is one Graph call MAIRO already knows how to make
    // — far better than a customer reading "Invalid parameter" and having no
    // idea their Page was never linked.
    if (
      input.destination?.type === "DIRECT_MESSAGE" &&
      input.destination.channel === "INSTAGRAM"
    ) {
      const account = await findInstagramAccount(input.organizationId);
      if (!account.ok) return fail("rejected", account.error.message);
      if (!account.data) {
        return fail(
          "rejected",
          "This ad opens Instagram messages, but no Instagram account is linked to your Facebook Page. Link one in Meta Business settings, then launch again."
        );
      }
    }

    try {
      const res = await metaGraphRequest<{ id: string }>(
        `/${loaded.creds.externalAccountId}/adsets`,
        {
          method: "POST",
          accessToken: loaded.creds.accessToken,
          body: metaAdSetBody(input),
        }
      );
      return ok({ externalId: res.id });
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't create the ad set on Meta.");
    }
  },

  /**
   * Uploads the picture, builds the creative and attaches the ad.
   *
   * Three dependent calls, each of which can fail on its own, so the failures
   * are separated: a missing Page is a different problem from an oversized
   * image and needs a different sentence. Everything lands PAUSED.
   */
  async createAd(input: CreateAdInput): Promise<PlatformResult<CreatedEntity>> {
    const loaded = await credentialsOr<CreatedEntity>(input.organizationId);
    if (!loaded.ok) return loaded.result;

    const connection = await loadMetaConnection(input.organizationId);
    // An ad is always published *by* a Page, even one that only ever runs as
    // an ad. Checked here rather than left to Meta, whose error for this names
    // object_story_spec and not the Page.
    if (!connection?.pageId) {
      return fail(
        "rejected",
        "Meta needs a Facebook Page to publish the ad from, and none is picked yet. Choose one on the Meta connection screen."
      );
    }

    // None of the below applies to a post that already exists. It has its own
    // picture and its own words, on Meta, and demanding a generated image and a
    // written headline first would refuse the one kind of ad that needs neither.
    const boosting = Boolean(input.boostPostId);

    if (!boosting && !input.creative.imageData) {
      return fail("rejected", "This creative has no finished picture to run.");
    }
    if (!boosting && (!input.creative.headline || !input.creative.primaryText)) {
      return fail(
        "rejected",
        "This creative is missing its headline or its main text, so MAIRO won't build an ad from it."
      );
    }

    try {
      // Skipped entirely when boosting: there is no picture to upload, and
      // uploading one would cost a Graph call to produce a hash nothing reads.
      const image = boosting
        ? null
        : await uploadAdImage(
            loaded.creds.externalAccountId,
            loaded.creds.accessToken,
            input.creative.imageData!,
            input.name
          );

      const creative = await createAdCreative({
        adAccountId: loaded.creds.externalAccountId,
        accessToken: loaded.creds.accessToken,
        name: input.name,
        pageId: connection.pageId,
        imageHash: image?.hash ?? "",
        boostPostId: input.boostPostId ?? null,
        destination: input.destination,
        message: input.creative.primaryText ?? "",
        headline: input.creative.headline ?? "",
        callToAction: input.creative.cta ?? null,
      });

      const ad = await createMetaAd({
        adAccountId: loaded.creds.externalAccountId,
        accessToken: loaded.creds.accessToken,
        name: input.name,
        adSetId: input.externalAdGroupId,
        creativeId: creative.id,
      });

      return ok({ externalId: ad.id });
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't build the ad on Meta.");
    }
  },

  async updateBudget(input): Promise<PlatformResult<void>> {
    const loaded = await credentialsOr<void>(input.organizationId);
    if (!loaded.ok) return loaded.result;

    try {
      await metaGraphRequest(`/${input.externalCampaignId}`, {
        method: "POST",
        accessToken: loaded.creds.accessToken,
        body: { daily_budget: input.dailyBudgetCents },
      });
      return ok(undefined);
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't change the budget on Meta.");
    }
  },

  /**
   * Moves an ad set's start time after it has been created.
   *
   * Meta takes the same start_time field on an update as on a create, so this
   * is one POST. Clearing it back to "start on approval" is the awkward case —
   * Meta has no "unset" for start_time, so the nearest honest thing is to move
   * it to now, which lets delivery begin the moment review passes.
   */
  async updateSchedule(input): Promise<PlatformResult<void>> {
    const loaded = await credentialsOr<void>(input.organizationId);
    if (!loaded.ok) return loaded.result;

    try {
      await metaGraphRequest(`/${input.externalAdGroupId}`, {
        method: "POST",
        accessToken: loaded.creds.accessToken,
        body: {
          start_time: isSchedulable(input.startAt)
            ? metaStartTime(input.startAt)
            : metaStartTime(new Date()),
        },
      });
      return ok(undefined);
    } catch (error) {
      return toFailure(
        input.organizationId,
        error,
        "Couldn't move the start time on Meta."
      );
    }
  },

  async pauseCampaign(input): Promise<PlatformResult<void>> {
    return setStatus(input.organizationId, input.externalCampaignId, "PAUSED");
  },

  async resumeCampaign(input): Promise<PlatformResult<void>> {
    // The ad and ad set are built PAUSED. Switched on first, campaign last:
    // the campaign is what starts spending, so a failure part-way through
    // leaves nothing running.
    for (const id of [input.externalAdId, input.externalAdGroupId]) {
      if (!id) continue;
      const result = await setStatus(input.organizationId, id, "ACTIVE");
      if (!result.ok) return result;
    }
    return setStatus(input.organizationId, input.externalCampaignId, "ACTIVE");
  },

  async getCampaignPerformance(input): Promise<PlatformResult<CampaignPerformance[]>> {
    const loaded = await credentialsOr<CampaignPerformance[]>(input.organizationId);
    if (!loaded.ok) return loaded.result;
    if (input.externalCampaignIds.length === 0) return ok([]);

    try {
      // One account-level call filtered to these campaigns, rather than one
      // call per campaign. The plan limits cap campaigns at ten, so this is
      // the difference between one round trip and ten on every dashboard load.
      const res = await metaGraphRequest<{ data: MetaInsightRow[] }>(
        `/${loaded.creds.externalAccountId}/insights`,
        {
          accessToken: loaded.creds.accessToken,
          params: {
            level: "campaign",
            fields:
              "campaign_id,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas",
            filtering: JSON.stringify([
              { field: "campaign.id", operator: "IN", value: input.externalCampaignIds },
            ]),
            ...(input.range
              ? {
                  time_range: JSON.stringify({
                    since: input.range.since.toISOString().slice(0, 10),
                    until: input.range.until.toISOString().slice(0, 10),
                  }),
                }
              : { date_preset: "maximum" }),
          },
        }
      );

      return ok(
        res.data.map((row) => ({
          externalCampaignId: row.campaign_id ?? "",
          metrics: normalizeInsights(row),
        }))
      );
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't read Meta performance.");
    }
  },

  async getCreativePerformance(input): Promise<PlatformResult<CreativePerformance[]>> {
    const loaded = await credentialsOr<CreativePerformance[]>(input.organizationId);
    if (!loaded.ok) return loaded.result;

    try {
      const res = await metaGraphRequest<{ data: MetaInsightRow[] }>(
        `/${input.externalCampaignId}/insights`,
        {
          accessToken: loaded.creds.accessToken,
          params: {
            level: "ad",
            fields: "ad_id,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas",
            date_preset: "maximum",
          },
        }
      );
      return ok(
        res.data.map((row) => ({
          externalAdId: row.ad_id ?? "",
          metrics: normalizeInsights(row),
        }))
      );
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't read Meta creative performance.");
    }
  },
};

function normalizeInsights(row: MetaInsightRow) {
  const spendCents = unitsToCents(row.spend);
  const purchases = actionValue(row.actions, PURCHASE_TYPES);
  const revenueCents = unitsToCents(
    actionValue(row.action_values, PURCHASE_TYPES) ?? undefined
  );
  const roasReported = actionValue(row.purchase_roas, PURCHASE_TYPES);

  return {
    ...EMPTY_METRICS,
    spendCents,
    impressions: num(row.impressions),
    reach: num(row.reach),
    clicks: num(row.clicks),
    // Meta reports CTR as a percentage; MAIRO holds fractions.
    ctr: num(row.ctr) === null ? null : num(row.ctr)! / 100,
    cpcCents: unitsToCents(row.cpc),
    cpmCents: unitsToCents(row.cpm),
    conversions: actionValue(row.actions, ["offsite_conversion", ...PURCHASE_TYPES]),
    purchases,
    costPerPurchaseCents:
      purchases && purchases > 0 && spendCents !== null
        ? Math.round(spendCents / purchases)
        : null,
    revenueCents,
    // Prefer Meta's own ROAS; fall back to deriving it, but only when both
    // parts are actually known.
    roas:
      roasReported ??
      (revenueCents !== null && spendCents !== null && spendCents > 0
        ? revenueCents / spendCents
        : null),
  };
}

/**
 * The ad set exactly as Meta will receive it.
 *
 * Pulled out of the Graph call so it can be asserted without one. Every field
 * here is a rule Meta enforces silently — a wrong optimization goal is
 * accepted and under-delivers, a missing promoted_object is refused with a
 * message that names no field — and a check that has to reach the network to
 * see them is a check nobody runs.
 */
export function metaAdSetBody(input: CreateAdGroupInput): Record<string, unknown> {
  // Which conversion this can honestly chase. Without a pixel there is nothing
  // for Meta to optimize towards, so asking for purchases would be accepted
  // and then under-deliver forever with no error.
  // An instant form collects the lead inside the ad, so there is nothing
  // offsite to optimize towards and no pixel involved. LEAD_GENERATION is the
  // goal that actually means "get me these forms filled in" — the one case
  // where it is right, since MAIRO now does create the form.
  const instantForm = input.destination?.type === "INSTANT_FORM";
  const optimization = instantForm
    ? "LEAD_GENERATION"
    : metaOptimizationGoal(input.goal, Boolean(input.conversion));

  return {
    name: input.name,
    campaign_id: input.externalCampaignId,
    // Omitted when the campaign carries it. Meta rejects an ad set budget
    // under a campaign that has one, and MAIRO always sets the budget on the
    // campaign so the optimizer has one place to move it.
    ...(input.campaignOwnsBudget ? {} : { daily_budget: input.dailyBudgetCents }),
    billing_event: "IMPRESSIONS",
    optimization_goal: optimization,
    status: "PAUSED",
    // Where a click lands, at the ad set level. Meta needs this to deliver a
    // message ad into the inbox rather than treating it as an ordinary link ad
    // with an unusual button.
    ...(input.destination?.type === "DIRECT_MESSAGE"
      ? { destination_type: CHANNEL_META[input.destination.channel].destinationType }
      : {}),
    // An instant form lives on the ad, so the ad set says so and names the
    // Page the form belongs to. Without the promoted_object Meta refuses the
    // ad set; without ON_AD it builds a link ad whose button happens to carry
    // a form id and never opens it.
    ...(instantForm && input.pageId
      ? {
          destination_type: "ON_AD",
          promoted_object: JSON.stringify({ page_id: input.pageId }),
        }
      : {}),
    // When the customer booked a start. Sent as ISO 8601 in UTC, which Meta
    // converts into the ad account's own timezone — safer than MAIRO guessing
    // that timezone, where being wrong means every scheduled campaign starts
    // hours out.
    //
    // Omitted when the time has already arrived, or is about to: Meta rejects
    // a start_time in the past outright, and failing a whole launch over a
    // customer who meant "now" would be absurd.
    ...(isSchedulable(input.startAt) ? { start_time: metaStartTime(input.startAt) } : {}),
    targeting: input.targeting ?? { geo_locations: { countries: ["US"] } },
    // Required whenever the ad set optimizes for a pixel conversion, and
    // meaningless otherwise. It is what ties the tracking MAIRO set up to the
    // thing the campaign is actually trying to cause.
    //
    // Never for an instant form, even when the business has a pixel. There is
    // one promoted_object and the form's Page has already claimed it — writing
    // the pixel over it leaves an ON_AD ad set that names no Page, which Meta
    // refuses. A form filled in inside the ad is not a pixel event anyway; the
    // lead is the conversion.
    ...(input.conversion && !instantForm
      ? {
          promoted_object: JSON.stringify({
            pixel_id: input.conversion.pixelId,
            custom_event_type: metaCustomEventType(input.conversion.event),
          }),
        }
      : {}),
  };
}

/**
 * Meta needs an optimization goal on the ad set that matches the campaign's
 * objective; a mismatch is rejected at creation with a message that does not
 * name the field.
 */
function metaOptimizationGoal(
  goal: Parameters<typeof metaObjectiveFor>[0],
  hasPixel: boolean
): string {
  switch (goal) {
    case "LEADS":
      // OFFSITE_CONVERSIONS, not LEAD_GENERATION. LEAD_GENERATION means one of
      // Meta's instant forms, which lives on Facebook and which MAIRO does not
      // create — asking for it on a campaign that sends people to a website
      // produces an ad set that cannot deliver. With a pixel, a website lead is
      // an offsite conversion; without one, the best honest target is a click.
      return hasPixel ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS";
    case "SALES":
      // Same reasoning. Optimizing for purchases on an account that has never
      // seen one is accepted by Meta and then under-delivers indefinitely.
      return hasPixel ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS";
    case "AWARENESS":
      return "REACH";
    case "TRAFFIC":
      return "LINK_CLICKS";
    case "APP_PROMOTION":
      return "APP_INSTALLS";
  }
}

/** Sets the status of a campaign, ad set or ad — Meta takes the same call for all three. */
async function setStatus(
  organizationId: string,
  externalId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<PlatformResult<void>> {
  const loaded = await credentialsOr<void>(organizationId);
  if (!loaded.ok) return loaded.result;

  try {
    await metaGraphRequest(`/${externalId}`, {
      method: "POST",
      accessToken: loaded.creds.accessToken,
      body: { status },
    });
    return ok(undefined);
  } catch (error) {
    return toFailure(organizationId, error, "Couldn't change the status on Meta.");
  }
}
