import { z } from "zod";
import { CURRENCIES, money, percent, round, times, type BreakEven, type Currency, type SaleEconomics, type ServiceEconomics } from "./economics";

// A calculator's result, carried into the plan once the owner chooses to use
// it: the most a sale or a lead can cost before it loses money, and what it
// was worked out from.
//
// Only the figures the calculator produced are kept — nothing estimated on
// top — with the tool it came from and when it was confirmed. The plan shows
// them as "you told MAIRO" facts and measures its own test against them; the
// numbers stay the owner's to change or remove. Pure, so the free tools, the
// setup form, the server and scripts/check-calculators.ts share one reading.

export type ConfirmedEconomics =
  | {
      basis: "sale";
      currency: Currency;
      /** What a sale brings in, after discounts and refunds. */
      netRevenue: number;
      /** What's left of a sale before advertising and fixed costs. */
      contribution: number;
      breakEvenCpa: number;
      /** Below break-even by the margin the owner wanted to keep; null when they kept none. */
      targetCpa: number | null;
      breakEvenRoas: number;
      tool: string;
      confirmedAt: string;
    }
  | {
      basis: "lead";
      currency: Currency;
      jobValue: number;
      contributionPerJob: number;
      /** Lead → paid job, as a fraction. */
      leadToSale: number;
      breakEvenCpl: number;
      targetCpl: number | null;
      tool: string;
      confirmedAt: string;
    };

const pos = z.number().finite().positive().max(10_000_000);
const schema = z.discriminatedUnion("basis", [
  z.object({
    basis: z.literal("sale"),
    currency: z.enum(CURRENCIES),
    netRevenue: pos,
    contribution: pos,
    breakEvenCpa: pos,
    targetCpa: pos.nullable(),
    breakEvenRoas: z.number().finite().min(1).max(1000),
    tool: z.string().max(60),
    confirmedAt: z.string().max(40),
  }),
  z.object({
    basis: z.literal("lead"),
    currency: z.enum(CURRENCIES),
    jobValue: pos,
    contributionPerJob: pos,
    leadToSale: z.number().finite().positive().max(1),
    breakEvenCpl: pos,
    targetCpl: pos.nullable(),
    tool: z.string().max(60),
    confirmedAt: z.string().max(40),
  }),
]);

/** Reads stored or submitted numbers; anything that doesn't add up is refused, not repaired. */
export function parseEconomics(raw: unknown): ConfirmedEconomics | null {
  let v = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const r = schema.safeParse(v);
  if (!r.success) return null;
  const e = r.data;
  // The figures have to agree with each other, the way the calculator made them (to rounding).
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.001);
  if (e.basis === "sale") {
    if (!near(e.breakEvenCpa, e.contribution) || e.contribution > e.netRevenue + 0.01) return null;
    if (!near(e.breakEvenRoas, e.netRevenue / e.contribution)) return null;
    if (e.targetCpa !== null && e.targetCpa > e.breakEvenCpa + 0.01) return null;
  } else {
    if (!near(e.breakEvenCpl, e.leadToSale * e.contributionPerJob) || e.contributionPerJob > e.jobValue + 0.01) return null;
    if (e.targetCpl !== null && e.targetCpl > e.breakEvenCpl + 0.01) return null;
  }
  return e;
}

/** From the break-even ROAS calculator. Null when a sale doesn't make money before ads. */
export function economicsFromSale(sale: SaleEconomics, be: BreakEven, currency: Currency, tool: string, now = new Date()): ConfirmedEconomics | null {
  if (!be.breakEvenRoas || !be.breakEvenCpa || sale.netRevenue <= 0) return null;
  return { basis: "sale", currency, netRevenue: round(sale.netRevenue), contribution: round(be.contribution), breakEvenCpa: round(be.breakEvenCpa), targetCpa: be.targetCpa && be.targetCpa < be.breakEvenCpa - 0.005 ? round(be.targetCpa) : null, breakEvenRoas: round(sale.netRevenue / be.contribution, 4), tool, confirmedAt: now.toISOString() };
}

/** From the cost-per-lead calculator. Null when no cost per lead can pay. */
export function economicsFromService(r: ServiceEconomics, jobValue: number, currency: Currency, tool: string, now = new Date()): ConfirmedEconomics | null {
  if (!r.breakEvenCpl || r.contributionPerJob <= 0 || r.leadToSale <= 0) return null;
  return { basis: "lead", currency, jobValue: round(jobValue), contributionPerJob: round(r.contributionPerJob), leadToSale: round(r.leadToSale, 4), breakEvenCpl: round(r.breakEvenCpl), targetCpl: r.targetCpl && r.targetCpl < r.breakEvenCpl - 0.005 ? round(r.targetCpl) : null, tool, confirmedAt: now.toISOString() };
}

/** The result the plan's test is measured against. */
export function costLimit(e: ConfirmedEconomics): { per: "sale" | "lead"; breakEven: number; target: number | null; text: string } {
  const m = (n: number) => money(n, e.currency);
  if (e.basis === "sale") {
    return { per: "sale", breakEven: e.breakEvenCpa, target: e.targetCpa, text: e.targetCpa ? `${m(e.targetCpa)} per sale (break-even ${m(e.breakEvenCpa)})` : `${m(e.breakEvenCpa)} per sale` };
  }
  return { per: "lead", breakEven: e.breakEvenCpl, target: e.targetCpl, text: e.targetCpl ? `${m(e.targetCpl)} per lead (break-even ${m(e.breakEvenCpl)})` : `${m(e.breakEvenCpl)} per lead` };
}

/** The numbers as plan facts: what they are and what they came from. */
export function economicsFacts(e: ConfirmedEconomics): { label: string; value: string; source: string }[] {
  const m = (n: number) => money(n, e.currency);
  const source = `From the ${TOOL_NAME[e.tool] ?? "calculator"} — you chose to use it`;
  if (e.basis === "sale") {
    return [
      { label: "Most a sale can cost in ads", value: `${m(e.breakEvenCpa)} — break-even at ${times(e.breakEvenRoas)} ROAS${e.targetCpa ? `; ${m(e.targetCpa)} keeps the margin you wanted` : ""}`, source },
      { label: "What a sale leaves before ads", value: `${m(e.contribution)} of ${m(e.netRevenue)}, before fixed costs`, source },
    ];
  }
  return [
    { label: "Most a lead can cost", value: `${m(e.breakEvenCpl)}${e.targetCpl ? `; ${m(e.targetCpl)} keeps the margin you wanted` : ""}`, source },
    { label: "How leads become paid jobs", value: `${percent(e.leadToSale)} of leads, each job leaving ${m(e.contributionPerJob)} of ${m(e.jobValue)}`, source },
  ];
}

export const TOOL_NAME: Record<string, string> = {
  "break-even-roas": "break-even ROAS calculator",
  "service-lead-economics": "cost-per-lead calculator",
};

/** Whether the numbers fit the plan's goal: sales numbers for a sales plan, lead numbers for a leads plan. */
export function economicsFitGoal(e: ConfirmedEconomics, goal: string): boolean {
  return e.basis === "sale" ? goal === "SALES" : goal === "LEADS";
}
