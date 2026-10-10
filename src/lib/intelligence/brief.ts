import { clickRate, costPerResult, frequency, pastLearning } from "@/lib/decisions/rules";
import type { DecisionInput } from "@/lib/decisions/types";
import { resultsFor, usd } from "@/lib/protection/rules";
import { aggregateMetrics } from "./metrics";
import type { BriefFigures, BriefReport, Insight } from "./types";

// Your Morning Brief: yesterday (or last week) in four numbers, the ad that
// did the most with the least, and what MAIRO is keeping an eye on. Built to
// be read in half a minute; the actions for today are the top open Insights,
// chosen on the screen, so the brief and everything else agree.

export type BriefAdRow = { label: string; campaignName: string; spendCents: number; results: number };

export function buildBrief(args: {
  period: "yesterday" | "week";
  since: string;
  until: string;
  figures: BriefFigures | null;
  before: BriefFigures | null;
  ads: BriefAdRow[];
  input: DecisionInput;
  insights: Insight[];
}): BriefReport {
  const { input, insights } = args;
  const totalSpend = args.ads.reduce((n, a) => n + a.spendCents, 0);
  const totalResults = args.ads.reduce((n, a) => n + a.results, 0);
  const best =
    args.ads.length >= 2 && totalResults >= 3 && totalSpend > 0
      ? args.ads
          .map((a) => ({ a, resultShare: a.results / totalResults, spendShare: a.spendCents / totalSpend }))
          .filter((x) => x.resultShare >= x.spendShare + 0.1)
          .sort((x, y) => y.resultShare - y.spendShare - (x.resultShare - x.spendShare))[0]
      : undefined;

  const judged = input.campaigns.filter((c) => pastLearning(c, input.now));
  const week = aggregateMetrics(judged.map((c) => c.week));
  const watching: BriefReport["watching"] = [];
  const ads = judged.reduce((n, c) => n + c.ads.length, 0);
  if (ads > 0) {
    const tired = insights.filter((i) => i.type === "creative-fatigue").length;
    watching.push({ label: "Creative performance", status: tired ? `${tired} ad${tired === 1 ? " is" : "s are"} wearing out` : `${ads} ad${ads === 1 ? "" : "s"} compared daily` });
  }
  const sales = judged.filter((c) => c.objective === "SALES");
  const cpa = sales.length ? costPerResult("SALES", aggregateMetrics(sales.map((c) => c.week))) : null;
  if (cpa !== null) watching.push({ label: "Cost per purchase", status: `${usd(cpa)} this week` });
  const daily = judged.reduce((n, c) => n + c.dailyBudgetCents * 7, 0);
  if (daily > 0 && week.spendCents !== null) watching.push({ label: "Budget efficiency", status: `${Math.round((week.spendCents / daily) * 100)}% of this week's budget spent` });
  const f = frequency(week);
  if (f !== null) watching.push({ label: "Audience fatigue", status: `Seen ${f.toFixed(1)}× each this week` });
  const siteResults = judged.filter((c) => c.destinationType === "WEBSITE").reduce((n, c) => n + (resultsFor(c.objective, c.week) ?? 0), 0);
  const siteClicks = judged.filter((c) => c.destinationType === "WEBSITE").reduce((n, c) => n + (c.week?.clicks ?? 0), 0);
  if (siteClicks > 0) watching.push({ label: "Website conversions", status: `${((siteResults / siteClicks) * 100).toFixed(1)}% of clicks convert` });
  const ctr = clickRate(week);
  if (watching.length < 3 && ctr !== null) watching.push({ label: "Click rate", status: `${(ctr * 100).toFixed(2)}% this week` });

  return {
    period: args.period,
    since: args.since,
    until: args.until,
    figures: args.figures,
    before: args.before,
    winner: best ? { label: best.a.label, campaignName: best.a.campaignName, resultShare: best.resultShare, spendShare: best.spendShare } : null,
    watching,
  };
}
