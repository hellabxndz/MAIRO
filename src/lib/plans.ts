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
    priceMonthly: 29,
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
    priceMonthly: 79,
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
    priceMonthly: 199,
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

// Organizations start on NONE because there's no billing yet. Treat them as
// Starter so the limits are live and testable from day one; the owner can
// raise a tier by hand from the AIOS dashboard after taking payment.
const DEFAULT_TIER: SubscriptionTier = "STARTER";

export function planFor(tier: SubscriptionTier): Plan {
  const resolved = tier === "NONE" ? DEFAULT_TIER : tier;
  return PLANS.find((p) => p.tier === resolved) ?? PLANS[0];
}

export function limitsFor(tier: SubscriptionTier): PlanLimits {
  return planFor(tier).limits;
}
