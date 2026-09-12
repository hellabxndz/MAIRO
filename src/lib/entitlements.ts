import { db } from "@/lib/db";
import type { AdPlatform, SubscriptionTier } from "@/generated/prisma/enums";
import { billingEnforced, planFor, type Plan } from "@/lib/plans";

// What a plan lets an organization do — the only place in the application
// allowed to answer that question.
//
// Before this, "is this customer allowed to do X" was a tier comparison
// wherever X happened. That works until there are two products' worth of
// features and three plans, at which point changing what Growth includes means
// finding every `tier === "GROWTH"` in the codebase and hoping. So there is one
// vocabulary of flags, one function that resolves them, and nothing outside
// this file compares a tier to anything.
//
// The flags are read from the PlanConfig table when it has a row, and from the
// defaults below when it does not. That ordering is the point: pricing can be
// changed with an UPDATE rather than a deploy, but a deployment with an empty
// PlanConfig table still works exactly as the code says it should. There is no
// state where the product is broken because someone forgot to seed a table.

/**
 * Everything a plan can grant.
 *
 * Boolean flags are capabilities; numbers are ceilings. Adding one means
 * adding it here, to DEFAULT_ENTITLEMENTS, and to the plan rows — the compiler
 * finds every place that matters.
 */
export type Entitlements = {
  /** Run ads on Facebook and Instagram. */
  meta_ads: boolean;
  /** Run ads on TikTok. */
  tiktok_ads: boolean;
  /** One campaign spanning more than one network, with a split budget. */
  cross_platform_campaigns: boolean;
  /** TikTok Growth Mode: native creative, hook variations, Spark readiness. */
  tiktok_growth: boolean;
  /** MAIRO's team creates the customer's TikTok Business presence for them. */
  tiktok_account_setup: boolean;
  /**
   * MAIRO posts to the customer's own social profiles — Instagram and TikTok.
   *
   * Organic posts on their own feed, not ads. Separate from tiktok_ads for a
   * reason: running an ad and publishing to somebody's profile are different
   * promises, need different permissions from each network, and one of them
   * puts words on their account under their own name.
   */
  social_posting: boolean;
  /** Let MAIRO move budget by itself, within the customer's limits. */
  auto_optimize: boolean;
  /** Per-platform breakdowns, creative-level figures, video metrics. */
  advanced_analytics: boolean;
  /** Creative requests per calendar month. */
  creative_limit: number;
  /** Campaigns that aren't archived. */
  campaign_limit: number;
};

export type EntitlementFlag = {
  [K in keyof Entitlements]: Entitlements[K] extends boolean ? K : never;
}[keyof Entitlements];

/**
 * The defaults, and the shape the pricing page renders.
 *
 * Prices here are what the customer is *shown*. What they are actually charged
 * comes from the Stripe Price object behind STRIPE_PRICE_*, so changing a
 * number here without changing it in Stripe makes the page lie. That is worth
 * saying out loud because it is invisible until someone checks their card
 * statement.
 */
export const DEFAULT_ENTITLEMENTS: Record<SubscriptionTier, Entitlements> = {
  NONE: {
    meta_ads: false,
    tiktok_ads: false,
    cross_platform_campaigns: false,
    tiktok_growth: false,
    tiktok_account_setup: false,
    social_posting: false,
    auto_optimize: false,
    advanced_analytics: false,
    creative_limit: 0,
    campaign_limit: 0,
  },
  STARTER: {
    meta_ads: true,
    tiktok_ads: false,
    cross_platform_campaigns: false,
    tiktok_growth: false,
    tiktok_account_setup: false,
    social_posting: false,
    auto_optimize: false,
    advanced_analytics: false,
    creative_limit: 2,
    campaign_limit: 1,
  },
  GROWTH: {
    meta_ads: true,
    tiktok_ads: true,
    cross_platform_campaigns: true,
    tiktok_growth: true,
    tiktok_account_setup: true,
    social_posting: false,
    auto_optimize: false,
    advanced_analytics: true,
    creative_limit: 8,
    campaign_limit: 3,
  },
  // The top business plan. Its enum value is still SCALE and that is
  // deliberate: Stripe price ids are keyed off the tier name in the
  // environment, and renaming the value would leave every existing subscriber
  // matching no STRIPE_PRICE_* variable, which the webhook would read as
  // "no plan". The customer-facing name lives in plans.ts; this is internal.
  SCALE: {
    meta_ads: true,
    tiktok_ads: true,
    cross_platform_campaigns: true,
    tiktok_growth: true,
    tiktok_account_setup: true,
    social_posting: true,
    auto_optimize: true,
    advanced_analytics: true,
    creative_limit: 20,
    campaign_limit: 10,
  },
  // Freelancer plans. Per-client capability matches Growth, because a
  // freelancer's client is a real business running real campaigns.
  STUDIO: {
    meta_ads: true,
    tiktok_ads: true,
    cross_platform_campaigns: true,
    tiktok_growth: true,
    tiktok_account_setup: true,
    social_posting: false,
    auto_optimize: false,
    advanced_analytics: true,
    creative_limit: 8,
    campaign_limit: 3,
  },
  AGENCY: {
    meta_ads: true,
    tiktok_ads: true,
    cross_platform_campaigns: true,
    tiktok_growth: true,
    tiktok_account_setup: true,
    social_posting: true,
    auto_optimize: true,
    advanced_analytics: true,
    creative_limit: 20,
    campaign_limit: 10,
  },
};

/** Human wording for each flag, used by the upgrade prompts. */
export const FLAG_LABELS: Record<EntitlementFlag, string> = {
  meta_ads: "Meta ads",
  tiktok_ads: "TikTok ads",
  cross_platform_campaigns: "Cross-platform campaigns",
  tiktok_growth: "TikTok Growth Mode",
  tiktok_account_setup: "MAIRO sets up your TikTok",
  social_posting: "MAIRO posts to your Instagram and TikTok",
  auto_optimize: "Mairo Auto Optimize",
  advanced_analytics: "Advanced analytics",
};

function parseEntitlements(raw: string, fallback: Entitlements): Entitlements {
  try {
    const parsed = JSON.parse(raw) as Partial<Entitlements>;
    // Merged over the defaults rather than used directly. A row written before
    // a new flag existed is missing that key, and spreading it over the
    // defaults means the new flag takes its compiled-in value instead of
    // becoming undefined — which would read as false and silently switch a
    // feature off for every paying customer on the next deploy.
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

/**
 * The tier an organization is actually treated as.
 *
 * Mirrors planFor()'s handling of unpaid accounts: while BILLING_ENFORCED is
 * off, NONE is treated as Starter so the product works for everyone, which is
 * what the Meta App Review submission promises the reviewer will see.
 */
function effectiveTier(tier: SubscriptionTier): SubscriptionTier {
  if (tier === "NONE" && !billingEnforced()) return "STARTER";
  return tier;
}

/**
 * Resolves a tier's entitlements, preferring the database.
 *
 * A missing row is normal, not an error — see the note at the top.
 */
export async function entitlementsForTier(tier: SubscriptionTier): Promise<Entitlements> {
  const resolved = effectiveTier(tier);
  const fallback = DEFAULT_ENTITLEMENTS[resolved];

  const row = await db.planConfig
    .findUnique({ where: { tier: resolved }, select: { entitlementsJson: true, active: true } })
    .catch(() => null);

  if (!row || !row.active) return fallback;
  return parseEntitlements(row.entitlementsJson, fallback);
}

/** The same thing, starting from an organization. */
export async function entitlementsFor(organizationId: string): Promise<Entitlements> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionTier: true },
  });
  return entitlementsForTier(org?.subscriptionTier ?? "NONE");
}

/** Convenience for the common "may they?" question. */
export async function can(organizationId: string, flag: EntitlementFlag): Promise<boolean> {
  const ent = await entitlementsFor(organizationId);
  return ent[flag];
}

/**
 * The cheapest plan that grants a flag.
 *
 * This is what makes the upgrade prompt honest: rather than hard-coding
 * "upgrade to Growth" next to every TikTok feature, the prompt asks which plan
 * would actually unlock the thing the customer just clicked. Change the flags
 * on a plan and the prompts follow.
 */
export function cheapestPlanWith(flag: EntitlementFlag, plans: Plan[]): Plan | null {
  const candidates = plans
    .filter((p) => DEFAULT_ENTITLEMENTS[p.tier][flag])
    .sort((a, b) => a.priceMonthly - b.priceMonthly);
  return candidates[0] ?? null;
}

/** Which networks this organization's plan lets it advertise on. */
export function platformsAllowedBy(ent: Entitlements): AdPlatform[] {
  const out: AdPlatform[] = [];
  if (ent.meta_ads) out.push("META");
  if (ent.tiktok_ads) out.push("TIKTOK");
  return out;
}

/**
 * Whether a chosen set of platforms is within the plan, and what to say if not.
 *
 * Returns the blocking flag rather than a message so the caller can decide
 * between an inline note and the upgrade modal — the requirement is explicitly
 * that picking TikTok on Starter opens an upgrade path, not an error.
 */
export function checkPlatformSelection(
  platforms: AdPlatform[],
  ent: Entitlements
): { allowed: true } | { allowed: false; missing: EntitlementFlag } {
  if (platforms.includes("TIKTOK") && !ent.tiktok_ads) {
    return { allowed: false, missing: "tiktok_ads" };
  }
  if (platforms.includes("META") && !ent.meta_ads) {
    return { allowed: false, missing: "meta_ads" };
  }
  if (platforms.length > 1 && !ent.cross_platform_campaigns) {
    return { allowed: false, missing: "cross_platform_campaigns" };
  }
  return { allowed: true };
}

/**
 * Plan display data, preferring the database over the compiled defaults.
 *
 * Used by the pricing page and the upgrade modal so that a price changed in
 * PlanConfig shows up everywhere without a deploy.
 */
export async function planWithOverrides(tier: SubscriptionTier): Promise<Plan> {
  const base = planFor(tier);
  const row = await db.planConfig.findUnique({ where: { tier } }).catch(() => null);
  if (!row || !row.active) return base;

  let features = base.features;
  try {
    const parsed = JSON.parse(row.featuresJson);
    if (Array.isArray(parsed)) features = parsed as string[];
  } catch {
    // Keep the compiled list; a malformed row shouldn't blank the pricing card.
  }

  return {
    ...base,
    name: row.name,
    priceMonthly: row.priceMonthly / 100,
    tagline: row.tagline,
    spendGuidance: row.spendGuidance || base.spendGuidance,
    featured: row.featured,
    features,
  };
}

/**
 * The handful of facts people actually compare between plans.
 *
 * Derived from the entitlements and the limits rather than written out as
 * marketing copy, which is the point: the pricing grid then cannot promise
 * something the code does not grant. When TikTok moved to Growth and posting
 * moved to the top plan, the cards had to be edited by hand to keep up, and Growth
 * card went on promising posting for a while after the flag had gone. This
 * makes that class of mistake impossible.
 *
 * Same rows in the same order on every card, so a reader can run their eye
 * down one column and straight across to the next.
 */
export function planComparison(
  tier: SubscriptionTier
): { label: string; value: string; muted?: boolean }[] {
  const e = DEFAULT_ENTITLEMENTS[tier];
  const limits = planFor(tier).limits;

  const networks = [e.meta_ads && "Meta", e.tiktok_ads && "TikTok"]
    .filter(Boolean)
    .join(" + ");

  return [
    { label: "Runs ads on", value: networks || "Nothing yet", muted: !networks },
    { label: "Campaigns at once", value: String(limits.campaigns) },
    { label: "New ads a month", value: String(limits.creativesPerMonth) },
    {
      label: "Posts to your own feed",
      value: e.social_posting ? "Instagram + TikTok" : "No",
      muted: !e.social_posting,
    },
  ];
}
