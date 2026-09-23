import Link from "next/link";
import { redirect } from "next/navigation";
import { viewMode } from "@/lib/view-mode";
import { SimpleDashboard, firstNameFrom } from "@/components/mairo/simple-dashboard";
import { assistantNameOf } from "@/lib/ai/agents";
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
import { fetchMetaBillingStatus } from "@/lib/meta/billing";
import { readinessFor } from "@/lib/readiness";
import { ReadinessPanel } from "@/components/readiness-panel";
import { maybeGoLive, autoLaunchIntent } from "@/lib/campaigns/auto-launch";
import { maybeRunSpendProtection } from "@/lib/protection/run";
import { ResultsNote } from "@/components/results-disclaimer";
import { campaignHealth } from "@/lib/campaigns/health";
import { organizationActions } from "@/lib/campaigns/action-log";

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

  // Before anything is read, anything that is ready goes live.
  //
  // Here rather than behind a button, because the whole promise of MAIRO is
  // that a business owner does not have to know which button. It does nothing
  // at all unless a campaign is built and every setup step is genuinely
  // finished — see src/lib/campaigns/auto-launch.ts for what it refuses to do.
  const launched = await maybeGoLive(organizationId);
  // Spend limits, checked here too: the scheduled run is only daily.
  await maybeRunSpendProtection(organizationId).catch(() => undefined);

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


  // Live figures from every connected network. This runs after the queries
  // above rather than alongside them because it needs what they return, and it
  // is written never to throw — a slow or unhappy Meta or TikTok must not cost
  // the client their whole dashboard.
  const performance = await fetchOrganizationPerformance(organizationId);

  // Whether any campaign is worth suggesting a change to. Usually none are,
  // which is the correct answer for a campaign in its first week.
  const recommendations = await buildRecommendations(organizationId);

  // Whether the ad account can actually be charged. A campaign that has been
  // created, looks healthy and delivers nothing is almost always this, and it
  // is the one problem a business owner has no way of diagnosing themselves.
  const billing = connectedPlatforms.some((c) => c.platform === "META")
    ? await fetchMetaBillingStatus(organizationId)
    : null;
  const billingProblem =
    billing && billing.state !== "funded" && billing.state !== "unknown" ? billing : null;

  // One list of what is outstanding, shared with the campaigns page, the AI
  // specialists and auto-launch. Two screens disagreeing about what a customer
  // still owes is worse than neither of them saying anything.
  //
  // The billing answer read just above is handed over rather than fetched
  // again — same question, same render.
  const [readiness, autoLaunch] = await Promise.all([
    readinessFor(organizationId, { billing }),
    autoLaunchIntent(organizationId),
  ]);

  // When the missing card is the thing holding the account up, the panel says
  // so and carries the link straight to Meta's payment page. The standalone
  // billing card below then has nothing to add, so it is not drawn — two
  // amber boxes repeating each other reads as a product that is shouting.
  const fundingIsTheBlocker = readiness.next?.id === "funding";

  const campaignCount = campaigns.length;
  // Every network any campaign runs on, for the icon row.
  const allPlatformsInUse = [
    ...new Set(campaigns.flatMap((c) => c.platformCampaigns.map((p) => p.platform))),
  ];

  // Simple View is the same screen at a different depth, not a second product.
  //
  // Everything above this line — the auto-launch, the readiness list, the
  // billing check, the live figures — has already run and is shared. The only
  // thing the mode decides is how much of it to put on the screen, which is
  // exactly the guarantee that the two views can never disagree about the
  // state of an account.
  // The account as a whole, and what MAIRO has actually changed. Both read the
  // same way the campaign screen does, so the dashboard and a campaign can
  // never describe the same state differently.
  const anyLive = campaigns.some((c) => c.status === "ACTIVE");
  const accountHealth = campaignHealth(performance.total, { live: anyLive, scope: "account" });
  const actions = await organizationActions(organizationId, 6);

  // What is going out and what is allowed to move it. Both read here rather
  // than inside the dashboard component, so the figures on the card are the
  // same rows the rest of the page was rendered from.
  const [intake, automation, insights] = await Promise.all([
    db.onboardingIntake.findUnique({
      where: { organizationId },
      select: { monthlyBudgetCents: true },
    }),
    db.autoOptimizeSettings.findUnique({
      where: { organizationId },
      select: { level: true },
    }),
    // Unread only, and at most two. A proactive card that stays after it has
    // been read becomes furniture, and four at once is a feed.
    db.notification.findMany({
      where: { organizationId, readAt: null, dismissedAt: null },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 2,
    }),
  ]);

  const dailyCents = campaigns
    .filter((c) => c.status === "ACTIVE")
    .reduce((total, c) => total + c.totalDailyBudgetCents, 0);

  if ((await viewMode()) === "simple") {
    return (
      <SimpleDashboard
        firstName={firstNameFrom(session.user.name, "")}
        performance={performance}
        campaigns={campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          platforms: c.platformCampaigns.map((p) => p.platform),
        }))}
        notices={recommendations.map((r) => r.recommendation.headline)}
        anyConnected={anyConnected}
        health={accountHealth}
        actions={actions}
        assistantName={assistantNameOf(organization?.assistantName)}
        spend={{
          spentCents: performance.total.spendCents,
          // Nothing running is not a daily budget of zero — it is no daily
          // budget, which reads as a dash rather than as $0.
          dailyCents: dailyCents > 0 ? dailyCents : null,
          monthlyCents: intake?.monthlyBudgetCents ?? null,
        }}
        automationLevel={automation?.level ?? "MANUAL"}
        insights={insights}
        readiness={readiness}
        monthlyPlan={plan ? { summary: plan.strategySummary } : null}
        monthLabel={formatMonthKey(currentMonthKey())}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${organization?.name}`}
        description="Here's where things stand this month."
      />

      {/* MAIRO acted on its own, so it says so — before the customer finds a
          live campaign they did not press anything to start. */}
      {launched.launched && (
        <Card className="mb-8 border-emerald-400/25 bg-emerald-400/[0.05]">
          <p className="font-medium text-emerald-200">
            {launched.names.length === 1
              ? `MAIRO put ${launched.names[0]} live`
              : `MAIRO put ${launched.names.length} campaigns live`}
          </p>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-300">
            Everything it needed was done, so it started{" "}
            {launched.names.length === 1 ? "it" : "them"} rather than waiting for you.
            Meta will begin charging your ad account as the ads deliver. You can pause
            {launched.names.length === 1 ? " it" : " them"} any time from Campaigns.
          </p>
        </Card>
      )}

      <ReadinessPanel
        readiness={readiness}
        autoLaunch={autoLaunch}
        action={
          fundingIsTheBlocker && billingProblem?.actionUrl
            ? { url: billingProblem.actionUrl, label: billingProblem.actionLabel ?? "Open Meta billing" }
            : null
        }
      />

      {/* Ads that cannot be paid for outrank everything, including an
          optimization: there is no point tuning a budget split on a campaign
          Meta will not run. */}
      {billingProblem && !fundingIsTheBlocker && (
        <div className="mb-6">
          <Card className="border-amber-500/30 bg-amber-500/[0.06]">
            <p className="font-medium text-amber-200">
              {billingProblem.state === "no_payment_method"
                ? "Meta has no way to charge for your ads yet"
                : "Meta can't run your ads right now"}
            </p>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-300">
              {billingProblem.message}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {billingProblem.actionUrl && (
                <a
                  href={billingProblem.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-[image:var(--mairo-ramp)] shadow-[var(--mairo-glow-key)] px-5 py-2.5 text-xs font-medium text-white transition hover:brightness-110"
                >
                  {billingProblem.actionLabel} →
                </a>
              )}
              <Link
                href="/dashboard/meta"
                className="rounded-full border border-white/10 px-5 py-2.5 text-xs text-neutral-300 transition hover:border-white/25 hover:text-white"
              >
                See the details
              </Link>
            </div>
          </Card>
        </div>
      )}

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
          {/* Attached to the plan rather than parked at the bottom of the
              screen: the plan is the thing that describes a month that has not
              happened yet, so this is the claim that needs the qualifier. */}
          <ResultsNote className="mt-4" />
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
