import type { SubscriptionTier } from "@/generated/prisma/enums";

// What each plan costs and what it includes.
//
// These are the compiled-in defaults. The database can override them — see
// src/lib/entitlements.ts, which reads PlanConfig and falls back here — so
// pricing can change without a deploy while a deployment with an empty
// PlanConfig table still behaves exactly as this file says.
//
// What a plan *allows* is no longer decided here. That moved to
// entitlements.ts, in one vocabulary of flags, because "can this customer use
// TikTok" was about to become a tier comparison scattered across the campaign
// form, the creative generator, the analytics page and the optimizer. The
// limits below stay because the pricing cards render them.
//
// Limits are set around what actually costs us money: creative requests are
// real production work, and each live campaign is real oversight. AI agent
// chat is deliberately unlimited on every tier — it costs cents to serve and
// it's the thing that keeps people logging in.
//
// One thing to know before changing a price: the number here is what the
// customer is SHOWN. What they are charged is the Stripe Price behind the
// matching STRIPE_PRICE_* variable. Changing one without the other makes the
// pricing page lie, and nobody notices until a card statement does.

export type PlanLimits = {
  /** Campaigns that aren't archived. */
  campaigns: number;
  /** Creative requests per calendar month. */
  creativesPerMonth: number;
  /**
   * Client businesses a freelancer can run at once. Absent on business plans,
   * which are one business by definition.
   *
   * This is the thing freelancer pricing scales on. A business pays more as it
   * advertises more; a freelancer pays more as they take on more clients, and
   * the per-client limits below apply to each of those clients separately.
   */
  clients?: number;
};

export type Plan = {
  tier: SubscriptionTier;
  name: string;
  priceMonthly: number;
  tagline: string;
  spendGuidance: string;
  featured?: boolean;
  limits: PlanLimits;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    tier: "STARTER",
    name: "Starter",
    priceMonthly: 49,
    tagline: "Get your first campaign live on Meta.",
    spendGuidance: "Best for $100–500/mo in ad spend",
    limits: { campaigns: 1, creativesPerMonth: 2 },
    features: [
      "Meta advertising — Facebook + Instagram",
      "AI campaign builder",
      "AI-written ad copy, unlimited rewrites",
      "Creative generation",
      "Performance dashboard",
      "1 active campaign, 2 creative requests a month",
      // Said out loud rather than left as an absence. Somebody comparing the
      // cards should learn where TikTok lives from the Starter card, not by
      // picking it and hitting an upgrade prompt later.
      "Meta only — TikTok is on Growth",
    ],
  },
  {
    tier: "GROWTH",
    name: "Growth",
    priceMonthly: 99,
    tagline: "Meta and TikTok, from one place.",
    spendGuidance: "Best for $500–2,000/mo in ad spend",
    featured: true,
    limits: { campaigns: 3, creativesPerMonth: 8 },
    features: [
      "Everything in Starter",
      "Meta + TikTok advertising",
      "MAIRO sets up your TikTok account for you",
      "MAIRO posts to your TikTok for you",
      "TikTok Growth Mode",
      "TikTok-native creative generation",
      "Cross-platform analytics",
      "AI budget recommendations",
      "Creative testing",
      "3 active campaigns, 8 creative requests a month",
    ],
  },
  {
    // Shown as "Pro". The tier value stays SCALE because Stripe price ids are
    // keyed off it in the environment — renaming it would leave every existing
    // subscriber matching no STRIPE_PRICE_* variable, and the webhook would
    // read that as having no plan at all.
    tier: "SCALE",
    name: "Pro",
    priceMonthly: 199,
    tagline: "Let MAIRO run the budget.",
    spendGuidance: "Best for $2,000+/mo in ad spend",
    limits: { campaigns: 10, creativesPerMonth: 20 },
    features: [
      "Everything in Growth",
      "Advanced AI optimization",
      "Mairo Auto Optimize",
      "Automatic budget allocation",
      "Advanced creative testing",
      "Advanced analytics",
      "Priority campaign processing",
      "Future advertising platforms as they land",
      "10 active campaigns, 20 creative requests a month",
    ],
  },
];

/**
 * Plans for someone running ads as their job rather than for their own
 * business.
 *
 * Kept out of PLANS on purpose: the landing page's pricing grid renders PLANS,
 * and a business owner comparing Starter against Growth should not be shown an
 * agency tier. These surface on the freelancer side of the site instead.
 *
 * The per-client limits are Growth-level, because a freelancer's client is a
 * real business running real campaigns — the freelancer is paying for reach
 * across several of them, not for a cheaper version of the product.
 *
 * PRICES ARE A STARTING POINT, not a recommendation. They need to be checked
 * against what a freelancer in this market actually charges their own clients.
 */
export const FREELANCER_PLANS: Plan[] = [
  {
    tier: "STUDIO",
    name: "Studio",
    priceMonthly: 149.99,
    tagline: "For a freelancer with a handful of clients.",
    spendGuidance: "Up to 5 client businesses",
    limits: { campaigns: 3, creativesPerMonth: 6, clients: 5 },
    features: [
      "Up to 5 client businesses",
      "3 active campaigns per client",
      "6 creative requests a month per client",
      "Switch between clients from one login",
      "All three AI specialists on every client",
      "Meta + TikTok, with separate ad accounts per client",
    ],
  },
  {
    tier: "AGENCY",
    name: "Agency",
    priceMonthly: 399.99,
    tagline: "For a book of business.",
    spendGuidance: "Up to 20 client businesses",
    featured: true,
    limits: { campaigns: 10, creativesPerMonth: 20, clients: 20 },
    features: [
      "Everything in Studio",
      "Up to 20 client businesses",
      "10 active campaigns per client",
      "20 creative requests a month per client",
      "Video creative included",
      "48-hour creative turnaround",
    ],
  },
];

/** Every plan that exists, whichever side of the product it belongs to. */
export const ALL_PLANS: Plan[] = [...PLANS, ...FREELANCER_PLANS];

/** True for the tiers that come with client businesses attached. */
export function isFreelancerTier(tier: SubscriptionTier): boolean {
  return tier === "STUDIO" || tier === "AGENCY";
}

// What an organization on NONE — nobody who has paid — is allowed to do.
//
// This is a switch, and it is deliberately off by default.
//
// While off, NONE is treated as Starter: everyone gets a working product for
// free. That is how MAIRO shipped, and it is what the Meta App Review
// submission tells the reviewer to expect — "billing is not yet enabled, so
// this account has full access". Turning enforcement on before that review
// completes would put a paywall in front of a reviewer we promised wouldn't
// see one, which is a rejection.
//
// Set BILLING_ENFORCED=1 once App Review is through. Then an organization
// without a subscription can still sign up, look around, and talk to the AI —
// but cannot run campaigns or spend a creative request, which are the two
// things that cost real money to serve.
const DEFAULT_TIER: SubscriptionTier = "STARTER";

export function billingEnforced(): boolean {
  return process.env.BILLING_ENFORCED?.trim() === "1";
}

const UNSUBSCRIBED: Plan = {
  tier: "NONE",
  name: "No plan",
  priceMonthly: 0,
  tagline: "Pick a plan to start running ads.",
  spendGuidance: "",
  limits: { campaigns: 0, creativesPerMonth: 0 },
  features: [
    "Look around the dashboard",
    "Talk to the AI specialists",
    "Choose a plan whenever you're ready",
  ],
};

export function planFor(tier: SubscriptionTier): Plan {
  if (tier === "NONE") {
    return billingEnforced()
      ? UNSUBSCRIBED
      : PLANS.find((p) => p.tier === DEFAULT_TIER) ?? PLANS[0];
  }
  return ALL_PLANS.find((p) => p.tier === tier) ?? PLANS[0];
}

export function limitsFor(tier: SubscriptionTier): PlanLimits {
  return planFor(tier).limits;
}
