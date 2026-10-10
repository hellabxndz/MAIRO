// Profit First: what advertising leaves behind once the cost of what was sold
// is taken out.
//
// Every figure is an estimate built from numbers the business entered (or its
// Business Brain margin) and Meta's tracked revenue — MAIRO has no accounting
// data, and the screen says "Estimated profit" for that reason. When the one
// number that can't be guessed is missing (the margin), profit is shown as
// unknown and the screen asks for it. Nothing is filled in to make it look
// complete.

export type ProfitInputs = {
  averageMarginPercent: number | null;
  sellingPriceCents: number | null;
  productCostCents: number | null;
  averageOrderValueCents: number | null;
  shippingCostCents: number;
  paymentFeePercent: number;
  paymentFeeFixedCents: number;
  otherMonthlyCostsCents: number;
  /** From the Business Brain, used when nothing is entered here. */
  brainMarginPercent: number | null;
};

export const DEFAULT_PROFIT_INPUTS: ProfitInputs = {
  averageMarginPercent: null,
  sellingPriceCents: null,
  productCostCents: null,
  averageOrderValueCents: null,
  shippingCostCents: 0,
  paymentFeePercent: 2.9,
  paymentFeeFixedCents: 30,
  otherMonthlyCostsCents: 0,
  brainMarginPercent: null,
};

export type MarginSource = "entered" | "price-and-cost" | "business-brain";

export function marginOf(s: ProfitInputs): { percent: number; source: MarginSource } | null {
  if (s.averageMarginPercent !== null) return { percent: s.averageMarginPercent, source: "entered" };
  if (s.sellingPriceCents && s.productCostCents !== null && s.sellingPriceCents > 0)
    return { percent: ((s.sellingPriceCents - s.productCostCents) / s.sellingPriceCents) * 100, source: "price-and-cost" };
  if (s.brainMarginPercent !== null) return { percent: s.brainMarginPercent, source: "business-brain" };
  return null;
}

/**
 * Of each dollar of revenue, what's left to pay for advertising: the margin,
 * less payment fees and per-order shipping spread over the order value.
 */
export function contributionRate(marginPercent: number, s: ProfitInputs, aovCents: number | null): number | null {
  const perOrder = s.shippingCostCents + s.paymentFeeFixedCents;
  if (perOrder > 0 && (!aovCents || aovCents <= 0)) return null;
  return marginPercent / 100 - s.paymentFeePercent / 100 - (perOrder > 0 ? perOrder / aovCents! : 0);
}

/** The ROAS at which advertising pays for itself and no more. Null when it can't be worked out, or never can. */
export function breakEvenRoas(rate: number | null): number | null {
  return rate === null || rate <= 0 ? null : 1 / rate;
}

export type ProfitFigures = { revenueCents: number | null; spendCents: number | null; purchases: number | null };

export type ProfitReport = {
  revenueCents: number | null;
  spendCents: number | null;
  customers: number | null;
  costPerCustomerCents: number | null;
  roas: number | null;
  aovCents: number | null;
  margin: { percent: number; source: MarginSource } | null;
  productCostsCents: number | null;
  shippingCents: number | null;
  feesCents: number | null;
  otherCostsCents: number;
  profitCents: number | null;
  /** Estimated profit as a share of revenue. */
  profitMargin: number | null;
  breakEvenRoas: number | null;
  status: "above" | "below" | "unknown";
  /** Plain reasons profit couldn't be estimated, or what would sharpen it. */
  missing: string[];
};

export function estimateProfit(f: ProfitFigures, s: ProfitInputs, days: number): ProfitReport {
  const revenue = f.revenueCents;
  const spend = f.spendCents;
  const orders = f.purchases;
  const aov = s.averageOrderValueCents ?? (revenue !== null && orders ? Math.round(revenue / orders) : s.sellingPriceCents);
  const margin = marginOf(s);
  const rate = margin ? contributionRate(margin.percent, s, aov) : null;
  const be = breakEvenRoas(rate);
  const roas = revenue !== null && spend ? revenue / spend : null;
  const other = Math.round((s.otherMonthlyCostsCents * days) / 30);

  const missing: string[] = [];
  if (!margin) missing.push("Your margin — what you keep from a sale before advertising.");
  if (revenue === null) missing.push("Tracked revenue — Meta hasn't reported sales values for this period.");

  const productCosts = margin && revenue !== null ? Math.round(revenue * (1 - margin.percent / 100)) : null;
  const shipping = orders !== null ? orders * s.shippingCostCents : null;
  const fees = revenue !== null ? Math.round(revenue * (s.paymentFeePercent / 100) + (orders ?? 0) * s.paymentFeeFixedCents) : null;
  const profit =
    productCosts !== null && revenue !== null && spend !== null && shipping !== null && fees !== null
      ? revenue - productCosts - spend - shipping - fees - other
      : null;

  return {
    revenueCents: revenue,
    spendCents: spend,
    customers: orders,
    costPerCustomerCents: spend !== null && orders ? Math.round(spend / orders) : null,
    roas,
    aovCents: aov ?? null,
    margin,
    productCostsCents: productCosts,
    shippingCents: shipping,
    feesCents: fees,
    otherCostsCents: other,
    profitCents: profit,
    profitMargin: profit !== null && revenue ? profit / revenue : null,
    breakEvenRoas: be,
    status: roas === null || be === null ? "unknown" : roas >= be ? "above" : "below",
    missing,
  };
}

/** One row of "where the profit comes from": an app, a campaign, before fixed costs. */
export function contributionOf(f: ProfitFigures, s: ProfitInputs): { profitCents: number | null; roas: number | null; breakEven: number | null } {
  const margin = marginOf(s);
  const aov = s.averageOrderValueCents ?? (f.revenueCents !== null && f.purchases ? Math.round(f.revenueCents / f.purchases) : s.sellingPriceCents);
  const rate = margin ? contributionRate(margin.percent, s, aov) : null;
  return {
    profitCents: rate !== null && f.revenueCents !== null && f.spendCents !== null ? Math.round(f.revenueCents * rate - f.spendCents) : null,
    roas: f.revenueCents !== null && f.spendCents ? f.revenueCents / f.spendCents : null,
    breakEven: breakEvenRoas(rate),
  };
}

/** A product's own margin and the ROAS an ad for it needs to break even. */
export function productEconomics(priceCents: number | null, costCents: number | null, s: ProfitInputs) {
  if (!priceCents || costCents === null) return { marginPercent: null, breakEven: null };
  const marginPercent = ((priceCents - costCents) / priceCents) * 100;
  return { marginPercent, breakEven: breakEvenRoas(contributionRate(marginPercent, s, priceCents)) };
}
