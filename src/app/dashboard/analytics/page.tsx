import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SectionSkeleton } from "@/components/mairo/page-skeleton";
import { auth } from "@/lib/auth";
import { Card, PageHeader, EmptyState, Badge } from "@/components/ui";
import { activeOrganizationId } from "@/lib/active-org";
import { fetchOrganizationPerformance, type PlatformReport } from "@/lib/ad-platforms/performance";
import { entitlementsFor } from "@/lib/entitlements";
import { PlatformIcon } from "@/components/platform-icons";
import { formatInteger, formatMoney, NO_VALUE } from "@/components/metrics";
import { platformName } from "@/lib/ad-platforms/registry";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import type { AdPlatform } from "@/generated/prisma/enums";
import { compare, metric } from "@/lib/analytics/metrics";
import { parseRange, RANGE_KEYS, rangeInfo, type RangeKey } from "@/lib/analytics/ranges";
import { MetricTile } from "@/components/mairo/metric-tile";
import { db } from "@/lib/db";
import { viewMode } from "@/lib/view-mode";
import { activeMission } from "@/lib/mission/store";
import { missionGoal, type MetricFamily } from "@/lib/mission/goals";
import { performanceTiles, money as fmtMoney, num } from "@/lib/dashboard/home";
import { goalResults, loadCreativeHub, resultPhrase } from "@/lib/creatives/hub";
import { loadIntelligence } from "@/lib/intelligence/run";
import { loadOverview } from "@/lib/dashboard/overview";
import { CampaignTable } from "@/components/dashboard/overview/campaign-table";
import { PlatformSplit } from "@/components/dashboard/overview/platform-split";
import { PANEL } from "@/components/dashboard/overview/format";
import { AdCard } from "@/app/dashboard/creatives/hub-client";

// Everything, in one place, with the ability to look at one network at a time.
//
// The order matters and is the whole design: the combined number first,
// because that is what a business owner actually wants to know, and the split
// underneath for when they want to know why. A dashboard that opens on a
// per-platform table makes them do the addition, which is the job they hired
// MAIRO to stop doing.
//
// Every figure on this page comes from a live call to Meta. Nothing
// here is generated, sampled, or filled in — a metric MAIRO could not read is
// shown as a dash, never as a zero and never as a plausible-looking number.

export const maxDuration = 30;

type Filter = "all" | "meta";

function money(cents: number | null): string {
  return cents === null ? NO_VALUE : formatMoney(cents / 100);
}
function count(value: number | null): string {
  return value === null ? NO_VALUE : formatInteger(value);
}
function ratio(value: number | null): string {
  return value === null ? NO_VALUE : `${value.toFixed(2)}x`;
}
function percent(value: number | null): string {
  return value === null ? NO_VALUE : `${(value * 100).toFixed(2)}%`;
}
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; range?: string; view?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const params = await searchParams;
  const filter: Filter =
    params.platform === "meta" ? "meta" : "all";
  const rangeKey: RangeKey = parseRange(params.range);
  // Simple shows business results; Advanced shows every advertising metric.
  // The page's own toggle wins; otherwise it follows the app-wide mode.
  const view: "simple" | "advanced" = params.view === "advanced" || params.view === "simple" ? params.view : (await viewMode()) === "advanced" ? "advanced" : "simple";
  const period = rangeInfo(rangeKey);

  // The window, and the window before it. Both fetched together so the page
  // can say how a figure moved rather than only what it is — which is the
  // difference between a number and a fact somebody can act on.
  //
  // The comparison is best-effort: if the previous window cannot be read, the
  // page shows the current figures with no change line rather than failing.
  const [report, previousReport, entitlements] = await Promise.all([
    fetchOrganizationPerformance(organizationId, period.range ?? undefined),
    period.previous
      ? fetchOrganizationPerformance(organizationId, period.previous).catch(() => null)
      : Promise.resolve(null),
    entitlementsFor(organizationId),
  ]);

  const selected: AdPlatform | null =
    filter === "meta" ? "META" : null;

  const shown: PlatformMetrics =
    selected === null
      ? report.total
      : (report.byPlatform.find((p) => p.platform === selected)?.metrics ??
        report.total);

  const previousShown: PlatformMetrics | null =
    previousReport === null
      ? null
      : selected === null
        ? previousReport.total
        : (previousReport.byPlatform.find((p) => p.platform === selected)?.metrics ?? null);

  /** A change line for one figure, or nothing when there is no honest one. */
  const since = period.previousLabel;
  const change = (
    current: number | null,
    prev: number | null,
    key: Parameters<typeof metric>[0],
  ) => (since ? compare(current, prev, metric(key).direction, since) : undefined);

  const available = report.byPlatform.map((p) => p.platform);

  return (
    <div>
      <PageHeader
        title="Analytics"
        description={view === "simple" ? "Your results, in plain numbers." : "Every advertising metric, for when you want to dig in."}
        action={
          <div role="group" aria-label="Detail" className="inline-flex rounded-full border border-[color:var(--mairo-line)] p-0.5">
            {(["simple", "advanced"] as const).map((v) => {
              const q = new URLSearchParams();
              q.set("view", v);
              if (rangeKey !== "all") q.set("range", rangeKey);
              return (
                <Link key={v} href={`/dashboard/analytics?${q.toString()}`} aria-current={view === v ? "page" : undefined}
                  className={`rounded-full px-4 py-1.5 text-[13px] capitalize ${view === v ? "text-white" : "text-muted hover:text-white"}`}
                  style={view === v ? { backgroundImage: "var(--mairo-ramp)" } : undefined}>
                  {v}
                </Link>
              );
            })}
          </div>
        }
      />

      {report.problems.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-4">
          {report.problems.map((p) => (
            <p key={p.platform} className="text-xs text-amber-200/90">
              <span className="font-medium">{platformName(p.platform)}:</span> {p.message}
            </p>
          ))}
        </div>
      )}

      {/* When, then where. The period changes what every figure on the page
          means, so it comes first. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {RANGE_KEYS.map((key) => {
          const info = rangeInfo(key);
          const query = new URLSearchParams();
          if (key !== "all") query.set("range", key);
          if (filter !== "all") query.set("platform", filter);
          query.set("view", view);
          const qs = query.toString();
          return (
            <FilterTab
              key={key}
              href={`/dashboard/analytics${qs ? `?${qs}` : ""}`}
              label={info.label}
              active={rangeKey === key}
            />
          );
        })}
      </div>

      {view === "simple" ? (
        // Its own boundary: the figures above are already read, and the best
        // creative and insights below ask Meta again — no reason for the
        // headline numbers to wait for them.
        <Suspense fallback={<SectionSkeleton panels={3} />}>
          <SimpleAnalytics organizationId={organizationId} shown={shown} hasData={report.hasData} campaigns={report.campaigns} />
        </Suspense>
      ) : (<>
      {available.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <FilterTab
            href={rangeKey === "all" ? "/dashboard/analytics" : `/dashboard/analytics?range=${rangeKey}`}
            label="All platforms"
            active={filter === "all"}
          />
          {available.includes("META") && (
            <FilterTab
              href={`/dashboard/analytics?platform=meta${rangeKey === "all" ? "" : `&range=${rangeKey}`}`}
              label="Meta"
              active={filter === "meta"}
              platform="META"
            />
          )}
        </div>
      )}

      {!report.hasData ? (
        <EmptyState
          title="Nothing to report yet"
          description="Once a campaign has been running for a day or so, its figures land here. Nothing on this page is estimated — if MAIRO can't read a number, it shows a dash rather than a guess."
        />
      ) : (
        <>
          <Card>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm uppercase tracking-[0.16em] text-neutral-400">
                {selected === null ? "Total MAIRO performance" : `${platformName(selected)} performance`}
              </h2>
              {selected === null && available.length > 1 && (
                <span className="flex items-center gap-1.5 text-neutral-500">
                  {available.map((p) => (
                    <PlatformIcon key={p} platform={p} className="h-4 w-4" />
                  ))}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
              <MetricTile
                info={metric("spend")}
                value={money(shown.spendCents)}
                comparison={change(shown.spendCents, previousShown?.spendCents ?? null, "spend")}
                large
              />
              <MetricTile
                info={metric("revenue")}
                value={money(shown.revenueCents)}
                comparison={change(shown.revenueCents, previousShown?.revenueCents ?? null, "revenue")}
                large
              />
              <MetricTile
                info={metric("roas")}
                value={ratio(shown.roas)}
                comparison={change(shown.roas, previousShown?.roas ?? null, "roas")}
                large
              />
              <MetricTile
                info={metric("purchases")}
                value={count(shown.purchases)}
                comparison={change(shown.purchases, previousShown?.purchases ?? null, "purchases")}
                large
              />
              <MetricTile
                info={metric("costPerPurchase")}
                value={money(shown.costPerPurchaseCents)}
                comparison={change(
                  shown.costPerPurchaseCents,
                  previousShown?.costPerPurchaseCents ?? null,
                  "costPerPurchase",
                )}
                large
              />
            </div>

            <div className="mt-8 grid grid-cols-2 gap-6 border-t border-white/[0.06] pt-6 sm:grid-cols-3 lg:grid-cols-6">
              <MetricTile info={metric("impressions")} value={count(shown.impressions)} />
              <MetricTile info={metric("reach")} value={count(shown.reach)} />
              <MetricTile
                info={metric("clicks")}
                value={count(shown.clicks)}
                comparison={change(shown.clicks, previousShown?.clicks ?? null, "clicks")}
              />
              <MetricTile
                info={metric("ctr")}
                value={percent(shown.ctr)}
                comparison={change(shown.ctr, previousShown?.ctr ?? null, "ctr")}
              />
              <MetricTile
                info={metric("cpc")}
                value={money(shown.cpcCents)}
                comparison={change(shown.cpcCents, previousShown?.cpcCents ?? null, "cpc")}
              />
              <MetricTile
                info={metric("cpm")}
                value={money(shown.cpmCents)}
                comparison={change(shown.cpmCents, previousShown?.cpmCents ?? null, "cpm")}
              />
            </div>
          </Card>

          {/* Per-platform comparison. Only where there is something to
              compare — a single-network account gets the totals above and
              nothing redundant underneath. */}
          {selected === null && report.byPlatform.length > 1 && (
            <Card className="mt-6">
              <h2 className="mb-5 text-sm uppercase tracking-[0.16em] text-neutral-400">
                By platform
              </h2>
              <div className="space-y-3">
                {report.byPlatform.map((p) => (
                  <PlatformRow key={p.platform} report={p} />
                ))}
              </div>
            </Card>
          )}

          <Suspense fallback={<SectionSkeleton />}>
            <AdvancedBreakdowns organizationId={organizationId} rangeKey={rangeKey} />
          </Suspense>

          {!entitlements.advanced_analytics && (
            <Card className="mt-6">
              <p className="text-sm text-neutral-400">
                Ad-by-ad breakdowns and creative-level figures are part of Growth.{" "}
                <Link href="/dashboard/billing" className="text-sky-300 underline underline-offset-4">
                  See plans
                </Link>
              </p>
            </Card>
          )}
        </>
      )}
      </>)}

      <p className="mt-10 text-[13px] text-faint">
        More: <Link href="/dashboard/reports" className="text-violet-bright hover:underline">Weekly reports</Link> · <Link href="/dashboard/activity" className="text-violet-bright hover:underline">MAIRO activity</Link> · <Link href="/dashboard/decisions" className="text-violet-bright hover:underline">MAIRO decisions</Link>
      </p>
    </div>
  );
}

/** Simple: business results for the goal, the best creative and campaign, a few insights. */
async function SimpleAnalytics({ organizationId, shown, hasData, campaigns }: { organizationId: string; shown: PlatformMetrics; hasData: boolean; campaigns: { mairoCampaignId: string; name: string; total: PlatformMetrics; hasData: boolean }[] }) {
  const [mission, hub, intelligence, learnings, rows] = await Promise.all([
    activeMission(organizationId),
    loadCreativeHub(organizationId).catch(() => null),
    loadIntelligence(organizationId).catch(() => null),
    db.mairoLearning.findMany({ where: { organizationId, active: true, confidence: { in: ["HIGH", "MEDIUM"] } }, orderBy: { lastSeenAt: "desc" }, take: 3 }),
    db.mairoCampaign.findMany({ where: { organizationId }, select: { id: true, objective: true } }),
  ]);
  const family: MetricFamily = mission ? missionGoal(mission.primaryGoal).metrics : "sales";
  const tiles = performanceTiles(family, shown);
  const extra = [
    { label: "Revenue", value: shown.revenueCents, money: true },
    { label: "Sales", value: shown.purchases },
    { label: "Leads", value: shown.leads ?? null },
    { label: "Bookings", value: shown.bookings ?? null },
  ].filter((e) => e.value !== null && e.value !== undefined && !tiles.some((t) => t.label === e.label));
  const known = new Set(rows.map((r) => r.id));
  const best = campaigns
    .filter((c) => c.hasData && known.has(c.mairoCampaignId))
    .map((c) => ({ c, results: goalResults(family, c.total), spend: c.total.spendCents }))
    .filter((x) => (x.results ?? 0) > 0 && (x.spend ?? 0) > 0)
    .sort((a, b) => a.spend! / a.results! - b.spend! / b.results!)[0];
  const insights = [
    ...learnings.map((l) => l.statement),
    ...(intelligence?.insights ?? []).filter((i) => i.severity !== "INFO").slice(0, 3).map((i) => i.title),
  ].slice(0, 3);

  if (!hasData) {
    return <EmptyState title="Nothing to report yet" description="Once a campaign has been running for a day or so, its results land here. Nothing on this page is estimated." />;
  }
  return (
    <div className="space-y-5">
      <section className={`${PANEL} p-6`}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label}>
              <dd className="text-[clamp(26px,3.2vw,36px)] font-light tabular-nums text-white">{t.value}</dd>
              <dt className="mt-1.5 text-[13px] text-muted">{t.label}</dt>
            </div>
          ))}
        </dl>
        {extra.length > 0 && (
          <p className="mt-5 text-[13.5px] text-muted">{extra.map((e) => `${e.label}: ${e.money ? fmtMoney(e.value as number) : num(e.value as number)}`).join(" · ")}</p>
        )}
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${PANEL} p-6`}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright">Best creative</h2>
          {hub?.top[0] ? <div className="mt-4 max-w-[260px]"><AdCard ad={hub.top[0]} rank={1} /></div> : <p className="mt-3 text-[14px] text-muted">Not enough results to pick one yet.</p>}
        </section>
        <section className={`${PANEL} p-6`}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright">Best campaign</h2>
          {best ? (
            <Link href={`/dashboard/campaigns/${best.c.mairoCampaignId}`} className="mt-3 block rounded-2xl p-1 hover:bg-white/[0.03]">
              <p className="text-[18px] text-white">{best.c.name}</p>
              <p className="mt-1 text-[14px] text-muted">{resultPhrase(family, best.results)} · {fmtMoney(Math.round(best.spend! / best.results!))} each</p>
            </Link>
          ) : <p className="mt-3 text-[14px] text-muted">Not enough results to pick one yet.</p>}
          <h2 className="mt-7 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright">MAIRO insights</h2>
          {insights.length ? <ul className="mt-3 space-y-2 text-[14px] text-white/85">{insights.map((t) => <li key={t}>• {t}</li>)}</ul> : <p className="mt-3 text-[14px] text-muted">MAIRO is still learning what works for you.</p>}
        </section>
      </div>
    </div>
  );
}

/** Advanced: campaign, ad set and creative breakdowns, and where the ads showed. */
async function AdvancedBreakdowns({ organizationId, rangeKey }: { organizationId: string; rangeKey: RangeKey }) {
  const days = rangeKey === "7d" ? 7 : rangeKey === "90d" || rangeKey === "all" ? 90 : 30;
  const overview = await loadOverview(organizationId, days, { adBreakdown: true }).catch(() => null);
  if (!overview) return null;
  return (
    <div className="mt-6 space-y-4">
      <CampaignTable rows={overview.campaigns} variant="advanced" range={overview.range} />
      <section className={`${PANEL} p-5`}>
        <h2 className="mb-3 text-[15px] font-medium text-white">By placement and platform</h2>
        <PlatformSplit publishers={overview.publishers} selectable />
      </section>
    </div>
  );
}

function FilterTab({
  href,
  label,
  active,
  platform,
}: {
  href: string;
  label: string;
  active: boolean;
  platform?: AdPlatform;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition ${
        active
          ? "border-white/25 bg-white/[0.06] text-white"
          : "border-white/[0.07] text-neutral-400 hover:border-white/20 hover:text-white"
      }`}
    >
      {platform && <PlatformIcon platform={platform} className="h-3.5 w-3.5" />}
      {label}
    </Link>
  );
}

function PlatformRow({ report }: { report: PlatformReport }) {
  return (
    <div className="rounded-xl bg-white/[0.02] px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-neutral-400">
          <PlatformIcon platform={report.platform} className="h-3.5 w-3.5" />
          {platformName(report.platform)}
        </span>
        {report.unavailable ? (
          <Badge tone="yellow">Couldn&rsquo;t read</Badge>
        ) : (
          <span className="flex flex-wrap gap-x-7 gap-y-1 text-xs tabular-nums text-neutral-300">
            <span>
              <span className="text-neutral-500">Spend </span>
              {money(report.metrics.spendCents)}
            </span>
            <span>
              <span className="text-neutral-500">Revenue </span>
              {money(report.metrics.revenueCents)}
            </span>
            <span>
              <span className="text-neutral-500">ROAS </span>
              {ratio(report.metrics.roas)}
            </span>
            <span>
              <span className="text-neutral-500">CPA </span>
              {money(report.metrics.costPerPurchaseCents)}
            </span>
          </span>
        )}
      </div>
      {report.unavailable && (
        <p className="mt-2 text-xs text-amber-200/70">{report.unavailable}</p>
      )}
    </div>
  );
}
