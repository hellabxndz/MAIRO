import type { DateRange, PlatformMetrics } from "@/lib/ad-platforms/types";
import { rangeInfo } from "@/lib/analytics/ranges";
import type { MetricFamily } from "@/lib/mission/goals";
import { resultFor } from "@/lib/dashboard/console";

// The Results screen's period and its plain-words findings. Pure, so the
// rules can be checked without Meta (scripts/check-simplify.ts).
//
// Every finding is a sentence about a figure Meta reported for this period:
// which campaigns brought results and at what cost, which spent and brought
// nothing yet. Nothing is predicted, and a campaign with no reported figures
// is not mentioned at all rather than described as failing.

export type ResultsRangeKey = "today" | "7d" | "30d" | "custom";

export type ResultsRange = {
  key: ResultsRangeKey;
  label: string;
  range: DateRange;
  previous: DateRange;
  /** YYYY-MM-DD, for the custom fields. */
  from: string;
  to: string;
};

const DAY = 86_400_000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

function parseDay(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

/** Today, 7 days, 30 days (the default), or a custom period of at most a year, never in the future. */
export function resultsRange(params: { range?: string; from?: string; to?: string }, now = new Date()): ResultsRange {
  if (params.range === "custom") {
    const today = startOf(now);
    let from = parseDay(params.from);
    let to = parseDay(params.to);
    if (from && to) {
      if (to > today) to = today;
      if (from > to) [from, to] = [to, from];
      if (to.getTime() - from.getTime() > 365 * DAY) from = new Date(to.getTime() - 365 * DAY);
      const days = Math.round((startOf(to).getTime() - startOf(from).getTime()) / DAY) + 1;
      const prevTo = new Date(from.getTime() - DAY);
      const prevFrom = new Date(from.getTime() - days * DAY);
      return {
        key: "custom",
        label: `${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        range: { since: startOf(from), until: endOf(to) },
        previous: { since: startOf(prevFrom), until: endOf(prevTo) },
        from: ymd(from),
        to: ymd(to),
      };
    }
  }
  const key: ResultsRangeKey = params.range === "today" || params.range === "7d" ? params.range : "30d";
  const info = rangeInfo(key, now);
  return {
    key,
    label: info.label,
    range: info.range!,
    previous: info.previous!,
    from: ymd(info.range!.since),
    to: ymd(info.range!.until),
  };
}

export type Finding = { key: string; text: string; href?: string };

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents >= 100_000 ? 0 : 2, maximumFractionDigits: cents >= 100_000 ? 0 : 2 });

/** What's working and what needs improvement, campaign by campaign, from reported figures only. */
export function findings(
  family: MetricFamily,
  campaigns: { id: string; name: string; metrics: PlatformMetrics; hasData: boolean }[],
): { working: Finding[]; improve: Finding[] } {
  const reported = campaigns.filter((c) => c.hasData && (c.metrics.spendCents ?? 0) > 0);
  const scored = reported.map((c) => {
    const r = resultFor(family, c.metrics);
    const n = r.value ?? 0;
    return { c, r, n, per: n > 0 ? Math.round((c.metrics.spendCents ?? 0) / n) : null };
  });
  const working = scored
    .filter((s) => s.n > 0 && s.per !== null)
    .sort((a, b) => (a.per ?? 0) - (b.per ?? 0))
    .slice(0, 3)
    .map((s) => ({
      key: `w:${s.c.id}`,
      text: `“${s.c.name}” brought ${s.n.toLocaleString("en-US")} ${s.r.label.toLowerCase()} at ${usd(s.per!)} each.`,
      href: `/dashboard/campaigns/${s.c.id}`,
    }));
  const improve = scored
    .filter((s) => s.n === 0)
    .sort((a, b) => (b.c.metrics.spendCents ?? 0) - (a.c.metrics.spendCents ?? 0))
    .slice(0, 3)
    .map((s) => ({
      key: `i:${s.c.id}`,
      text: `“${s.c.name}” spent ${usd(s.c.metrics.spendCents ?? 0)} with no ${s.r.label.toLowerCase()} reported yet.`,
      href: `/dashboard/campaigns/${s.c.id}`,
    }));
  return { working, improve };
}
