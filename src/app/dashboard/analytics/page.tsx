import { redirect } from "next/navigation";
import Link from "next/link";
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

// Everything, in one place, with the ability to look at one network at a time.
//
// The order matters and is the whole design: the combined number first,
// because that is what a business owner actually wants to know, and the split
// underneath for when they want to know why. A dashboard that opens on a
// per-platform table makes them do the addition, which is the job they hired
// MAIRO to stop doing.
//
// Every figure on this page comes from a live call to Meta or TikTok. Nothing
// here is generated, sampled, or filled in — a metric MAIRO could not read is
// shown as a dash, never as a zero and never as a plausible-looking number.

export const maxDuration = 30;

type Filter = "all" | "meta" | "tiktok";

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
function seconds(value: number | null): string {
  return value === null ? NO_VALUE : `${value.toFixed(1)}s`;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const params = await searchParams;
  const filter: Filter =
    params.platform === "meta" ? "meta" : params.platform === "tiktok" ? "tiktok" : "all";

  const [report, entitlements] = await Promise.all([
    fetchOrganizationPerformance(organizationId),
    entitlementsFor(organizationId),
  ]);

  const selected: AdPlatform | null =
    filter === "meta" ? "META" : filter === "tiktok" ? "TIKTOK" : null;

  const shown: PlatformMetrics =
    selected === null
      ? report.total
      : (report.byPlatform.find((p) => p.platform === selected)?.metrics ??
        report.total);

  const available = report.byPlatform.map((p) => p.platform);
  const tiktokReport = report.byPlatform.find((p) => p.platform === "TIKTOK");

  return (
    <div>
      <PageHeader
        title="Performance"
        description="Everything MAIRO is running for you, added up — and broken down when you want it."
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

      {available.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <FilterTab href="/dashboard/analytics" label="All platforms" active={filter === "all"} />
          {available.includes("META") && (
            <FilterTab
              href="/dashboard/analytics?platform=meta"
              label="Meta"
              active={filter === "meta"}
              platform="META"
            />
          )}
          {available.includes("TIKTOK") && (
            <FilterTab
              href="/dashboard/analytics?platform=tiktok"
              label="TikTok"
              active={filter === "tiktok"}
              platform="TIKTOK"
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
              <Figure label="Spend" value={money(shown.spendCents)} large />
              <Figure label="Revenue" value={money(shown.revenueCents)} large />
              <Figure label="ROAS" value={ratio(shown.roas)} large />
              <Figure label="Purchases" value={count(shown.purchases)} large />
              <Figure label="Cost per purchase" value={money(shown.costPerPurchaseCents)} large />
            </div>

            <div className="mt-8 grid grid-cols-2 gap-6 border-t border-white/[0.06] pt-6 sm:grid-cols-3 lg:grid-cols-6">
              <Figure label="Impressions" value={count(shown.impressions)} />
              <Figure label="Reach" value={count(shown.reach)} />
              <Figure label="Clicks" value={count(shown.clicks)} />
              <Figure label="CTR" value={percent(shown.ctr)} />
              <Figure label="CPC" value={money(shown.cpcCents)} />
              <Figure label="CPM" value={money(shown.cpmCents)} />
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

          {/* TikTok's own vocabulary. Meta reports none of this and never
              will, so it lives in its own block rather than as columns of
              dashes across a shared table. */}
          {(selected === "TIKTOK" || (selected === null && tiktokReport?.hasData)) &&
            entitlements.advanced_analytics && (
              <Card className="mt-6">
                <div className="mb-5 flex items-center gap-2">
                  <PlatformIcon platform="TIKTOK" className="h-4 w-4 text-neutral-400" />
                  <h2 className="text-sm uppercase tracking-[0.16em] text-neutral-400">
                    TikTok video and profile
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
                  <Figure label="Video views" value={count(tiktokReport?.metrics.videoViews ?? null)} />
                  <Figure label="2-second views" value={count(tiktokReport?.metrics.videoViews2s ?? null)} />
                  <Figure label="6-second views" value={count(tiktokReport?.metrics.videoViews6s ?? null)} />
                  <Figure
                    label="Average watch time"
                    value={seconds(tiktokReport?.metrics.averageWatchTimeSeconds ?? null)}
                  />
                  <Figure
                    label="Completion rate"
                    value={percent(tiktokReport?.metrics.videoCompletionRate ?? null)}
                  />
                  <Figure label="Profile visits" value={count(tiktokReport?.metrics.profileVisits ?? null)} />
                  <Figure label="Followers gained" value={count(tiktokReport?.metrics.followersGained ?? null)} />
                  <Figure label="Likes" value={count(tiktokReport?.metrics.likes ?? null)} />
                  <Figure label="Comments" value={count(tiktokReport?.metrics.comments ?? null)} />
                  <Figure label="Shares" value={count(tiktokReport?.metrics.shares ?? null)} />
                </div>
              </Card>
            )}

          {!entitlements.advanced_analytics && (
            <Card className="mt-6">
              <p className="text-sm text-neutral-400">
                Per-platform breakdowns, creative-level figures and TikTok&rsquo;s video
                metrics are part of Growth.{" "}
                <Link href="/dashboard/settings#billing" className="text-sky-300 underline underline-offset-4">
                  See plans
                </Link>
              </p>
            </Card>
          )}
        </>
      )}
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

function Figure({
  label,
  value,
  large = false,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p
        className={`mt-1.5 font-light tabular-nums text-white ${
          large ? "text-2xl" : "text-base"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
