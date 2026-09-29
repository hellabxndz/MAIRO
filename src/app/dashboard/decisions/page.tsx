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

// Mairo Decisions.
//
// Every day MAIRO looks at the account and writes down the few things worth
// doing — usually one to five, often none. None is a real answer and the page
// says so, rather than inventing something to fill the space.

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

  const [rows, counts, dataStatus, mode, level, campaigns] = await Promise.all([
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
  ]);
  const decisions = rows.map(toView);
  const names = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));
  const advanced = mode === "advanced";

  return (
    <div>
      <PageHeader
        title="Mairo Decisions"
        description="Each day Mairo looks at your campaigns and writes down what's worth changing — only when there's something real to act on. Nothing changes until you approve it, unless you've let Mairo act within your limits."
        action={<RefreshDecisionsButton />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        <span className="text-white">
          <span className="text-[20px] font-medium tabular-nums">{counts.pending}</span>{" "}
          <span className="text-muted">to review</span>
        </span>
        {counts.urgent > 0 && <span className="text-[#f87171]">{counts.urgent} need attention</span>}
        {counts.growth > 0 && <span className="text-live">{counts.growth} growth opportunit{counts.growth === 1 ? "y" : "ies"}</span>}
        <Link href="/dashboard/settings#automation" className="ml-auto text-[12.5px] text-muted hover:text-white">
          Mode: {levelInfo(level).label} →
        </Link>
      </div>

      <nav className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="Filter decisions">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "all" ? "/dashboard/decisions" : `/dashboard/decisions?f=${x.key}`}
            className="shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors"
            style={{
              borderColor: filter === x.key ? "var(--mairo-line-lit)" : "var(--mairo-line)",
              color: filter === x.key ? "white" : "var(--color-muted, #9aa3b5)",
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
        <DecisionHistory decisions={decisions} campaignNames={names} />
      ) : decisions.length > 0 ? (
        <DecisionList key={filter} decisions={decisions} advanced={advanced} />
      ) : (
        <Empty filter={filter} dataStatus={dataStatus} />
      )}

      <p className="mt-10 max-w-2xl text-[12px] leading-relaxed text-faint">
        Mairo compares your campaigns with their own recent results — never with made-up benchmarks — and doesn&rsquo;t promise
        what a change will earn. Confidence shows how much data a decision rests on.{" "}
        <Link href="/dashboard/decisions?f=completed" className="underline underline-offset-4 hover:text-white">
          Decision history
        </Link>{" "}
        ·{" "}
        <Link href="/dashboard/activity" className="underline underline-offset-4 hover:text-white">
          Mairo Activity
        </Link>
      </p>
    </div>
  );
}

function Empty({ filter, dataStatus }: { filter: string; dataStatus: "no-campaigns" | "learning" | "enough" }) {
  let title = "Nothing needs changing right now";
  let body = "Mairo looked at your campaigns and nothing stands out enough to act on. It checks again every day, and shows up here when something does.";
  if (filter === "retargeting") {
    title = "No retargeting decisions";
    body = "Mairo will suggest retargeting — ads for people who visited but didn't buy — once it can build those audiences for you. That isn't available yet, so it won't suggest something it can't do.";
  } else if (dataStatus === "no-campaigns") {
    title = "No campaigns running yet";
    body = "Mairo makes decisions from real results. Once a campaign is running, this is where it tells you what to change.";
  } else if (dataStatus === "learning") {
    title = "Mairo needs more campaign data before making recommendations";
    body = "Meta spends a campaign's first few days learning who responds, and the numbers jump around. Mairo starts judging after 3 days and $20 spent, so it doesn't have you change something that was about to work.";
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
