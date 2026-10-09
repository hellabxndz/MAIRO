import type { AdGoal, LeadStatus } from "@/generated/prisma/enums";
import { costPer, leadFunnel, type LeadFunnel } from "@/lib/leads/outcomes";
import { classifyNiche, nicheById } from "@/lib/tracking/niches";

// What the advertising achieved, the way the business measures it.
//
// A shop is measured in orders and sales; a roofer, cleaner or landscaper in
// enquiries, good leads, inspections booked and jobs won. So the figures are
// chosen by the kind of business, and every one carries where it came from:
// Meta's own reporting, a count MAIRO made of the leads it stored, what the
// business marked or entered, or what its store recorded.
//
// Three rules, pinned by scripts/check-results.ts:
//
//   Nothing is a zero that is really an absence. A figure MAIRO can't know is
//   null, with the reason and where to fix it — never "$0" or "0 customers".
//
//   Meta's count is never a customer. A purchase or lead Meta reports is
//   Meta's estimate; a customer is someone the business confirmed.
//
//   A return on ad spend is shown only where attribution supports it: for a
//   leads business, from customers whose enquiry is linked to the ads; for a
//   shop, as Meta's own estimate and labelled so. Store orders come from every
//   source, so they're shown, but never divided by ad spend.
//
// Pure.

export type ResultsKind = "sales" | "leads";
export type Source = "Meta" | "MAIRO counted" | "You marked" | "You entered" | "Your store";

export type Missing = { why: string; href: string | null; action: string | null };

export type Metric = {
  key: string;
  label: string;
  /** Formatted, or null when there's no honest figure. */
  value: string | null;
  source: Source;
  /** How it's worked out, in a line. */
  hint: string;
  missing: Missing | null;
};

export type JourneyStage = {
  key: string;
  label: string;
  value: string | null;
  source: Source;
  /** "48% of those you marked" — only where both steps are real counts. */
  rate: string | null;
  missing: Missing | null;
};

export type ResultsLead = { status: LeadStatus; valueCents: number | null; /** Linked to a campaign, or from Meta's own form. */ attributed: boolean };

export type ResultsInput = {
  kind: ResultsKind;
  /** The business's names for its stages. */
  labels: Pick<Record<LeadStatus, string>, "QUALIFIED" | "BOOKED" | "WON">;
  /** Meta's totals for the period, or null when Meta couldn't be read. */
  meta: { spendCents: number | null; clicks: number | null; leads: number | null; purchases: number | null; revenueCents: number | null } | null;
  /** Why Meta couldn't be read, when it couldn't. */
  metaProblem: string | null;
  leads: ResultsLead[];
  store: { connected: boolean; orders: number; valueCents: number };
  /** The Meta pixel is active. */
  salesTracked: boolean;
};

export type ResultsModel = {
  kind: ResultsKind;
  journey: JourneyStage[];
  metrics: Metric[];
  /** The other side of the business, shown only when there's something on it. */
  extra: { title: string; metrics: Metric[] } | null;
  funnel: LeadFunnel;
  /** Leads the business has judged: good or later, not a fit, or spam. */
  judged: number;
  /** Confirmed sales from ad-linked customers ÷ spend — the only return MAIRO calls verified. */
  verifiedRoas: number | null;
  notes: string[];
};

const LEADS_HREF = "/dashboard/leads";
const TRACKING_HREF = "/dashboard/tracking";

export const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents >= 100_000 ? 0 : 2 });
const count = (n: number) => n.toLocaleString("en-US");
const pct = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

/**
 * Which figures a business is measured by, and why — said on the page so it
 * can be corrected. A type the business confirmed decides; otherwise what its
 * campaigns aim for and whether enquiries come in; otherwise MAIRO's guess
 * from what it does.
 */
export function resultsKind(i: { nicheId: string | null; nicheConfirmed?: boolean; industry: string | null; goal: AdGoal | null; objectives: AdGoal[]; storedLeads: number }): { kind: ResultsKind; why: string } {
  const niche = i.nicheId ? nicheById(i.nicheId) : classifyNiche(i.industry, i.goal);
  const byNiche = (): { kind: ResultsKind; why: string } | null =>
    niche.id === "ecommerce" ? { kind: "sales", why: "your business is set up as an online shop" } : niche.id !== "general" ? { kind: "leads", why: `your business is set up as ${niche.label.toLowerCase()}` } : null;
  if (i.nicheConfirmed) {
    const confirmed = byNiche();
    if (confirmed) return confirmed;
  }
  const sales = i.objectives.includes("SALES");
  const leads = i.objectives.includes("LEADS");
  if (leads) return { kind: "leads", why: "your campaigns aim for enquiries" };
  if (i.storedLeads > 0) return { kind: "leads", why: "enquiries are coming in through your forms" };
  if (sales) return { kind: "sales", why: "your campaigns aim for online sales" };
  const guessed = byNiche();
  if (guessed) return guessed;
  if (i.goal === "SALES") return { kind: "sales", why: "your goal is online sales" };
  return { kind: "leads", why: "MAIRO shows enquiries until your campaigns aim for online sales" };
}

export function resultsModel(input: ResultsInput): ResultsModel {
  const f = leadFunnel(input.leads);
  const judged = f.qualified + f.lost + f.spam;
  const spend = input.meta?.spendCents ?? null;
  const notes: string[] = [];

  const metaDown: Missing | null = input.meta === null ? { why: `MAIRO couldn't read Meta just now${input.metaProblem ? ` (${input.metaProblem})` : ""}. Try again in a minute.`, href: null, action: null } : null;
  const noSpend: Missing = metaDown ?? { why: "Meta reported no advertising spend for this period.", href: null, action: null };
  const unmarked: Missing = { why: f.reported ? "None of your leads is marked yet. Only you know which were good, booked or became customers." : "No leads came in during this period.", href: f.reported ? LEADS_HREF : null, action: f.reported ? "Mark your leads" : null };

  // --- Lead figures -----------------------------------------------------------
  const spendMetric: Metric = { key: "spend", label: "Advertising spend", value: spend !== null && spend > 0 ? usd(spend) : null, source: "Meta", hint: "What Meta charged for MAIRO's campaigns.", missing: spend !== null && spend > 0 ? null : noSpend };

  const metaLeads = input.meta?.leads ?? null;
  const leadsMetric: Metric =
    f.reported > 0
      ? { key: "leads", label: "Leads reported", value: count(f.reported), source: "MAIRO counted", hint: `Everyone who filled in your form${f.spam ? `, including ${count(f.spam)} you marked spam` : ""}.${metaLeads !== null ? ` Meta reported ${count(metaLeads)}.` : ""}`, missing: null }
      : metaLeads !== null && metaLeads > 0
        ? { key: "leads", label: "Leads reported", value: count(metaLeads), source: "Meta", hint: "Meta's count. None reached MAIRO, so what became of them isn't known.", missing: null }
        : { key: "leads", label: "Leads reported", value: "0", source: "MAIRO counted", hint: "Nobody filled in your form during this period.", missing: null };

  const judgedValue = (n: number) => (judged > 0 ? count(n) : null);
  const qualifiedMetric: Metric = { key: "qualified", label: "Qualified leads", value: judgedValue(f.qualified), source: "You marked", hint: judged ? `Marked "${input.labels.QUALIFIED}" or further — ${count(judged)} of ${count(f.reported)} leads judged so far.` : `Leads you mark "${input.labels.QUALIFIED}" or further.`, missing: judged ? null : unmarked };
  const bookedMetric: Metric = { key: "booked", label: "Booked appointments", value: judgedValue(f.booked), source: "You marked", hint: `Marked "${input.labels.BOOKED}" or further.`, missing: judged ? null : unmarked };
  const customersMetric: Metric = { key: "customers", label: "Confirmed customers", value: judgedValue(f.won), source: "You marked", hint: `Marked "${input.labels.WON}". A lead is never assumed to have paid.`, missing: judged ? null : unmarked };

  const perQualified = costPer(spend, f.qualified);
  const cpqMetric: Metric = {
    key: "costPerQualified",
    label: "Cost per qualified lead",
    value: perQualified !== null ? usd(perQualified) : null,
    source: "MAIRO counted",
    hint: "Ad spend ÷ the leads you marked qualified.",
    missing: perQualified !== null ? null : spend === null || spend <= 0 ? noSpend : judged ? { why: "No lead is marked qualified yet in this period.", href: LEADS_HREF, action: "Review your leads" } : unmarked,
  };
  const cac = costPer(spend, f.won);
  const cacMetric: Metric = {
    key: "cac",
    label: "Customer acquisition cost",
    value: cac !== null ? usd(cac) : null,
    source: "MAIRO counted",
    hint: "Ad spend ÷ customers you confirmed. Your other costs aren't in it.",
    missing: cac !== null ? null : spend === null || spend <= 0 ? noSpend : judged ? { why: "No lead is marked as a customer yet in this period.", href: LEADS_HREF, action: "Mark customers on Leads" } : unmarked,
  };

  // --- Money the business confirmed ------------------------------------------
  const leadValue = f.wonValueCents;
  const storeValue = input.store.connected && input.store.valueCents > 0 ? input.store.valueCents : null;
  const confirmed = leadValue !== null || storeValue !== null ? (leadValue ?? 0) + (storeValue ?? 0) : null;
  const confirmedSource: Source = leadValue === null && input.store.connected ? "Your store" : "You entered";
  const revenueMetric: Metric = {
    key: "verifiedRevenue",
    label: "Verified sales revenue",
    value: confirmed !== null ? usd(confirmed) : null,
    source: confirmedSource,
    hint: [leadValue !== null ? `${usd(leadValue)} you recorded for customers` : null, storeValue !== null ? `${usd(storeValue)} in orders your store recorded (all sources)` : null].filter(Boolean).join(" + ") || "What customers actually paid.",
    missing: confirmed !== null ? null : f.won > 0 ? { why: "You've confirmed customers but not what they paid.", href: LEADS_HREF, action: "Add what each customer paid" } : input.kind === "sales" && !input.store.connected ? { why: "Your store isn't connected, so MAIRO has no verified sales.", href: TRACKING_HREF, action: "Connect your store" } : { why: "No sales confirmed in this period.", href: null, action: null },
  };

  // A return, only from customers whose enquiry is linked to the ads.
  const attributedValue = input.leads.filter((l) => l.attributed && l.status === "WON" && (l.valueCents ?? 0) > 0).reduce((s, l) => s + l.valueCents!, 0);
  const leadRoas = spend !== null && spend > 0 && attributedValue > 0 ? attributedValue / spend : null;
  const leadRoasMetric: Metric = {
    key: "roas",
    label: "Return on ad spend",
    value: leadRoas !== null ? `${leadRoas.toFixed(1)}×` : null,
    source: "You entered",
    hint: "What customers from your ads paid ÷ ad spend. Only enquiries linked to a campaign count.",
    missing:
      leadRoas !== null
        ? null
        : spend === null || spend <= 0
          ? noSpend
          : leadValue !== null
            ? { why: "The customers you recorded aren't linked to a campaign, so MAIRO won't credit them to your ads.", href: LEADS_HREF, action: null }
            : { why: "Shown once you record what customers from your ads paid.", href: LEADS_HREF, action: f.won ? "Add what each customer paid" : null },
  };

  // --- Sales figures ----------------------------------------------------------
  const purchases = input.meta?.purchases ?? null;
  const metaRevenue = input.meta?.revenueCents ?? null;
  const notTracking: Missing = metaDown ?? (input.salesTracked ? { why: "Meta reported no purchases for this period.", href: null, action: null } : { why: "Your Meta pixel isn't reporting sales, so Meta can't count them.", href: TRACKING_HREF, action: "Set up tracking" });
  const purchasesMetric: Metric = { key: "purchases", label: "Purchases Meta reported", value: purchases !== null && purchases > 0 ? count(purchases) : null, source: "Meta", hint: "Meta's estimate of sales its ads led to, by its own attribution rules.", missing: purchases !== null && purchases > 0 ? null : notTracking };
  const perPurchase = costPer(spend, purchases ?? 0);
  const cppMetric: Metric = { key: "costPerPurchase", label: "Cost per purchase", value: perPurchase !== null ? usd(perPurchase) : null, source: "Meta", hint: "Ad spend ÷ the purchases Meta reported.", missing: perPurchase !== null ? null : spend === null || spend <= 0 ? noSpend : notTracking };
  const metaRevenueMetric: Metric = { key: "metaRevenue", label: "Sales value Meta reported", value: metaRevenue !== null && metaRevenue > 0 ? usd(metaRevenue) : null, source: "Meta", hint: "Meta's estimate — not verified against your store.", missing: metaRevenue !== null && metaRevenue > 0 ? null : notTracking };
  const metaRoas = spend !== null && spend > 0 && metaRevenue !== null && metaRevenue > 0 ? metaRevenue / spend : null;
  const metaRoasMetric: Metric = { key: "roas", label: "Return on ad spend (Meta's estimate)", value: metaRoas !== null ? `${metaRoas.toFixed(1)}×` : null, source: "Meta", hint: "Sales value Meta credits to the ads ÷ ad spend. Meta's attribution, not a verified figure.", missing: metaRoas !== null ? null : spend === null || spend <= 0 ? noSpend : notTracking };
  const storeOrdersMetric: Metric = {
    key: "storeOrders",
    label: "Orders your store recorded",
    value: input.store.connected ? count(input.store.orders) : null,
    source: "Your store",
    hint: "Every order in this period, from every source — not only ads.",
    missing: input.store.connected ? null : { why: "Your store isn't connected. Meta's purchase count is its estimate; your store's orders are the verified figure.", href: TRACKING_HREF, action: "Connect your store" },
  };
  const storeRevenueMetric: Metric = { ...revenueMetric, source: storeValue !== null ? "Your store" : revenueMetric.source };

  // --- The journey ------------------------------------------------------------
  const rate = (part: number, whole: number, of: string) => (whole > 0 ? `${pct(part, whole)} ${of}` : null);
  const journey: JourneyStage[] =
    input.kind === "leads"
      ? [
          { key: "advertising", label: "Advertising", value: spendMetric.value, source: "Meta", rate: null, missing: spendMetric.missing },
          { key: "leads", label: "Leads", value: leadsMetric.value, source: leadsMetric.source, rate: null, missing: null },
          { key: "qualified", label: "Qualified leads", value: qualifiedMetric.value, source: "You marked", rate: judged ? rate(f.qualified, judged, "of those you judged") : null, missing: qualifiedMetric.missing },
          { key: "booked", label: "Bookings", value: bookedMetric.value, source: "You marked", rate: judged && f.qualified ? rate(f.booked, f.qualified, "of qualified") : null, missing: bookedMetric.missing },
          { key: "customers", label: "Customers", value: customersMetric.value, source: "You marked", rate: judged && f.booked ? rate(f.won, f.booked, "of bookings") : null, missing: customersMetric.missing },
          { key: "revenue", label: "Revenue", value: revenueMetric.value, source: revenueMetric.source, rate: null, missing: revenueMetric.missing },
        ]
      : [
          { key: "advertising", label: "Advertising", value: spendMetric.value, source: "Meta", rate: null, missing: spendMetric.missing },
          { key: "clicks", label: "Clicks", value: input.meta?.clicks ? count(input.meta.clicks) : null, source: "Meta", rate: null, missing: input.meta?.clicks ? null : (metaDown ?? { why: "Meta reported no clicks for this period.", href: null, action: null }) },
          { key: "purchases", label: "Purchases (Meta)", value: purchasesMetric.value, source: "Meta", rate: purchases && input.meta?.clicks ? rate(purchases, input.meta.clicks, "of clicks") : null, missing: purchasesMetric.missing },
          { key: "orders", label: "Store orders", value: storeOrdersMetric.value, source: "Your store", rate: null, missing: storeOrdersMetric.missing },
          { key: "revenue", label: "Revenue", value: storeRevenueMetric.value, source: storeRevenueMetric.source, rate: null, missing: storeRevenueMetric.missing },
        ];

  const leadMetrics = [spendMetric, leadsMetric, qualifiedMetric, bookedMetric, customersMetric, cpqMetric, cacMetric, revenueMetric, leadRoasMetric];
  const salesMetrics = [spendMetric, purchasesMetric, cppMetric, metaRevenueMetric, metaRoasMetric, storeOrdersMetric, storeRevenueMetric];

  let extra: ResultsModel["extra"] = null;
  if (input.kind === "sales" && f.reported > 0) extra = { title: "Your enquiries", metrics: [leadsMetric, qualifiedMetric, bookedMetric, customersMetric] };
  if (input.kind === "leads" && ((purchases ?? 0) > 0 || input.store.connected)) extra = { title: "Sales", metrics: [purchasesMetric, storeOrdersMetric] };

  if (input.kind === "leads" && f.unmarked > 0 && judged > 0) notes.push(`${count(f.unmarked)} ${f.unmarked === 1 ? "lead isn't" : "leads aren't"} marked yet, so the figures after "Leads" are what you've marked so far.`);
  if (input.kind === "sales" && purchases && input.store.connected) notes.push("Meta's purchases and your store's orders are counted differently and won't match: Meta credits sales to its ads by its own rules, your store counts every order.");

  return { kind: input.kind, journey, metrics: input.kind === "leads" ? leadMetrics : salesMetrics, extra, funnel: f, judged, verifiedRoas: leadRoas, notes };
}
