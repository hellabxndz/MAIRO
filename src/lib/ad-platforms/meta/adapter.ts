import {
  EMPTY_METRICS,
  fail,
  ok,
  type AdPlatformAdapter,
  type CampaignPerformance,
  type ConnectedAccount,
  type CreateAdGroupInput,
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

    try {
      const res = await metaGraphRequest<{ id: string }>(
        `/${loaded.creds.externalAccountId}/adsets`,
        {
          method: "POST",
          accessToken: loaded.creds.accessToken,
          body: {
            name: input.name,
            campaign_id: input.externalCampaignId,
            daily_budget: input.dailyBudgetCents,
            billing_event: "IMPRESSIONS",
            optimization_goal: metaOptimizationGoal(input.goal),
            status: "PAUSED",
            targeting: input.targeting ?? { geo_locations: { countries: ["US"] } },
          },
        }
      );
      return ok({ externalId: res.id });
    } catch (error) {
      return toFailure(input.organizationId, error, "Couldn't create the ad set on Meta.");
    }
  },

  async createAd(): Promise<PlatformResult<CreatedEntity>> {
    // Same honest gap as TikTok's: an ad needs a creative that already exists
    // in the ad account, which means uploading the image or video to Meta
    // first and referencing the returned hash. MAIRO has no asset pipeline
    // yet, so this says so rather than posting an ad with nothing in it.
    return fail(
      "not_implemented",
      "Publishing finished creatives to Meta isn't switched on yet. The campaign and ad set are live; " +
        "the creative has to be attached in Ads Manager for now."
    );
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

  async pauseCampaign(input): Promise<PlatformResult<void>> {
    return setStatus(input.organizationId, input.externalCampaignId, "PAUSED");
  },

  async resumeCampaign(input): Promise<PlatformResult<void>> {
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
 * Meta needs an optimization goal on the ad set that matches the campaign's
 * objective; a mismatch is rejected at creation with a message that does not
 * name the field.
 */
function metaOptimizationGoal(goal: Parameters<typeof metaObjectiveFor>[0]): string {
  switch (goal) {
    case "LEADS":
      return "LEAD_GENERATION";
    case "SALES":
      return "OFFSITE_CONVERSIONS";
    case "AWARENESS":
      return "REACH";
    case "TRAFFIC":
      return "LINK_CLICKS";
    case "APP_PROMOTION":
      return "APP_INSTALLS";
  }
}

async function setStatus(
  organizationId: string,
  externalCampaignId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<PlatformResult<void>> {
  const loaded = await credentialsOr<void>(organizationId);
  if (!loaded.ok) return loaded.result;

  try {
    await metaGraphRequest(`/${externalCampaignId}`, {
      method: "POST",
      accessToken: loaded.creds.accessToken,
      body: { status },
    });
    return ok(undefined);
  } catch (error) {
    return toFailure(organizationId, error, "Couldn't change the campaign status on Meta.");
  }
}
