import type { SubscriptionTier } from "@/generated/prisma/enums";

// Single source of truth for what each plan costs and what it allows.
// The landing page renders from this, and the server actions enforce from
// it, so the marketing copy and the product can't drift apart.
//
// Limits are set around what actually costs us money: creative requests are
// real production work, and each live campaign is real oversight. AI agent
// chat is deliberately unlimited on every tier — it costs cents to serve and
// it's the thing that keeps people logging in.

export type PlanLimits = {
  /** Campaigns that aren't archived. */
  campaigns: number;
  /** Creative requests per calendar month. */
  creativesPerMonth: number;
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
    priceMonthly: 39.99,
    tagline: "Get your first campaign live.",
    spendGuidance: "Best for $100–500/mo in ad spend",
    limits: { campaigns: 1, creativesPerMonth: 2 },
    features: [
      "1 active campaign",
      "2 creative requests a month",
      "AI-written ad copy, unlimited rewrites",
      "Monthly AI strategy plan",
      "All three AI specialists, unlimited chat",
      "Performance dashboard",
    ],
  },
  {
    tier: "GROWTH",
    name: "Growth",
    priceMonthly: 99.99,
    tagline: "What most businesses run on.",
    spendGuidance: "Best for $500–2,000/mo in ad spend",
    featured: true,
    limits: { campaigns: 3, creativesPerMonth: 6 },
    features: [
      "Everything in Starter",
      "3 active campaigns",
      "6 creative requests a month",
      "Custom images and graphics designed for you",
      "A/B creative testing",
      "Weekly optimization pass",
    ],
  },
  {
    tier: "SCALE",
    name: "Scale",
    priceMonthly: 249.99,
    tagline: "For spend that needs real attention.",
    spendGuidance: "Best for $2,000+/mo in ad spend",
    limits: { campaigns: 10, creativesPerMonth: 20 },
    features: [
      "Everything in Growth",
      "10 active campaigns",
      "20 creative requests a month, video included",
      "Human strategist review every month",
      "Advanced retargeting and audience setup",
      "48-hour creative turnaround",
    ],
  },
];

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
  return PLANS.find((p) => p.tier === tier) ?? PLANS[0];
}

export function limitsFor(tier: SubscriptionTier): PlanLimits {
  return planFor(tier).limits;
}
