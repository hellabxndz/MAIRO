import { metaCampaignBody, createMetaCampaign, listMetaCampaigns, getCampaignInsights } from "@/lib/meta/campaigns";
import { MetaApiError, describeGraphError, graphApiVersion, metaGraphRequest, withGraphTransport } from "@/lib/meta/client";
import { createMetaAd, metaAdCreativeParams, uploadAdImage } from "@/lib/meta/creatives";
import { META_CTA_TYPES } from "@/lib/meta/creative-copy";
import { metaAdSetBody, normalizeInsights, toFailureKind } from "@/lib/ad-platforms/meta/adapter";
import { checkImage } from "@/lib/campaigns/media-rules";
import { metaScopes } from "@/lib/meta/oauth";
import type { AdGoal } from "@/generated/prisma/enums";
import { metaCapabilities, placementTargeting } from "../capabilities";
import { eligibility } from "../discovery";

// The Meta contract suite: MAIRO's real request code, run against a stubbed
// Meta inside withGraphTransport (scoped to this run — never global), so it
// needs no network, no token and no database. It checks the shape of every
// request MAIRO sends and how it reads every answer, against the rules Meta
// enforces.
//
// A critical failure blocks the pipeline (nothing reaches production) and
// fails `npm run check:meta-contract`, which runs before deployment.

export type ContractTest = { key: string; name: string; area: string; critical: boolean; features: string[]; run: () => Promise<void> };
export type ContractResult = { key: string; name: string; area: string; critical: boolean; ok: boolean; error: string | null; ms: number };

type Call = { method: string; url: URL; body: string | null };

/** A stubbed Graph API: routes → canned JSON, every request recorded. */
function fakeMeta(routes: { match: RegExp; method?: string; status?: number; json: unknown | ((u: URL, body: string | null) => unknown) }[]) {
  const calls: Call[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : null;
    calls.push({ method, url, body });
    const r = routes.find((x) => x.match.test(url.pathname) && (!x.method || x.method === method));
    const json = r ? (typeof r.json === "function" ? (r.json as (u: URL, b: string | null) => unknown)(url, body) : r.json) : { error: { message: "Unknown path in contract stub", code: 100 } };
    return new Response(JSON.stringify(json), { status: r?.status ?? (r ? 200 : 400), headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetch: f, calls };
}

function check(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const run = <T>(meta: ReturnType<typeof fakeMeta>, fn: () => Promise<T>, version?: string) => withGraphTransport({ fetch: meta.fetch, version, record: false }, fn);

// Which ad set optimization goals Meta accepts under each ODAX objective
// (outcome-driven ad experiences), as MAIRO relies on them.
const VALID_OPTIMIZATION: Record<string, string[]> = {
  OUTCOME_SALES: ["OFFSITE_CONVERSIONS", "LINK_CLICKS", "LANDING_PAGE_VIEWS", "VALUE", "IMPRESSIONS", "REACH", "CONVERSATIONS"],
  OUTCOME_LEADS: ["OFFSITE_CONVERSIONS", "LEAD_GENERATION", "QUALITY_LEAD", "LINK_CLICKS", "LANDING_PAGE_VIEWS", "CONVERSATIONS", "QUALITY_CALL"],
  OUTCOME_TRAFFIC: ["LINK_CLICKS", "LANDING_PAGE_VIEWS", "REACH", "IMPRESSIONS", "CONVERSATIONS", "QUALITY_CALL"],
  OUTCOME_AWARENESS: ["REACH", "IMPRESSIONS", "AD_RECALL_LIFT", "THRUPLAY"],
  OUTCOME_ENGAGEMENT: ["POST_ENGAGEMENT", "CONVERSATIONS", "THRUPLAY", "LINK_CLICKS", "PAGE_LIKES", "EVENT_RESPONSES", "IMPRESSIONS", "REACH"],
  OUTCOME_APP_PROMOTION: ["APP_INSTALLS", "LINK_CLICKS", "OFFSITE_CONVERSIONS", "VALUE"],
};

const GOALS: AdGoal[] = ["SALES", "LEADS", "TRAFFIC", "AWARENESS", "ENGAGEMENT", "APP_PROMOTION"];

export const CONTRACT_TESTS: ContractTest[] = [
  {
    key: "auth.token",
    name: "Authentication: token travels as access_token, never in a body",
    area: "Authentication",
    critical: true,
    features: ["api.graph_version"],
    run: async () => {
      const meta = fakeMeta([{ match: /\/me$/, json: { id: "1" } }, { match: /\/campaigns$/, method: "POST", json: { id: "c1" } }]);
      await run(meta, () => metaGraphRequest("/me", { accessToken: "TOKEN-123" }));
      await run(meta, () => createMetaCampaign({ adAccountId: "act_1", accessToken: "TOKEN-123", name: "x", goal: "TRAFFIC", dailyBudgetCents: 1000 }));
      for (const c of meta.calls) {
        check(c.url.searchParams.get("access_token") === "TOKEN-123", "access_token missing from the query");
        check(!c.body?.includes("TOKEN-123"), "token leaked into a request body");
      }
    },
  },
  {
    key: "auth.permissions",
    name: "Permissions: MAIRO asks only for approved permissions; ads_management covers reading",
    area: "Permissions",
    critical: true,
    features: ["permissions.ads_management"],
    run: async () => {
      const scopes = metaScopes();
      for (const s of ["ads_management", "business_management", "pages_show_list", "pages_read_engagement"]) check(scopes.includes(s), `${s} isn't requested`);
      // Not approved by Meta's App Review; ads_management covers reading.
      check(!scopes.includes("ads_read"), "ads_read is requested, but Meta didn't approve it");
      const e = eligibility({ availability: "GA", permissions: ["ads_management"], regionRestrictions: [], deprecated: false }, { country: "US", permissions: ["ads_read"], capabilities: [], accountStatus: 1 });
      check(!e.eligible && e.reasons.some((r) => r.includes("ads_management")), "a missing permission isn't caught");
      const reads = eligibility({ availability: "GA", permissions: ["ads_read"], regionRestrictions: [], deprecated: false }, { country: "US", permissions: ["ads_management"], capabilities: [], accountStatus: 1 });
      check(reads.eligible, "ads_management doesn't cover reading");
    },
  },
  {
    key: "account.retrieval",
    name: "Ad account retrieval: act_ ids and account fields",
    area: "Ad account",
    critical: true,
    features: ["api.graph_version"],
    run: async () => {
      const meta = fakeMeta([{ match: /\/act_42$/, json: { account_status: 1, currency: "USD", business_country_code: "US", capabilities: ["CAN_USE_REACH_AND_FREQUENCY"] } }]);
      const info = await run(meta, () => metaGraphRequest<{ currency: string }>("/act_42", { accessToken: "t", params: { fields: "account_status,currency,business_country_code,capabilities" } }));
      check(info.currency === "USD", "account fields not read");
      check(meta.calls[0].url.pathname.endsWith("/act_42"), "ad account path wrong");
    },
  },
  {
    key: "campaign.create",
    name: "Campaign creation: valid objective, explicit bid strategy, one budget",
    area: "Campaign creation",
    critical: true,
    features: [...Object.values(metaCapabilities.campaignObjectives).map((o) => o.featureKey), metaCapabilities.delivery.bidStrategy.featureKey, metaCapabilities.delivery.campaignBudget.featureKey],
    run: async () => {
      for (const goal of GOALS) {
        for (const tracking of [true, false]) {
          const b = metaCampaignBody({ name: "x", goal, dailyBudgetCents: 1500, hasConversionTracking: tracking });
          check(Object.keys(VALID_OPTIMIZATION).includes(String(b.objective)), `${goal}: unknown objective ${String(b.objective)}`);
          check(b.bid_strategy === "LOWEST_COST_WITHOUT_CAP", `${goal}: bid strategy not stated`);
          check(b.status === "PAUSED", `${goal}: campaign not created paused`);
          check(Array.isArray(b.special_ad_categories), `${goal}: special_ad_categories missing`);
        }
      }
      const lifetime = metaCampaignBody({ name: "x", goal: "SALES", dailyBudgetCents: 1500, lifetimeBudgetCents: 30000 });
      check(lifetime.lifetime_budget === 30000 && lifetime.daily_budget === undefined, "daily and lifetime budget sent together");
      const special = metaCampaignBody({ name: "x", goal: "LEADS", dailyBudgetCents: 1500, specialAdCategory: "HOUSING" });
      check(Array.isArray(special.special_ad_category_country), "special category without its country");
    },
  },
  {
    key: "adset.create",
    name: "Ad set creation: optimization goal valid for the objective; required fields stated",
    area: "Ad set creation",
    critical: true,
    features: [metaCapabilities.delivery.billingEvent.featureKey, metaCapabilities.targetingRules.advantageAudience.featureKey, "measurement.pixel_conversions", metaCapabilities.destinationTypes.instantForm.featureKey, ...new Set(Object.values(metaCapabilities.optimizationGoals.byGoal).flatMap((g) => [g.default, g.withPixel, g.message].filter(Boolean).map((x) => x!.featureKey)))],
    run: async () => {
      for (const goal of GOALS) {
        for (const pixel of [true, false]) {
          const objective = String(metaCampaignBody({ name: "x", goal, dailyBudgetCents: 1000, hasConversionTracking: pixel }).objective);
          const body = metaAdSetBody({
            name: "s",
            externalCampaignId: "c1",
            goal,
            dailyBudgetCents: 1000,
            campaignOwnsBudget: true,
            conversion: pixel ? { pixelId: "p1", event: "Purchase" } : null,
            advantageAudience: false,
          } as never);
          check(VALID_OPTIMIZATION[objective].includes(String(body.optimization_goal)), `${goal} (pixel ${pixel}): ${String(body.optimization_goal)} isn't valid under ${objective}`);
          check(body.billing_event === "IMPRESSIONS", "billing_event missing");
          check(body.daily_budget === undefined, "ad set budget under a campaign budget");
          const t = body.targeting as { targeting_automation?: { advantage_audience?: number } };
          check(t.targeting_automation?.advantage_audience === 0, "Advantage+ audience not stated explicitly");
          if (pixel && (goal === "SALES" || goal === "LEADS")) check(typeof body.promoted_object === "string" && body.promoted_object.includes("PURCHASE"), "pixel ad set without its promoted_object");
        }
      }
      const form = metaAdSetBody({ name: "s", externalCampaignId: "c1", goal: "LEADS", dailyBudgetCents: 1000, campaignOwnsBudget: true, destination: { type: "INSTANT_FORM" }, pageId: "pg1", conversion: { pixelId: "p1", event: "Lead" } } as never);
      check(form.optimization_goal === "LEAD_GENERATION" && form.destination_type === "ON_AD", "instant form ad set wrong");
      check(String(form.promoted_object).includes("pg1") && !String(form.promoted_object).includes("pixel"), "instant form must name its Page, not the pixel");
    },
  },
  {
    key: "creative.create",
    name: "Creative creation: one story spec, a CTA Meta accepts",
    area: "Creative creation",
    critical: true,
    features: [metaCapabilities.creativeFormats.image.featureKey, metaCapabilities.creativeFormats.existingPost.featureKey, "creative.enhancement_features"],
    run: async () => {
      const p = metaAdCreativeParams({ adAccountId: "act_1", accessToken: "t", name: "c", pageId: "pg1", imageHash: "h1", destination: { type: "WEBSITE", url: "https://example.com" }, message: "Hello", headline: "Hi", callToAction: "LEARN_MORE" } as never);
      check(!("object_story_id" in p && "object_story_spec" in p), "object_story_id and object_story_spec together");
      const spec = JSON.stringify(p);
      check(spec.includes("LEARN_MORE"), "CTA missing");
      for (const cta of metaCapabilities.ctaTypes) check(META_CTA_TYPES.has(cta), `CTA ${cta} not accepted`);
    },
  },
  {
    key: "ad.create",
    name: "Ad creation: paused, names its ad set and creative",
    area: "Ad creation",
    critical: true,
    features: ["api.graph_version"],
    run: async () => {
      const meta = fakeMeta([{ match: /\/ads$/, method: "POST", json: { id: "ad1" } }]);
      const ad = await run(meta, () => createMetaAd({ adAccountId: "act_1", accessToken: "t", name: "a", adSetId: "s1", creativeId: "cr1" }));
      check(ad.id === "ad1", "ad id not read");
      const q = meta.calls[0].url.searchParams;
      check(q.get("adset_id") === "s1" && q.get("status") === "PAUSED" && (q.get("creative") ?? "").includes("cr1"), "ad request missing fields");
    },
  },
  {
    key: "campaign.status",
    name: "Campaign status: only ACTIVE / PAUSED are sent",
    area: "Campaign status",
    critical: true,
    features: ["api.graph_version"],
    run: async () => {
      const meta = fakeMeta([{ match: /\/c1$/, method: "POST", json: { success: true } }]);
      await run(meta, () => metaGraphRequest("/c1", { method: "POST", accessToken: "t", body: { status: "PAUSED" } }));
      check(JSON.parse(meta.calls[0].body ?? "{}").status === "PAUSED", "status body wrong");
    },
  },
  {
    key: "budget.fields",
    name: "Budget fields: whole cents, lifetime needs an end",
    area: "Budgets",
    critical: true,
    features: [metaCapabilities.delivery.campaignBudget.featureKey],
    run: async () => {
      const b = metaCampaignBody({ name: "x", goal: "TRAFFIC", dailyBudgetCents: 2550 });
      check(Number.isInteger(b.daily_budget) && b.daily_budget === 2550, "daily_budget not in whole cents");
      const s = metaAdSetBody({ name: "s", externalCampaignId: "c1", goal: "TRAFFIC", dailyBudgetCents: 1000, campaignOwnsBudget: false, endAt: new Date(Date.now() + 10 * 86_400_000) } as never);
      check(s.daily_budget === 1000 && typeof s.end_time === "string", "ad set budget or end_time missing");
    },
  },
  {
    key: "placements",
    name: "Placements: valid positions; none chosen = Advantage+ placements",
    area: "Placements",
    critical: true,
    features: [metaCapabilities.advantagePlacements.featureKey, ...Object.values(metaCapabilities.placements).map((p) => p.featureKey)],
    run: async () => {
      check(Object.keys(placementTargeting([])).length === 0, "Advantage+ placements must send no placement fields");
      const t = placementTargeting(["REELS", "FACEBOOK_FEED", "STORIES", "INSTAGRAM_FEED"]);
      check(JSON.stringify(t.publisher_platforms) === '["facebook","instagram"]', "publisher_platforms wrong");
      const valid = { facebook: ["feed", "story", "facebook_reels", "marketplace", "video_feeds", "search", "right_hand_column", "instream_video", "profile_feed", "notification"], instagram: ["stream", "story", "reels", "explore", "explore_home", "profile_feed", "ig_search"] };
      for (const p of t.facebook_positions ?? []) check(valid.facebook.includes(p), `unknown facebook position ${p}`);
      for (const p of t.instagram_positions ?? []) check(valid.instagram.includes(p), `unknown instagram position ${p}`);
    },
  },
  {
    key: "media.validation",
    name: "Media validation: Meta's picture rules enforced before upload",
    area: "Media",
    critical: false,
    features: [metaCapabilities.creativeFormats.image.featureKey, metaCapabilities.creativeFormats.video.featureKey],
    run: async () => {
      check(checkImage({ type: "image/gif", bytes: 1000, width: 1080, height: 1080 }).problems.length > 0, "GIF accepted");
      check(checkImage({ type: "image/jpeg", bytes: 1000, width: 500, height: 500 }).problems.length > 0, "tiny image accepted");
      check(checkImage({ type: "image/png", bytes: 1000, width: 1080, height: 1080 }).problems.length === 0, "good image refused");
      const meta = fakeMeta([{ match: /\/adimages$/, method: "POST", json: { images: { f: { hash: "abc", url: "https://x" } } } }]);
      const up = await run(meta, () => uploadAdImage("act_1", "t", "data:image/png;base64,iVBORw0KGgo=", "f"));
      check(JSON.stringify(up).includes("abc"), "image hash not read");
      check(!meta.calls[0].url.search.includes("iVBOR"), "image bytes sent in the URL instead of the body");
    },
  },
  {
    key: "insights.read",
    name: "Insights retrieval: results read from the right action types",
    area: "Insights",
    critical: true,
    features: [metaCapabilities.insightActions.featureKey],
    run: async () => {
      const m = normalizeInsights({ spend: "12.50", impressions: "1000", clicks: "40", reach: "800", actions: [{ action_type: "lead", value: "3" }, { action_type: "omni_purchase", value: "2" }, { action_type: "landing_page_view", value: "30" }], action_values: [{ action_type: "omni_purchase", value: "80" }] } as never);
      check(m.spendCents === 1250 && m.leads === 3 && m.purchases === 2 && m.revenueCents === 8000 && m.landingPageViews === 30, "insight figures misread");
      const meta = fakeMeta([{ match: /\/insights$/, json: { data: [{ impressions: "10", spend: "1.00" }] } }]);
      const row = await run(meta, () => getCampaignInsights("c1", "t"));
      check(row?.impressions === "10", "insights row not returned");
    },
  },
  {
    key: "pagination",
    name: "Pagination: follows Graph's cursors, never leaves Graph, stops at a cap",
    area: "Pagination",
    critical: false,
    features: ["api.graph_version"],
    run: async () => {
      const meta = fakeMeta([
        {
          match: /\/act_1\/campaigns$/,
          json: (u: URL) =>
            u.searchParams.get("after") === "p2"
              ? { data: [{ id: "c3", name: "c", objective: "OUTCOME_SALES", status: "ACTIVE" }] }
              : { data: [{ id: "c1" }, { id: "c2" }], paging: { cursors: { after: "p2" }, next: "https://graph.facebook.com/v24.0/act_1/campaigns?after=p2" } },
        },
      ]);
      const all = await run(meta, () => listMetaCampaigns("act_1", "t"));
      check(all.length === 3, `expected 3 campaigns across pages, got ${all.length}`);
      const evil = fakeMeta([{ match: /\/act_1\/campaigns$/, json: { data: [{ id: "c1" }], paging: { cursors: { after: "x" }, next: "https://evil.example/steal" } } }]);
      await run(evil, () => listMetaCampaigns("act_1", "t"));
      check(evil.calls.length === 1 && evil.calls.every((c) => c.url.hostname === "graph.facebook.com"), "followed a paging link off Graph");
    },
  },
  {
    key: "tokens.handling",
    name: "Token handling: errors never echo the token",
    area: "Tokens",
    critical: true,
    features: ["api.graph_version"],
    run: async () => {
      const meta = fakeMeta([{ match: /\/me$/, status: 400, json: { error: { message: "Invalid OAuth access token.", code: 190 } } }]);
      let caught: unknown = null;
      await run(meta, () => metaGraphRequest("/me", { accessToken: "SECRET-TOKEN" })).catch((e) => (caught = e));
      check(caught instanceof MetaApiError, "no MetaApiError thrown");
      check(!String((caught as Error).message).includes("SECRET-TOKEN"), "token in the error message");
      check(toFailureKind(caught as MetaApiError) === "not_connected", "expired token not recognised");
    },
  },
  {
    key: "errors.handling",
    name: "Error handling: Meta's own explanation and codes survive",
    area: "Errors",
    critical: true,
    features: ["api.graph_version"],
    run: async () => {
      const msg = describeGraphError({ error: { message: "Invalid parameter", error_user_title: "Bid Amount Required", error_user_msg: "Set a bid.", code: 100, error_subcode: 1815857 } }, 400);
      check(msg.includes("Bid Amount Required") && msg.includes("subcode 1815857"), "error detail lost");
      check(toFailureKind(new MetaApiError("x", 400, { error: { code: 200 } })) === "insufficient_scope", "permission error misread");
      check(toFailureKind(new MetaApiError("x", 503, {})) === "unavailable", "outage misread");
    },
  },
  {
    key: "api.version",
    name: "API version: every call uses the production version (or the run's candidate)",
    area: "API version",
    critical: true,
    features: ["api.graph_version"],
    run: async () => {
      const meta = fakeMeta([{ match: /\/me$/, json: { id: "1" } }]);
      await run(meta, () => metaGraphRequest("/me", { accessToken: "t" }));
      check(meta.calls[0].url.pathname.startsWith(`/${graphApiVersion()}/`), "production version not in the path");
      await run(meta, () => metaGraphRequest("/me", { accessToken: "t" }), "v99.0");
      check(meta.calls[1].url.pathname.startsWith("/v99.0/"), "candidate version not used inside its run");
      check(/^v\d+\.0$/.test(graphApiVersion()), "malformed production version");
    },
  },
];

/** Runs the suite (or some of it). Pure: no DB, no network. */
export async function runContractTests(keys?: string[]): Promise<ContractResult[]> {
  const out: ContractResult[] = [];
  for (const t of CONTRACT_TESTS.filter((x) => !keys || keys.includes(x.key))) {
    const started = Date.now();
    try {
      await t.run();
      out.push({ key: t.key, name: t.name, area: t.area, critical: t.critical, ok: true, error: null, ms: Date.now() - started });
    } catch (error) {
      out.push({ key: t.key, name: t.name, area: t.area, critical: t.critical, ok: false, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started });
    }
  }
  return out;
}
