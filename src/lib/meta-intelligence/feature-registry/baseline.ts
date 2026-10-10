import type { Compatibility } from "@/lib/platform-intelligence/types";
import type { MetricFamily } from "@/lib/mission/goals";
import { DEFAULT_GRAPH_API_VERSION, metaCapabilities as C } from "../capabilities";

// The Meta Feature Registry's starting point: every Meta capability MAIRO's
// code relies on today (each featureKey matches metaCapabilities), plus Meta
// AI/automation tools MAIRO has not evaluated yet, recorded as NOT_SUPPORTED
// rather than left out — so "does MAIRO use this?" always has an answer.
//
// Seeding never overwrites what an admin or the pipeline changed later (see
// store.ts). lastVerifiedAt starts empty: the contract tests set it.

export type FeatureRecord = {
  featureKey: string;
  name: string;
  category: string;
  description: string;
  apiVersion?: string | null;
  objectives?: string[];
  optimizationGoals?: string[];
  placements?: string[];
  creativeFormats?: string[];
  permissions?: string[];
  accountType?: string | null;
  availability: "GA" | "LIMITED" | "BETA" | "ALPHA" | "UNKNOWN";
  betaStatus?: string | null;
  regionRestrictions?: string[];
  deprecated?: boolean;
  deprecationDate?: string | null;
  replacementKey?: string | null;
  sourceUrl?: string | null;
  mairoSupport: Compatibility;
  mairoMapping: { systems: string[]; code: string[] };
  breakingRisk: "LOW" | "MEDIUM" | "HIGH";
  goalFit: MetricFamily[];
  aiCapability?: boolean;
  /** Search terms that mean this feature in documentation text. */
  terms: string[];
  notes?: string | null;
};

const DOCS = "https://developers.facebook.com/docs/marketing-api/";
const BUILDER = { systems: ["Campaign builder (Create / launch)", "Meta adapter (ad sets, ads, insights)"], code: ["src/lib/meta/campaigns.ts", "src/lib/ad-platforms/meta/adapter.ts", "src/lib/meta-intelligence/capabilities/index.ts"] };
const ADS = ["ads_management"];
const ALL: MetricFamily[] = ["sales", "leads", "bookings", "calls", "traffic", "awareness", "social", "visits"];

const objective = (goal: keyof typeof C.campaignObjectives, name: string, fit: MetricFamily[]): FeatureRecord => ({
  featureKey: C.campaignObjectives[goal].featureKey,
  name: `${name} objective`,
  category: "Campaign objective",
  description: `Meta's ${C.campaignObjectives[goal].value} campaign objective, which MAIRO uses for its "${goal.toLowerCase()}" goal.`,
  objectives: [C.campaignObjectives[goal].value],
  permissions: ADS,
  availability: "GA",
  sourceUrl: `${DOCS}reference/ad-campaign-group/`,
  mairoSupport: "SUPPORTED",
  mairoMapping: BUILDER,
  breakingRisk: "HIGH",
  goalFit: fit,
  terms: [C.campaignObjectives[goal].value, `${name.toLowerCase()} objective`],
});

const optimization = (key: string, value: string, name: string, objectives: string[], fit: MetricFamily[], risk: "LOW" | "MEDIUM" | "HIGH" = "HIGH"): FeatureRecord => ({
  featureKey: key,
  name,
  category: "Optimization goal",
  description: `Ad set optimization goal ${value}.`,
  objectives,
  optimizationGoals: [value],
  permissions: ADS,
  availability: "GA",
  sourceUrl: `${DOCS}reference/ad-campaign/`,
  mairoSupport: "SUPPORTED",
  mairoMapping: BUILDER,
  breakingRisk: risk,
  goalFit: fit,
  terms: [value],
});

const placement = (key: string, name: string, positions: string[]): FeatureRecord => ({
  featureKey: key,
  name,
  category: "Placement",
  description: `${name}, offered when a business chooses where its ad shows.`,
  placements: positions,
  permissions: ADS,
  availability: "GA",
  sourceUrl: `${DOCS}audiences/reference/placement-targeting/`,
  mairoSupport: "SUPPORTED",
  mairoMapping: { systems: ["Campaign builder (Create / launch)"], code: ["src/lib/campaigns/placements.ts", "src/lib/meta-intelligence/capabilities/index.ts"] },
  breakingRisk: "MEDIUM",
  goalFit: ALL,
  terms: positions,
});

export const BASELINE_FEATURES: FeatureRecord[] = [
  {
    featureKey: "api.graph_version",
    name: "Graph / Marketing API version",
    category: "API version",
    description: "The API version every MAIRO request to Meta is made against.",
    apiVersion: DEFAULT_GRAPH_API_VERSION,
    availability: "GA",
    sourceUrl: "https://developers.facebook.com/docs/graph-api/changelog/versions/",
    mairoSupport: "SUPPORTED",
    mairoMapping: { systems: ["Meta adapter (ad sets, ads, insights)", "Meta connection and permissions"], code: ["src/lib/meta/client.ts"] },
    breakingRisk: "HIGH",
    goalFit: ALL,
    terms: ["graph api", "marketing api", "api version"],
  },
  objective("SALES", "Sales", ["sales"]),
  objective("LEADS", "Leads", ["leads", "bookings", "calls"]),
  objective("TRAFFIC", "Traffic", ["traffic", "sales", "leads"]),
  objective("AWARENESS", "Awareness", ["awareness", "visits"]),
  objective("ENGAGEMENT", "Engagement", ["social", "calls", "leads"]),
  objective("APP_PROMOTION", "App promotion", ["sales"]),
  optimization(C.optimizationGoals.byGoal.SALES.withPixel!.featureKey, "OFFSITE_CONVERSIONS", "Website conversions", ["OUTCOME_SALES", "OUTCOME_LEADS"], ["sales", "leads", "bookings"]),
  optimization(C.optimizationGoals.byGoal.TRAFFIC.default.featureKey, "LINK_CLICKS", "Link clicks", ["OUTCOME_TRAFFIC"], ["traffic"]),
  optimization(C.optimizationGoals.instantForm.featureKey, "LEAD_GENERATION", "Instant form leads", ["OUTCOME_LEADS"], ["leads", "bookings"]),
  optimization(C.optimizationGoals.byGoal.ENGAGEMENT.message!.featureKey, "CONVERSATIONS", "Conversations", ["OUTCOME_ENGAGEMENT"], ["leads", "calls", "bookings"]),
  optimization(C.optimizationGoals.byGoal.ENGAGEMENT.default.featureKey, "POST_ENGAGEMENT", "Post engagement", ["OUTCOME_ENGAGEMENT"], ["social"], "MEDIUM"),
  optimization(C.optimizationGoals.byGoal.AWARENESS.default.featureKey, "REACH", "Reach", ["OUTCOME_AWARENESS"], ["awareness", "visits"], "MEDIUM"),
  optimization(C.optimizationGoals.byGoal.APP_PROMOTION.default.featureKey, "APP_INSTALLS", "App installs", ["OUTCOME_APP_PROMOTION"], ["sales"], "MEDIUM"),
  {
    featureKey: C.delivery.bidStrategy.featureKey,
    name: "Highest volume bidding (no cap)",
    category: "Bid strategy",
    description: "LOWEST_COST_WITHOUT_CAP, stated on every campaign so an account default with a bid cap can't make the ad set unbuildable.",
    optimizationGoals: [],
    permissions: ADS,
    availability: "GA",
    sourceUrl: `${DOCS}bidding/overview/`,
    mairoSupport: "SUPPORTED",
    mairoMapping: BUILDER,
    breakingRisk: "HIGH",
    goalFit: ALL,
    terms: ["LOWEST_COST_WITHOUT_CAP", "bid strategy", "highest volume"],
  },
  {
    featureKey: C.delivery.billingEvent.featureKey,
    name: "Billing on impressions",
    category: "Delivery",
    description: "billing_event IMPRESSIONS on every ad set.",
    permissions: ADS,
    availability: "GA",
    mairoSupport: "SUPPORTED",
    mairoMapping: BUILDER,
    breakingRisk: "MEDIUM",
    goalFit: ALL,
    terms: ["billing_event", "IMPRESSIONS"],
  },
  {
    featureKey: C.delivery.campaignBudget.featureKey,
    name: "Campaign budget (Advantage campaign budget)",
    category: "Budget",
    description: "MAIRO sets the budget on the campaign so Meta moves it between ad sets, and one place holds it.",
    permissions: ADS,
    availability: "GA",
    mairoSupport: "SUPPORTED",
    mairoMapping: { systems: ["Campaign builder (Create / launch)", "MAIRO Decisions and optimization"], code: ["src/lib/meta/campaigns.ts", "src/lib/ad-platforms/meta/adapter.ts"] },
    breakingRisk: "HIGH",
    goalFit: ALL,
    aiCapability: true,
    terms: ["campaign budget", "daily_budget", "lifetime_budget", "advantage campaign budget"],
  },
  {
    featureKey: C.advantagePlacements.featureKey,
    name: "Advantage+ placements",
    category: "Placement optimization",
    description: "No placement chosen: Meta spreads the budget across placements and moves it to what works.",
    permissions: ADS,
    availability: "GA",
    sourceUrl: `${DOCS}audiences/reference/placement-targeting/`,
    mairoSupport: "SUPPORTED",
    mairoMapping: { systems: ["Campaign builder (Create / launch)", "Strategy Engine"], code: ["src/lib/campaigns/placements.ts", "src/lib/meta-intelligence/capabilities/index.ts"] },
    breakingRisk: "MEDIUM",
    goalFit: ALL,
    aiCapability: true,
    terms: ["advantage+ placements", "automatic placements", "advantage plus placements"],
  },
  placement(C.placements.FACEBOOK_FEED.featureKey, "Facebook feed", ["facebook:feed"]),
  placement(C.placements.INSTAGRAM_FEED.featureKey, "Instagram feed", ["instagram:stream"]),
  placement(C.placements.STORIES.featureKey, "Stories", ["facebook:story", "instagram:story"]),
  placement(C.placements.REELS.featureKey, "Reels", ["facebook:facebook_reels", "instagram:reels"]),
  {
    featureKey: C.targetingRules.advantageAudience.featureKey,
    name: "Advantage+ audience",
    category: "Audience automation",
    description: "targeting_automation.advantage_audience, always stated: 1 lets Meta widen past the choices, 0 keeps to them.",
    permissions: ADS,
    availability: "GA",
    sourceUrl: DOCS,
    mairoSupport: "SUPPORTED",
    mairoMapping: { systems: ["Campaign builder (Create / launch)", "Strategy Engine"], code: ["src/lib/ad-platforms/meta/adapter.ts", "src/lib/campaigns/launch.ts"] },
    breakingRisk: "HIGH",
    goalFit: ALL,
    aiCapability: true,
    terms: ["advantage+ audience", "advantage_audience", "targeting_automation"],
  },
  {
    featureKey: C.targetingRules.specialAdCategories.featureKey,
    name: "Special ad categories",
    category: "Targeting",
    description: "Housing, employment, credit and similar ads are declared, with their country, and use restricted targeting.",
    permissions: ADS,
    availability: "GA",
    mairoSupport: "SUPPORTED",
    mairoMapping: BUILDER,
    breakingRisk: "HIGH",
    goalFit: ALL,
    terms: ["special_ad_categories", "special ad category", "special_ad_category_country"],
  },
  {
    featureKey: C.destinationTypes.instantForm.featureKey,
    name: "Instant forms (lead ads)",
    category: "Lead generation",
    description: "Meta's own lead form, inside the ad; the leads are synced back to MAIRO.",
    permissions: [...ADS, "pages_manage_ads", "leads_retrieval"],
    availability: "GA",
    sourceUrl: `${DOCS}guides/lead-ads/`,
    mairoSupport: "PARTIALLY_SUPPORTED",
    mairoMapping: { systems: ["Lead forms", "Campaign builder (Create / launch)"], code: ["src/lib/leads/meta-form.ts", "src/lib/ad-platforms/meta/adapter.ts"] },
    breakingRisk: "HIGH",
    goalFit: ["leads", "bookings"],
    terms: ["instant form", "lead ads", "leadgen", "lead_gen_forms", "ON_AD"],
    notes: "Native delivery needs two App Review permissions MAIRO doesn't hold yet; the hosted lead page is the default.",
  },
  { ...placementLike("destination.messenger", "Messenger ads", "MESSENGER"), goalFit: ["leads", "calls", "bookings"] },
  { ...placementLike("destination.instagram_direct", "Instagram Direct ads", "INSTAGRAM_DIRECT"), goalFit: ["leads", "calls", "bookings"] },
  { ...placementLike("destination.whatsapp", "WhatsApp ads", "WHATSAPP"), goalFit: ["leads", "calls", "bookings"] },
  {
    featureKey: C.destinationTypes.onPost.featureKey,
    name: "Engagement on the post",
    category: "Destination",
    description: "destination_type ON_POST for likes, comments and shares.",
    permissions: ADS,
    availability: "GA",
    mairoSupport: "SUPPORTED",
    mairoMapping: BUILDER,
    breakingRisk: "MEDIUM",
    goalFit: ["social", "awareness"],
    terms: ["ON_POST"],
  },
  {
    featureKey: C.creativeFormats.image.featureKey,
    name: "Single image ads",
    category: "Creative format",
    description: "Link ads with one picture (JPG/PNG, at least 600px a side, up to 30MB).",
    creativeFormats: ["image"],
    permissions: ADS,
    availability: "GA",
    sourceUrl: "https://www.facebook.com/business/ads-guide/",
    mairoSupport: "SUPPORTED",
    mairoMapping: { systems: ["Creative builder and media checks"], code: ["src/lib/meta/creatives.ts", "src/lib/campaigns/media-rules.ts"] },
    breakingRisk: "MEDIUM",
    goalFit: ALL,
    terms: ["image ads", "single image", "image_hash", "link_data"],
  },
  {
    featureKey: C.creativeFormats.video.featureKey,
    name: "Single video ads",
    category: "Creative format",
    description: "Video ads with a thumbnail, uploaded to the ad account first.",
    creativeFormats: ["video"],
    permissions: ADS,
    availability: "GA",
    mairoSupport: "SUPPORTED",
    mairoMapping: { systems: ["Creative builder and media checks"], code: ["src/lib/meta/videos.ts", "src/lib/meta/creatives.ts"] },
    breakingRisk: "MEDIUM",
    goalFit: ALL,
    terms: ["video ads", "video_data", "advideos"],
  },
  {
    featureKey: C.creativeFormats.existingPost.featureKey,
    name: "Existing posts as ads",
    category: "Creative format",
    description: "Running a Page or Instagram post, or an existing ad's creative, again.",
    creativeFormats: ["existing post"],
    permissions: [...ADS, "pages_read_engagement"],
    availability: "GA",
    mairoSupport: "SUPPORTED",
    mairoMapping: { systems: ["Creative builder and media checks"], code: ["src/lib/meta/existing-ads.ts", "src/lib/meta/creatives.ts"] },
    breakingRisk: "MEDIUM",
    goalFit: ALL,
    terms: ["object_story_id", "source_instagram_media_id", "boost"],
  },
  {
    featureKey: "creative.standard_enhancements",
    name: "Standard enhancements bundle",
    category: "Creative AI",
    description: "Meta's bundled creative enhancements. Retired by Meta; MAIRO opts out of its individual features instead.",
    availability: "GA",
    deprecated: true,
    replacementKey: "creative.enhancement_features",
    mairoSupport: "DEPRECATED",
    mairoMapping: { systems: ["Creative builder and media checks"], code: ["src/lib/meta/creatives.ts"] },
    breakingRisk: "MEDIUM",
    goalFit: [],
    aiCapability: true,
    terms: ["standard_enhancements"],
  },
  {
    featureKey: "creative.enhancement_features",
    name: "Individual creative enhancements",
    category: "Creative AI",
    description: "Meta's per-feature creative enhancements (touch-ups, templates, auto-crop, text optimizations…). MAIRO sends each one explicitly so the ad looks like what the owner approved.",
    availability: "GA",
    mairoSupport: "SUPPORTED",
    mairoMapping: { systems: ["Creative builder and media checks"], code: ["src/lib/meta/creatives.ts"] },
    breakingRisk: "MEDIUM",
    goalFit: ALL,
    aiCapability: true,
    terms: [...C.creativeFormats.retiredStandardEnhancements, "degrees_of_freedom_spec", "creative_features_spec"],
  },
  {
    featureKey: "measurement.pixel_conversions",
    name: "Pixel conversion events",
    category: "Measurement",
    description: "Optimizing toward a pixel event through promoted_object (pixel_id, custom_event_type).",
    permissions: ADS,
    availability: "GA",
    mairoSupport: "SUPPORTED",
    mairoMapping: { systems: ["Tracking and conversions", "Campaign builder (Create / launch)"], code: ["src/lib/meta/creatives.ts", "src/lib/tracking/pixels.ts"] },
    breakingRisk: "HIGH",
    goalFit: ["sales", "leads", "bookings"],
    terms: ["custom_event_type", "promoted_object", "pixel_id", ...Object.values(C.conversionEvents)],
  },
  {
    featureKey: C.insightActions.featureKey,
    name: "Ads Insights",
    category: "Measurement",
    description: "Spend, reach, clicks and the action types MAIRO reads as purchases, leads, bookings and contacts.",
    permissions: ["ads_read"],
    availability: "GA",
    sourceUrl: `${DOCS}insights/`,
    mairoSupport: "SUPPORTED",
    mairoMapping: { systems: ["Reporting and analytics", "MAIRO Decisions and optimization", "Strategy Engine"], code: ["src/lib/ad-platforms/meta/adapter.ts", "src/lib/meta/performance.ts"] },
    breakingRisk: "HIGH",
    goalFit: ALL,
    terms: ["insights", "action_type", "action_values", "purchase_roas", ...C.insightActions.leads, ...C.insightActions.purchases],
  },
  {
    featureKey: "measurement.attribution",
    name: "Attribution settings",
    category: "Measurement",
    description: "MAIRO reads Meta's default attribution; it doesn't set a custom window.",
    availability: "GA",
    mairoSupport: "PARTIALLY_SUPPORTED",
    mairoMapping: { systems: ["Reporting and analytics"], code: ["src/lib/ad-platforms/meta/adapter.ts"] },
    breakingRisk: "MEDIUM",
    goalFit: ALL,
    terms: ["attribution", "attribution_spec", "action_attribution_windows"],
  },
  {
    featureKey: "permissions.ads_management",
    name: "ads_management and Page permissions",
    category: "Permissions",
    description: "The permissions MAIRO needs to build and read campaigns. ads_management covers reading ad accounts and Insights; ads_read isn't requested (not approved in App Review).",
    permissions: ["ads_management", "business_management", "pages_show_list", "pages_read_engagement"],
    availability: "GA",
    mairoSupport: "SUPPORTED",
    mairoMapping: { systems: ["Meta connection and permissions"], code: ["src/lib/meta/oauth.ts"] },
    breakingRisk: "HIGH",
    goalFit: ALL,
    terms: ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement", "app review"],
  },
  {
    featureKey: "publishing.instagram_content",
    name: "Instagram content publishing",
    category: "Instagram publishing",
    description: "Publishing posts and reels to a business's Instagram account (Social Manager, Scale).",
    permissions: ["instagram_basic", "instagram_content_publish"],
    availability: "GA",
    sourceUrl: "https://developers.facebook.com/docs/instagram-platform/content-publishing/",
    mairoSupport: "SUPPORTED",
    mairoMapping: { systems: ["Instagram / Facebook publishing (Social Manager)"], code: ["src/lib/instagram/publish.ts", "src/lib/social/manager.ts"] },
    breakingRisk: "HIGH",
    goalFit: ["social", "awareness"],
    terms: ["content publishing", "instagram_content_publish", "media_publish", "reels publishing"],
  },
  {
    featureKey: "publishing.facebook_page_posts",
    name: "Facebook Page posting",
    category: "Facebook Pages",
    description: "Posting on the business's own Page, asked for separately (pages_manage_posts).",
    permissions: ["pages_manage_posts"],
    availability: "GA",
    sourceUrl: "https://developers.facebook.com/docs/pages-api/posts/",
    mairoSupport: "PARTIALLY_SUPPORTED",
    mairoMapping: { systems: ["Instagram / Facebook publishing (Social Manager)", "Meta connection and permissions"], code: ["src/lib/facebook/page-posting.ts"] },
    breakingRisk: "HIGH",
    goalFit: ["social", "awareness"],
    terms: ["pages_manage_posts", "page posts", "/feed"],
    notes: "Waiting on Meta App Review for pages_manage_posts.",
  },
  // Meta AI / automation tools MAIRO hasn't evaluated. Recorded, never assumed.
  notYet("advantage_plus.sales_campaigns", "Advantage+ sales campaigns", "Campaign automation", ["sales"], ["advantage+ shopping", "advantage+ sales", "advantage plus shopping"]),
  notYet("advantage_plus.leads_campaigns", "Advantage+ leads campaigns", "Campaign automation", ["leads", "bookings"], ["advantage+ leads", "advantage+ lead campaigns"]),
  notYet("advantage_plus.app_campaigns", "Advantage+ app campaigns", "Campaign automation", ["sales"], ["advantage+ app"]),
  notYet("creative.generative_ai", "Generative AI creative features", "Creative AI", ["sales", "leads", "bookings", "awareness"], ["generative ai", "image generation", "background generation", "text generation", "image expansion", "video generation"]),
  notYet("creative.advantage_plus_catalog", "Advantage+ catalog ads", "Creative AI", ["sales"], ["advantage+ catalog", "catalog ads", "dynamic ads"]),
];

function placementLike(key: string, name: string, destinationType: string): FeatureRecord {
  return {
    featureKey: key,
    name,
    category: "Message destination",
    description: `Click-to-message ads with destination_type ${destinationType}.`,
    permissions: ADS,
    availability: "GA",
    mairoSupport: "SUPPORTED",
    mairoMapping: BUILDER,
    breakingRisk: "MEDIUM",
    goalFit: [],
    terms: [destinationType],
  };
}

function notYet(key: string, name: string, category: string, fit: MetricFamily[], terms: string[]): FeatureRecord {
  return {
    featureKey: key,
    name,
    category,
    description: `${name}: a Meta AI/automation capability MAIRO hasn't evaluated yet. Meta Intelligence checks official sources for what it does, who can use it and whether the API supports it.`,
    availability: "UNKNOWN",
    mairoSupport: "NOT_SUPPORTED",
    mairoMapping: { systems: [], code: [] },
    breakingRisk: "LOW",
    goalFit: fit,
    aiCapability: true,
    terms,
    notes: "Not yet evaluated. Never used for a customer until it passes the safe update pipeline.",
  };
}

/** Features whose terms appear in a piece of text. */
export function featuresMentioned(text: string, features: Pick<FeatureRecord, "featureKey" | "terms" | "name">[]): string[] {
  const low = text.toLowerCase();
  const hits: { key: string; score: number }[] = [];
  for (const f of features) {
    const score = [f.featureKey, f.name, ...f.terms].filter((t) => t.length >= 4 && low.includes(t.toLowerCase())).length;
    if (score > 0) hits.push({ key: f.featureKey, score });
  }
  return hits.sort((a, b) => b.score - a.score).map((h) => h.key);
}
