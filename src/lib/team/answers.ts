import { db } from "@/lib/db";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { readinessFor } from "@/lib/readiness";
import { otherApprovals } from "@/lib/approvals/queue";
import { AGENT } from "./agents";
import { loadTeam } from "./store";

// Two answers "Ask your AI team" gives straight from the records, for the
// questions no single screen answers: how much has been spent, and what's the
// next best thing to do. Scoped to one organization; nothing here is
// estimated, and what couldn't be read is said.

const DAY = 86_400_000;

export type SpendWindow = { label: string; since: string; until: string; spendCents: number | null };

/** What Meta charged for MAIRO's campaigns: this month, last month, and since the first campaign. */
export async function spendSummary(organizationId: string, now = new Date()): Promise<{ windows: SpendWindow[]; problem: string | null; campaigns: number }> {
  const first = await db.mairoCampaign.findFirst({
    where: { organizationId, platformCampaigns: { some: { externalCampaignId: { not: null } } } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const campaigns = await db.mairoCampaign.count({ where: { organizationId, platformCampaigns: { some: { externalCampaignId: { not: null } } } } });
  if (!first) return { windows: [], problem: null, campaigns: 0 };
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastEnd = new Date(monthStart.getTime() - 1);
  const ranges = [
    { label: "This month so far", since: monthStart, until: now },
    { label: "Last month", since: lastStart, until: lastEnd },
    { label: "Since your first campaign", since: first.createdAt, until: now },
  ];
  let problem: string | null = null;
  const windows = await Promise.all(
    ranges.map(async (r) => {
      const report = await fetchOrganizationPerformance(organizationId, { since: r.since, until: r.until }).catch((e: unknown) => {
        problem = e instanceof Error ? e.message : "Meta didn't answer";
        return null;
      });
      if (report?.problems.length && !report.hasData) problem = report.problems[0].message;
      const spend = report && !(report.problems.length && !report.hasData) ? report.total.spendCents : null;
      return { label: r.label, since: r.since.toISOString().slice(0, 10), until: r.until.toISOString().slice(0, 10), spendCents: spend };
    }),
  );
  return { windows, problem, campaigns };
}

export type NextStep = { title: string; why: string; href: string; from: string };

/** The few things most worth doing next, most important first — each from a record, with where it came from. */
export async function nextBestSteps(organizationId: string, now = new Date()): Promise<NextStep[]> {
  const [readiness, others, decisions, coach, team, unmarked] = await Promise.all([
    readinessFor(organizationId).catch(() => null),
    otherApprovals(organizationId, now).catch(() => []),
    db.mairoDecision.findMany({ where: { organizationId, status: "PENDING" }, orderBy: [{ urgent: "desc" }, { createdAt: "desc" }], take: 3, select: { id: true, title: true, noticed: true, urgent: true } }),
    db.coachFinding.findFirst({ where: { organizationId, status: "OPEN", severity: "ATTENTION" }, orderBy: { priority: "desc" }, select: { id: true, title: true, plain: true } }),
    loadTeam(organizationId, { now }).catch(() => null),
    db.lead.count({ where: { organizationId, status: "NEW", createdAt: { gte: new Date(now.getTime() - 14 * DAY), lte: new Date(now.getTime() - DAY) } } }),
  ]);
  const out: NextStep[] = [];
  if (readiness && !readiness.ready && readiness.next?.owner === "you") out.push({ title: readiness.next.label, why: readiness.next.detail, href: readiness.next.href, from: "Your setup checklist" });
  for (const o of others.filter((x) => x.kind === "launch")) out.push({ title: o.title, why: `${o.text} ${o.budget}`, href: "/dashboard/decisions", from: "Your Approval Center" });
  for (const d of decisions.filter((x) => x.urgent)) out.push({ title: d.title, why: d.noticed, href: `/dashboard/decisions#d-${d.id}`, from: "Your Approval Center" });
  if (coach) out.push({ title: coach.title, why: coach.plain, href: `/dashboard/coach#${coach.id}`, from: "Your Performance Coach" });
  for (const d of decisions.filter((x) => !x.urgent)) out.push({ title: d.title, why: d.noticed, href: `/dashboard/decisions#d-${d.id}`, from: "Your Approval Center" });
  for (const s of team?.statuses.filter((x) => x.state === "ATTENTION" || x.state === "ERROR" || x.state === "CONNECT") ?? []) {
    out.push({ title: `${AGENT[s.role].name}: ${s.label.toLowerCase()}`, why: s.line, href: s.state === "CONNECT" ? "/dashboard/meta" : `/dashboard/team?agent=${s.role}#activity`, from: "Your AI Team" });
  }
  if (unmarked > 0) out.push({ title: `Mark what happened to ${unmarked} lead${unmarked === 1 ? "" : "s"}`, why: "Only you know which were good, booked or became customers. Until they're marked, MAIRO can only judge your ads by form fills.", href: "/dashboard/leads", from: "Your leads" });
  for (const o of others.filter((x) => x.kind !== "launch")) out.push({ title: o.title, why: o.text, href: o.href, from: "Your Approval Center" });
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.title) ? false : (seen.add(s.title), true))).slice(0, 3);
}
