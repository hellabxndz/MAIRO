/**
 * Centralized subscription configuration. Prices, allowances and feature
 * access are defined here ONCE; the marketing page, billing page, entitlement
 * checks and usage limits all read from this file. Change a price here (or via
 * the PLAN_PRICE_* env overrides) and every surface follows.
 */

export const PLAN_KEYS = ["free", "starter", "growth", "pro", "enterprise"] as const;
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
  /**
   * AI responses ("credits") per calendar month: one per reply the AI sends a
   * customer. This is the allowance merchants see. Preview tests are free.
   */
  aiResponsesPerMonth: number;
  /** Model requests per month (a reply can take several). A cost guard, not shown. */
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

const FREE_FEATURES: Feature[] = ["website_assistant", "product_questions", "basic_support"];
const STARTER_FEATURES: Feature[] = [...FREE_FEATURES, "custom_personality", "customer_inbox", "basic_analytics"];
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
  free: {
    key: "free",
    name: "Free",
    tagline: "Free forever. No credit card required.",
    monthlyPriceCents: 0,
    priceIsStartingAt: false,
    customPricing: false,
    highlights: [
      "100 AI responses monthly",
      "Basic AI website assistant",
      "Basic Shopify integration",
      "Product questions",
      "Basic product recommendations",
      "Basic customer support",
      "1 AI employee",
    ],
    features: FREE_FEATURES,
    limits: { aiResponsesPerMonth: 100, aiRequestsPerMonth: 800, seats: 1, stores: 1, knowledgeDocuments: 10 },
    overLimit: "handoff_to_human",
    warnAt: 0.8,
    selfServe: true,
  },
  starter: {
    key: "starter",
    name: "Starter",
    tagline: "Your first AI employee on the website.",
    monthlyPriceCents: priceOverride("starter", 14900),
    priceIsStartingAt: false,
    customPricing: false,
    highlights: [
      "1,000 AI responses monthly",
      "Everything in Free",
      "Enhanced product assistance",
      "Custom AI personality",
      "Full customer inbox",
      "Basic analytics",
    ],
    inherits: "free",
    features: STARTER_FEATURES,
    limits: { aiResponsesPerMonth: 1000, aiRequestsPerMonth: 8000, seats: 1, stores: 1, knowledgeDocuments: 25 },
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
      "5,000 AI responses monthly",
      "Everything in Starter",
      "Advanced AI sales assistance",
      "Order tracking",
      "Customer profiles",
      "Return requests",
      "Exchange requests",
      "Enhanced analytics",
    ],
    features: GROWTH_FEATURES,
    limits: { aiResponsesPerMonth: 5000, aiRequestsPerMonth: 40000, seats: 1, stores: 1, knowledgeDocuments: 100 },
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
      "15,000 AI responses monthly",
      "Everything in Growth",
      "Advanced automation",
      "Advanced analytics",
      "Multiple employees",
      "Priority support",
      "Expanded customization",
    ],
    features: PRO_FEATURES,
    limits: { aiResponsesPerMonth: 15000, aiRequestsPerMonth: 120000, seats: 10, stores: 1, knowledgeDocuments: 500 },
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
      "Custom credits",
      "Everything in Pro",
      "Multiple stores",
      "Custom workflows",
      "Advanced integrations",
      "Dedicated onboarding",
    ],
    features: ENTERPRISE_FEATURES,
    limits: { aiResponsesPerMonth: 50000, aiRequestsPerMonth: 400000, seats: 50, stores: 10, knowledgeDocuments: 5000 },
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

/** The plan a subscription entitles to right now, or null. */
export function entitledPlan(sub: SubscriptionState): Plan | null {
  if (!sub || !isPlanKey(sub.plan_key) || !ENTITLED_STATUSES.has(sub.status)) return null;
  return PLANS[sub.plan_key];
}

/**
 * The plan that applies to a business: its entitled plan, or Free. A lapsed
 * or unpaid subscription falls back to Free, never to nothing, so a business
 * keeps its AI employee (within Free's allowance) whatever happens to billing.
 */
export function effectivePlan(sub: SubscriptionState): Plan {
  return entitledPlan(sub) ?? PLANS.free;
}

/** Plans a business can buy online (Enterprise is arranged with sales). */
export const PAID_SELF_SERVE: PlanKey[] = ["starter", "growth", "pro"];

export function isPaidSelfServe(value: unknown): value is "starter" | "growth" | "pro" {
  return typeof value === "string" && (PAID_SELF_SERVE as string[]).includes(value);
}

/** Features a plan adds over another (for "what you'd unlock" lists). */
export function addedFeatures(plan: Plan, over: Plan): Feature[] {
  return plan.features.filter((f) => !over.features.includes(f));
}

export function hasFeature(sub: SubscriptionState, feature: Feature) {
  return entitledPlan(sub)?.features.includes(feature) ?? false;
}

/** The cheapest plan that includes a feature (for upgrade prompts). */
export function minimumPlanFor(feature: Feature): Plan {
  return PLAN_LIST.find((p) => p.features.includes(feature)) ?? PLANS.enterprise;
}

export function formatPlanPrice(plan: Plan) {
  if (plan.monthlyPriceCents === 0) return "$0";
  const dollars = plan.monthlyPriceCents / 100;
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  }).format(dollars);
  return plan.priceIsStartingAt ? `From ${amount}` : amount;
}

export type UsageState = { aiResponses: number; aiRequests: number };

/** Allowance status used for warnings and the configured over-limit behavior. */
export function usageStatus(plan: Plan, usage: UsageState) {
  const respRatio = usage.aiResponses / plan.limits.aiResponsesPerMonth;
  const reqRatio = usage.aiRequests / plan.limits.aiRequestsPerMonth;
  const ratio = Math.max(respRatio, reqRatio);
  return {
    ratio,
    warning: ratio >= plan.warnAt && ratio < 1,
    exceeded: ratio >= 1,
    behavior: ratio >= 1 ? plan.overLimit : null,
  } as const;
}

/** Calendar-month allowance period (UTC), as stored in usage_counters.period_start. */
export function periodStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/** When the monthly allowance next resets: the first of next month, 00:00 UTC. */
export function nextReset(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Human-readable feature names for plan comparisons. */
export const FEATURE_LABELS: Record<Feature, string> = {
  website_assistant: "AI website assistant",
  product_questions: "Product questions and recommendations",
  basic_support: "Customer support answers",
  custom_personality: "Custom AI personality",
  customer_inbox: "Full customer inbox",
  basic_analytics: "Analytics",
  sales_assistance: "Advanced AI sales assistance",
  shopify_order_lookup: "Shopify order lookup",
  order_tracking: "Order tracking",
  customer_profiles: "Customer profiles",
  return_exchange_requests: "Return and exchange requests",
  human_escalation: "Hand-off to your team",
  advanced_automation: "Advanced automation",
  advanced_analytics: "Advanced analytics",
  team_access: "Multiple team members",
  priority_support: "Priority support",
  expanded_customization: "Expanded customization",
  multiple_stores: "Multiple stores",
  custom_workflows: "Custom workflows",
  advanced_integrations: "Advanced integrations",
  dedicated_onboarding: "Dedicated onboarding",
};
