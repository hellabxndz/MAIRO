import type { AdDestination, AdGoal, MessageChannel, MetaPlacement } from "@/generated/prisma/enums";

// metaCapabilities — every Meta-specific value MAIRO builds campaigns with,
// in one place.
//
// Campaign objectives, optimization goals, placements, message destinations,
// targeting rules, creative specs, CTA types, conversion events and the
// insight action types used to be literals spread through the campaign code.
// When Meta renames, adds or retires one, this is the file that changes, and
// each entry names its feature in the Meta Feature Registry (featureKey), so
// a registry change — a deprecation, say — can be traced to the exact values
// it affects.
//
// Pure and dependency-free so the Create screens (client components) can read
// it too. What's allowed *for new campaigns* right now is a server question
// answered from the registry: see ../feature-registry/guard.ts. Nothing here
// is ever written from external content; changing it is a code change that
// goes through review, tests and deployment.

/** The Graph API version MAIRO builds against unless META_GRAPH_API_VERSION overrides it. */
export const DEFAULT_GRAPH_API_VERSION = "v24.0";

export type Capability<T> = { value: T; featureKey: string };

/** MAIRO's goals → Meta's ODAX campaign objectives. */
const campaignObjectives: Record<AdGoal, Capability<string>> = {
  LEADS: { value: "OUTCOME_LEADS", featureKey: "objective.outcome_leads" },
  SALES: { value: "OUTCOME_SALES", featureKey: "objective.outcome_sales" },
  AWARENESS: { value: "OUTCOME_AWARENESS", featureKey: "objective.outcome_awareness" },
  TRAFFIC: { value: "OUTCOME_TRAFFIC", featureKey: "objective.outcome_traffic" },
  APP_PROMOTION: { value: "OUTCOME_APP_PROMOTION", featureKey: "objective.outcome_app_promotion" },
  ENGAGEMENT: { value: "OUTCOME_ENGAGEMENT", featureKey: "objective.outcome_engagement" },
};

/**
 * How the objective adapts to what the account can measure. A sales or leads
 * objective without a pixel builds an ad set Meta refuses, so it degrades to
 * traffic; an instant form is always a leads campaign.
 */
const objectiveRules = {
  instantFormGoal: "LEADS" as AdGoal,
  withoutTracking: { SALES: "TRAFFIC", LEADS: "TRAFFIC" } as Partial<Record<AdGoal, AdGoal>>,
};

/** Ad set optimization goals by MAIRO goal, and the condition that picks each. */
const optimizationGoals = {
  instantForm: { value: "LEAD_GENERATION", featureKey: "optimization.lead_generation" },
  byGoal: {
    ENGAGEMENT: {
      message: { value: "CONVERSATIONS", featureKey: "optimization.conversations" },
      default: { value: "POST_ENGAGEMENT", featureKey: "optimization.post_engagement" },
    },
    LEADS: {
      withPixel: { value: "OFFSITE_CONVERSIONS", featureKey: "optimization.offsite_conversions" },
      default: { value: "LINK_CLICKS", featureKey: "optimization.link_clicks" },
    },
    SALES: {
      withPixel: { value: "OFFSITE_CONVERSIONS", featureKey: "optimization.offsite_conversions" },
      default: { value: "LINK_CLICKS", featureKey: "optimization.link_clicks" },
    },
    AWARENESS: { default: { value: "REACH", featureKey: "optimization.reach" } },
    TRAFFIC: { default: { value: "LINK_CLICKS", featureKey: "optimization.link_clicks" } },
    APP_PROMOTION: { default: { value: "APP_INSTALLS", featureKey: "optimization.app_installs" } },
  } as Record<AdGoal, { default: Capability<string>; withPixel?: Capability<string>; message?: Capability<string> }>,
};

/** Placements as MAIRO offers them → Meta publisher platforms and positions. */
const placements: Record<MetaPlacement, { featureKey: string; positions: { platform: "facebook" | "instagram"; position: string }[] }> = {
  FACEBOOK_FEED: { featureKey: "placement.facebook_feed", positions: [{ platform: "facebook", position: "feed" }] },
  INSTAGRAM_FEED: { featureKey: "placement.instagram_stream", positions: [{ platform: "instagram", position: "stream" }] },
  STORIES: { featureKey: "placement.stories", positions: [{ platform: "facebook", position: "story" }, { platform: "instagram", position: "story" }] },
  REELS: { featureKey: "placement.reels", positions: [{ platform: "facebook", position: "facebook_reels" }, { platform: "instagram", position: "reels" }] },
};

/** No placement chosen means Advantage+ placements: the targeting spec leaves them unsaid. */
const advantagePlacements = { featureKey: "advantage_plus.placements" };

/** Message ads: the ad set destination, the CTA and the app destination per channel. */
const messageChannels: Record<MessageChannel, { destinationType: string; cta: string; appDestination: string; featureKey: string }> = {
  MESSENGER: { destinationType: "MESSENGER", cta: "MESSAGE_PAGE", appDestination: "MESSENGER", featureKey: "destination.messenger" },
  INSTAGRAM: { destinationType: "INSTAGRAM_DIRECT", cta: "INSTAGRAM_MESSAGE", appDestination: "INSTAGRAM_DIRECT", featureKey: "destination.instagram_direct" },
  WHATSAPP: { destinationType: "WHATSAPP", cta: "WHATSAPP_MESSAGE", appDestination: "WHATSAPP", featureKey: "destination.whatsapp" },
};

/** Other ad set destination types. */
const destinationTypes = {
  onPost: { value: "ON_POST", featureKey: "destination.on_post" },
  instantForm: { value: "ON_AD", featureKey: "lead_forms.instant_forms" },
};

/** Targeting rules Meta enforces that MAIRO must state rather than inherit. */
const targetingRules = {
  /** Newer API versions refuse an ad set that leaves Advantage+ audience unsaid. */
  advantageAudience: { featureKey: "advantage_plus.audience", stateExplicitly: true },
  /** A special ad category (housing, employment, credit…) can't use Advantage+ audience. */
  specialCategoryDisablesAdvantageAudience: true,
  specialAdCategories: { featureKey: "targeting.special_ad_categories", countries: ["US"] },
  defaultGeo: { countries: ["US"] },
};

/** Delivery and bidding. */
const delivery = {
  billingEvent: { value: "IMPRESSIONS", featureKey: "delivery.billing_impressions" },
  /** The only strategy that is correct without asking a small business for a bid. */
  bidStrategy: { value: "LOWEST_COST_WITHOUT_CAP", featureKey: "delivery.lowest_cost_without_cap" },
  campaignBudget: { featureKey: "budget.campaign_budget" },
};

/** Creative specs: what an ad's picture or video may be. */
const creativeFormats = {
  image: { featureKey: "creative.single_image", types: ["image/jpeg", "image/png"] as const, maxBytes: 30 * 1024 * 1024, minSide: 600, sharpSide: 1080 },
  video: { featureKey: "creative.single_video", types: ["video/mp4", "video/quicktime"] as const, minSeconds: 1, maxSeconds: 241 * 60 },
  existingPost: { featureKey: "creative.existing_post" },
  /** Meta retired the standard_enhancements bundle; these are its parts, opted out one by one. */
  retiredStandardEnhancements: ["image_touchups", "image_brightness_and_contrast", "image_templates", "video_auto_crop", "text_optimizations", "enhance_cta", "inline_comment"] as const,
};

/** Every CTA type Meta accepts that MAIRO maps to. */
const ctaTypes = [
  "SHOP_NOW", "ORDER_NOW", "BOOK_TRAVEL", "SEE_MENU", "GET_QUOTE", "CALL_NOW",
  "CONTACT_US", "SIGN_UP", "SUBSCRIBE", "DOWNLOAD", "APPLY_NOW", "GET_OFFER",
  "MESSAGE_PAGE", "LEARN_MORE", "NO_BUTTON",
] as const;

/** Pixel events → the custom_event_type a promoted_object takes. */
const conversionEvents: Record<string, string> = {
  Purchase: "PURCHASE",
  Lead: "LEAD",
  CompleteRegistration: "COMPLETE_REGISTRATION",
  Contact: "CONTACT",
  Schedule: "SCHEDULE",
  StartTrial: "START_TRIAL",
  Subscribe: "SUBSCRIBE",
  SubmitApplication: "SUBMIT_APPLICATION",
  AddToCart: "ADD_TO_CART",
  InitiateCheckout: "INITIATED_CHECKOUT",
  ViewContent: "VIEW_CONTENT",
  FindLocation: "FIND_LOCATION",
  Search: "SEARCH",
  Donate: "DONATE",
};

/** Insight action types MAIRO reads as each result. */
const insightActions = {
  featureKey: "measurement.insights_actions",
  purchases: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  leads: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
  bookings: ["schedule_total", "omni_schedule", "offsite_conversion.fb_pixel_schedule"],
  contacts: ["contact_total", "onsite_conversion.messaging_conversation_started_7d", "click_to_call_native_call_placed"],
  landingPageViews: ["landing_page_view", "omni_landing_page_view"],
  videoViews: ["video_view"],
  engagement: ["post_engagement"],
};

export const metaCapabilities = {
  campaignObjectives,
  objectiveRules,
  optimizationGoals,
  placements,
  advantagePlacements,
  messageChannels,
  destinationTypes,
  targetingRules,
  delivery,
  creativeFormats,
  ctaTypes,
  conversionEvents,
  insightActions,
} as const;

// --- Reading it --------------------------------------------------------------------

/** The Meta objective for a goal, degraded to what the account can measure. */
export function objectiveCapability(goal: AdGoal, hasConversionTracking = true, usesInstantForm = false): Capability<string> {
  if (usesInstantForm) return campaignObjectives[objectiveRules.instantFormGoal];
  const degraded = !hasConversionTracking ? objectiveRules.withoutTracking[goal] : undefined;
  return campaignObjectives[degraded ?? goal];
}

/** The ad set optimization goal for a goal and what the ad set can track. */
export function optimizationCapability(goal: AdGoal, opts: { hasPixel: boolean; instantForm?: boolean; destination?: string }): Capability<string> {
  if (opts.instantForm) return optimizationGoals.instantForm;
  const g = optimizationGoals.byGoal[goal];
  if (opts.destination === "DIRECT_MESSAGE" && g.message) return g.message;
  if (opts.hasPixel && g.withPixel) return g.withPixel;
  return g.default;
}

/** The placement fields of a targeting spec. Empty = Advantage+ placements (nothing sent). */
export function placementTargeting(chosen: MetaPlacement[]): Record<string, string[]> {
  if (chosen.length === 0) return {};
  // Canonical order (the order above), whatever order they were picked in.
  const picked = new Set(chosen);
  const positions = (Object.keys(placements) as MetaPlacement[]).filter((p) => picked.has(p)).flatMap((p) => placements[p].positions);
  const of = (platform: "facebook" | "instagram") => [...new Set(positions.filter((x) => x.platform === platform).map((x) => x.position))];
  const facebook = of("facebook");
  const instagram = of("instagram");
  return {
    publisher_platforms: [...(facebook.length ? ["facebook"] : []), ...(instagram.length ? ["instagram"] : [])],
    ...(facebook.length ? { facebook_positions: facebook } : {}),
    ...(instagram.length ? { instagram_positions: instagram } : {}),
  };
}

/**
 * The registry features a campaign would be built with — recorded on the
 * campaign (metaFeatures) so results can be compared per feature, and checked
 * against the registry before a new campaign launches.
 */
export function featuresForCampaign(input: {
  goal: AdGoal;
  hasConversionTracking: boolean;
  instantForm: boolean;
  destination?: AdDestination | string | null;
  channel?: MessageChannel | null;
  placements: MetaPlacement[];
  advantageAudience: boolean;
  specialAdCategory: boolean;
  creativeKinds?: ("IMAGE" | "VIDEO" | "EXISTING_AD")[];
}): string[] {
  const out = new Set<string>();
  out.add(objectiveCapability(input.goal, input.hasConversionTracking, input.instantForm).featureKey);
  out.add(optimizationCapability(input.goal, { hasPixel: input.hasConversionTracking, instantForm: input.instantForm, destination: input.destination ?? undefined }).featureKey);
  out.add(delivery.bidStrategy.featureKey);
  if (input.placements.length === 0) out.add(advantagePlacements.featureKey);
  else for (const p of input.placements) out.add(placements[p].featureKey);
  if (input.advantageAudience && !input.specialAdCategory) out.add(targetingRules.advantageAudience.featureKey);
  if (input.specialAdCategory) out.add(targetingRules.specialAdCategories.featureKey);
  if (input.instantForm) out.add(destinationTypes.instantForm.featureKey);
  if (input.destination === "DIRECT_MESSAGE" && input.channel) out.add(messageChannels[input.channel].featureKey);
  for (const k of input.creativeKinds ?? []) out.add(k === "VIDEO" ? creativeFormats.video.featureKey : k === "EXISTING_AD" ? creativeFormats.existingPost.featureKey : creativeFormats.image.featureKey);
  return [...out].sort();
}
