import { db } from "@/lib/db";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { platformName } from "@/lib/ad-platforms/registry";
import type { AdPlatform } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";

// The month, in one page.
//
// This is the artefact somebody forwards to a business partner, so every
// figure on it has to survive being read by a sceptic. That rules out the
// three things a monthly report normally does:
//
//   No projections dressed as results. "Recommended next month" is a
//   recommendation and is labelled as one; it is never added to a total.
//
//   No zero-for-null. A platform that reported nothing reported nothing. The
//   report says "not reported" rather than printing a confident 0, because a
//   0 next to "revenue" is a claim and a dash is an absence.
//
//   No summary that is braver than the data. The written paragraph is
//   assembled from the figures that exist, and when there are too few it says
//   so rather than producing the encouraging sentence a template would.
//
// The recommended budget is the one number with judgement in it, so the rule
// behind it is stated on the page: MAIRO suggests more only when the month
// actually returned more than it cost, and the suggestion is a step rather
// than a leap because a budget that doubles overnight re-enters the platform's
// learning phase and usually performs worse for a fortnight.

export type MonthKey = { year: number; month: number };

export type MonthlyReport = {
  /** The month this covers, already formatted — "August 2026". */
  label: string;
  range: { since: Date; until: Date };

  spendCents: number | null;
  revenueCents: number | null;
  roas: number | null;
  purchases: number | null;
  costPerPurchaseCents: number | null;

  creativesTested: number;
  adsPaused: number;
  changesMade: number;

  /** The platform with the cheapest result, when more than one is comparable. */
  bestPlatform: { platform: AdPlatform; name: string; costPerPurchaseCents: number } | null;

  /** A suggestion, never a total. Null when the month cannot support one. */
  recommendedNextCents: number | null;
  recommendationWhy: string;

  /** The written paragraph, assembled from what is actually known. */
  summary: string;

  /** True when there is not enough to report on at all. */
  thin: boolean;
};

/** First and last instant of a month, in the server's zone. */
export function monthRange({ year, month }: MonthKey): { since: Date; until: Date } {
  const since = new Date(year, month, 1, 0, 0, 0, 0);
  const until = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { since, until };
}

export function monthLabel({ year, month }: MonthKey): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** The month before the one containing `now`. The default report to show. */
export function lastCompleteMonth(now = new Date()): MonthKey {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function money(cents: number | null): string {
  if (cents === null) return "not reported";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * How much to suggest for next month.
 *
 * Only ever from a month that returned more than it cost, and only ever a
 * step. A budget that doubles overnight puts every campaign back into the
 * platform's learning phase, which reliably performs worse for a week or two —
 * so a recommendation to double would be advice that hurts the thing it was
 * meant to help.
 */
function recommendNext(
  spendCents: number | null,
  roas: number | null,
): { cents: number | null; why: string } {
  if (spendCents === null || spendCents <= 0) {
    return { cents: null, why: "There is no spend to base a recommendation on yet." };
  }
  if (roas === null) {
    return {
      cents: spendCents,
      why: "The platforms have not reported what your advertising returned, so MAIRO suggests holding steady rather than guessing.",
    };
  }
  if (roas < 1) {
    return {
      cents: Math.round(spendCents * 0.8),
      why: "Your advertising cost more than it brought back this month, so MAIRO suggests easing off while it works out what is not landing rather than spending more on it.",
    };
  }
  if (roas < 2) {
    return {
      cents: spendCents,
      why: "Your advertising roughly paid for itself. MAIRO suggests holding the budget steady and letting it improve what is running before adding money to it.",
    };
  }
  return {
    cents: Math.round(spendCents * 1.2),
    why: "Your advertising returned more than it cost, so MAIRO suggests a gradual increase. It is deliberately a step rather than a leap — a budget that jumps too far restarts the platform's learning and usually performs worse for a fortnight.",
  };
}

function writeSummary(input: {
  spendCents: number | null;
  revenueCents: number | null;
  roas: number | null;
  purchases: number | null;
  changesMade: number;
  creativesTested: number;
  bestPlatformName: string | null;
}): string {
  const parts: string[] = [];

  if (input.spendCents === null) {
    return "Nothing ran this month, so there is nothing to report. The figures here fill in once a campaign has been live for a few days.";
  }

  if (input.roas !== null && input.revenueCents !== null) {
    parts.push(
      `You spent ${money(input.spendCents)} and your advertising brought back ${money(input.revenueCents)} — about ${input.roas.toFixed(1)}x what it cost.`,
    );
  } else if (input.purchases !== null && input.purchases > 0) {
    parts.push(
      `You spent ${money(input.spendCents)} and got ${input.purchases} ${input.purchases === 1 ? "result" : "results"}. The platforms did not report what those were worth, so there is no return figure this month.`,
    );
  } else {
    parts.push(
      `You spent ${money(input.spendCents)}. The platforms have not reported results against it yet.`,
    );
  }

  if (input.creativesTested > 0) {
    parts.push(
      `MAIRO had ${input.creativesTested} ${input.creativesTested === 1 ? "ad" : "ads"} running for you.`,
    );
  }
  if (input.changesMade > 0) {
    parts.push(
      `It made ${input.changesMade} ${input.changesMade === 1 ? "change" : "changes"}, each recorded with the numbers behind it.`,
    );
  } else {
    parts.push("It made no changes — nothing in the figures called for one.");
  }
  if (input.bestPlatformName) {
    parts.push(`${input.bestPlatformName} produced your cheapest results.`);
  }

  return parts.join(" ");
}

export async function monthlyReport(
  organizationId: string,
  key: MonthKey,
): Promise<MonthlyReport> {
  const range = monthRange(key);

  // Everything scoped to the month. The counts are of things that HAPPENED in
  // it, not of things that exist now — a report about August that changes when
  // somebody deletes a creative in October is not a report.
  const [report, creativesTested, adsPaused, changesMade] = await Promise.all([
    fetchOrganizationPerformance(organizationId, range).catch(() => null),
    db.platformCreative.count({
      where: { organizationId, createdAt: { gte: range.since, lte: range.until } },
    }),
    db.mairoCampaign.count({
      where: {
        organizationId,
        status: "PAUSED",
        updatedAt: { gte: range.since, lte: range.until },
      },
    }),
    db.optimizationRecommendation.count({
      where: {
        mairoCampaign: { organizationId },
        appliedAt: { gte: range.since, lte: range.until },
      },
    }),
  ]);

  const total: PlatformMetrics | null = report?.total ?? null;
  const spendCents = total?.spendCents ?? null;
  const revenueCents = total?.revenueCents ?? null;
  const purchases = total?.purchases ?? total?.conversions ?? null;
  const roas =
    total?.roas ??
    (revenueCents !== null && spendCents !== null && spendCents > 0
      ? revenueCents / spendCents
      : null);
  const costPerPurchaseCents =
    total?.costPerPurchaseCents ??
    (spendCents !== null && purchases !== null && purchases > 0
      ? Math.round(spendCents / purchases)
      : null);

  // Cheapest result, only among platforms that produced any.
  const comparable = (report?.byPlatform ?? []).filter(
    (p) => p.metrics.costPerPurchaseCents !== null && (p.metrics.purchases ?? 0) > 0,
  );
  const best =
    comparable.length > 0
      ? comparable.reduce((a, b) =>
          (a.metrics.costPerPurchaseCents ?? Infinity) < (b.metrics.costPerPurchaseCents ?? Infinity)
            ? a
            : b,
        )
      : null;

  const recommendation = recommendNext(spendCents, roas);

  return {
    label: monthLabel(key),
    range,
    spendCents,
    revenueCents,
    roas,
    purchases,
    costPerPurchaseCents,
    creativesTested,
    adsPaused,
    changesMade,
    bestPlatform: best
      ? {
          platform: best.platform,
          name: platformName(best.platform),
          costPerPurchaseCents: best.metrics.costPerPurchaseCents!,
        }
      : null,
    recommendedNextCents: recommendation.cents,
    recommendationWhy: recommendation.why,
    summary: writeSummary({
      spendCents,
      revenueCents,
      roas,
      purchases,
      changesMade,
      creativesTested,
      bestPlatformName: best ? platformName(best.platform) : null,
    }),
    // Nothing spent and nothing made is a month with no report in it.
    thin: spendCents === null && creativesTested === 0 && changesMade === 0,
  };
}

/** Plain text, for the download. Deliberately not a PDF — see the route. */
export function reportAsText(report: MonthlyReport, businessName: string): string {
  const line = (k: string, v: string) => `${k.padEnd(34)}${v}`;
  return [
    `MAIRO — ${report.label}`,
    businessName,
    "",
    line("Advertising spend", money(report.spendCents)),
    line("Revenue from advertising", money(report.revenueCents)),
    line("Return on ad spend", report.roas === null ? "not reported" : `${report.roas.toFixed(2)}x`),
    line("Results", report.purchases === null ? "not reported" : String(report.purchases)),
    line("Cost per result", money(report.costPerPurchaseCents)),
    "",
    line("Ads running this month", String(report.creativesTested)),
    line("Campaigns paused", String(report.adsPaused)),
    line("Changes MAIRO made", String(report.changesMade)),
    line("Best platform", report.bestPlatform ? report.bestPlatform.name : "not enough data"),
    "",
    line(
      "Recommended next month",
      report.recommendedNextCents === null ? "no recommendation" : money(report.recommendedNextCents),
    ),
    report.recommendationWhy,
    "",
    "Summary",
    report.summary,
    "",
    "Figures come from the advertising platforms' own reporting and may differ",
    "slightly from what they show in their dashboards. MAIRO cannot promise",
    "sales, leads or a particular return.",
  ].join("\n");
}

/**
 * Tell each business their month is ready, once.
 *
 * Runs on the daily cron and does nothing for most of the month: reports are
 * only announced in the first few days after a month closes, and the dedupe
 * key is the month itself, so a sweep that runs every day for a week produces
 * exactly one notification.
 *
 * Only for businesses whose month actually had something in it. A notification
 * announcing a report that says "nothing ran" is the kind of thing that
 * teaches people to ignore the bell.
 */
export async function announceMonthlyReports(
  opts: { now?: Date; limit?: number } = {},
): Promise<{ considered: number; created: number }> {
  const now = opts.now ?? new Date();
  const result = { considered: 0, created: 0 };

  // Only in the opening days of a month. Later than that, the report is
  // something they go and look at rather than something worth interrupting for.
  if (now.getDate() > 5) return result;

  const key = lastCompleteMonth(now);
  const { since, until } = monthRange(key);

  const organizations = await db.organization.findMany({
    where: {
      mairoCampaigns: {
        some: { status: { not: "DRAFT" }, createdAt: { lte: until } },
      },
    },
    select: { id: true },
    take: opts.limit ?? 50,
  });

  for (const org of organizations) {
    result.considered += 1;
    try {
      const report = await monthlyReport(org.id, key);
      if (report.thin) continue;

      const { notify } = await import("@/lib/notifications/notify");
      const written = await notify({
        organizationId: org.id,
        kind: "MONTHLY_REPORT",
        // The month is the situation. A daily sweep across the first five days
        // finds this key already written and does nothing.
        dedupeKey: `monthly-report:${key.year}-${key.month}`,
        title: `Your ${report.label} report is ready`,
        body: report.summary,
        actionLabel: "Read the report",
        actionHref: `/dashboard/reports?m=${key.year}-${String(key.month + 1).padStart(2, "0")}`,
        evidence: {
          spendCents: report.spendCents,
          revenueCents: report.revenueCents,
          roas: report.roas,
        },
      });
      if (written.created) result.created += 1;
    } catch (error) {
      // One account's unreachable platform must not cost every other account
      // their report notification.
      console.error(`Monthly report announce failed for ${org.id}:`, error);
    }
  }

  // `since` is unused beyond documenting the window the report covers; the
  // report function derives its own range from the key.
  void since;
  return result;
}
