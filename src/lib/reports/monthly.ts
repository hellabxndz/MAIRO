import { leadFunnel, type LeadFunnel } from "@/lib/leads/outcomes";
import { stageLabels } from "@/lib/leads/details";
import { db } from "@/lib/db";
import { resultsKind, resultsModel, type ResultsKind, type ResultsModel } from "@/lib/results/model";
import { teamWork, type WorkItem } from "@/lib/results/work";
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
  /** The month this covers, already formatted — "August 2026", or "October 2026 so far". */
  label: string;
  range: { since: Date; until: Date };
  /** The month hasn't finished: figures run to today. */
  partial: boolean;

  spendCents: number | null;
  revenueCents: number | null;
  roas: number | null;
  purchases: number | null;
  costPerPurchaseCents: number | null;

  /** Leads Meta reported (form fills, instant forms). Null when it reported none. */
  leads: number | null;
  /** The headline result: sales when there were any, otherwise leads, otherwise conversions. */
  results: number | null;
  resultLabel: "Sales" | "Leads" | "Results";
  costPerResultCents: number | null;

  creativesTested: number;
  adsPaused: number;
  changesMade: number;

  /** MAIRO's work this month — counts of things that happened in it. */
  work: {
    campaignsCreated: number;
    recommendations: number;
    approved: number;
    declined: number;
    problemsFound: number;
    reportsGenerated: number;
    /** The recommendations the business said yes to, newest first. */
    accepted: string[];
  };
  /** What the business marked its enquiries as — never assumed. */
  leadOutcomes: LeadFunnel;
  /** Whether a Meta pixel was reporting sales — revenue figures depend on it. */
  salesTracked: boolean;

  /** The platform with the cheapest result, when more than one is comparable. */
  bestPlatform: { platform: AdPlatform; name: string; costPerPurchaseCents: number } | null;

  /** A suggestion, never a total. Null when the month cannot support one. */
  recommendedNextCents: number | null;
  recommendationWhy: string;

  /** The written paragraph, assembled from what is actually known. */
  summary: string;

  /** True when there is not enough to report on at all. */
  thin: boolean;

  /** Which figures this business is measured by, and why. */
  kind: ResultsKind;
  kindWhy: string;
  /** The month from ad to customer, each figure with its source. */
  outcomes: ResultsModel;
  /** What the AI team did in the month, from its records. */
  team: WorkItem[];
  /** Why Meta couldn't be read, when it couldn't — so a dash isn't mistaken for "nothing ran". */
  metaProblem: string | null;
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

/** The month containing `now`. */
export function currentMonth(now = new Date()): MonthKey {
  return { year: now.getFullYear(), month: now.getMonth() };
}

export const sameMonth = (a: MonthKey, b: MonthKey) => a.year === b.year && a.month === b.month;

/** The month's range, ending now for the month still running. */
export function reportRange(key: MonthKey, now = new Date()): { since: Date; until: Date; partial: boolean } {
  const range = monthRange(key);
  return range.until > now ? { since: range.since, until: now, partial: true } : { ...range, partial: false };
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
export function recommendNext(
  spendCents: number | null,
  roas: number | null,
  opts: { basis?: "verified" | "meta"; hold?: string | null } = {},
): { cents: number | null; why: string } {
  if (spendCents === null || spendCents <= 0) {
    return { cents: null, why: "There is no spend to base a recommendation on yet." };
  }
  // An open question about the leads themselves comes before more money.
  if (opts.hold) return { cents: spendCents, why: opts.hold };
  const said = opts.basis === "meta" ? "Meta reports that your advertising" : "Your advertising";
  if (roas === null) {
    return {
      cents: spendCents,
      why: "The platforms have not reported what your advertising returned, so MAIRO suggests holding steady rather than guessing.",
    };
  }
  if (roas < 1) {
    return {
      cents: Math.round(spendCents * 0.8),
      why: `${said} cost more than it brought back this month, so MAIRO suggests easing off while it works out what is not landing rather than spending more on it.`,
    };
  }
  if (roas < 2) {
    return {
      cents: spendCents,
      why: `${said} roughly paid for itself. MAIRO suggests holding the budget steady and letting it improve what is running before adding money to it.`,
    };
  }
  return {
    cents: Math.round(spendCents * 1.2),
    why: `${said} returned more than it cost, so MAIRO suggests a gradual increase.${opts.basis === "meta" ? " That is Meta's own estimate, not sales your store confirmed." : ""} It is deliberately a step rather than a leap — a budget that jumps too far restarts the platform's learning and usually performs worse for a fortnight.`,
  };
}

function writeSummary(input: {
  spendCents: number | null;
  revenueCents: number | null;
  roas: number | null;
  purchases: number | null;
  resultNoun: [string, string];
  leadOutcomes: LeadFunnel;
  approved: number;
  changesMade: number;
  creativesTested: number;
  bestPlatformName: string | null;
  metaProblem?: string | null;
  partial?: boolean;
}): string {
  const parts: string[] = [];
  const month = input.partial ? "this month so far" : "this month";

  if (input.spendCents === null) {
    if (input.metaProblem) return "MAIRO couldn't read your results from Meta just now, so this month's spend and results are missing here — not zero. Try again in a minute.";
    return `Meta hasn't reported any advertising spend ${month}, so there are no results to show yet. The figures here fill in once a campaign has been live on Meta for a few days.`;
  }

  if (input.roas !== null && input.revenueCents !== null) {
    parts.push(
      `You spent ${money(input.spendCents)}, and Meta reports your advertising brought back ${money(input.revenueCents)} — about ${input.roas.toFixed(1)}x what it cost, by Meta's own attribution.`,
    );
  } else if (input.purchases !== null && input.purchases > 0) {
    parts.push(
      `You spent ${money(input.spendCents)} and Meta reported ${input.purchases} ${input.purchases === 1 ? input.resultNoun[0] : input.resultNoun[1]}. It didn't report what those were worth, so there is no return figure this month — a reported lead isn't revenue until it becomes a paying customer.`,
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
  const lo = input.leadOutcomes;
  if (lo.qualified || lo.booked || lo.won) {
    parts.push(
      `Of the enquiries that came in, you marked ${[lo.qualified ? `${lo.qualified} as good leads` : null, lo.booked ? `${lo.booked} booked` : null, lo.won ? `${lo.won} as paying customers` : null].filter(Boolean).join(", ")}.`,
    );
  }
  if (input.changesMade > 0) {
    parts.push(
      `It made ${input.changesMade} ${input.changesMade === 1 ? "change" : "changes"}${input.approved ? `, including ${input.approved} you approved` : ""}, each recorded with the numbers behind it.`,
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
  opts: { now?: Date } = {},
): Promise<MonthlyReport> {
  const { partial, ...range } = reportRange(key, opts.now);

  // Everything scoped to the month. The counts are of things that HAPPENED in
  // it, not of things that exist now — a report about August that changes when
  // somebody deletes a creative in October is not a report.
  const inMonth = { gte: range.since, lte: range.until };
  let metaProblem: string | null = null;
  const [report, creativesTested, adsPaused, team, approvedRows, declined, monthLeads, pixel, org, profile, campaigns, store, orders, qualityFinding] = await Promise.all([
    fetchOrganizationPerformance(organizationId, range).catch((e: unknown) => {
      metaProblem = e instanceof Error ? e.message : "Meta didn't answer";
      return null;
    }),
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
    teamWork(organizationId, range),
    // Only the ones a person said yes to — changes made within the business's
    // limits are counted with the optimizations, not as approvals.
    db.mairoDecision.findMany({
      where: { organizationId, status: "APPLIED", automatic: false, decidedAt: inMonth },
      orderBy: { decidedAt: "desc" },
      select: { title: true },
      take: 50,
    }),
    db.mairoDecision.count({ where: { organizationId, status: "REJECTED", decidedAt: inMonth } }),
    db.lead.findMany({ where: { organizationId, createdAt: inMonth }, select: { status: true, valueCents: true, source: true, mairoCampaignId: true } }),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } }, select: { status: true } }),
    db.organization.findUnique({ where: { id: organizationId }, select: { industry: true, leadStagesJson: true, intake: { select: { primaryGoal: true } } } }),
    db.trackingProfile.findUnique({ where: { organizationId }, select: { nicheId: true, nicheConfirmed: true } }),
    db.mairoCampaign.findMany({ where: { organizationId, status: { notIn: ["DRAFT", "ARCHIVED"] } }, select: { objective: true } }),
    db.storeIngest.findUnique({ where: { organizationId }, select: { id: true } }),
    db.conversionEvent.aggregate({ where: { organizationId, eventName: "Purchase", occurredAt: inMonth }, _count: { _all: true }, _sum: { valueCents: true } }),
    // The Performance Coach is looking into lead quality: more budget waits.
    db.coachFinding.findFirst({ where: { organizationId, category: "LEAD_QUALITY", status: { in: ["OPEN", "APPROVED"] } }, select: { title: true } }),
  ]);
  if (!metaProblem && report?.problems.length) metaProblem = report.problems[0].message;
  const work = Object.fromEntries(team.map((w) => [w.key, w.count])) as Record<WorkItem["key"], number>;
  const changesMade = work.optimizations;

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

  const leads = total?.leads ?? null;
  const sales = total?.purchases ?? null;
  const [results, resultLabel]: [number | null, MonthlyReport["resultLabel"]] =
    sales !== null && sales > 0 ? [sales, "Sales"] : leads !== null && leads > 0 ? [leads, "Leads"] : [purchases, "Results"];
  const costPerResultCents = spendCents !== null && results !== null && results > 0 ? Math.round(spendCents / results) : null;
  const leadOutcomes = leadFunnel(monthLeads);

  const { kind, why: kindWhy } = resultsKind({
    nicheId: profile?.nicheId ?? null,
    nicheConfirmed: profile?.nicheConfirmed ?? false,
    industry: org?.industry ?? null,
    goal: org?.intake?.primaryGoal ?? null,
    objectives: [...new Set(campaigns.map((c) => c.objective))],
    storedLeads: monthLeads.length,
  });
  const labels = stageLabels(org?.industry, org?.leadStagesJson);
  const outcomes = resultsModel({
    kind,
    labels,
    // Meta unreadable is "couldn't read", never "reported nothing".
    meta: report && !(metaProblem && !report.hasData) ? { spendCents, clicks: total?.clicks ?? null, leads, purchases: sales, revenueCents } : null,
    metaProblem,
    // Linked to a campaign MAIRO built, or from Meta's own form: only these count towards a return.
    leads: monthLeads.map((l) => ({ status: l.status, valueCents: l.valueCents, attributed: Boolean(l.mairoCampaignId) || l.source === "META_INSTANT" })),
    store: { connected: Boolean(store), orders: orders._count._all, valueCents: orders._sum.valueCents ?? 0 },
    salesTracked: pixel?.status === "ACTIVE",
  });

  // A confirmed return beats Meta's estimate of one.
  const verifiedRoas = outcomes.verifiedRoas;
  const recommendation = recommendNext(spendCents, verifiedRoas ?? roas, {
    basis: verifiedRoas !== null ? "verified" : "meta",
    hold: qualityFinding
      ? `Your Performance Coach is looking into lead quality ("${qualityFinding.title.toLowerCase()}"), so MAIRO suggests holding the budget steady until that's understood — more budget would mostly buy more of the same leads.`
      : null,
  });

  return {
    label: partial ? `${monthLabel(key)} so far` : monthLabel(key),
    range,
    partial,
    spendCents,
    revenueCents,
    roas,
    purchases,
    costPerPurchaseCents,
    leads,
    results,
    resultLabel,
    costPerResultCents,
    creativesTested,
    adsPaused,
    changesMade,
    work: {
      campaignsCreated: work.campaigns,
      recommendations: work.recommendations,
      approved: approvedRows.length,
      declined,
      problemsFound: work.issues,
      reportsGenerated: work.reports,
      accepted: [...new Set(approvedRows.map((r) => r.title))].slice(0, 5),
    },
    leadOutcomes,
    salesTracked: pixel?.status === "ACTIVE",
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
      purchases: results,
      resultNoun: resultLabel === "Sales" ? ["sale", "sales"] : resultLabel === "Leads" ? ["lead", "leads"] : ["result", "results"],
      leadOutcomes,
      approved: approvedRows.length,
      changesMade,
      creativesTested,
      bestPlatformName: best ? platformName(best.platform) : null,
      metaProblem,
      partial,
    }),
    // Nothing spent and nothing made is a month with no report in it — unless
    // Meta simply couldn't be read, which is a different thing to say.
    thin: spendCents === null && !metaProblem && creativesTested === 0 && changesMade === 0 && monthLeads.length === 0,
    kind,
    kindWhy,
    outcomes,
    team,
    metaProblem,
  };
}

/** Plain text, for the download. Deliberately not a PDF — see the route. */
export function reportAsText(report: MonthlyReport, businessName: string): string {
  const line = (k: string, v: string) => `${k.padEnd(38)}${v}`;
  const figure = (m: MonthlyReport["outcomes"]["metrics"][number]) => line(m.label, m.value === null ? "not known" : `${m.value}  (${m.source})`);
  return [
    `MAIRO — ${report.label}`,
    businessName,
    "",
    line("Advertising spend", money(report.spendCents)),
    line("Revenue from advertising", money(report.revenueCents)),
    line("Return on ad spend", report.roas === null ? "not reported" : `${report.roas.toFixed(2)}x`),
    line(report.resultLabel, report.results === null ? "not reported" : String(report.results)),
    line("Cost per result", money(report.costPerResultCents)),
    "",
    `Your results (${report.kind === "sales" ? "sales" : "leads and appointments"} — ${report.kindWhy})`,
    ...report.outcomes.metrics.map(figure),
    ...(report.outcomes.extra ? ["", report.outcomes.extra.title, ...report.outcomes.extra.metrics.map(figure)] : []),
    ...(report.metaProblem ? [`Meta couldn't be read: ${report.metaProblem}`] : []),
    "",
    "What your AI team did",
    line("Ads running this month", String(report.creativesTested)),
    line("Campaigns paused", String(report.adsPaused)),
    line("Changes MAIRO made", String(report.changesMade)),
    line("Recommendations MAIRO made", String(report.work.recommendations)),
    line("You approved", String(report.work.approved)),
    line("Problems MAIRO caught", String(report.work.problemsFound)),
    ...report.team.filter((w) => w.key === "campaigns" || w.key === "experiments" || w.key === "reports").map((w) => line(w.label, String(w.count))),
    ...(report.leadOutcomes.reported
      ? ["", line("Enquiries", String(report.leadOutcomes.real)), line("Marked good leads", String(report.leadOutcomes.qualified)), line("Booked", String(report.leadOutcomes.booked)), line("Paying customers", String(report.leadOutcomes.won))]
      : []),
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
    "slightly from what they show in their dashboards. A reported lead or",
    "conversion is not revenue, and ad results are not profit. Leads, bookings",
    "and customers are what you marked; sales values are what you or your store",
    "recorded. MAIRO cannot promise sales, leads or a particular return.",
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
        actionHref: `/dashboard/reports/monthly?m=${key.year}-${String(key.month + 1).padStart(2, "0")}`,
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
