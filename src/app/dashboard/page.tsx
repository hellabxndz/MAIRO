import Link from "next/link";
import { redirect } from "next/navigation";
import { OwnerGettingStarted } from "./getting-started";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, primaryButtonClass } from "@/components/ui";
import { currentMonthKey, formatMonthKey } from "@/lib/utils/month";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { buildRecommendations } from "@/lib/actions/optimize-actions";
import { OptimizationCard } from "@/components/optimization-card";
import { PlatformIcons } from "@/components/platform-icons";
import { formatInteger, formatMoney, NO_VALUE } from "@/components/metrics";
import { activeOrganizationId } from "@/lib/active-org";

// Results are read live from Meta on every load, so this page is only as fast
// as their API is. The default budget is not enough when several campaigns are
// queried at once and Meta is having a slow moment.
export const maxDuration = 30;

const statusTone = {
  DRAFT: "neutral",
  IN_REVIEW: "yellow",
  APPROVED: "blue",
  ACTIVE: "green",
  COMPLETE: "neutral",
} as const;

export default async function DashboardOverviewPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [organization, plan, connections, campaigns, creativeCount] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId } }),
    db.monthlyPlan.findUnique({
      where: { organizationId_month: { organizationId, month: currentMonthKey() } },
    }),
    connectionSummaries(organizationId),
    db.mairoCampaign.findMany({
      where: { organizationId, status: { not: "ARCHIVED" } },
      include: { platformCampaigns: { select: { platform: true } } },
    }),
    db.creativeRequest.count({ where: { organizationId } }),
  ]);

  const connectedPlatforms = [...connections.values()].filter((c) => c.connected);
  const anyConnected = connectedPlatforms.length > 0;

  // The checklist reads what has already been loaded above, plus the one thing
  // that had not been — whether setup was ever completed.
  const intake = await db.onboardingIntake.findUnique({
    where: { organizationId },
    select: { id: true },
  });

  // Live figures from every connected network. This runs after the queries
  // above rather than alongside them because it needs what they return, and it
  // is written never to throw — a slow or unhappy Meta or TikTok must not cost
  // the client their whole dashboard.
  const performance = await fetchOrganizationPerformance(organizationId);

  // Whether any campaign is worth suggesting a change to. Usually none are,
  // which is the correct answer for a campaign in its first week.
  const recommendations = await buildRecommendations(organizationId);

  const campaignCount = campaigns.length;
  // Every network any campaign runs on, for the icon row.
  const allPlatformsInUse = [
    ...new Set(campaigns.flatMap((c) => c.platformCampaigns.map((p) => p.platform))),
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${organization?.name}`}
        description="Here's where things stand this month."
      />

      <OwnerGettingStarted
        state={{
          hasSetup: Boolean(intake),
          hasMeta: anyConnected,
          hasPlan: Boolean(plan),
          hasCreative: creativeCount > 0,
          hasCampaign: campaignCount > 0,
        }}
      />

      {/* An optimization worth acting on outranks everything else on this
          page, so it sits above the numbers rather than below them. */}
      {recommendations.length > 0 && (
        <div className="mb-6 space-y-4">
          {recommendations.map((item) => (
            <OptimizationCard key={item.recommendationId} item={item} />
          ))}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-neutral-400">Where you advertise</p>
          <p className="mt-2 flex items-center gap-3 text-lg font-medium">
            {anyConnected ? (
              <>
                <PlatformIcons platforms={connectedPlatforms.map((c) => c.platform)} />
                <Badge tone="green">Connected</Badge>
              </>
            ) : (
              <Badge tone="red">Nothing connected</Badge>
            )}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-400">Campaigns</p>
          <p className="mt-2 flex items-center gap-3 text-2xl font-semibold">
            {campaignCount}
            <PlatformIcons platforms={allPlatformsInUse} />
          </p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-400">Creative requests</p>
          <p className="mt-2 text-2xl font-semibold">{creativeCount}</p>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm uppercase tracking-[0.16em] text-neutral-400">
              Total MAIRO performance
            </p>
            <Link href="/dashboard/analytics" className="text-xs text-neutral-400 underline underline-offset-4 hover:text-white">
              Full breakdown
            </Link>
          </div>
          {performance.hasData ? (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
              <Figure label="Spend" value={money(performance.total.spendCents)} />
              <Figure label="Revenue" value={money(performance.total.revenueCents)} />
              <Figure
                label="ROAS"
                value={
                  performance.total.roas === null ? NO_VALUE : `${performance.total.roas.toFixed(2)}x`
                }
              />
              <Figure
                label="Purchases"
                value={
                  performance.total.purchases === null
                    ? NO_VALUE
                    : formatInteger(performance.total.purchases)
                }
              />
              <Figure label="Cost per purchase" value={money(performance.total.costPerPurchaseCents)} />
            </div>
          ) : (
            <p className="text-sm text-neutral-400">
              No figures yet. Once a campaign has been running a day or so, they land here.
            </p>
          )}
          {performance.problems.map((p) => (
            <p key={p.platform} className="mt-4 text-xs text-amber-200/80">
              {p.message}
            </p>
          ))}
        </Card>
      </div>

      <div className="mt-8">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-neutral-400">{formatMonthKey(currentMonthKey())} plan</p>
              <p className="mt-1 text-lg font-medium">
                {plan ? <Badge tone={statusTone[plan.status]}>{plan.status}</Badge> : "No plan yet"}
              </p>
            </div>
            <Link href="/dashboard/plan" className={primaryButtonClass}>
              View plan
            </Link>
          </div>
          {plan && <p className="mt-4 line-clamp-3 text-sm text-neutral-400">{plan.strategySummary}</p>}
        </Card>
      </div>

      {!anyConnected && (
        <div className="mt-8">
          <Card className="border-amber-500/30 bg-amber-500/[0.06]">
            <p className="font-medium">Connect somewhere to advertise</p>
            <p className="mt-1 text-sm text-neutral-400">
              MAIRO needs access to at least one ad account — Meta, TikTok, or both —
              before it can launch anything.
            </p>
            <Link href="/dashboard/integrations" className={`${primaryButtonClass} mt-4`}>
              Choose where
            </Link>
          </Card>
        </div>
      )}
    </div>
  );
}

function money(cents: number | null): string {
  return cents === null ? NO_VALUE : formatMoney(cents / 100);
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p className="mt-1.5 text-xl font-light tabular-nums text-white">{value}</p>
    </div>
  );
}
