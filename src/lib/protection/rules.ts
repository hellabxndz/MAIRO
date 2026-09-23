import type { AdGoal } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";

// Spend Protection's decisions, kept free of the database and the networks so
// each one can be checked in a script.
//
// The honesty rule from the health grade applies: a figure a network didn't
// report is unknown, not zero. A campaign whose results the network doesn't
// report is never judged as "spending with no results".

/** What counts as a result, for the goal the customer chose. */
export function resultsFor(objective: AdGoal, m: PlatformMetrics | null): number | null {
  if (!m) return null;
  switch (objective) {
    case "SALES":
      return m.purchases ?? m.conversions;
    case "LEADS":
    case "APP_PROMOTION":
      return m.conversions;
    case "TRAFFIC":
    case "ENGAGEMENT":
      return m.clicks;
    case "AWARENESS":
      // Awareness buys being seen; there is no "no result" state to protect.
      return null;
  }
}

export type StopLossCheck = { tripped: false } | { tripped: true; spendCents: number; message: string };

export function checkStopLoss(input: {
  stopLossCents: number | null;
  objective: AdGoal;
  metrics: PlatformMetrics | null;
  campaignName: string;
}): StopLossCheck {
  if (!input.stopLossCents || !input.metrics) return { tripped: false };
  const spend = input.metrics.spendCents;
  const results = resultsFor(input.objective, input.metrics);
  if (spend === null || results === null) return { tripped: false };
  if (spend < input.stopLossCents || results > 0) return { tripped: false };
  return {
    tripped: true,
    spendCents: spend,
    message: `“${input.campaignName}” has spent ${usd(spend)} without a single ${resultWord(input.objective)} — past your ${usd(input.stopLossCents)} limit.`,
  };
}

export type CapCheck =
  | { state: "off" | "ok" }
  | { state: "warn" | "reached"; spendCents: number; capCents: number; message: string };

export function checkMonthlyCap(input: {
  monthlyCapCents: number | null;
  warnAtPercent: number;
  monthSpendCents: number | null;
}): CapCheck {
  const cap = input.monthlyCapCents;
  if (!cap) return { state: "off" };
  const spend = input.monthSpendCents;
  if (spend === null) return { state: "ok" };
  if (spend >= cap) {
    return { state: "reached", spendCents: spend, capCents: cap, message: `You've spent ${usd(spend)} on ads this month, reaching your ${usd(cap)} monthly limit.` };
  }
  if (spend >= (cap * Math.min(99, Math.max(1, input.warnAtPercent))) / 100) {
    return { state: "warn", spendCents: spend, capCents: cap, message: `You've spent ${usd(spend)} of your ${usd(cap)} monthly limit.` };
  }
  return { state: "ok" };
}

export function resultWord(objective: AdGoal): string {
  switch (objective) {
    case "SALES":
      return "purchase";
    case "LEADS":
      return "lead";
    case "APP_PROMOTION":
      return "install";
    default:
      return "click";
  }
}

export function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
}
