// Checks that the analytics page cannot mislead somebody about their own money.
//
// Two things here are easy to get subtly wrong and impossible to notice once
// wrong, because both produce numbers that look entirely reasonable.
//
//   Direction. "Up" is not universally good. Spend rising is neutral, cost per
//   sale rising is bad, revenue rising is good. A page that paints every
//   increase green teaches people to misread their account — and it is exactly
//   the sort of thing that survives review because green looks right.
//
//   Comparison. A percentage change computed from a near-zero base produces
//   "+4,300%", which is arithmetically correct and completely useless. A change
//   against a period with no data at all is not a change, it is a first
//   reading. Both must refuse rather than print.
//
// Also checks the date windows, because "the 7 days before these 7 days" has
// one correct answer and several plausible wrong ones.
//
// Run with: npm run check:analytics

import { compare, METRICS, metric, type MetricKey } from "@/lib/analytics/metrics";
import { parseRange, RANGE_KEYS, rangeInfo } from "@/lib/analytics/ranges";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${name} ${extra}`);
  } else console.log(`  ok    ${name}`);
}

const ALL = Object.values(METRICS);

console.log("\n— every metric explains itself —");
check("each has a plain-English name", ALL.every((m) => m.plain.trim().length > 0));
check("each has a definition", ALL.every((m) => m.tooltip.trim().length > 0));
check("each can describe its own value", ALL.every((m) => m.reading("X").includes("X")));
check(
  "no definition explains jargon with more jargon",
  ALL.every((m) => !/\b(ROAS|CPA|CPC|CPM|CTR)\b/.test(m.tooltip)),
  ALL.filter((m) => /\b(ROAS|CPA|CPC|CPM|CTR)\b/.test(m.tooltip)).map((m) => m.key).join(","),
);
check("the record key matches the metric", Object.entries(METRICS).every(([k, v]) => k === v.key));
check("acronyms are a subtitle, never the name", ALL.every((m) => m.plain !== m.short));

console.log("\n— direction is not uniformly optimistic —");
check("revenue rising is good", metric("revenue").direction === "up-good");
check("sales rising is good", metric("purchases").direction === "up-good");
check("return rising is good", metric("roas").direction === "up-good");
check("cost per sale rising is BAD", metric("costPerPurchase").direction === "up-bad");
check("cost per click rising is BAD", metric("cpc").direction === "up-bad");
check("cost per thousand rising is BAD", metric("cpm").direction === "up-bad");
check("spend rising is neither", metric("spend").direction === "neutral");
check("times shown rising is neither", metric("impressions").direction === "neutral");
check(
  "at least one of each direction exists",
  new Set(ALL.map((m) => m.direction)).size === 3,
);

console.log("\n— comparisons refuse when they would mislead —");
const P = "last week";
check("no current figure means no comparison", compare(null, 100, "up-good", P).label === null);
check("no previous figure means no comparison", compare(100, null, "up-good", P).label === null);
// A first reading is not a 100% rise.
check("a zero baseline means no comparison", compare(100, 0, "up-good", P).label === null);
check("a near-zero baseline means no comparison", compare(100, 0.4, "up-good", P).label === null);
check(
  "a tiny change is called about the same",
  /about the same/.test(compare(1000, 1005, "up-good", P).label ?? ""),
);

console.log("\n— comparisons colour by direction, not by sign —");
const revUp = compare(120, 100, "up-good", P);
const revDown = compare(80, 100, "up-good", P);
check("revenue up is good news", revUp.tone === "good", revUp.tone);
check("revenue down is bad news", revDown.tone === "bad", revDown.tone);
const cpaUp = compare(120, 100, "up-bad", P);
const cpaDown = compare(80, 100, "up-bad", P);
check("cost per sale up is BAD news", cpaUp.tone === "bad", cpaUp.tone);
check("cost per sale down is GOOD news", cpaDown.tone === "good", cpaDown.tone);
const spendUp = compare(120, 100, "neutral", P);
check("spend up is neither", spendUp.tone === "neutral", spendUp.tone);

console.log("\n— the words match the movement —");
check("a rise says 'more'", /20% more than last week/.test(revUp.label ?? ""), revUp.label ?? "");
check("a fall says 'less'", /20% less than last week/.test(revDown.label ?? ""), revDown.label ?? "");
check("the period is named", (revUp.label ?? "").includes(P));
check("percentages are whole numbers", !/\d\.\d/.test(revUp.label ?? ""), revUp.label ?? "");

console.log("\n— date windows —");
const now = new Date(2026, 8, 18, 14, 30);
const today = rangeInfo("today", now);
check("today starts at midnight", today.range!.since.getHours() === 0);
check("today compares to yesterday", today.previousLabel === "yesterday");
check(
  "yesterday's window is the day before today's",
  rangeInfo("yesterday", now).range!.since.getDate() === 17,
);

const week = rangeInfo("7d", now);
const days = (r: { since: Date; until: Date }) =>
  Math.round((r.until.getTime() - r.since.getTime()) / (24 * 60 * 60 * 1000));
check("7 days covers 7 days", days(week.range!) === 7, `${days(week.range!)}`);
check("the previous window is the same length", days(week.previous!) === 7, `${days(week.previous!)}`);
// A part-day always looks like a collapse beside a full one.
check("the window ends yesterday, not today", week.range!.until.getDate() === 17);
check(
  "the previous window ends the day before this one starts",
  week.previous!.until.getTime() < week.range!.since.getTime(),
);
check(
  "and the two windows do not overlap",
  week.previous!.until.getTime() <= week.range!.since.getTime(),
);

const month = rangeInfo("30d", now);
check("30 days covers 30 days", days(month.range!) === 30, `${days(month.range!)}`);

console.log("\n— all time is the absence of a range —");
const all = rangeInfo("all", now);
check("all time has no range", all.range === null);
// There is no period before all time.
check("all time has no comparison", all.previous === null && all.previousLabel === null);

console.log("\n— the range parameter cannot be forged —");
check("a bad value falls back to all time", parseRange("'; DROP TABLE") === "all");
check("an empty value falls back to all time", parseRange(undefined) === "all");
check("every advertised key parses back to itself", RANGE_KEYS.every((k) => parseRange(k) === k));

console.log("\n— every metric the page shows has an entry —");
const USED: MetricKey[] = [
  "spend", "revenue", "roas", "purchases", "costPerPurchase",
  "impressions", "reach", "clicks", "ctr", "cpc", "cpm",
];
check("all of them resolve", USED.every((k) => metric(k) !== undefined));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
