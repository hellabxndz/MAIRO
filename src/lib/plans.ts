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
// autopilot" was about to become a tier comparison scattered across the campaign
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
  /** Days of free trial at checkout. Absent: no trial — billing starts when they subscribe. */
  trialDays?: number;
  /** The button on the pricing card. */
  cta?: string;
  /** A plan kept for existing subscribers and no longer sold. */
  legacy?: boolean;
};

/**
 * The free trial: MAIRO Pro only, 7 days. Scale bills from the day it starts.
 *
 * One number on the plan rather than one typed into Stripe and again into
 * the marketing copy — those two drift, and the version that drifts is always
 * the one on the page promising longer than the card actually gives. Checkout
 * and every line of copy read it through trialDaysFor().
 */
export const PRO_TRIAL_DAYS = 7;

export const PLANS: Plan[] = [
  // The two plans MAIRO sells. MAIRO runs Meta (Facebook and Instagram) only,
  // so the plans differ by how much MAIRO does on its own, how much it can
  // make, and how many businesses and people it covers. Every line that
  // separates them is something the product enforces — a limit or a flag in
  // entitlements.ts, checked on the server — not a promise in copy.
  {
    tier: "PRO",
    name: "MAIRO Pro",
    priceMonthly: 139,
    trialDays: PRO_TRIAL_DAYS,
    tagline: "A complete AI advertising system for your business.",
    spendGuidance: "For a business running its own Facebook and Instagram ads",
    limits: { campaigns: 15, creativesPerMonth: 30 },
    headline: "Your AI advertising department",
    cta: "Get Started with Pro",
    features: [
      "Connect 1 Meta advertising account",
      "All 8 AI advertising specialists",
      "AI campaign strategy and creation",
      "AI-generated ad creatives",
      "AI audience recommendations",
      "Website and business analysis",
      "AI optimization recommendations, each one yours to approve",
      "Simple and Advanced dashboard views",
      "Your latest Meta results, each time you open the dashboard",
      "AI Daily Brief",
      "Monthly performance reports",
      "50 AI creative credits a month",
      "Your approval before any campaign launches or spending changes",
    ],
  },
  {
    // SCALE_V2, not SCALE: the earlier Scale plan was $499.99 with different
    // allowances, and its subscribers keep it. Stripe price ids are keyed off
    // the tier in the environment (STRIPE_PRICE_SCALE_V2), so the two can't
    // be confused at the webhook.
    tier: "SCALE_V2",
    name: "MAIRO Scale",
    priceMonthly: 299,
    tagline: "For growing businesses, established brands and marketing teams.",
    spendGuidance: "For brands advertising every month, or more than one business",
    featured: true,
    limits: { campaigns: Infinity, creativesPerMonth: 100 },
    headline: "More accounts, more automation, your team",
    inherits: "MAIRO Pro",
    cta: "Start Scaling with MAIRO",
    // Each line here is enforced: ad_account_limit, studio_credits_monthly,
    // advanced_analytics, auto_optimize/autopilot, social_posting,
    // advanced_tracking, member_limit and growth_coach in entitlements.ts.
    features: [
      "Connect up to 3 Meta advertising accounts, one per business or brand",
      "200 AI creative credits a month",
      "Advanced performance analytics: every ad and placement side by side",
      "More AI optimization: AI Assist and Full Autopilot inside your limits, never raising your total",
      "AI-powered Instagram content creation with MAIRO Social Manager",
      "Social post approval queue",
      "Advanced revenue and lead tracking, where your store or forms connect",
      "Team members with approval permissions",
      "Advanced growth recommendations from MAIRO's Performance Coach",
      "Priority support",
      "Unlimited campaigns",
    ],
  },
];

/**
 * Plans MAIRO no longer sells, kept so existing subscribers keep exactly what
 * they bought — the same allowances, on their own Stripe prices — until they
 * choose to move to Pro or Scale. Nothing on the website offers them.
 */
export const LEGACY_PLANS: Plan[] = [
  {
    tier: "STARTER",
    name: "Starter",
    priceMonthly: 149.99,
    tagline: "MAIRO builds your ads. You approve every change.",
    spendGuidance: "An earlier plan",
    limits: { campaigns: 3, creativesPerMonth: 10 },
    headline: "Facebook & Instagram ads",
    legacy: true,
    features: [
      "Facebook and Instagram ads, built for you",
      "AI campaign builder with a safety review before launch",
      "AI-written ad text, three versions to choose from",
      "Use your own pictures, videos or past posts",
      "Your MAIRO assistant, unlimited questions",
      "Results in plain English",
      "Spend Protection: caps and a pause switch",
      "Up to 3 campaigns at a time",
      "50 AI image credits a month (about 10 pictures)",
    ],
  },
  {
    tier: "GROWTH",
    name: "Growth",
    priceMonthly: 239.99,
    tagline: "MAIRO handles the small changes for you.",
    spendGuidance: "An earlier plan",
    limits: { campaigns: 15, creativesPerMonth: 30 },
    headline: "Adds AI Assist",
    inherits: "Starter",
    legacy: true,
    features: [
      "AI Assist, when you switch it on: MAIRO pauses losing ads, tests new ones and moves budget between your campaigns — never raising your total",
      "Advanced analytics: every ad's results, side by side",
      "Up to 15 campaigns at a time",
      "150 AI image credits a month (about 30 pictures)",
    ],
  },
  {
    // The earlier Scale plan. Its enum value stays SCALE: renaming it would
    // leave every existing subscriber matching no STRIPE_PRICE_* variable,
    // which the webhook reads as having no plan at all.
    tier: "SCALE",
    name: "Scale (earlier plan)",
    priceMonthly: 499.99,
    tagline: "Your AI advertising + marketing manager.",
    spendGuidance: "An earlier plan",
    limits: { campaigns: Infinity, creativesPerMonth: 100 },
    headline: "Adds MAIRO Social Manager",
    inherits: "Growth",
    legacy: true,
    features: [
      "MAIRO Social Manager",
      "Full Autopilot, when you switch it on",
      "Unlimited campaigns",
      "400 AI image credits a month (about 80 pictures)",
      "Priority support",
    ],
  },
];

/**
 * The earlier plans for someone running ads as their job rather than for
 * their own business. No longer sold (October 2026: MAIRO sells Pro and Scale
 * only); kept so existing freelancer workspaces keep their clients, limits
 * and Stripe prices.
 */
export const FREELANCER_PLANS: Plan[] = [
  {
    tier: "STUDIO",
    name: "Studio",
    legacy: true,
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
      "Facebook and Instagram ads, with a separate ad account per client",
    ],
  },
  {
    tier: "AGENCY",
    name: "Agency",
    legacy: true,
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
    ],
  },
];

/** Every plan that exists, sold or kept for existing subscribers. */
export const ALL_PLANS: Plan[] = [...PLANS, ...LEGACY_PLANS, ...FREELANCER_PLANS];

/** The tiers that can be bought today: MAIRO Pro and MAIRO Scale. */
export const SOLD_TIERS: SubscriptionTier[] = PLANS.map((p) => p.tier);

/** Whether a tier is one MAIRO sells today (rather than kept for existing subscribers). */
export function isSoldTier(tier: SubscriptionTier): boolean {
  return SOLD_TIERS.includes(tier);
}

/** The free-trial days a plan starts with at checkout — 0 for every plan but MAIRO Pro. */
export function trialDaysFor(tier: SubscriptionTier): number {
  return ALL_PLANS.find((p) => p.tier === tier)?.trialDays ?? 0;
}

export function isFreelancerTier(tier: SubscriptionTier): boolean {
  return tier === "STUDIO" || tier === "AGENCY";
}

// What an organization on NONE — nobody who has paid — is allowed to do.
//
// This is a switch, and it is deliberately off by default.
//
// While off, NONE is treated as Growth: everyone gets a working product for
// free. Growth (an earlier plan, kept) because it is what the Meta App Review
// test account was reviewed on — changing what an unpaid account can do now
// would change what the reviewer sees mid-review. It is
// also what the submission tells the reviewer to expect — "billing is not yet enabled, so
// this account has full access". Turning enforcement on before that review
// completes would put a paywall in front of a reviewer we promised wouldn't
// see one, which is a rejection.
//
// Set BILLING_ENFORCED=1 once App Review is through. Then an organization
// without a subscription can still sign up, look around, and talk to the AI —
// but cannot run campaigns or spend a creative request, which are the two
// things that cost real money to serve.
const DEFAULT_TIER: SubscriptionTier = "GROWTH";

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
      : ALL_PLANS.find((p) => p.tier === DEFAULT_TIER) ?? PLANS[0];
  }
  return ALL_PLANS.find((p) => p.tier === tier) ?? PLANS[0];
}

export function limitsFor(tier: SubscriptionTier): PlanLimits {
  return planFor(tier).limits;
}

/**
 * A campaign limit in words, for every screen that shows one. Infinity is how
 * an unlimited plan says so, and it must never reach the screen as the word
 * "Infinity".
 */
export function campaignLimitText(n: number): string {
  if (!Number.isFinite(n)) return "unlimited campaigns";
  return n === 1 ? "1 campaign" : `${n} campaigns`;
}

/**
 * The creative-request allowance in words: the "Write an ad from a photo"
 * requests on the Creatives page, counted separately from image credits.
 */
export function creativeRequestText(n: number): string {
  if (!Number.isFinite(n)) return "unlimited creative requests a month";
  return `${n} creative request${n === 1 ? "" : "s"} a month`;
}
