import type { DateRange } from "@/lib/ad-platforms/types";

// The periods somebody actually asks about, and the period before each one.
//
// Every range here comes in a pair: the window being reported, and the window
// immediately before it of the same length. That is what makes "18% more than
// last week" possible, and it is why the previous window is derived here
// rather than guessed at by the page — "the 7 days before these 7 days" has
// exactly one correct answer and several plausible wrong ones.
//
// All-time is deliberately included and deliberately has no comparison. There
// is no period before all time, and inventing one would mean comparing a
// business's whole history against nothing.

export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "90d" | "all";

export type RangeInfo = {
  key: RangeKey;
  label: string;
  /** Null for all-time, which is the absence of a range rather than a wide one. */
  range: DateRange | null;
  /** The same length, immediately before. Null when there is nothing to compare to. */
  previous: DateRange | null;
  /** How to refer to the previous window in a sentence. */
  previousLabel: string | null;
};

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export const RANGE_KEYS: RangeKey[] = ["today", "yesterday", "7d", "30d", "90d", "all"];

export function rangeInfo(key: RangeKey, now = new Date()): RangeInfo {
  const today = startOfDay(now);

  switch (key) {
    case "today": {
      return {
        key,
        label: "Today",
        range: { since: today, until: endOfDay(now) },
        previous: { since: new Date(today.getTime() - DAY), until: endOfDay(new Date(today.getTime() - DAY)) },
        previousLabel: "yesterday",
      };
    }
    case "yesterday": {
      const y = new Date(today.getTime() - DAY);
      const before = new Date(today.getTime() - 2 * DAY);
      return {
        key,
        label: "Yesterday",
        range: { since: y, until: endOfDay(y) },
        previous: { since: before, until: endOfDay(before) },
        previousLabel: "the day before",
      };
    }
    case "7d":
    case "30d":
    case "90d": {
      const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
      // Whole days ending yesterday. Today is excluded because a part-day
      // always looks like a collapse next to a full one.
      const until = endOfDay(new Date(today.getTime() - DAY));
      const since = startOfDay(new Date(today.getTime() - days * DAY));
      const prevUntil = endOfDay(new Date(since.getTime() - DAY));
      const prevSince = startOfDay(new Date(since.getTime() - days * DAY));
      return {
        key,
        label: `Last ${days} days`,
        range: { since, until },
        previous: { since: prevSince, until: prevUntil },
        previousLabel: `the ${days} days before`,
      };
    }
    case "all":
    default:
      return { key: "all", label: "All time", range: null, previous: null, previousLabel: null };
  }
}

export function parseRange(raw: string | undefined): RangeKey {
  return (RANGE_KEYS as string[]).includes(raw ?? "") ? (raw as RangeKey) : "all";
}
