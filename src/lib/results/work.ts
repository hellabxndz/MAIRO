import { db } from "@/lib/db";

// What MAIRO's AI team actually did for one business — counted from the
// records each piece of work left behind, with when the latest one happened
// and where to see them all. Counts only: no "money saved" or "revenue
// recovered", because what a change was worth can't be told apart from
// everything else that moved at the same time. Every query is scoped to the
// one organization.

export type WorkItem = {
  key: "campaigns" | "recommendations" | "optimizations" | "issues" | "experiments" | "reports";
  label: string;
  count: number;
  /** What's in the count, in a line. */
  detail: string;
  latestAt: Date | null;
  href: string;
};

type Range = { since: Date; until: Date } | null;

const later = (...ds: (Date | null | undefined)[]): Date | null => ds.reduce<Date | null>((a, d) => (d && (!a || d > a) ? d : a), null);
const n = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString("en-US")} ${k === 1 ? one : many}`;

/** The team's work in a period, or since the business started when `range` is null. */
export async function teamWork(organizationId: string, range: Range): Promise<WorkItem[]> {
  const within = (field: string) => (range ? { [field]: { gte: range.since, lte: range.until } } : {});
  const runDone = { status: { in: ["DONE" as const, "NOTHING" as const] } };

  const [campaigns, decisions, approved, automatic, legacyApplied, insights, findings, tests, measuredChanges, measuredPlans, weekly, dailyReviews, coachReviews] = await Promise.all([
    // Built and accepted by Meta: a drafted campaign that never reached the network isn't counted.
    db.mairoCampaign.aggregate({ where: { organizationId, ...within("createdAt"), platformCampaigns: { some: { externalCampaignId: { not: null } } } }, _count: { _all: true }, _max: { createdAt: true } }),
    db.mairoDecision.aggregate({ where: { organizationId, ...within("createdAt") }, _count: { _all: true }, _max: { createdAt: true } }),
    db.mairoDecision.aggregate({ where: { organizationId, status: "APPLIED", automatic: false, ...within("decidedAt") }, _count: { _all: true }, _max: { decidedAt: true } }),
    db.mairoDecision.aggregate({ where: { organizationId, status: "APPLIED", automatic: true, ...within("decidedAt") }, _count: { _all: true }, _max: { decidedAt: true } }),
    db.optimizationRecommendation.aggregate({ where: { mairoCampaign: { organizationId }, appliedAt: range ? { gte: range.since, lte: range.until } : { not: null } }, _count: { _all: true }, _max: { appliedAt: true } }),
    db.mairoInsight.aggregate({ where: { organizationId, ...within("createdAt") }, _count: { _all: true }, _max: { createdAt: true } }),
    db.coachFinding.aggregate({ where: { organizationId, ...within("firstSeenAt") }, _count: { _all: true }, _max: { firstSeenAt: true } }),
    // A second version of an ad put up against the first, on Meta.
    db.mairoDecision.aggregate({ where: { organizationId, status: "APPLIED", category: "TESTING", ...within("decidedAt") }, _count: { _all: true }, _max: { decidedAt: true } }),
    // A change carried out, then compared two weeks before against two weeks after.
    db.mairoDecision.aggregate({ where: { organizationId, verdictAt: range ? { gte: range.since, lte: range.until } : { not: null } }, _count: { _all: true }, _max: { verdictAt: true } }),
    db.coachFinding.aggregate({ where: { organizationId, verdictAt: range ? { gte: range.since, lte: range.until } : { not: null } }, _count: { _all: true }, _max: { verdictAt: true } }),
    db.weeklyReport.aggregate({ where: { organizationId, ...within("generatedAt") }, _count: { _all: true }, _max: { generatedAt: true } }),
    db.agentRun.aggregate({ where: { organizationId, task: "team-review", ...runDone, ...within("startedAt") }, _count: { _all: true }, _max: { startedAt: true } }),
    db.agentRun.aggregate({ where: { organizationId, task: "coach-review", ...runDone, ...within("startedAt") }, _count: { _all: true }, _max: { startedAt: true } }),
  ]);

  const applied = approved._count._all + automatic._count._all + legacyApplied._count._all;
  const issues = insights._count._all + findings._count._all;
  const experiments = tests._count._all + measuredChanges._count._all + measuredPlans._count._all;
  const reports = weekly._count._all + dailyReviews._count._all + coachReviews._count._all;
  const parts = (xs: (string | null)[]) => xs.filter(Boolean).join(" · ") || "None yet.";

  return [
    {
      key: "campaigns",
      label: "Campaigns created on Meta",
      count: campaigns._count._all,
      detail: "Built by your AI team and accepted by Meta. Drafts that never reached Meta aren't counted.",
      latestAt: campaigns._max.createdAt,
      href: "/dashboard/campaigns",
    },
    {
      key: "recommendations",
      label: "Recommendations made",
      count: decisions._count._all,
      detail: "Changes your AI team proposed, each with the figures behind it. Every issue below also comes with a next step.",
      latestAt: decisions._max.createdAt,
      href: "/dashboard/decisions",
    },
    {
      key: "optimizations",
      label: "Optimizations carried out",
      count: applied,
      detail: parts([approved._count._all ? `${n(approved._count._all, "you approved", "you approved")}` : null, automatic._count._all ? `${automatic._count._all.toLocaleString("en-US")} within limits you set` : null, legacyApplied._count._all ? `${legacyApplied._count._all.toLocaleString("en-US")} earlier budget changes` : null]),
      latestAt: later(approved._max.decidedAt, automatic._max.decidedAt, legacyApplied._max.appliedAt),
      href: "/dashboard/activity",
    },
    {
      key: "issues",
      label: "Issues detected",
      count: issues,
      detail: parts([insights._count._all ? n(insights._count._all, "problem caught in your campaigns", "problems caught in your campaigns") : null, findings._count._all ? n(findings._count._all, "Performance Coach finding") : null]),
      latestAt: later(insights._max.createdAt, findings._max.firstSeenAt),
      href: "/dashboard/coach",
    },
    {
      key: "experiments",
      label: "Experiments run",
      count: experiments,
      detail: parts([tests._count._all ? n(tests._count._all, "ad test started on Meta", "ad tests started on Meta") : null, measuredChanges._count._all + measuredPlans._count._all ? n(measuredChanges._count._all + measuredPlans._count._all, "change measured before and after", "changes measured before and after") : null]),
      latestAt: later(tests._max.decidedAt, measuredChanges._max.verdictAt, measuredPlans._max.verdictAt),
      href: "/dashboard/coach#history",
    },
    {
      key: "reports",
      label: "Performance reports completed",
      count: reports,
      detail: parts([weekly._count._all ? n(weekly._count._all, "weekly report") : null, dailyReviews._count._all ? n(dailyReviews._count._all, "daily review") : null, coachReviews._count._all ? n(coachReviews._count._all, "Performance Coach review") : null]),
      latestAt: later(weekly._max.generatedAt, dailyReviews._max.startedAt, coachReviews._max.startedAt),
      href: "/dashboard/team#activity",
    },
  ];
}
