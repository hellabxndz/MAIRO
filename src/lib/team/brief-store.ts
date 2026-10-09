import { db } from "@/lib/db";
import { otherApprovals } from "@/lib/approvals/queue";
import { AGENT } from "./agents";
import { dailyBrief, type Brief, type BriefItem } from "./brief";
import type { TeamView } from "./store";

// What the Daily Brief reads, all scoped to one organization. Issues come
// from the team's verified statuses (a connection missing, a campaign Meta
// flagged, a task that failed) so the Brief and the AI Team screen can never
// disagree about what's wrong.

const DAY = 86_400_000;

export async function loadBrief(organizationId: string, team: TeamView, now = new Date()): Promise<Brief> {
  const since = new Date(now.getTime() - DAY);
  const [launchedCount, mission, plan, built, launchApproved, review, leadsLastDay, insights, applied, coachNew, done, pending, others] = await Promise.all([
    // Ran on Meta at some point: built campaigns wait as PENDING_REVIEW until they go live.
    db.platformCampaign.count({ where: { mairoCampaign: { organizationId }, externalCampaignId: { not: null }, status: { in: ["ACTIVE", "PAUSED"] } } }),
    db.marketingMission.findFirst({ where: { organizationId, status: { in: ["ACTIVE", "PROPOSED"] } }, select: { status: true } }),
    db.strategyPlan.findUnique({ where: { organizationId }, select: { status: true } }),
    db.platformCampaign.count({ where: { mairoCampaign: { organizationId }, externalCampaignId: { not: null } } }),
    db.mairoCampaign.count({ where: { organizationId, launchApprovedAt: { not: null } } }),
    db.agentRun.findFirst({ where: { organizationId, task: "team-review", status: { in: ["DONE", "NOTHING"] } }, orderBy: { startedAt: "desc" }, select: { id: true } }),
    db.lead.count({ where: { organizationId, createdAt: { gte: since }, status: { not: "SPAM" } } }),
    db.mairoInsight.findMany({ where: { organizationId, createdAt: { gte: since }, severity: { in: ["ATTENTION", "URGENT", "OPPORTUNITY"] } }, orderBy: { createdAt: "desc" }, take: 4, select: { title: true, happened: true, createdAt: true, mairoCampaignId: true } }),
    db.mairoDecision.findMany({ where: { organizationId, status: "APPLIED", decidedAt: { gte: since } }, orderBy: { decidedAt: "desc" }, take: 3, select: { title: true, decidedAt: true, automatic: true } }),
    db.coachFinding.findMany({ where: { organizationId, firstSeenAt: { gte: since }, status: { in: ["OPEN", "APPROVED"] } }, orderBy: { priority: "desc" }, take: 2, select: { id: true, title: true, firstSeenAt: true } }),
    db.agentRun.findMany({ where: { organizationId, status: "DONE", finishedAt: { gte: since }, task: { not: "team-review" }, summary: { not: null } }, orderBy: { finishedAt: "desc" }, take: 5, select: { agent: true, summary: true, finishedAt: true, href: true } }),
    db.mairoDecision.findFirst({ where: { organizationId, status: "PENDING" }, orderBy: [{ urgent: "desc" }, { createdAt: "desc" }], select: { title: true } }),
    otherApprovals(organizationId, now).catch(() => []),
  ]);
  const results = review
    ? await db.agentRun.findFirst({ where: { organizationId, parentId: review.id, agent: "ANALYST", task: "read-results", summary: { not: null } }, select: { summary: true, detail: true, finishedAt: true, startedAt: true } })
    : null;

  const changes: BriefItem[] = [
    ...applied.map((d) => ({ text: `${d.automatic ? "Made within your limits" : "Carried out your approval"}: ${d.title}`, href: "/dashboard/activity", at: d.decidedAt, agent: null })),
    ...insights.map((i) => ({ text: `${i.title}. ${i.happened}`.replace(/\.\./g, "."), href: i.mairoCampaignId ? `/dashboard/campaigns/${i.mairoCampaignId}` : "/dashboard/analytics", at: i.createdAt, agent: null })),
    ...coachNew.map((f) => ({ text: `New from your Performance Coach: ${f.title}`, href: `/dashboard/coach#${f.id}`, at: f.firstSeenAt, agent: "ANALYST" as const })),
  ];
  const issues: BriefItem[] = team.statuses
    .filter((s) => s.state === "ATTENTION" || s.state === "ERROR" || s.state === "CONNECT")
    .map((s) => ({ text: `${AGENT[s.role].name}: ${s.line}`, href: s.state === "CONNECT" ? "/dashboard/meta" : `/dashboard/team?agent=${s.role}#activity`, at: null, agent: s.role }));

  return dailyBrief({
    now,
    launched: launchedCount > 0,
    setup: { goal: Boolean(mission) || Boolean(plan), meta: team.metaConnected, plan: mission?.status === "ACTIVE" || plan?.status === "APPROVED", built: built > 0, launchApproved: launchApproved > 0 },
    results: results?.summary ? { summary: results.summary, detail: results.detail, at: results.finishedAt ?? results.startedAt } : null,
    leadsLastDay,
    changes,
    completed: done.map((r) => ({ text: r.summary!, href: r.href, at: r.finishedAt, agent: r.agent })),
    issues,
    pending: { count: team.pending + others.length, top: pending?.title ?? others[0]?.title ?? null },
    nextReview: team.nextReview,
    liveCampaigns: team.liveCampaigns,
  });
}
