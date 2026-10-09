import type { LeadStatus } from "@/generated/prisma/enums";

// What became of the people who got in touch.
//
// A form filled in — on MAIRO's page or Meta's instant form — is a *reported*
// lead and nothing more. Whether that person was a real prospect, booked an
// estimate or paid for a job is something only the business knows, so every
// step past "reported" is the business's own word, marked lead by lead. MAIRO
// never assumes a lead was qualified, never counts a lead as revenue, and
// never fills a gap with a guess: a lead nobody has marked is counted as
// reported, and the numbers say so.
//
// Pure; pinned by scripts/check-lead-outcomes.ts.

export const LEAD_OUTCOMES: { status: LeadStatus; label: string; hint: string }[] = [
  { status: "NEW", label: "New", hint: "Not looked at yet" },
  { status: "CONTACTED", label: "Contacted", hint: "You've been in touch with them" },
  { status: "QUALIFIED", label: "Good lead", hint: "A real prospect you'd want — in your area, wants what you do" },
  { status: "BOOKED", label: "Booked", hint: "An appointment, visit or call is booked" },
  { status: "ESTIMATE_SENT", label: "Estimate sent", hint: "You've sent a quote or estimate and are waiting to hear" },
  { status: "WON", label: "Customer", hint: "They paid for a job" },
  { status: "LOST", label: "Not a fit", hint: "A real person, but it didn't go anywhere" },
  { status: "SPAM", label: "Spam", hint: "Junk, a test or a duplicate" },
];

export const OUTCOME_LABEL = Object.fromEntries(LEAD_OUTCOMES.map((o) => [o.status, o.label])) as Record<LeadStatus, string>;

/**
 * How far a lead got. Each step counts the ones after it: a good lead was
 * contacted, a booked lead was a good one, an estimate follows a booking, and
 * a customer got that far.
 */
export const STAGE: Record<LeadStatus, number> = { NEW: 0, CONTACTED: 1, QUALIFIED: 2, BOOKED: 3, ESTIMATE_SENT: 4, WON: 5, LOST: -1, SPAM: -2 };

export type LeadFunnel = {
  /** Everything that came in. */
  reported: number;
  /** Marked spam, and so not a lead at all. */
  spam: number;
  /** Reported minus spam. */
  real: number;
  /** Marked contacted or any later step. */
  contacted: number;
  /** Marked good, booked or customer — each later step counts the earlier ones. */
  qualified: number;
  booked: number;
  /** Marked estimate sent or customer. */
  estimates: number;
  won: number;
  lost: number;
  /** Still unmarked. */
  unmarked: number;
  /** What the business said its customers' jobs were worth. Null when none gave a value. */
  wonValueCents: number | null;
};

export function leadFunnel(rows: { status: LeadStatus; valueCents: number | null }[]): LeadFunnel {
  const at = (n: number) => rows.filter((r) => STAGE[r.status] >= n).length;
  const won = rows.filter((r) => r.status === "WON");
  const valued = won.filter((r) => r.valueCents !== null && r.valueCents > 0);
  const spam = rows.filter((r) => r.status === "SPAM").length;
  return {
    reported: rows.length,
    spam,
    real: rows.length - spam,
    contacted: at(STAGE.CONTACTED),
    qualified: at(STAGE.QUALIFIED),
    booked: at(STAGE.BOOKED),
    estimates: at(STAGE.ESTIMATE_SENT),
    won: won.length,
    lost: rows.filter((r) => r.status === "LOST").length,
    unmarked: rows.filter((r) => r.status === "NEW").length,
    wonValueCents: valued.length ? valued.reduce((s, r) => s + r.valueCents!, 0) : null,
  };
}

/** Spend ÷ count, or null when either is missing — never "$0.00 per customer". */
export function costPer(spendCents: number | null | undefined, count: number): number | null {
  return spendCents !== null && spendCents !== undefined && spendCents > 0 && count > 0 ? Math.round(spendCents / count) : null;
}

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: c >= 100_000 ? 0 : 2 });
const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/**
 * The plain sentence for the Overview and reports: what came in, what the
 * business marked, and what that costs — with what's still unknown said out
 * loud rather than left to look like zero.
 */
export function outcomeSummary(f: LeadFunnel, spendCents: number | null): { headline: string; detail: string | null } | null {
  if (f.reported === 0) return null;
  const parts = [`${n(f.real, "enquiry", "enquiries")} came in`];
  if (f.qualified || f.booked || f.won) {
    parts.push([f.qualified ? `${f.qualified} good` : null, f.booked ? `${f.booked} booked` : null, f.won ? n(f.won, "customer") : null].filter(Boolean).join(", "));
  }
  const headline = `${parts.join(" · ")}.`;
  const bits: string[] = [];
  const perGood = costPer(spendCents, f.qualified);
  const perBooked = costPer(spendCents, f.booked);
  const perWon = costPer(spendCents, f.won);
  if (perWon) bits.push(`about ${money(perWon)} in ads per customer`);
  else if (perBooked) bits.push(`about ${money(perBooked)} per booking`);
  else if (perGood) bits.push(`about ${money(perGood)} per good lead`);
  if (f.wonValueCents) bits.push(`${money(f.wonValueCents)} in jobs you recorded`);
  let detail = bits.length ? `That's ${bits.join(", and ")}.` : null;
  if (f.unmarked > 0) {
    const note = `${n(f.unmarked, "enquiry", "enquiries")} not marked yet — mark them on Leads so MAIRO can tell form fills from real customers.`;
    detail = detail ? `${detail} ${note}` : note;
  }
  return { headline, detail };
}
