import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { GlassPanel, HudLabel, MairoButton } from "@/components/mairo";
import { assistantNameOf } from "@/lib/ai/agents";
import {
  currentMonth,
  lastCompleteMonth,
  monthLabel,
  monthlyReport,
  sameMonth,
  type MonthKey,
} from "@/lib/reports/monthly";
import { loadFindings } from "@/lib/coach/store";
import { teamWork } from "@/lib/results/work";
import { Journey, MetricGrid, TeamWork } from "@/components/results/results-figures";

// Results: what the advertising achieved, from the ad to paying customers, in
// the figures this kind of business is measured by — what the AI team found
// along the way and what it did about it.
//
// Every figure names where it came from: Meta's own reporting, a count MAIRO
// made of the leads it stored, what the business marked or entered, or what
// its store recorded. Where a figure can't be known it says why and how to
// fill it, rather than printing a zero. The one number with judgement in it —
// next month's suggested budget — shows its reasoning underneath.

export const metadata = { title: "Results — MAIRO" };
export const dynamic = "force-dynamic";

function money(cents: number | null): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** `?m=2026-08` or `?m=current`; never a month that hasn't started. */
function parseMonth(raw: string | undefined, now: Date): MonthKey | null {
  if (raw === "current") return currentMonth(now);
  const match = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (!match) return null;
  const key = { year: Number(match[1]), month: Number(match[2]) - 1 };
  if (key.month < 0 || key.month > 11) return null;
  const cur = currentMonth(now);
  if (key.year > cur.year || (key.year === cur.year && key.month > cur.month)) return cur;
  return key;
}

function monthParam({ year, month }: MonthKey): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function shift({ year, month }: MonthKey, by: number): MonthKey {
  const d = new Date(year, month + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

const SEVERITY: Record<string, { label: string; cls: string }> = {
  ATTENTION: { label: "Needs attention", cls: "bg-warn/15 text-warn" },
  OPPORTUNITY: { label: "Opportunity", cls: "bg-live/15 text-live" },
  WATCH: { label: "Worth watching", cls: "bg-white/[0.07] text-muted" },
};

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const { m } = await searchParams;
  const now = new Date();
  const thisMonth = currentMonth(now);

  // With no month asked for: the last full month — unless advertising only
  // started this month, when last month would just be empty.
  let key = parseMonth(m, now);
  if (!key) {
    const first = await db.mairoCampaign.findFirst({
      where: { organizationId, platformCampaigns: { some: { externalCampaignId: { not: null } } } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    key = first && first.createdAt >= new Date(now.getFullYear(), now.getMonth(), 1) ? thisMonth : lastCompleteMonth(now);
  }

  const [org, report, sinceStart, findings] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, assistantName: true },
    }),
    monthlyReport(organizationId, key, { now }),
    teamWork(organizationId, null),
    loadFindings(organizationId, now),
  ]);
  const assistant = assistantNameOf(org?.assistantName);
  const viewingCurrent = sameMonth(key, thisMonth);
  const previous = shift(key, -1);
  const next = shift(key, 1);
  const canGoForward = !viewingCurrent;
  const periodLabel = viewingCurrent ? "this month so far" : `in ${monthLabel(key)}`;
  const actionable = findings.active.filter((f) => f.severity !== "WATCH").slice(0, 3);

  return (
    <div>
      <PageHeader
        title={`Results · ${report.label}`}
        description="What your advertising achieved — from the ad all the way to paying customers — what your AI team found, and what it did about it."
        action={
          /* A plain anchor, not next/link. Link prefetches, and prefetching a
             route that streams a file attachment meant every visit to this
             page silently computed the whole report a second time — including
             its live calls to the ad platforms — on a request that could never
             resolve as an RSC payload. `download` also gives the file its name
             when the browser saves it. */
          <a
            href={`/api/reports/${monthParam(key)}`}
            download={`mairo-${monthParam(key)}.txt`}
            className="inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-[13px] text-white/85 transition-colors hover:border-[color:var(--mairo-line-lit)] hover:text-white"
            style={{ borderColor: "var(--mairo-line)" }}
          >
            Download
          </a>
        }
      />

      <nav className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Choose a month">
        <Link href={`/dashboard/reports/monthly?m=${monthParam(previous)}`} className="text-[12.5px] text-muted transition-colors hover:text-white">
          ← {monthLabel(previous)}
        </Link>
        {canGoForward && (
          <Link href={`/dashboard/reports/monthly?m=${sameMonth(next, thisMonth) ? "current" : monthParam(next)}`} className="text-[12.5px] text-muted transition-colors hover:text-white">
            {sameMonth(next, thisMonth) ? "This month so far" : monthLabel(next)} →
          </Link>
        )}
        {!viewingCurrent && !sameMonth(next, thisMonth) && (
          <Link href="/dashboard/reports/monthly?m=current" className="rounded-full border border-[color:var(--mairo-line)] px-3 py-1 text-[12px] text-white/85 hover:border-[color:var(--mairo-line-lit)]">
            This month so far
          </Link>
        )}
        <Link href="/dashboard/reports" className="ml-auto text-[12.5px] text-muted transition-colors hover:text-white">
          Weekly reports →
        </Link>
      </nav>

      {report.thin ? (
        <GlassPanel className="px-6 py-14 text-center">
          <h2 className="text-[16px] font-medium text-white">Nothing ran {periodLabel}</h2>
          <p className="mx-auto mt-2.5 max-w-md text-[13px] leading-relaxed text-muted">
            There are no results for a month with no advertising in it. Once a campaign has been
            live for a few days, this fills in on its own.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {!viewingCurrent && <MairoButton href="/dashboard/reports/monthly?m=current">See this month so far</MairoButton>}
            <MairoButton href="/dashboard/create" tone={viewingCurrent ? "primary" : "ghost"}>Create a campaign</MairoButton>
          </div>
        </GlassPanel>
      ) : (
        <>
          {/* From ad to customer. */}
          <GlassPanel lit className="p-5 sm:p-7">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <HudLabel>From ad to customer</HudLabel>
              <p className="text-[12px] text-faint">
                Showing {report.kind === "sales" ? "sales" : "lead and appointment"} results — {report.kindWhy}.{" "}
                <Link href="/dashboard/tracking" className="text-violet-bright hover:underline">Not right?</Link>
              </p>
            </div>
            {report.metaProblem && (
              <p className="mb-4 rounded-xl bg-warn/10 px-3.5 py-2.5 text-[12.5px] text-warn" role="status">
                MAIRO couldn&rsquo;t read Meta just now, so Meta&rsquo;s figures are missing below — not zero. Try again in a minute.
              </p>
            )}
            <Journey stages={report.outcomes.journey} />
            <p className="mt-6 max-w-3xl text-[14px] leading-relaxed text-white/90">{report.summary}</p>
            {report.outcomes.notes.map((n) => (
              <p key={n} className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">{n}</p>
            ))}
          </GlassPanel>

          {/* The figures this business is measured by. */}
          <GlassPanel className="mt-6 p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
              <HudLabel>Your results {periodLabel}</HudLabel>
              {report.kind === "leads" && (
                <Link href="/dashboard/leads" className="text-[12.5px] text-muted hover:text-white">Mark your leads →</Link>
              )}
            </div>
            <MetricGrid metrics={report.outcomes.metrics} />
            {report.outcomes.extra && (
              <>
                <p className="mb-3 mt-6 text-[13px] font-medium text-white">{report.outcomes.extra.title}</p>
                <MetricGrid metrics={report.outcomes.extra.metrics} />
              </>
            )}
            <p className="mt-5 max-w-3xl text-[11.5px] leading-relaxed text-faint">
              <span className="font-medium text-muted">Meta</span> is Meta&rsquo;s own reporting.{" "}
              <span className="font-medium text-muted">You marked / You entered</span> is what you recorded on Leads.{" "}
              <span className="font-medium text-muted">Your store</span> is your store&rsquo;s own orders.{" "}
              <span className="font-medium text-muted">MAIRO counted</span> is worked out from those. A lead Meta reports isn&rsquo;t a customer until you say so.
            </p>
          </GlassPanel>

          {/* What the AI team found. */}
          <GlassPanel className="mt-6 p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <HudLabel>What your AI team found — right now</HudLabel>
              <Link href="/dashboard/coach" className="text-[12.5px] text-muted hover:text-white">Open your Performance Coach →</Link>
            </div>
            {actionable.length === 0 ? (
              <p className="text-[13.5px] text-muted">
                {findings.lastReviewedAt
                  ? `Nothing needs your attention. Your Performance Coach last reviewed your results ${findings.lastReviewedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} and looks again every day.`
                  : "No review yet. Your Performance Coach looks once your campaigns have run long enough to compare."}
              </p>
            ) : (
              <ul className="grid gap-3">
                {actionable.map((f) => {
                  const sev = SEVERITY[f.severity] ?? SEVERITY.WATCH;
                  return (
                    <li key={f.id} className="rounded-2xl border border-[color:var(--mairo-line)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${sev.cls}`}>{sev.label}</span>
                        {f.campaignName && <span className="text-[12px] text-muted">&ldquo;{f.campaignName}&rdquo;</span>}
                      </div>
                      <p className="mt-2 text-[14.5px] font-medium text-white">{f.title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted">
                        <span className="text-white/80">What MAIRO noticed: </span>
                        {f.noticed}
                      </p>
                      <Link href={`/dashboard/coach#${f.id}`} className="mt-2 inline-block text-[12.5px] text-violet-bright hover:underline">
                        Why it might be happening, what to do, and what&rsquo;s missing →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassPanel>

          {/* What the AI team did. */}
          <GlassPanel className="mt-6 p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <HudLabel>What your AI team did {periodLabel}</HudLabel>
              <Link href="/dashboard/activity" className="text-[12.5px] text-muted hover:text-white">Every change, with the reason →</Link>
            </div>
            <TeamWork items={report.team} sinceStart={sinceStart} periodLabel={periodLabel} />
            {report.work.accepted.length > 0 && (
              <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--mairo-line)" }}>
                <p className="text-[12px] text-faint">Recommendations you said yes to</p>
                <ul className="mt-2 space-y-1.5 text-[13px] text-white/85">
                  {report.work.accepted.map((t) => <li key={t}>✓ {t}</li>)}
                </ul>
              </div>
            )}
            <p className="mt-4 max-w-3xl text-[11.5px] leading-relaxed text-faint">
              Counted from MAIRO&rsquo;s own records of each piece of work. MAIRO doesn&rsquo;t put a money value on it —
              what one change was worth can&rsquo;t be separated from everything else that changed at the same time.
            </p>
          </GlassPanel>

          <GlassPanel className="mt-6 p-5 sm:p-6">
            <HudLabel className="mb-5">Next month</HudLabel>
            <p className="text-[28px] font-medium leading-none text-white">
              {money(report.recommendedNextCents)}
            </p>
            <p className="mt-2 text-[11.5px] text-faint">Suggested advertising budget — a suggestion, never applied without you</p>
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-muted">
              {report.recommendationWhy}
            </p>
            {report.bestPlatform && (
              <p className="mt-3 text-[12.5px] text-muted">
                Cheapest results: {report.bestPlatform.name} · {money(report.bestPlatform.costPerPurchaseCents)}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Link
                href={`/dashboard/agents?ask=${encodeURIComponent(`Talk me through my ${report.label} results.`)}`}
                className="text-[12.5px] text-blue-bright transition-colors hover:text-white"
              >
                Ask {assistant} about {viewingCurrent ? "this month" : "this month's results"} →
              </Link>
            </div>
          </GlassPanel>

          <p className="mt-8 max-w-3xl text-[11.5px] leading-relaxed text-faint">
            Meta&rsquo;s figures may differ slightly from Ads Manager, and the last day or two can still change.
            Where a figure can&rsquo;t be known this page shows a dash and says why, rather than a zero.
            A reported lead or conversion isn&rsquo;t revenue until it becomes a paying customer, and advertising
            results aren&rsquo;t profit — your other costs aren&rsquo;t in these numbers. MAIRO can&rsquo;t promise
            sales, leads or a particular return.
          </p>
        </>
      )}
    </div>
  );
}
