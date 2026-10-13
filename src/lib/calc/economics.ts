// The arithmetic behind MAIRO's calculators — the free tools and the signed-in
// dashboard use these same functions, so a number can't mean one thing in one
// place and another somewhere else.
//
// Rules every function here keeps:
//   - Deterministic. No AI does arithmetic; AI may only explain a result.
//   - Every input is the owner's own assumption. Nothing here supplies a CPC,
//     conversion rate or close rate as if it were a fact.
//   - A result that doesn't exist says so. Dividing by zero, or a sale that
//     loses money before any advertising, returns a reason — never Infinity,
//     NaN, or a threshold that can't be met.
//   - Words match what's counted. "Contribution" is revenue less variable costs;
//     "operating profit" is before tax and anything the owner didn't enter;
//     nothing here is called "net profit" or "actual revenue".
//
// Rates are entered as percentages (20 means 20%) and validated to 0–100.
// Money is a plain number in one currency the caller chooses; mixing
// currencies inside one calculation isn't supported and isn't attempted.
//
// scripts/check-calculators.ts pins the formulas, the reference examples and
// the edge cases.

export type Problem = { field: string; message: string };
export type Result<T> = { ok: true; value: T; notes: string[] } | { ok: false; problems: Problem[] };

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Validates money and rates up front, so every calculator reports bad input the same way. */
export class Inputs {
  problems: Problem[] = [];
  money(field: string, label: string, v: number | null | undefined, opts: { required?: boolean; allowZero?: boolean } = {}): number {
    const { required = true, allowZero = true } = opts;
    if (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))) {
      if (required) this.problems.push({ field, message: `Enter ${label}.` });
      return 0;
    }
    if (!finite(v)) {
      this.problems.push({ field, message: `${cap(label)} must be a number.` });
      return 0;
    }
    if (v < 0) this.problems.push({ field, message: `${cap(label)} can't be negative.` });
    else if (v === 0 && !allowZero) this.problems.push({ field, message: `${cap(label)} must be more than zero.` });
    else if (v > 1e10) this.problems.push({ field, message: `${cap(label)} is too large to be right.` });
    return v;
  }
  /** A percentage, 0–100. `max` lowers the ceiling where 100% makes no sense (a margin of 100%). */
  rate(field: string, label: string, v: number | null | undefined, opts: { required?: boolean; allowZero?: boolean; max?: number } = {}): number {
    const { required = true, allowZero = true, max = 100 } = opts;
    if (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))) {
      if (required) this.problems.push({ field, message: `Enter ${label}.` });
      return 0;
    }
    if (!finite(v) || v < 0 || v > max) this.problems.push({ field, message: `${cap(label)} must be between 0 and ${max}%.` });
    else if (v === 0 && !allowZero) this.problems.push({ field, message: `${cap(label)} must be more than 0%.` });
    return v / 100;
  }
  count(field: string, label: string, v: number | null | undefined, opts: { min?: number; max?: number; required?: boolean } = {}): number {
    const { min = 0, max = 1e9, required = true } = opts;
    if (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))) {
      if (required) this.problems.push({ field, message: `Enter ${label}.` });
      return 0;
    }
    if (!finite(v) || v < min || v > max) this.problems.push({ field, message: `${cap(label)} must be between ${min} and ${max.toLocaleString("en-US")}.` });
    return v;
  }
  done<T>(value: () => T, notes: string[] = []): Result<T> {
    return this.problems.length ? { ok: false, problems: this.problems } : { ok: true, value: value(), notes };
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// --- Margin and markup --------------------------------------------------------

export type MarginMarkup = {
  profit: number;
  /** Profit ÷ price. Null when the price is zero. */
  margin: number | null;
  /** Profit ÷ cost. Null when the cost is zero. */
  markup: number | null;
};

/** Margin divides by the price; markup divides by the cost. Same profit, different denominators. */
export function marginMarkup(input: { cost: number | null; price: number | null }): Result<MarginMarkup> {
  const i = new Inputs();
  const cost = i.money("cost", "the cost", input.cost);
  const price = i.money("price", "the price", input.price);
  const notes: string[] = [];
  if (!i.problems.length) {
    if (price === 0) notes.push("With a price of zero there's no margin to work out.");
    if (cost === 0) notes.push("With a cost of zero, markup isn't defined — every dollar of the price is profit.");
    if (price < cost) notes.push("The price is below the cost, so each sale loses money before any other costs.");
  }
  return i.done(() => {
    const profit = price - cost;
    return { profit, margin: price > 0 ? profit / price : null, markup: cost > 0 ? profit / cost : null };
  }, notes);
}

/** The price that gives a target margin: cost ÷ (1 − margin). No price gives a margin of 100% or more. */
export function priceForMargin(input: { cost: number | null; marginPct: number | null }): Result<{ price: number }> {
  const i = new Inputs();
  const cost = i.money("cost", "the cost", input.cost, { allowZero: false });
  const m = i.rate("marginPct", "the target margin", input.marginPct, { max: 99.99 });
  return i.done(() => ({ price: cost / (1 - m) }));
}

/** The price that gives a target markup: cost × (1 + markup). */
export function priceForMarkup(input: { cost: number | null; markupPct: number | null }): Result<{ price: number }> {
  const i = new Inputs();
  const cost = i.money("cost", "the cost", input.cost, { allowZero: false });
  const k = i.count("markupPct", "the target markup", input.markupPct, { min: 0, max: 10_000 }) / 100;
  return i.done(() => ({ price: cost * (1 + k) }));
}

// --- Contribution per sale ------------------------------------------------------

export type SaleInput = {
  /** What the customer pays, before any discount. */
  price: number | null;
  /** Average discount given, % of price. */
  discountPct?: number | null;
  /** Share of sales refunded, %. Refunded revenue is lost; the item's costs are assumed not to be recovered. */
  refundPct?: number | null;
  /** Cost of the product or of doing the job. */
  productCost: number | null;
  /** Shipping, packaging, travel — per sale. */
  fulfilmentCost?: number | null;
  /** Card or payment fee, % of the amount charged. */
  paymentFeePct?: number | null;
  /** Card or payment fee, fixed per sale. */
  paymentFeeFixed?: number | null;
  /** Anything else that's paid on every sale (commission, materials). */
  otherVariableCost?: number | null;
};

export type SaleEconomics = {
  /** Expected money kept from one sale after discounts and refunds. */
  netRevenue: number;
  variableCosts: number;
  /** Net revenue − variable costs: what one sale leaves to pay for ads, overhead and profit. */
  contribution: number;
  contributionMargin: number | null;
};

export function saleEconomics(input: SaleInput): Result<SaleEconomics> {
  const i = new Inputs();
  const price = i.money("price", "the price", input.price, { allowZero: false });
  const discount = i.rate("discountPct", "the discount", input.discountPct ?? 0, { required: false });
  const refund = i.rate("refundPct", "the refund rate", input.refundPct ?? 0, { required: false });
  const product = i.money("productCost", "the product or job cost", input.productCost);
  const fulfil = i.money("fulfilmentCost", "the shipping or delivery cost", input.fulfilmentCost ?? 0, { required: false });
  const feePct = i.rate("paymentFeePct", "the payment fee", input.paymentFeePct ?? 0, { required: false, max: 20 });
  const feeFixed = i.money("paymentFeeFixed", "the fixed payment fee", input.paymentFeeFixed ?? 0, { required: false });
  const other = i.money("otherVariableCost", "other per-sale costs", input.otherVariableCost ?? 0, { required: false });
  const notes: string[] = [];
  if (refund > 0) notes.push("Refunds are counted as lost revenue with the item's costs still paid — the cautious assumption.");
  return i.done(() => {
    const charged = price * (1 - discount);
    const netRevenue = charged * (1 - refund);
    const variableCosts = product + fulfil + other + charged * feePct + feeFixed;
    const contribution = netRevenue - variableCosts;
    if (contribution <= 0) notes.push("Each sale loses money before any advertising. More ad spend can't fix that — the price or the costs have to change.");
    return { netRevenue, variableCosts, contribution, contributionMargin: netRevenue > 0 ? contribution / netRevenue : null };
  }, notes);
}

// --- Break-even ROAS and acquisition cost ----------------------------------------------

export type BreakEven = {
  contribution: number;
  /** Net revenue ÷ contribution. Null when a sale doesn't contribute anything. */
  breakEvenRoas: number | null;
  /** The most one sale can cost in ads before it loses money: the contribution. */
  breakEvenCpa: number | null;
  /** Keeping a reserve per sale: contribution − reserve. Null when the reserve uses up the contribution. */
  targetCpa: number | null;
  /** The ROAS that keeps the reserve. */
  targetRoas: number | null;
};

/**
 * Before fixed overhead. ROAS here is revenue ÷ ad spend, the way Meta reports
 * it, with revenue net of discounts and refunds.
 */
export function breakEven(sale: SaleEconomics, reservePerSale = 0): BreakEven {
  const c = sale.contribution;
  if (c <= 0) return { contribution: c, breakEvenRoas: null, breakEvenCpa: null, targetCpa: null, targetRoas: null };
  const target = c - Math.max(0, reservePerSale);
  return {
    contribution: c,
    breakEvenRoas: sale.netRevenue / c,
    breakEvenCpa: c,
    targetCpa: target > 0 ? target : null,
    targetRoas: target > 0 ? sale.netRevenue / target : null,
  };
}

// --- Ad return scenario ------------------------------------------------------------

export type ScenarioInput = {
  budget: number | null;
  cpc: number | null;
  /** Share of clicks that become a sale (or a job), %. */
  conversionPct: number | null;
};

export type Scenario = {
  clicks: number;
  sales: number;
  revenue: number;
  /** Sales × contribution − ad spend. */
  contributionAfterAds: number;
  /** Revenue ÷ ad spend. */
  roas: number;
  /** Ad spend ÷ sales; null with no modeled sales. */
  costPerSale: number | null;
};

/**
 * Modeled clicks = budget ÷ CPC; modeled sales = clicks × conversion rate;
 * contribution after ads = sales × contribution per sale − budget.
 * A model of the owner's assumptions, not a forecast.
 */
export function adScenario(input: ScenarioInput, sale: Pick<SaleEconomics, "netRevenue" | "contribution">): Result<Scenario> {
  const i = new Inputs();
  const budget = i.money("budget", "the ad budget", input.budget, { allowZero: false });
  const cpc = i.money("cpc", "the cost per click", input.cpc, { allowZero: false });
  const rate = i.rate("conversionPct", "the conversion rate", input.conversionPct);
  return i.done(() => {
    const clicks = budget / cpc;
    const sales = clicks * rate;
    const revenue = sales * sale.netRevenue;
    return {
      clicks,
      sales,
      revenue,
      contributionAfterAds: sales * sale.contribution - budget,
      roas: revenue / budget,
      costPerSale: sales > 0 ? budget / sales : null,
    };
  });
}

/**
 * The three columns of a scenario table. Conservative and optimistic are the
 * owner's own numbers; `spread` only fills them when the owner asks, and the
 * page says so.
 */
export function spreadScenario(base: { cpc: number; conversionPct: number }, spreadPct = 25): { conservative: { cpc: number; conversionPct: number }; optimistic: { cpc: number; conversionPct: number } } {
  const s = spreadPct / 100;
  return {
    conservative: { cpc: round(base.cpc * (1 + s), 2), conversionPct: round(base.conversionPct * (1 - s), 2) },
    optimistic: { cpc: round(base.cpc * (1 - s), 2), conversionPct: round(Math.min(100, base.conversionPct * (1 + s)), 2) },
  };
}

// --- Customer lifetime contribution -------------------------------------------------

export type LifetimeInput = {
  contributionPerOrder: number | null;
  ordersPerYear: number | null;
  /** How many years to count. Nothing beyond it is included. */
  years: number | null;
  /** Share of customers still buying a year later, %. 100 means everyone keeps buying. */
  retentionPct: number | null;
  /** Contribution to keep per customer after paying to win them. */
  reserve?: number | null;
};

export type Lifetime = {
  expectedOrders: number;
  /** Contribution per order × expected orders within the horizon. */
  lifetimeContribution: number;
  /** The most worth paying to win one customer, keeping the reserve. Null when nothing is left. */
  maxAcquisitionCost: number | null;
  byYear: { year: number; orders: number; contribution: number }[];
};

/**
 * Year 1 counts every customer's orders; each later year counts the share
 * still buying (retention compounds). Contribution, not revenue — a lifetime
 * of sales at no margin is worth nothing.
 */
export function lifetimeContribution(input: LifetimeInput): Result<Lifetime> {
  const i = new Inputs();
  const c = i.money("contributionPerOrder", "the contribution per order", input.contributionPerOrder);
  const perYear = i.count("ordersPerYear", "orders per year", input.ordersPerYear, { min: 0.1, max: 365 });
  const years = i.count("years", "the number of years", input.years, { min: 1, max: 10 });
  const keep = i.rate("retentionPct", "the share still buying each year", input.retentionPct);
  const reserve = i.money("reserve", "the reserve per customer", input.reserve ?? 0, { required: false });
  const notes = [`Counts ${years} year${years === 1 ? "" : "s"} only; anything a customer buys after that isn't included.`];
  if (c === 0 && !i.problems.length) notes.push("With no contribution per order, a customer is worth nothing however often they buy.");
  return i.done(() => {
    const byYear = Array.from({ length: Math.floor(years) }, (_, y) => {
      const orders = perYear * keep ** y;
      return { year: y + 1, orders, contribution: orders * c };
    });
    const expectedOrders = byYear.reduce((s, y) => s + y.orders, 0);
    const lifetime = expectedOrders * c;
    const max = lifetime - reserve;
    return { expectedOrders, lifetimeContribution: lifetime, maxAcquisitionCost: max > 0 ? max : null, byYear };
  }, notes);
}

// --- Monthly operating profit -------------------------------------------------------

export type MonthInput = {
  revenue: number | null;
  /** Everything that rises with sales: products, delivery, card fees — as an amount. */
  variableCosts: number | null;
  adSpend: number | null;
  /** Rent, wages, insurance — what's paid whatever the sales. */
  fixedCosts: number | null;
  /** Software subscriptions, including MAIRO's fee if the owner adds it. */
  softwareFees: number | null;
};

export type Month = {
  contribution: number;
  /** Contribution − ad spend − fixed costs − software fees. Before tax and anything not entered. */
  operatingProfit: number;
  /** Revenue ÷ ad spend. Null with no ad spend. */
  roas: number | null;
  /** The ad spend at which this month breaks even, at the same contribution. Null when contribution can't cover fixed costs. */
  adSpendAtBreakEven: number | null;
};

export function monthlyOperatingProfit(input: MonthInput): Result<Month> {
  const i = new Inputs();
  const revenue = i.money("revenue", "the month's sales", input.revenue);
  const variable = i.money("variableCosts", "the variable costs", input.variableCosts);
  const ads = i.money("adSpend", "the ad spend", input.adSpend);
  const fixed = i.money("fixedCosts", "the fixed costs", input.fixedCosts);
  const software = i.money("softwareFees", "the software fees", input.softwareFees ?? 0, { required: false });
  const notes = ["Operating profit here is before tax, loan payments and anything you didn't enter. It isn't net profit."];
  return i.done(() => {
    const contribution = revenue - variable;
    const operatingProfit = contribution - ads - fixed - software;
    const room = contribution - fixed - software;
    return { contribution, operatingProfit, roas: ads > 0 ? revenue / ads : null, adSpendAtBreakEven: room > 0 ? room : null };
  }, notes);
}

// --- Service business: leads, bookings, jobs ------------------------------------------

export type ServiceInput = {
  /** What a typical job is worth to the business — the invoice. */
  jobValue: number | null;
  /** Materials, subcontractors, travel — per job. */
  jobCost: number | null;
  /**
   * Either the two conditional rates (lead → booking, booking → paid job), or
   * the one total rate (lead → paid job). Never a mix: a booking-to-sale rate
   * isn't a lead-to-sale rate.
   */
  rates: { mode: "two-step"; leadToBookingPct: number | null; bookingToSalePct: number | null } | { mode: "total"; leadToSalePct: number | null };
  /** Contribution to keep per job after paying for the lead. */
  reservePerJob?: number | null;
  /** The cost per lead seen or expected, to compare against. Optional. */
  currentCpl?: number | null;
};

export type ServiceEconomics = {
  contributionPerJob: number;
  /** Lead → paid job, as a fraction. */
  leadToSale: number;
  /** Lead → booking, when known. */
  leadToBooking: number | null;
  /** Lead-to-sale × contribution per job. */
  breakEvenCpl: number | null;
  /** Lead-to-sale × (contribution − reserve). Null when the reserve uses it all up. */
  targetCpl: number | null;
  /** Break-even cost per booking: booking-to-sale × contribution. */
  breakEvenCostPerBooking: number | null;
  /** With the current CPL: ad cost per paid job, and what's left of the job. */
  atCurrentCpl: { costPerJob: number; leftPerJob: number } | null;
  leadsPerJob: number | null;
};

export function serviceEconomics(input: ServiceInput): Result<ServiceEconomics> {
  const i = new Inputs();
  const value = i.money("jobValue", "the job value", input.jobValue, { allowZero: false });
  const cost = i.money("jobCost", "the cost of doing the job", input.jobCost);
  let leadToSale = 0;
  let leadToBooking: number | null = null;
  let bookingToSale: number | null = null;
  if (input.rates.mode === "two-step") {
    leadToBooking = i.rate("leadToBookingPct", "the share of leads that book", input.rates.leadToBookingPct);
    bookingToSale = i.rate("bookingToSalePct", "the share of bookings that become paid jobs", input.rates.bookingToSalePct);
    leadToSale = leadToBooking * bookingToSale;
  } else {
    leadToSale = i.rate("leadToSalePct", "the share of leads that become paid jobs", input.rates.leadToSalePct);
  }
  const reserve = i.money("reservePerJob", "the reserve per job", input.reservePerJob ?? 0, { required: false });
  const cpl = input.currentCpl == null ? null : i.money("currentCpl", "your cost per lead", input.currentCpl, { required: false, allowZero: false });
  const notes: string[] = [];
  return i.done(() => {
    const contribution = value - cost;
    if (contribution <= 0) notes.push("Each job loses money before any advertising, so there's no cost per lead that pays. The price or the job cost has to change first.");
    if (leadToSale === 0) notes.push("With no leads becoming paid jobs, no cost per lead can pay for itself.");
    const ok = contribution > 0 && leadToSale > 0;
    const target = leadToSale * (contribution - reserve);
    return {
      contributionPerJob: contribution,
      leadToSale,
      leadToBooking,
      breakEvenCpl: ok ? leadToSale * contribution : null,
      targetCpl: ok && target > 0 ? target : null,
      breakEvenCostPerBooking: ok && bookingToSale !== null ? bookingToSale * contribution : null,
      atCurrentCpl: cpl && leadToSale > 0 ? { costPerJob: cpl / leadToSale, leftPerJob: contribution - cpl / leadToSale } : null,
      leadsPerJob: leadToSale > 0 ? 1 / leadToSale : null,
    };
  }, notes);
}

// --- Formatting -------------------------------------------------------------------

export const CURRENCIES = ["USD", "CAD", "GBP", "EUR", "AUD", "NZD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function money(n: number | null, currency: Currency = "USD", opts: { cents?: boolean } = {}): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const cents = opts.cents ?? Math.abs(n) < 1000;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(n);
}

export function percent(fraction: number | null, places = 1): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  return `${round(fraction * 100, places).toLocaleString("en-US")}%`;
}

export function times(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${round(n, 2).toLocaleString("en-US")}x`;
}

export function num(n: number | null, places = 0): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return round(n, places).toLocaleString("en-US", { maximumFractionDigits: places });
}

export function currencySymbol(currency: Currency): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? "$";
}
