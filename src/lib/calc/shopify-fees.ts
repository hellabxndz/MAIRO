import { Inputs, type Result } from "./economics";

// Shopify plan costs for a month of sales.
//
// Shopify sets these rates and changes them; they also differ by country. The
// defaults below are United States list rates as summarised by the public
// sources named in SOURCES, as of the date in RATES_CHECKED. They could not be
// confirmed against shopify.com/pricing from MAIRO's build environment, so
// the page says so, links to Shopify's pricing page, and lets every rate be
// edited. Nothing here is presented as Shopify's official figure.

export const RATES_CHECKED = "12 October 2026";
export const OFFICIAL_PRICING_URL = "https://www.shopify.com/pricing";
export const SOURCES = [
  { name: "OneCart — Shopify fees", url: "https://www.getonecart.com/shopify-fees/" },
  { name: "Rigby — Shopify cost", url: "https://rigbyjs.com/blog/shopify-cost" },
  { name: "Charle Agency — Shopify pricing", url: "https://charleagency.com/articles/shopify-pricing" },
];

export type ShopifyPlanRates = {
  id: string;
  name: string;
  /** Subscription per month, billed monthly. */
  monthly: number;
  /** Subscription per month, billed yearly. */
  yearly: number;
  /** Shopify Payments online card rate, % of the order. */
  cardPct: number;
  /** Shopify Payments online card fee, fixed per order. */
  cardFixed: number;
  /** Extra transaction fee when using a payment provider other than Shopify Payments, %. */
  thirdPartyPct: number;
};

export const DEFAULT_RATES: ShopifyPlanRates[] = [
  { id: "basic", name: "Basic", monthly: 39, yearly: 29, cardPct: 2.9, cardFixed: 0.3, thirdPartyPct: 2 },
  { id: "grow", name: "Grow", monthly: 105, yearly: 79, cardPct: 2.7, cardFixed: 0.3, thirdPartyPct: 1 },
  { id: "advanced", name: "Advanced", monthly: 399, yearly: 299, cardPct: 2.5, cardFixed: 0.3, thirdPartyPct: 0.6 },
];

export type FeeInput = {
  monthlySales: number | null;
  orders: number | null;
  billing: "monthly" | "yearly";
  payments: "shopify" | "other";
  /** With another provider: their own rate and fixed fee, which Shopify doesn't set. */
  providerPct?: number | null;
  providerFixed?: number | null;
};

export type PlanCost = { id: string; name: string; subscription: number; cardFees: number; shopifyTransactionFees: number; total: number; shareOfSales: number | null };

export function compareShopifyPlans(input: FeeInput, rates: ShopifyPlanRates[] = DEFAULT_RATES): Result<{ plans: PlanCost[]; cheapest: string | null }> {
  const i = new Inputs();
  const sales = i.money("monthlySales", "your monthly sales", input.monthlySales);
  const orders = i.count("orders", "the number of orders", input.orders, { min: 0, max: 10_000_000 });
  const providerPct = input.payments === "other" ? i.rate("providerPct", "your payment provider's rate", input.providerPct ?? 0, { required: false, max: 20 }) : 0;
  const providerFixed = input.payments === "other" ? i.money("providerFixed", "your payment provider's fixed fee", input.providerFixed ?? 0, { required: false }) : 0;
  rates.forEach((r, n) => {
    i.money(`rates.${n}.monthly`, `${r.name}'s monthly price`, r.monthly);
    i.rate(`rates.${n}.cardPct`, `${r.name}'s card rate`, r.cardPct, { max: 20 });
    i.rate(`rates.${n}.thirdPartyPct`, `${r.name}'s third-party fee`, r.thirdPartyPct, { max: 20 });
  });
  return i.done(() => {
    const plans = rates.map((r) => {
      const subscription = input.billing === "yearly" ? r.yearly : r.monthly;
      const cardFees = input.payments === "shopify" ? sales * (r.cardPct / 100) + orders * r.cardFixed : sales * providerPct + orders * providerFixed;
      const shopifyTransactionFees = input.payments === "other" ? sales * (r.thirdPartyPct / 100) : 0;
      const total = subscription + cardFees + shopifyTransactionFees;
      return { id: r.id, name: r.name, subscription, cardFees, shopifyTransactionFees, total, shareOfSales: sales > 0 ? total / sales : null };
    });
    const cheapest = plans.length ? plans.reduce((a, b) => (b.total < a.total ? b : a)).id : null;
    return { plans, cheapest };
  }, ["Card fees use the online rate. In-person rates, currency conversion, international cards, apps and themes aren't included."]);
}
