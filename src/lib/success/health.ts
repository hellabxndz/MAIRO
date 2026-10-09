import type { Journey } from "./journey";

// Which customers need the MAIRO team, and why — for AIOS → Customers.
//
// Every flag is a sentence a person can act on ("Paid 9 days ago, nothing
// live yet"), never a score: a founding program of ten businesses is run by
// someone reading the list, and a number would only make them look up why.
// Pure; pinned by scripts/check-success.ts.

export type HealthInput = {
  journey: Journey;
  now: Date;
  subscriptionStatus: string | null;
  canceledAt: Date | null;
  lastActiveAt: Date | null;
  /** Live or approved campaigns with an error or a rejected ad. */
  campaignProblems: number;
  openProblems: number;
  /** The most recent "is MAIRO making advertising easier?" answer. */
  latestPulse: "YES" | "SOMEWHAT" | "NO" | null;
  /** Days from signing up to the first campaign approved, or null if none yet. */
  daysToFirstCampaign: number | null;
  paid: boolean;
};

export type Health = { level: "healthy" | "watch" | "struggling" | "cancelled"; flags: string[] };

const DAY = 86_400_000;
const days = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY);

export function accountHealth(h: HealthInput): Health {
  if (h.canceledAt || h.subscriptionStatus === "canceled") {
    return { level: "cancelled", flags: [`Cancelled${h.canceledAt ? ` ${days(h.canceledAt, h.now)} days ago` : ""}`] };
  }
  const red: string[] = [];
  const amber: string[] = [];

  if (h.subscriptionStatus === "past_due" || h.subscriptionStatus === "unpaid") red.push("Payment is failing");
  if (h.latestPulse === "NO") red.push("Said MAIRO isn't making advertising easier");
  else if (h.latestPulse === "SOMEWHAT") amber.push("Said MAIRO is only somewhat easier");
  if (h.openProblems > 0) red.push(`${h.openProblems} open problem report${h.openProblems === 1 ? "" : "s"}`);
  if (h.campaignProblems > 0) red.push(`${h.campaignProblems} campaign${h.campaignProblems === 1 ? " has" : "s have"} an error or a rejected ad`);
  if (h.paid && h.daysToFirstCampaign === null && h.journey.day > 7) red.push(`Paid, ${h.journey.day} days in, and no campaign approved yet`);

  if (h.lastActiveAt) {
    const quiet = days(h.lastActiveAt, h.now);
    if (quiet >= 21) red.push(`Hasn't opened MAIRO in ${quiet} days`);
    else if (quiet >= 10) amber.push(`Hasn't opened MAIRO in ${quiet} days`);
  } else if (h.journey.day > 3) {
    amber.push("No visits recorded yet");
  }

  const current = h.journey.stages.find((s) => s.state === "current");
  if (h.journey.behind && current && h.journey.day <= 35) amber.push(`Behind on "${current.title}" (day ${h.journey.day})`);

  return { level: red.length ? "struggling" : amber.length ? "watch" : "healthy", flags: [...red, ...amber] };
}

export type ProgramAccount = {
  health: Health;
  activated: boolean;
  daysToFirstCampaign: number | null;
  paid: boolean;
  payingNow: boolean;
  activeLast7: boolean;
  latestPulse: "YES" | "SOMEWHAT" | "NO" | null;
};

export type ProgramMetrics = {
  accounts: number;
  activatedPct: number | null;
  medianDaysToFirstCampaign: number | null;
  /** Of those who ever paid, how many still do. */
  retainedPct: number | null;
  activeLast7Pct: number | null;
  /** Share of pulse answers that were "Yes". */
  easierPct: number | null;
  pulseAnswers: number;
  struggling: number;
  cancelled: number;
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);

export function programMetrics(list: ProgramAccount[]): ProgramMetrics {
  const times = list.map((a) => a.daysToFirstCampaign).filter((d): d is number => d !== null).sort((a, b) => a - b);
  const median = times.length ? (times.length % 2 ? times[(times.length - 1) / 2] : Math.round((times[times.length / 2 - 1] + times[times.length / 2]) / 2)) : null;
  const everPaid = list.filter((a) => a.paid);
  const pulses = list.map((a) => a.latestPulse).filter(Boolean);
  return {
    accounts: list.length,
    activatedPct: pct(list.filter((a) => a.activated).length, list.length),
    medianDaysToFirstCampaign: median,
    retainedPct: pct(everPaid.filter((a) => a.payingNow).length, everPaid.length),
    activeLast7Pct: pct(list.filter((a) => a.activeLast7).length, list.length),
    easierPct: pct(pulses.filter((p) => p === "YES").length, pulses.length),
    pulseAnswers: pulses.length,
    struggling: list.filter((a) => a.health.level === "struggling").length,
    cancelled: list.filter((a) => a.health.level === "cancelled").length,
  };
}
