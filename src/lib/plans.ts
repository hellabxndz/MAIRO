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
  /**
   * The one thing this plan adds over the one below it, in three or four
   * words.
   *
   * The pricing grid used to be three columns of identically-shaped dashes,
   * and telling Starter from Growth meant reading fourteen bullets and
   * diffing them in your head. Nobody does that; they pick the middle one or
   * they leave. This is the line that answers "why would I pay more" before
   * any list is read.
   */
  headline: string;
  /**
   * The plan this one contains, when it builds on another.
   *
   * With this set, `features` lists only what is genuinely NEW — so the
   * length of the list is the size of the upgrade rather than an artefact of
   * how much got restated.
   */
  inherits?: string;
  /** Only what this plan adds. Everything below it comes via `inherits`. */
  features: string[];
};

/**
 * Days of free trial on every client plan.
 *
 * One constant rather than a number typed into Stripe and again into the
 * marketing copy — those two drift, and the version that drifts is always the
 * one on the page promising longer than the card actually gives.
 *
 * Zero switches trials off everywhere at once.
 */
export const TRIAL_DAYS = 7;

export const PLANS: Plan[] = [
  {
    tier: "STARTER",
    name: "Starter",
    priceMonthly: 199,
    tagline: "Your advertising department, on Meta.",
    spendGuidance: "Best for businesses starting paid advertising",
    // Unlimited rather than one. A cap of one campaign made the product worse
    // at the thing it is for: a business with a summer sale and an evergreen
    // offer has two campaigns, and charging them to have a second one taught
    // them to cram both into one and get worse results. Creative generation
    // still has a monthly ceiling, because each one costs real money to make.
    limits: { campaigns: Infinity, creativesPerMonth: 20 },
    headline: "Facebook and Instagram",
    features: [
      "Meta advertising — Facebook and Instagram",
      "AI strategy built from your business",
      "AI campaign builder",
      "AI creative generation",
      "Your Mairo assistant, unlimited questions",
      "Campaign analytics in plain English",
      "Assisted automation — Mairo handles the small changes",
      "Unlimited campaigns, subject to fair use",
    ],
  },
  {
    tier: "GROWTH",
    name: "Growth",
    priceMonthly: 399,
    tagline: "Meta and TikTok, from one place.",
    spendGuidance: "Best for businesses advertising on more than one network",
    featured: true,
    limits: { campaigns: Infinity, creativesPerMonth: 60 },
    headline: "Adds TikTok",
    inherits: "Starter",
    features: [
      "TikTok ads alongside Meta, from one campaign",
      "Mairo sets up your TikTok account for you",
      "Advanced analytics, every metric explained",
      "More creative generation",
      "Creative performance intelligence",
      "AI budget recommendations",
      "Priority AI processing",
    ],
  },
  {
    // The tier value stays SCALE whatever this plan is called. Stripe price ids
    // are keyed off it in the environment, so renaming the enum would leave
    // every existing subscriber matching no STRIPE_PRICE_* variable and the
    // webhook would read that as having no plan at all. `name` is the only
    // customer-facing part and is safe to change — everything that says it out
    // loud reads it from here rather than hard-coding it, so this line is the
    // single place the plan is named.
    tier: "SCALE",
    name: "Scale",
    priceMonthly: 699,
    tagline: "Let Mairo run the budget.",
    spendGuidance: "Best for businesses running advertising continuously",
    limits: { campaigns: Infinity, creativesPerMonth: 150 },
    headline: "Adds Autopilot",
    inherits: "Growth",
    features: [
      "Full Autopilot — Mairo manages campaigns inside your limits",
      "Custom optimisation rules",
      "Higher creative limits",
      "Multiple businesses from one account",
      "Advanced reporting",
      "Mairo posts to your Instagram and TikTok for you",
      "Priority support",
      "Future advertising platforms as they land",
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
    headline: "Up to 5 clients",
    features: [
      "3 active campaigns per client",
      "6 creative requests a month per client",
      "Switch between clients from one login",
      "MAIRO AI on every client, in that client's context",
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
    headline: "Up to 20 clients",
    inherits: "Studio",
    features: [
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
  headline: "Nothing runs yet",
  features: [
    "Look around the dashboard",
    "Talk to MAIRO AI",
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
