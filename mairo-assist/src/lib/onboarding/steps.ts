export const ONBOARDING_STEPS = [
  { n: 1, key: "business", title: "Your business", question: "What's your business name and website?" },
  { n: 2, key: "sells", title: "What you sell", question: "What does your business sell?" },
  { n: 3, key: "goals", title: "AI goals", question: "What would you like your AI employee to help with?" },
  { n: 4, key: "name", title: "Customize your AI", question: "What should we call your AI employee?" },
  { n: 5, key: "shopify", title: "Connect Shopify", question: "Connect your Shopify store" },
  { n: 6, key: "policies", title: "Policies", question: "Teach your AI employee your policies" },
  { n: 7, key: "preview", title: "Test your AI", question: "Test your AI employee" },
  { n: 8, key: "activate", title: "Activate", question: "Activate your AI employee" },
] as const;

export const TOTAL_STEPS = ONBOARDING_STEPS.length;
/** Stored in business_settings.onboarding_step once every step is done. */
export const COMPLETED_STEP = TOTAL_STEPS + 1;

/**
 * Which step to show. Users may revisit any step they've reached, but never
 * jump ahead of their saved progress.
 */
export function resolveStep(saved: number, requested: unknown): number {
  const reached = Math.min(Math.max(1, Math.trunc(saved) || 1), TOTAL_STEPS);
  const n = typeof requested === "string" ? Number.parseInt(requested, 10) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= reached) return n;
  return reached;
}

/** Progress after finishing step `n` — never moves backwards. */
export function advance(saved: number, finished: number): number {
  return Math.min(Math.max(saved, finished + 1), COMPLETED_STEP);
}
