import { NO_VALUE } from "@/components/metrics";

// Number formatting for the dashboard's cards, chart and table. Missing is a
// dash, never a zero.

export const PANEL = "rounded-2xl border border-white/[0.07] bg-[#0b1122]/80";

export function money(cents: number | null, opts: { whole?: boolean } = {}): string {
  if (cents === null) return NO_VALUE;
  const whole = opts.whole ?? Math.abs(cents) >= 100_000;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

export function count(value: number | null): string {
  return value === null ? NO_VALUE : Math.round(value).toLocaleString("en-US");
}

export function pct(fraction: number | null): string {
  return fraction === null ? NO_VALUE : `${(fraction * 100).toFixed(2)}%`;
}

export function roas(value: number | null): string {
  return value === null ? NO_VALUE : `${value.toFixed(1)}x`;
}

/** Short axis money: $0, $800, $1.2K, $8K. */
export function axisMoney(cents: number): string {
  const d = cents / 100;
  if (d >= 1000) return `$${(d / 1000).toFixed(d >= 10_000 || d % 1000 === 0 ? 0 : 1)}K`;
  return `$${Math.round(d)}`;
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const GOAL_WORD: Record<string, string> = {
  SALES: "Sales",
  LEADS: "Leads",
  TRAFFIC: "Traffic",
  AWARENESS: "Awareness",
  ENGAGEMENT: "Engagement",
  APP_PROMOTION: "App installs",
};

export const PUBLISHER_NAME: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  audience_network: "Audience Network",
  messenger: "Messenger",
  threads: "Threads",
};
