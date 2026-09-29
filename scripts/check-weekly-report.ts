// Checks the Weekly Report's judgement.
//
//   npm run check:weekly-report
//
// The promises: the win needs real results behind it; weak lessons are shown
// but never saved to Learning Memory; platforms aren't declared winners
// without context; the plan comes from open Insights and never promises an
// outcome; and the report covers the business's own last seven days.

import { EMPTY_METRICS, type PlatformMetrics } from "@/lib/ad-platforms/types";
import {
  budgetNote,
  creativeSummary,
  healthWhy,
  learnings,
  nextWeekPlan,
  pickWin,
  plainSummary,
  platformNote,
  type AdWeek,
  type Figures,
} from "@/lib/reports/weekly-logic";
import { lastWeekFor, localToday, weekLabel } from "@/lib/reports/weekly";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

const m = (p: Partial<PlatformMetrics>): PlatformMetrics => ({ ...EMPTY_METRICS, ...p });
const ad = (label: string, cur: Partial<PlatformMetrics>, p: Partial<AdWeek> = {}): AdWeek => ({
  key: label,
  label,
  campaignId: "c1",
  campaignName: "Spring sale",
  objective: "SALES",
  kind: "IMAGE",
  createdAt: null,
  current: m(cur),
  previous: null,
  ...p,
});
const account = (p: Partial<Figures> = {}): Figures => ({
  spendCents: 100_000,
  revenueCents: 300_000,
  purchases: 30,
  results: 30,
  resultWord: "purchase",
  costPerResultCents: 3333,
  roas: 3,
  impressions: 100_000,
  reach: 50_000,
  clicks: 2000,
  ctr: 0.02,
  cpcCents: 50,
  cpmCents: 1000,
  profitCents: null,
  ...p,
});

console.log("\n— the week's win —");
{
  const none = pickWin([ad("Creative #1", { spendCents: 5000, purchases: 2 })], account());
  ok("two purchases isn't a win", none.win === null);
  ok("and says there isn't enough data", Boolean(none.note?.includes("does not have enough purchase data")));

  const ads = [
    ad("Creative #1", { spendCents: 60000, purchases: 12, clicks: 1200, impressions: 60000, revenueCents: 120000 }),
    ad("Creative #4", { spendCents: 24300, purchases: 10, clicks: 700, impressions: 25000, revenueCents: 114000 }, { kind: "VIDEO" }),
  ];
  const { win } = pickWin(ads, account());
  ok("the cheapest-per-purchase ad wins", win?.label === "Creative #4");
  ok("with its cost per purchase", win?.costPerResultCents === 2430);
  ok("and why, from the figures", Boolean(win?.why.some((w) => w.startsWith("Better click rate"))) && Boolean(win?.why.includes("A video ad")));
  ok("what was learned doesn't promise anything", !/will|guarantee/i.test(win?.learned ?? ""));

  const flat = pickWin(
    [ad("Creative #1", { spendCents: 40000, purchases: 10 }), ad("Creative #2", { spendCents: 40000, purchases: 10 })],
    account({ costPerResultCents: 3000 }),
  );
  ok("no win when nothing beats the average", flat.win === null);
}

console.log("\n— Learning Memory only keeps strong lessons —");
{
  const strong = learnings(
    [
      ad("A", { spendCents: 27000, purchases: 10 }, { kind: "VIDEO" }),
      ad("B", { spendCents: 39000, purchases: 10 }, { kind: "IMAGE" }),
      ad("C", { spendCents: 27000, purchases: 10 }, { kind: "VIDEO" }),
    ],
    [],
    null,
    "purchase",
  );
  const format = strong.find((l) => l.key.startsWith("format:"));
  ok("video beating image by 25%+ is a lesson", Boolean(format) && format!.statement.startsWith("Video ads"));
  ok("with enough results it's saved", format?.saved === true && format.confidence !== "EARLY");

  const weak = learnings([ad("A", { spendCents: 2700, purchases: 3 }, { kind: "VIDEO" }), ad("B", { spendCents: 9000, purchases: 3 })], [], null, "purchase");
  const w = weak.find((l) => l.key.startsWith("format:"));
  ok("three results each is only an early signal", w?.confidence === "EARLY");
  ok("and it isn't saved", w?.saved === false);

  const close = learnings([ad("A", { spendCents: 30000, purchases: 10 }, { kind: "VIDEO" }), ad("B", { spendCents: 33000, purchases: 10 })], [], null, "purchase");
  ok("a 10% gap isn't a lesson at all", !close.some((l) => l.key.startsWith("format:")));

  const place = learnings([], [
    { name: "Facebook", spendCents: 39000, revenueCents: null, results: 10, costPerResultCents: 3900, roas: null },
    { name: "Instagram", spendCents: 26000, revenueCents: null, results: 10, costPerResultCents: 2600, roas: null },
  ], null, "purchase");
  ok("Instagram cheaper than Facebook is a lesson", Boolean(place.find((l) => l.key === "placement:instagram")));
}

console.log("\n— platforms get context, not a trophy —");
{
  const rows = [
    { name: "Facebook", spendCents: 76000, revenueCents: 262000, results: 21, costPerResultCents: 3619, roas: 3.4 },
    { name: "Instagram", spendCents: 48000, revenueCents: 221000, results: 18, costPerResultCents: 2667, roas: 4.6 },
  ];
  const note = platformNote(rows, "purchase");
  ok("cheaper but smaller says both matter", note.includes("Instagram was more efficient") && note.includes("Facebook still brought more"));
  ok("near-equal says so", platformNote([{ ...rows[0], costPerResultCents: 3000 }, { ...rows[1], costPerResultCents: 2900 }], "purchase").includes("about the same"));
  ok("too few results to compare says so", platformNote([{ ...rows[0], results: 2 }, rows[1]], "purchase").includes("Not enough"));
}

console.log("\n— creatives, budget, health —");
{
  const since = "2026-09-21";
  const c = creativeSummary(
    [
      ad("Creative #2", { impressions: 5000, clicks: 70, spendCents: 20000, purchases: 4 }, { previous: m({ impressions: 5000, clicks: 140 }) }),
      ad("Creative #6", { spendCents: 5000, purchases: 2 }, { createdAt: "2026-09-18T00:00:00Z" }),
    ],
    null,
    [],
    since,
  );
  ok("a halved click rate is losing momentum", c.losing?.label === "Creative #2");
  ok("a new ad doing well is emerging", c.emerging?.label === "Creative #6");
  ok("no format claim without a lesson", c.bestFormat === null);

  ok("under-spending is explained", budgetNote(140000, 70000, 0, null).includes("50%"));
  ok("budget changes are counted", budgetNote(140000, 124000, 2, null).includes("2 budget changes"));

  const why = healthWhy(
    { score: 84, status: "healthy", areas: [{ key: "creative", label: "Creative Health", score: 80 }, { key: "audience", label: "Audience Health", score: 70 }] },
    { score: 78, status: "attention", areas: [{ key: "creative", label: "Creative Health", score: 72 }, { key: "audience", label: "Audience Health", score: 73 }] },
  );
  ok("health changes name the areas", why.includes("Creative Health improved by 8") && why.includes("Audience Health fell by 3"));
}

console.log("\n— next week's plan —");
{
  const plan = nextWeekPlan([
    { title: "Fatigue", happened: "x", recommendation: "Make a new version", severity: "ATTENTION", confidence: "HIGH", category: "CREATIVE", decisionId: "d1", action: null },
    { title: "Retarget", happened: "y", recommendation: "Create the audience", severity: "OPPORTUNITY", confidence: "MEDIUM", category: "AUDIENCE", decisionId: null, action: { label: "Open Meta", href: "https://x" } },
    { title: "Note", happened: "z", recommendation: "n", severity: "INFO", confidence: "HIGH", category: "BUDGET", decisionId: null, action: null },
  ]);
  ok("information-only findings aren't plan items", plan.length === 2);
  ok("needs-attention is high priority", plan[0].priority === "High");
  ok("each has a purpose", plan.every((p) => p.purpose.length > 5));
  ok("a decision links to Decisions", plan[0].href === "/dashboard/decisions");
}

console.log("\n— the summary —");
{
  const s = plainSummary({ glance: { current: account(), previous: account({ revenueCents: 250000, costPerResultCents: 3800 }), profitKnown: false }, win: null, attention: [], changes: [], resultWord: "purchase" }, false);
  ok("a better week reads as stronger", s.startsWith("This was a stronger week"));
  ok("no promises", !/will increase|guarantee/i.test(s));
  ok("no spend means nothing to report", plainSummary({ glance: { current: account({ spendCents: 0 }), previous: null, profitKnown: false }, win: null, attention: [], changes: [], resultWord: "purchase" }, false).startsWith("Nothing was spent"));
  ok("3–5 sentences at most", s.split(". ").length <= 6);
}

console.log("\n— the week covered —");
{
  // Wednesday 30 Sep 2026, 02:00 UTC is still Tuesday 29 Sep in New York.
  const now = new Date("2026-09-30T02:00:00Z");
  ok("the weekday is the business's own", localToday(now, "America/New_York").weekday === 2);
  const w = lastWeekFor(now, "America/New_York");
  ok("the seven days before today", w.since.toISOString().slice(0, 10) === "2026-09-22" && w.until.toISOString().slice(0, 10) === "2026-09-28");
  ok("labelled as a range", weekLabel("2026-09-21", "2026-09-27") === "September 21 – September 27");
}

console.log(bad ? `\n${bad} check(s) failed.` : "\nAll checks passed.");
process.exit(bad ? 1 : 0);
