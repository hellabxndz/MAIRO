/**
 * Centralized subscription configuration. Prices, allowances and feature
 * access are defined here ONCE; the marketing page, billing page, entitlement
 * checks and usage limits all read from this file. Change a price here (or via
 * the PLAN_PRICE_* env overrides) and every surface follows.
 */

export const PLAN_KEYS = ["starter", "growth", "pro", "enterprise"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const FEATURES = [
  "website_assistant",
  "product_questions",
  "basic_support",
  "custom_personality",
  "customer_inbox",
  "basic_analytics",
  "sales_assistance",
  "shopify_order_lookup",
  "order_tracking",
  "customer_profiles",
  "return_exchange_requests",
  "human_escalation",
  "advanced_automation",
  "advanced_analytics",
  "team_access",
  "priority_support",
  "expanded_customization",
  "multiple_stores",
  "custom_workflows",
  "advanced_integrations",
  "dedicated_onboarding",
] as const;
export type Feature = (typeof FEATURES)[number];

export type PlanLimits = {
  /** Customer conversations per billing period. */
  conversationsPerMonth: number;
  /** Model requests per billing period (a conversation makes several). */
  aiRequestsPerMonth: number;
  /** Team seats including the owner. */
  seats: number;
  /** Connected stores. */
  stores: number;
  /** Knowledge base documents. */
  knowledgeDocuments: number;
};

/** What happens when the allowance runs out. */
export type OverLimitBehavior = "handoff_to_human" | "allow_with_overage";

export type Plan = {
  key: PlanKey;
  name: string;
  tagline: string;
  /** Monthly price in cents. For enterprise this is the starting price. */
  monthlyPriceCents: number;
  priceIsStartingAt: boolean;
  customPricing: boolean;
  highlights: string[];
  inherits?: PlanKey;
  features: Feature[];
  limits: PlanLimits;
  overLimit: OverLimitBehavior;
  /** Notify the owner when usage crosses this fraction of an allowance. */
  warnAt: number;
  selfServe: boolean;
};

const STARTER_FEATURES: Feature[] = [
  "website_assistant",
  "product_questions",
  "basic_support",
  "custom_personality",
  "customer_inbox",
  "basic_analytics",
];
const GROWTH_FEATURES: Feature[] = [
  ...STARTER_FEATURES,
  "sales_assistance",
  "shopify_order_lookup",
  "order_tracking",
  "customer_profiles",
  "return_exchange_requests",
  "human_escalation",
];
const PRO_FEATURES: Feature[] = [
  ...GROWTH_FEATURES,
  "advanced_automation",
  "advanced_analytics",
  "team_access",
  "priority_support",
  "expanded_customization",
];
const ENTERPRISE_FEATURES: Feature[] = [
  ...PRO_FEATURES,
  "multiple_stores",
  "custom_workflows",
  "advanced_integrations",
  "dedicated_onboarding",
];

function priceOverride(key: PlanKey, fallback: number) {
  const raw = typeof process !== "undefined" ? process.env[`PLAN_PRICE_${key.toUpperCase()}_CENTS`] : undefined;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    name: "Starter",
    tagline: "Your first AI employee on the website.",
    monthlyPriceCents: priceOverride("starter", 14900),
    priceIsStartingAt: false,
    customPricing: false,
    highlights: [
      "AI website assistant",
      "Basic product questions",
      "Basic customer support",
      "Custom AI personality",
      "Customer inbox",
      "Basic analytics",
    ],
    features: STARTER_FEATURES,
    limits: { conversationsPerMonth: 1000, aiRequestsPerMonth: 5000, seats: 1, stores: 1, knowledgeDocuments: 25 },
    overLimit: "handoff_to_human",
    warnAt: 0.8,
    selfServe: true,
  },
  growth: {
    key: "growth",
    name: "Growth",
    tagline: "Sell more and handle orders automatically.",
    monthlyPriceCents: priceOverride("growth", 29900),
    priceIsStartingAt: false,
    customPricing: false,
    inherits: "starter",
    highlights: [
      "AI sales assistance",
      "Shopify order lookup",
      "Order tracking",
      "Customer profiles",
      "Return and exchange requests",
      "Human escalation",
    ],
    features: GROWTH_FEATURES,
    limits: { conversationsPerMonth: 3000, aiRequestsPerMonth: 15000, seats: 1, stores: 1, knowledgeDocuments: 100 },
    overLimit: "handoff_to_human",
    warnAt: 0.8,
    selfServe: true,
  },
  pro: {
    key: "pro",
    name: "Pro",
    tagline: "More AI, more control, and your whole team.",
    monthlyPriceCents: priceOverride("pro", 49900),
    priceIsStartingAt: false,
    customPricing: false,
    inherits: "growth",
    highlights: [
      "Advanced automation",
      "More AI usage",
      "Advanced analytics",
      "Team access",
      "Priority support",
      "Expanded customization",
    ],
    features: PRO_FEATURES,
    limits: { conversationsPerMonth: 8000, aiRequestsPerMonth: 40000, seats: 10, stores: 1, knowledgeDocuments: 500 },
    overLimit: "handoff_to_human",
    warnAt: 0.8,
    selfServe: true,
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    tagline: "Custom workflows for multi-store brands.",
    monthlyPriceCents: priceOverride("enterprise", 99900),
    priceIsStartingAt: true,
    customPricing: true,
    inherits: "pro",
    highlights: [
      "Multiple stores",
      "Custom workflows",
      "Higher usage limits",
      "Advanced integrations",
      "Dedicated onboarding",
      "Custom support arrangements",
    ],
    features: ENTERPRISE_FEATURES,
    limits: { conversationsPerMonth: 25000, aiRequestsPerMonth: 125000, seats: 50, stores: 10, knowledgeDocuments: 5000 },
    overLimit: "allow_with_overage",
    warnAt: 0.8,
    selfServe: false,
  },
};

export const PLAN_LIST: Plan[] = PLAN_KEYS.map((k) => PLANS[k]);

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && (PLAN_KEYS as readonly string[]).includes(value);
}

/** Statuses under which a subscription grants its plan's features. */
const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

export type SubscriptionState = { plan_key: string; status: string } | null | undefined;

/** The plan a business is currently entitled to, or null (no paid plan). */
export function entitledPlan(sub: SubscriptionState): Plan | null {
  if (!sub || !isPlanKey(sub.plan_key) || !ENTITLED_STATUSES.has(sub.status)) return null;
  return PLANS[sub.plan_key];
}

export function hasFeature(sub: SubscriptionState, feature: Feature) {
  return entitledPlan(sub)?.features.includes(feature) ?? false;
}

/** The cheapest plan that includes a feature (for upgrade prompts). */
export function minimumPlanFor(feature: Feature): Plan {
  return PLAN_LIST.find((p) => p.features.includes(feature)) ?? PLANS.enterprise;
}

export function formatPlanPrice(plan: Plan) {
  const dollars = plan.monthlyPriceCents / 100;
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  }).format(dollars);
  return plan.priceIsStartingAt ? `From ${amount}` : amount;
}

export type UsageState = { conversations: number; aiRequests: number };

/** Allowance status used for warnings and the configured over-limit behavior. */
export function usageStatus(plan: Plan, usage: UsageState) {
  const convRatio = usage.conversations / plan.limits.conversationsPerMonth;
  const reqRatio = usage.aiRequests / plan.limits.aiRequestsPerMonth;
  const ratio = Math.max(convRatio, reqRatio);
  return {
    ratio,
    warning: ratio >= plan.warnAt && ratio < 1,
    exceeded: ratio >= 1,
    behavior: ratio >= 1 ? plan.overLimit : null,
  } as const;
}
