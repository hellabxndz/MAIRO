// The default credit cost of each Creative Studio action. Pure, so the
// pricing page can say "about N pictures" from the same number the Studio
// charges (pricing.ts reads a database override on top of these).

export type CreditCosts = {
  /** One image, gpt-image "medium" quality. */
  standard: number;
  /** One image, "high" quality — visibly better, costs roughly 4x more to make. */
  premium: number;
  /** One natural-language change to an existing image. */
  edit: number;
  /** ONE image inside a "generate N variations" batch — multiply by N yourself. */
  variation: number;
};

export const DEFAULT_COSTS: CreditCosts = {
  standard: 5,
  premium: 15,
  edit: 5,
  variation: 4,
};
