import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { viewMode } from "@/lib/view-mode";
import { refreshDecisions, quickDataStatus } from "@/lib/decisions/run";
import { decisionCounts, effectiveLevel, toView } from "@/lib/decisions/store";
import type { DecisionCategory, DecisionStatus } from "@/generated/prisma/enums";
import { DecisionList } from "@/components/decisions/decision-list";
import { DecisionHistory } from "@/components/decisions/history";
import { CATEGORY_LABEL } from "@/components/decisions/labels";
import { levelInfo } from "@/lib/automation/levels";
import { RefreshDecisionsButton } from "./refresh-button";
import { approvalFacts, type ApprovalFacts } from "@/lib/decisions/approval";
import { otherApprovals } from "@/lib/approvals/queue";
import { loadTrails } from "@/lib/team/trail-store";
import { TrailChain, TrailSteps } from "@/components/team/trail";
import { AgentIcon } from "@/components/team/agent-ui";
import { AGENT } from "@/lib/team/agents";
import { LaunchApprove } from "@/components/decisions/launch-approve";
import type { ReactNode } from "react";

// The Approval Center: everything waiting for the business's say-so, in one
// place. Campaigns built and waiting to launch, plans, Performance Coach
// plans and posts — then the changes the AI team recommends from its daily
// look, usually one to five, often none. None is a real answer and the page
// says so, rather than inventing something to fill the space.
//
// Every proposed change shows the specialist responsible, the change itself,
// the reason, the evidence, what it does to spending, the risk, what has to
// authorize it and how the team got there. Launches and anything that raises
// spending always wait for an explicit yes, and nothing is reported as done
// until Meta confirms it.

export const dynamic = "force-dynamic";
// Reading several windows of figures from the networks, on a stale page.
export const maxDuration = 30;

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "urgent", label: "Urgent" },
  { key: "growth", label: "Growth" },
  { key: "budget", label: "Budget" },
  { key: "creative", label: "Creative" },
  { key: "audience", label: "Audience" },
  { key: "website", label: "Website" },
  { key: "retargeting", label: "Retargeting" },
  { key: "testing", label: "Testing" },
  { key: "completed", label: "Completed" },
  { key: "rejected", label: "Rejected" },
];

const CATEGORY_OF: Record<string, DecisionCategory> = {
  growth: "GROWTH",
  budget: "BUDGET",
  creative: "CREATIVE",
  audience: "AUDIENCE",
  website: "WEBSITE",
  retargeting: "RETARGETING",
  testing: "TESTING",
};

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const { f } = await searchParams;
  const filter = FILTERS.some((x) => x.key === f) ? f! : "all";

  // A fresh look if the last one is old. Never lets a slow network take the
  // page down — the stored decisions are still true enough to show.
  await refreshDecisions(organizationId).catch((error) => console.error("Decisions refresh failed:", error));

  const history = filter === "completed" || filter === "rejected";
  const statuses: DecisionStatus[] =
    // A decision whose last attempt failed stays in the list, with the reason,
    // so it can be tried again or turned down — not quietly filed away.
    filter === "completed" ? ["APPLIED"] : filter === "rejected" ? ["REJECTED", "IGNORED"] : ["PENDING", "FAILED"];

  const [rows, counts, dataStatus, mode, level, campaigns, others, switchesRow, org] = await Promise.all([
    db.mairoDecision.findMany({
      where: {
        organizationId,
        status: { in: statuses },
        ...(filter === "urgent" ? { OR: [{ urgent: true }, { category: "NEEDS_ATTENTION" as const }] } : {}),
        ...(CATEGORY_OF[filter] ? { category: CATEGORY_OF[filter] } : {}),
      },
      orderBy: history ? { decidedAt: "desc" } : [{ urgent: "desc" }, { createdAt: "desc" }],
      take: history ? 50 : 20,
    }),
    decisionCounts(organizationId),
    quickDataStatus(organizationId),
    viewMode(),
    effectiveLevel(organizationId),
    db.mairoCampaign.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    history ? Promise.resolve([]) : otherApprovals(organizationId),
    db.autoOptimizeSettings.findUnique({ where: { organizationId }, select: { requireApprovalNewCreatives: true, requireApprovalAudience: true, requireApprovalPlatformShift: true } }),
    db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } }),
  ]);
  const switches = {
    requireApprovalNewCreatives: switchesRow?.requireApprovalNewCreatives ?? true,
    requireApprovalAudience: switchesRow?.requireApprovalAudience ?? true,
    requireApprovalPlatformShift: switchesRow?.requireApprovalPlatformShift ?? true,
  };
  const now = new Date();
  const timeZone = org?.timezone || "America/New_York";
  const trailMap = await loadTrails(organizationId, rows.map((r) => r.id));
  const decisions = rows.map(toView);
  const names = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));
  const advanced = mode === "advanced";
  const facts: Record<string, ApprovalFacts> = Object.fromEntries(decisions.map((d) => [d.id, approvalFacts(d, { level, switches })]));
  const trails: Record<string, ReactNode> = Object.fromEntries(
    [...trailMap.values()].map((t) => [
      t.decisionId,
      <div key={t.decisionId} className="space-y-3">
        <TrailChain steps={t.steps} />
        <TrailSteps steps={t.steps} now={now} timeZone={timeZone} />
      </div>,
    ]),
  );
  const waitingTotal = counts.pending + others.length;

  return (
    <div>
      <PageHeader
        title="Approval Center"
        description="Everything your AI team needs your say-so on, in one place. Launches and anything that raises what you spend always wait for you, and nothing is reported as done until Meta confirms it."
        action={<RefreshDecisionsButton />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        <span className="text-white">
          <span className="text-[20px] font-medium tabular-nums">{history ? counts.pending : waitingTotal}</span>{" "}
          <span className="text-muted">waiting for you</span>
        </span>
        {counts.urgent > 0 && <span className="text-red-300">{counts.urgent} need attention</span>}
        {counts.growth > 0 && <span className="text-live">{counts.growth} growth opportunit{counts.growth === 1 ? "y" : "ies"}</span>}
        <Link href="/dashboard/settings#automation" className="ml-auto text-[12.5px] text-muted hover:text-white">
          Mode: {levelInfo(level).label} →
        </Link>
      </div>

      {others.length > 0 && (
        <section aria-labelledby="waiting" className="mb-8">
          <h2 id="waiting" className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Launches, plans and posts</h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {others.map((o) => (
              <li key={o.key} className="flex flex-col rounded-2xl border p-4 sm:p-5" style={{ borderColor: o.kind === "launch" ? "rgba(245,158,11,0.4)" : "var(--mairo-line)" }}>
                <div className="flex items-center gap-2.5">
                  <AgentIcon role={o.agent} size={28} />
                  <p className="text-[12.5px] text-muted">
                    Responsible: <span className="font-medium text-white">{AGENT[o.agent].name}</span>
                  </p>
                </div>
                <p className="mt-2.5 text-[15px] font-medium text-white">{o.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{o.text}</p>
                <dl className="mt-3 grid gap-1.5 text-[12.5px]">
                  <div><dt className="inline text-faint">Budget impact: </dt><dd className={`inline ${o.kind === "launch" ? "font-medium text-warn" : "text-white/85"}`}>{o.budget}</dd></div>
                  <div><dt className="inline text-faint">Required authorization: </dt><dd className="inline text-white/85">{o.authorization}</dd></div>
                </dl>
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
                  {o.launch ? <LaunchApprove campaignId={o.launch.campaignId} name={o.title.replace(/^Launch “|”$/g, "")} budget={o.launch.budget} /> : null}
                  <Link href={o.href} className={o.launch ? "text-[12.5px] text-muted hover:text-white" : "rounded-full bg-[image:var(--mairo-ramp)] px-4 py-2 text-[12.5px] font-medium text-white"}>
                    {o.launch ? "See the campaign" : "Review"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Changes your AI team recommends</h2>
      <nav className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="Filter decisions">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "all" ? "/dashboard/decisions" : `/dashboard/decisions?f=${x.key}`}
            className="shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors"
            style={{
              borderColor: filter === x.key ? "var(--mairo-line-lit)" : "var(--mairo-line)",
              color: filter === x.key ? "var(--color-white)" : "var(--color-muted, #9aa3b5)",
              background: filter === x.key ? "rgba(108,158,255,0.12)" : "transparent",
            }}
            aria-current={filter === x.key ? "page" : undefined}
          >
            {x.label}
            {CATEGORY_OF[x.key] && counts.byCategory[CATEGORY_OF[x.key]] ? ` · ${counts.byCategory[CATEGORY_OF[x.key]]}` : ""}
          </Link>
        ))}
      </nav>

      {history ? (
        <DecisionHistory decisions={decisions} campaignNames={names} timeZone={timeZone} />
      ) : decisions.length > 0 ? (
        <DecisionList key={filter} decisions={decisions} advanced={advanced} facts={facts} trails={trails} timeZone={timeZone} />
      ) : (
        <Empty filter={filter} dataStatus={dataStatus} />
      )}

      <p className="mt-10 max-w-2xl text-[12px] leading-relaxed text-faint">
        MAIRO compares your campaigns with their own recent results — never with made-up benchmarks — and doesn&rsquo;t promise
        what a change will earn. Confidence shows how much data a decision rests on.{" "}
        <Link href="/dashboard/decisions?f=completed" className="underline underline-offset-4 hover:text-white">
          Decision history
        </Link>{" "}
        ·{" "}
        <Link href="/dashboard/activity" className="underline underline-offset-4 hover:text-white">
          MAIRO Activity
        </Link>
      </p>
    </div>
  );
}

function Empty({ filter, dataStatus }: { filter: string; dataStatus: "no-campaigns" | "learning" | "enough" }) {
  let title = "Nothing needs changing right now";
  let body = "MAIRO looked at your campaigns and nothing stands out enough to act on. It checks again every day, and shows up here when something does.";
  if (filter === "retargeting") {
    title = "No retargeting decisions";
    body = "MAIRO will suggest retargeting — ads for people who visited but didn't buy — once it can build those audiences for you. That isn't available yet, so it won't suggest something it can't do.";
  } else if (dataStatus === "no-campaigns") {
    title = "No campaigns running yet";
    body = "MAIRO makes decisions from real results. Once a campaign is running, this is where it tells you what to change.";
  } else if (dataStatus === "learning") {
    title = "MAIRO needs more campaign data before making recommendations";
    body = "Meta spends a campaign's first few days learning who responds, and the numbers jump around. MAIRO starts judging after 3 days and $20 spent, so it doesn't have you change something that was about to work.";
  } else if (filter !== "all") {
    title = `Nothing in ${CATEGORY_LABEL[CATEGORY_OF[filter] ?? "NEEDS_ATTENTION"].toLowerCase()} right now`;
  }
  return (
    <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--mairo-line)" }}>
      <p className="text-[15px] text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-[13px] leading-relaxed text-muted">{body}</p>
      {dataStatus === "no-campaigns" && (
        <Link href="/dashboard/create" className="mt-5 inline-block rounded-full px-5 py-2.5 text-[13px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)" }}>
          Create a campaign
        </Link>
      )}
    </div>
  );
}
