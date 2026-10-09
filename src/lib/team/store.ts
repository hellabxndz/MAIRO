import { db } from "@/lib/db";
import type { AgentRole } from "@/generated/prisma/enums";
import { fetchMetaBillingStatus } from "@/lib/meta/billing";
import { AGENTS, agentForDecision } from "./agents";
import { agentStatus, nextScheduledReview, teamWelcome, type AgentStatus, type RunLite } from "./status";

// Everything the AI Team screen shows, from records that already exist:
// the team's runs, the decisions waiting on the business, the campaigns,
// and the account's connections. One round of reads, plus Meta's (cached)
// billing answer when there's something live to pay for.

const DAY = 86_400_000;

export type FeedItem = {
  id: string;
  agent: AgentRole;
  status: "RUNNING" | "DONE" | "NOTHING" | "FAILED";
  summary: string;
  detail: string | null;
  href: string | null;
  at: Date;
};

export type TeamView = {
  statuses: AgentStatus[];
  welcome: string;
  pending: number;
  pendingByAgent: Partial<Record<AgentRole, number>>;
  /** Measurable things each did this month — counts of real outcomes, never invented impact. */
  contribution: Partial<Record<AgentRole, string>>;
  feed: FeedItem[];
  /** The latest daily team review's steps, for the Daily Brief. */
  brief: { at: Date; lines: FeedItem[] } | null;
  metaConnected: boolean;
  /** Campaigns running now. */
  liveCampaigns: number;
  /** The business's timezone, for every time shown. */
  timeZone: string;
  /** The next scheduled daily review, when there's something live to review. */
  nextReview: Date | null;
};

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export async function loadTeam(organizationId: string, opts: { agent?: AgentRole | null; now?: Date } = {}): Promise<TeamView> {
  const now = opts.now ?? new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [runs, pendingRows, meta, live, plan, waitingLaunch, troubled, trackingIssue, appliedThisMonth, protectionThisMonth, launchedThisMonth, reportsThisMonth, creativeThisMonth, lastReview, org] = await Promise.all([
    db.agentRun.findMany({ where: { organizationId, startedAt: { gte: new Date(now.getTime() - 30 * DAY) } }, orderBy: { startedAt: "desc" }, take: 300 }),
    db.mairoDecision.findMany({ where: { organizationId, status: "PENDING" }, select: { kind: true, category: true } }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true } }),
    db.mairoCampaign.count({ where: { organizationId, status: "ACTIVE" } }),
    db.strategyPlan.findUnique({ where: { organizationId }, select: { status: true } }),
    db.mairoCampaign.findFirst({
      where: { organizationId, launchApprovedAt: null, status: { not: "ARCHIVED" }, platformCampaigns: { some: { status: "PENDING_REVIEW", externalCampaignId: { not: null } } } },
      select: { name: true },
    }),
    db.platformCampaign.findFirst({
      where: { mairoCampaign: { organizationId, status: { not: "ARCHIVED" } }, OR: [{ lastError: { not: null } }, { adReviewState: { in: ["REJECTED", "WITH_ISSUES"] } }] },
      select: { lastError: true, adReviewExplanation: true, mairoCampaign: { select: { name: true } } },
    }),
    // The daily review's own tracking finding, from what Meta says about the
    // pixel — not MAIRO's copy, which can lag behind a pixel set up elsewhere.
    db.mairoInsight.findFirst({ where: { organizationId, category: "TRACKING", status: "OPEN" }, orderBy: { createdAt: "desc" }, select: { title: true } }),
    db.mairoDecision.findMany({ where: { organizationId, status: "APPLIED", decidedAt: { gte: monthStart } }, select: { kind: true, category: true } }),
    db.protectionEvent.count({ where: { organizationId, createdAt: { gte: monthStart } } }),
    db.mairoCampaign.count({ where: { organizationId, launchApprovedAt: { gte: monthStart } } }),
    db.weeklyReport.count({ where: { organizationId, generatedAt: { gte: monthStart } } }),
    db.agentRun.count({ where: { organizationId, agent: "CREATIVE", task: { in: ["ad-concept", "studio-image"] }, status: "DONE", startedAt: { gte: monthStart } } }),
    db.agentRun.findFirst({ where: { organizationId, task: "team-review", status: { in: ["DONE", "NOTHING"] } }, orderBy: { startedAt: "desc" }, select: { id: true, finishedAt: true, startedAt: true } }),
    db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } }),
  ]);
  const timeZone = org?.timezone || "America/New_York";
  const metaConnected = meta?.status === "CONNECTED";

  // Meta's answer about the payment method, only when something is live to
  // pay for — cached for 30 seconds, and "couldn't tell" is never a problem.
  const billing = metaConnected && live > 0 ? await fetchMetaBillingStatus(organizationId).catch(() => null) : null;
  const billingProblem = billing && billing.state !== "funded" && billing.state !== "unknown" ? billing.message : null;

  const pendingByAgent: Partial<Record<AgentRole, number>> = {};
  for (const d of pendingRows) {
    const role = agentForDecision(d.kind, d.category);
    pendingByAgent[role] = (pendingByAgent[role] ?? 0) + 1;
  }
  const appliedBy: Partial<Record<AgentRole, number>> = {};
  for (const d of appliedThisMonth) {
    const role = agentForDecision(d.kind, d.category);
    appliedBy[role] = (appliedBy[role] ?? 0) + 1;
  }

  const waitingFor: Partial<Record<AgentRole, string>> = {};
  if (plan && plan.status !== "APPROVED") waitingFor.STRATEGIST = "Your advertising plan is ready for you to review.";
  if (waitingLaunch) waitingFor.ARCHITECT = `“${waitingLaunch.name}” is built and waiting for your approval to launch.`;

  const attention: Partial<Record<AgentRole, string>> = {};
  if (troubled) attention.ARCHITECT = `“${troubled.mairoCampaign.name}” has a problem on Meta${troubled.adReviewExplanation ? `: ${troubled.adReviewExplanation}` : troubled.lastError ? `: ${troubled.lastError}` : ""}.`;
  if (billingProblem) attention.GUARDIAN = billingProblem;
  if (trackingIssue) attention.ANALYST = `${trackingIssue.title.replace(/\.$/, "")}. Results can't be measured properly until it's fixed.`;

  const byAgent = new Map<AgentRole, RunLite[]>();
  for (const r of runs) {
    if (r.task === "team-review") continue;
    byAgent.set(r.agent, [...(byAgent.get(r.agent) ?? []), r]);
  }
  // The coordinator's own runs count for the Strategy Agent too.
  byAgent.set("STRATEGIST", runs.filter((r) => r.agent === "STRATEGIST"));

  const statuses = AGENTS.map((a) =>
    agentStatus({
      role: a.role,
      now,
      timeZone,
      metaConnected,
      liveCampaigns: live,
      runs: byAgent.get(a.role) ?? [],
      pending: pendingByAgent[a.role] ?? 0,
      waitingFor: waitingFor[a.role] ?? null,
      attention: attention[a.role] ?? null,
    }),
  );

  const contribution: Partial<Record<AgentRole, string>> = {};
  const applied = (role: AgentRole) => (appliedBy[role] ? n(appliedBy[role]!, "change") + " you approved, carried out on Meta" : null);
  for (const role of ["OPTIMIZER", "AUDIENCE", "GROWTH", "STRATEGIST"] as const) {
    const a = applied(role);
    if (a) contribution[role] = a;
  }
  if (creativeThisMonth || appliedBy.CREATIVE) contribution.CREATIVE = [creativeThisMonth ? n(creativeThisMonth, "ad concept or image", "ad concepts and images") + " made" : null, applied("CREATIVE")].filter(Boolean).join(" · ");
  if (protectionThisMonth || appliedBy.GUARDIAN) contribution.GUARDIAN = [protectionThisMonth ? n(protectionThisMonth, "spend-limit action") : null, applied("GUARDIAN")].filter(Boolean).join(" · ");
  if (launchedThisMonth) contribution.ARCHITECT = `${n(launchedThisMonth, "campaign")} launched with your approval`;
  if (reportsThisMonth) contribution.ANALYST = n(reportsThisMonth, "weekly report");

  const feed: FeedItem[] = runs
    .filter((r) => r.summary && (!opts.agent || r.agent === opts.agent))
    .slice(0, 60)
    .map((r) => ({ id: r.id, agent: r.agent, status: r.status, summary: r.summary!, detail: r.detail, href: r.href, at: r.finishedAt ?? r.startedAt }));

  const briefLines = lastReview
    ? runs
        .filter((r) => r.parentId === lastReview.id && r.summary)
        .map((r) => ({ id: r.id, agent: r.agent, status: r.status, summary: r.summary!, detail: r.detail, href: r.href, at: r.finishedAt ?? r.startedAt }))
        .reverse()
    : [];

  return {
    statuses,
    welcome: teamWelcome({ now, statuses, pending: pendingRows.length, lastReviewAt: lastReview ? (lastReview.finishedAt ?? lastReview.startedAt) : null, timeZone }),
    pending: pendingRows.length,
    pendingByAgent,
    contribution,
    feed,
    brief: lastReview && briefLines.length ? { at: lastReview.finishedAt ?? lastReview.startedAt, lines: briefLines } : null,
    metaConnected,
    liveCampaigns: live,
    timeZone,
    nextReview: metaConnected && live > 0 ? nextScheduledReview(now) : null,
  };
}
