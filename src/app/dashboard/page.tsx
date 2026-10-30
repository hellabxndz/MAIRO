import { entitlementsFor } from "@/lib/entitlements";
import Link from "next/link";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { dashboardMode } from "@/lib/view-mode";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { buildRecommendations } from "@/lib/budget/recommendations";
import { OptimizationCard } from "@/components/optimization-card";
import { activeOrganizationId } from "@/lib/active-org";
import { fetchMetaBillingStatus } from "@/lib/meta/billing";
import { readinessFor } from "@/lib/readiness";
import { ReadinessPanel } from "@/components/readiness-panel";
import { maybeGoLive, autoLaunchIntent } from "@/lib/campaigns/auto-launch";
import { maybeRunSpendProtection } from "@/lib/protection/run";
import { publishDuePosts } from "@/lib/instagram/scheduler";
import { ResultsNote } from "@/components/results-disclaimer";
import { refreshDecisions } from "@/lib/decisions/run";
import { change, loadOverview, parseRange } from "@/lib/dashboard/overview";
import { KpiCard, KPI_ICON } from "@/components/dashboard/overview/kpi-card";
import { RangePicker, SourceChip } from "@/components/dashboard/overview/range-picker";
import { PerformanceChart } from "@/components/dashboard/overview/performance-chart";
import { PlatformSplit } from "@/components/dashboard/overview/platform-split";
import { InsightsList } from "@/components/dashboard/overview/insights";
import { CampaignTable } from "@/components/dashboard/overview/campaign-table";
import { count, money as fmtMoney, PANEL, pct, PUBLISHER_NAME, roas } from "@/components/dashboard/overview/format";
import { ConsoleOverview } from "./console-overview";
import { HomeOverview } from "./home-overview";
import { loadConsole } from "@/lib/dashboard/console";
import { DashboardModeToggle } from "@/components/dashboard/overview/mode-toggle";
import { MairoDecisionCard } from "@/components/decisions/decision-card";
import { BusinessHealthScore } from "@/components/intelligence/business-health";
import { OpportunityRadar } from "@/components/intelligence/opportunity-radar";
import { EarlyWarnings } from "@/components/intelligence/early-warnings";
import { CampaignTimeline } from "@/components/intelligence/campaign-timeline";
import { ProfitFirstView } from "@/components/intelligence/profit-first";
import { loadIntelligence } from "@/lib/intelligence/run";
import { campaignJourney } from "@/lib/intelligence/timeline";
import { contributionOf, DEFAULT_PROFIT_INPUTS, estimateProfit, productEconomics, type ProfitInputs } from "@/lib/intelligence/profit";
import { loadBrain } from "@/lib/business/brain";
import { parseReport, reportIsFresh, WEEKDAYS } from "@/lib/reports/weekly";
import { WeeklyReportCard } from "@/components/reports/weekly-card";
import { FirstCampaignCard } from "@/components/strategy/journey-card";
import { FreeHome } from "@/components/strategy/free-access";
import { freeHomeState } from "@/lib/strategy/free-home";
import { firstCampaignState } from "@/lib/strategy/first-campaign";
import { SuggestedAdsPrompt } from "@/components/suggested-ads-prompt";
import { PixelGuide } from "@/components/dashboard/pixel-guide";

// Results are read live from Meta on every load, so this page is only as fast
// as their API is. The default budget is not enough when several campaigns are
// queried at once and Meta is having a slow moment.
export const maxDuration = 30;

export default async function DashboardOverviewPage({ searchParams }: { searchParams: Promise<{ range?: string; journey?: string; feedback?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const query = await searchParams;
  const days = parseRange(query.range);

  // A free-plan account that hasn't subscribed: its plan, its next step, and
  // what unlocks with a subscription. Nothing below runs for it.
  //
  // Read together: each is its own question, and asking them one after the
  // other made every Overview load wait for all of them in a row.
  const [free, mode] = await Promise.all([freeHomeState(organizationId), dashboardMode()]);
  if (free) {
    return (
      <>
        <SuggestedAdsPrompt organizationId={organizationId} className="mx-auto mb-6 max-w-[1100px]" />
        <FreeHome {...free} />
      </>
    );
  }


  // Before anything is read, anything that is ready goes live.
  //
  // Here rather than behind a button, because the whole promise of MAIRO is
  // that a business owner does not have to know which button. It does nothing
  // at all unless a campaign is built and every setup step is genuinely
  // finished — see src/lib/campaigns/auto-launch.ts for what it refuses to do.
  const launched = await maybeGoLive(organizationId);

  // The upkeep that rides along with opening MAIRO — spend limits (the
  // scheduled run is only daily), approved Instagram posts that are due, and
  // the daily look behind MAIRO Decisions once it has gone stale — runs after
  // the page has been sent, not before. Each one used to hold the screen
  // until it finished: publishing a post alone was allowed eight seconds.
  // None of them changes what this render shows in a way worth waiting for;
  // the next screen picks up whatever they found.
  after(async () => {
    await maybeRunSpendProtection(organizationId).catch(() => undefined);
    await publishDuePosts({ organizationId, limit: 2, budgetMs: 8_000 }).catch(() => undefined);
    await refreshDecisions(organizationId).catch((error) => console.error("Decisions refresh failed:", error));
  });

  // Simple mode: the calm Overview — goal, this month, what MAIRO is doing,
  // anything that needs the owner, one insight, what's next. The Advanced and
  // Profit First views below keep every figure for those who want them.
  // A launch the owner approved that went live on this visit, said first.
  // "Live" only for what Meta confirms is delivering; anything switched on
  // whose ad Meta is still reviewing is called exactly that.
  const one = launched.names.length === 1;
  const allDelivering = launched.delivering.length === launched.names.length;
  const launchedNotice = launched.launched ? (
    <Card className="border-emerald-400/25 bg-emerald-400/[0.05]">
      <p className="font-medium text-emerald-200">
        {allDelivering
          ? one ? `${launched.names[0]} is live` : `${launched.names.length} campaigns are live`
          : one ? `MAIRO switched ${launched.names[0]} on` : `MAIRO switched ${launched.names.length} campaigns on`}
      </p>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-300">
        You approved {one ? "it" : "them"} at the budget you agreed to, and once Meta confirmed your ad account can be charged, MAIRO switched {one ? "it" : "them"} on.{" "}
        {allDelivering
          ? `Meta approved the ${one ? "ad" : "ads"} and ${one ? "it's" : "they're"} delivering.`
          : "Meta reviews new ads before they deliver, usually within a day — the campaign page shows Meta's answer, and MAIRO tells you if an ad isn't approved."}{" "}
        Meta charges your ad account as the ads deliver. You can pause {one ? "it" : "them"} any time from Campaigns.
      </p>
    </Card>
  ) : null;

  // Simple (the default): the chat-app-simple home — one box, one next step,
  // a short summary, what's waiting, the campaigns. Advanced and Profit First
  // below keep every figure for those who switch to them in Account.
  if (mode === "simple") {
    return (
      <HomeOverview
        organizationId={organizationId}
        userName={session.user.name ?? ""}
        days={days}
        askFeedback={query.feedback === "1"}
        above={launchedNotice}
      />
    );
  }

  // Read side by side rather than one after another.
  //
  // Recommendations: whether any campaign is worth suggesting a change to.
  // Usually none are, which is the correct answer for a campaign in its first
  // week.
  //
  // Billing: whether the ad account can actually be charged. A campaign that
  // has been created, looks healthy and delivers nothing is almost always
  // this, and it is the one problem a business owner has no way of diagnosing
  // themselves.
  const [recommendations, billing] = await Promise.all([
    buildRecommendations(organizationId),
    connectionSummaries(organizationId).then((c) =>
      [...c.values()].some((x) => x.connected && x.platform === "META") ? fetchMetaBillingStatus(organizationId) : null,
    ),
  ]);
  const billingProblem =
    billing && billing.state !== "funded" && billing.state !== "unknown" ? billing : null;

  // One list of what is outstanding, shared with the campaigns page, the AI
  // specialists and auto-launch. Two screens disagreeing about what a customer
  // still owes is worse than neither of them saying anything.
  //
  // The billing answer read just above is handed over rather than fetched
  // again — same question, same render.
  //
  // Simple, Advanced and Profit First are the same screen at different
  // depths, not three products: everything below is read once, and the mode
  // only decides which of it goes on the screen — so they can never disagree
  // about the state of an account.
  const advanced = mode === "advanced";
  // firstCampaign: a business that came through the free plan — its first
  // campaign's state.
  const [[readiness, autoLaunch], consoleData, fresh, intelligence, latestReport, reportSettings, firstCampaign] = await Promise.all([
    Promise.all([readinessFor(organizationId, { billing }), autoLaunchIntent(organizationId)]),
    // Ad-by-ad rows are advanced analytics (MAIRO Scale); the Advanced view
    // itself, campaign by campaign, is on every plan.
    advanced ? entitlementsFor(organizationId).then((e) => loadConsole(organizationId, session.user.name ?? "", days, { adBreakdown: e.advanced_analytics })) : null,
    db.organization.findUnique({ where: { id: organizationId }, select: { decisionsCheckedAt: true, briefFrequency: true } }),
    loadIntelligence(organizationId),
    db.weeklyReport.findFirst({ where: { organizationId }, orderBy: { weekStart: "desc" } }),
    db.reportSettings.findUnique({ where: { organizationId } }),
    firstCampaignState(organizationId),
  ]);
  const overview = consoleData?.overview ?? (await loadOverview(organizationId, days));
  const latestData = latestReport ? parseReport(latestReport.dataJson) : null;

  // When the missing card is the thing holding the account up, the panel says
  // so and carries the link straight to Meta's payment page. The standalone
  // billing card below then has nothing to add, so it is not drawn — two
  // amber boxes repeating each other reads as a product that is shouting.
  const fundingIsTheBlocker = readiness.next?.id === "funding";
  const weeklyCard = (
    <WeeklyReportCard
      report={
        latestReport && latestData
          ? { id: latestReport.id, data: latestData, fresh: reportIsFresh(latestReport.generatedAt) }
          : null
      }
      nextDay={WEEKDAYS[reportSettings?.deliveryDay ?? 1]}
      enabled={reportSettings?.weeklyEnabled ?? true}
    />
  );

  // The campaign whose journey is shown: the one asked for, else the most
  // recent running one, else the most recent.
  const params = await searchParams;
  const journeyId =
    overview.campaigns.find((c) => c.id === params.journey)?.id ??
    overview.campaigns.find((c) => c.status === "ACTIVE")?.id ??
    overview.campaigns[0]?.id ??
    null;
  const journey = mode === "profit" || !journeyId ? null : await campaignJourney(organizationId, journeyId).catch(() => null);

  const checkedAt = fresh?.decisionsCheckedAt
    ? fresh.decisionsCheckedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  const { current: t, previous: p } = overview;

  const report = intelligence.report;
  const journeyCampaigns = overview.campaigns.map((c) => ({ id: c.id, name: c.name }));

  const alerts = (
    <>
      <SuggestedAdsPrompt organizationId={organizationId} />
      {firstCampaign && <FirstCampaignCard state={firstCampaign} />}
      {/* Something was switched on during this visit, so it says so — and
          whether Meta has approved the ad yet. */}
      {launchedNotice && <div className="mb-6">{launchedNotice}</div>}

      {/* The launch checklist covers the same steps for a plan-journey business. */}
      {!(firstCampaign && !firstCampaign.launched) && <ReadinessPanel
        readiness={readiness}
        autoLaunch={autoLaunch}
        action={
          fundingIsTheBlocker && billingProblem?.actionUrl
            ? { url: billingProblem.actionUrl, label: billingProblem.actionLabel ?? "Open Meta billing" }
            : null
        }
      />}

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
                  className="rounded-full bg-[image:var(--mairo-ramp)] shadow-[var(--mairo-glow-key)] px-5 py-2.5 text-xs font-medium text-black transition hover:brightness-110"
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

      {/* An optimization worth acting on outranks the numbers, so it sits
          above them. */}
      {recommendations.length > 0 && (
        <div className="mb-6 space-y-4">
          {recommendations.map((item) => (
            <OptimizationCard key={item.recommendationId} item={item} />
          ))}
        </div>
      )}

      {overview.problems.map((problem) => (
        <p key={problem.platform} className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3 text-[13px] text-amber-200">
          {problem.message}
        </p>
      ))}

      {/* Until tracking works: how to set the pixel up, right here. */}
      <PixelGuide organizationId={organizationId} className="mb-6" />
    </>
  );

  const chart = (
    <section className={`${PANEL} p-5`}>
      <h2 className="mb-3 text-[16px] font-semibold text-white">{advanced ? "Spend & purchases over time" : "Money spent vs sales"}</h2>
      {overview.daily === null ? (
        <p className="py-16 text-center text-[13px] text-muted">
          {overview.campaigns.length === 0 ? "Your chart starts with your first campaign." : "Meta couldn't give a day-by-day split just now. Refresh to try again."}
        </p>
      ) : overview.daily.every((d) => !d.delivered) ? (
        <p className="py-16 text-center text-[13px] text-muted">Nothing delivered in the last {days} days yet.</p>
      ) : (
        <PerformanceChart points={overview.daily} variant={advanced ? "spend-purchases" : "spend-sales"} />
      )}
    </section>
  );

  const header = (
    <header className="mb-6 space-y-4">
      <div className="min-w-0">
        <h1 className="text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">
          {mode === "profit" ? "Is your advertising making money?" : "Here’s how your ads are performing"}
        </h1>
        {mode === "profit" && <p className="mt-1.5 text-[14.5px] text-muted">Revenue, estimated profit and break-even — the financial side of your ads.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <DashboardModeToggle mode={mode} />
        <div className="flex flex-wrap gap-2.5">
          <RangePicker days={days} since={overview.range.since} until={overview.range.until} />
          <SourceChip />
        </div>
      </div>
    </header>
  );

  const decisionsSection = (
    <section className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">MAIRO decisions</h2>
        <Link href="/dashboard/decisions" className="text-[12.5px] text-violet-bright hover:text-white">
          View all{overview.pendingCount > 0 ? ` ${overview.pendingCount}` : ""} →
        </Link>
      </div>
      {overview.insights.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-muted">
          Nothing worth changing right now — MAIRO looks again every day.{checkedAt ? ` Last looked ${checkedAt}.` : ""}
        </p>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {overview.insights.slice(0, 2).map((d) => (
            <MairoDecisionCard key={d.id} decision={d} advanced={advanced} />
          ))}
        </div>
      )}
    </section>
  );

  const timeline = <CampaignTimeline journey={journey} campaigns={journeyCampaigns} advanced={advanced} />;
  const table = <CampaignTable rows={overview.campaigns} variant={advanced ? "advanced" : "simple"} range={overview.range} />;

  if (mode === "profit") {
    const [settingsRow, products, brain] = await Promise.all([
      db.profitSettings.findUnique({ where: { organizationId } }),
      db.product.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, priceCents: true, costCents: true } }),
      loadBrain(organizationId),
    ]);
    const inputs: ProfitInputs = {
      ...DEFAULT_PROFIT_INPUTS,
      ...(settingsRow ?? {}),
      brainMarginPercent: brain.profile.profitMarginPercent,
    };
    const profit = estimateProfit({ revenueCents: t.revenueCents, spendCents: t.spendCents, purchases: t.purchases }, inputs, days);
    const row = (name: string, m: PlatformMetrics) => {
      const f = { revenueCents: m.revenueCents, spendCents: m.spendCents, purchases: m.purchases };
      return { name, revenueCents: m.revenueCents, spendCents: m.spendCents, ...contributionOf(f, inputs) };
    };
    return (
      <div className="mx-auto max-w-[1440px]">
        {header}
        {alerts}
        <div className="mb-4">{weeklyCard}</div>
        <ProfitFirstView
          report={profit}
          days={days}
          settings={inputs}
          platforms={(overview.publishers ?? []).map((pub) => row(PUBLISHER_NAME[pub.publisher] ?? pub.publisher, pub.metrics))}
          campaigns={overview.campaigns.filter((c) => c.hasData && (c.metrics.spendCents ?? 0) > 0).map((c) => row(c.name, c.metrics))}
          products={products.map((pr) => ({ ...pr, ...productEconomics(pr.priceCents, pr.costCents, inputs) }))}
        />
        <ResultsNote className="mt-6" />
      </div>
    );
  }

  // The period day by day for the cards' sparklines — only from Meta's daily
  // split; a day with no reading stays a gap, never a zero.
  const dailyPts = overview.daily ?? [];
  const sparks = {
    spend: dailyPts.length ? dailyPts.map((d) => (d.delivered ? d.spendCents : null)) : null,
    revenue: dailyPts.length ? dailyPts.map((d) => (d.delivered ? d.revenueCents : null)) : null,
    results: dailyPts.length ? dailyPts.map((d) => (d.delivered ? d.purchases || d.leads || 0 : null)) : null,
    roas: dailyPts.length ? dailyPts.map((d) => (d.delivered && d.spendCents > 0 ? d.revenueCents / d.spendCents : null)) : null,
  };
  const runningDaily = (await db.mairoCampaign.aggregate({ where: { organizationId, status: "ACTIVE" }, _sum: { totalDailyBudgetCents: true } }))._sum.totalDailyBudgetCents ?? 0;
  const budgetUse = runningDaily > 0 && t.spendCents !== null ? t.spendCents / (runningDaily * days) : null;

  // Advanced: the shared console on top, every figure underneath.
  const advancedBelow = (
    <>
      {recommendations.length > 0 && (
        <div className="space-y-4">
          {recommendations.map((item) => (
            <OptimizationCard key={item.recommendationId} item={item} />
          ))}
        </div>
      )}
      {overview.problems.map((problem) => (
        <p key={problem.platform} className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3 text-[13px] text-amber-200">
          {problem.message}
        </p>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright">Every figure</h2>
        <SourceChip />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        <KpiCard compact label="Amount spent" value={fmtMoney(t.spendCents)} change={change(t.spendCents, p?.spendCents)} icon={KPI_ICON.money} spark={sparks.spend} source="Meta Ads" />
        <KpiCard compact label="Revenue from ads" value={fmtMoney(t.revenueCents)} change={change(t.revenueCents, p?.revenueCents)} icon={KPI_ICON.trend} spark={sparks.revenue} source="Meta-attributed" hint="Purchase value Meta credits to your ads, by its attribution settings. Not your store's total sales." />
        <KpiCard compact label="Impressions" value={count(t.impressions)} change={change(t.impressions, p?.impressions)} icon={KPI_ICON.eye} hint="How many times your ads were shown." />
        <KpiCard compact label="Reach" value={count(t.reach)} change={change(t.reach, p?.reach)} icon={KPI_ICON.users} hint="People who saw your ads, added across campaigns." />
        <KpiCard compact label="Clicks" value={count(t.clicks)} change={change(t.clicks, p?.clicks)} icon={KPI_ICON.cursor} />
        <KpiCard compact label="CTR" value={pct(t.ctr)} change={change(t.ctr, p?.ctr)} icon={KPI_ICON.percent} hint="Click-through rate: out of every 100 people who saw the ad, how many clicked it." />
        <KpiCard compact label="CPC" value={fmtMoney(t.cpcCents)} change={change(t.cpcCents, p?.cpcCents)} goodWhen="down" icon={KPI_ICON.coin} hint="What each click cost, on average." />
        <KpiCard compact label="CPM" value={fmtMoney(t.cpmCents)} change={change(t.cpmCents, p?.cpmCents)} goodWhen="down" icon={KPI_ICON.bars} hint="What it cost to show the ad 1,000 times." />
        <KpiCard compact label="Conversions" value={count(t.purchases ?? t.conversions)} change={change(t.purchases ?? t.conversions, p?.purchases ?? p?.conversions)} icon={KPI_ICON.cart} spark={sparks.results} source="Meta-attributed" />
        <KpiCard compact label="CPA" value={fmtMoney(t.costPerPurchaseCents)} change={change(t.costPerPurchaseCents, p?.costPerPurchaseCents)} goodWhen="down" icon={KPI_ICON.tag} hint="Cost per acquisition: what each purchase cost, on average." />
        <KpiCard compact label="ROAS" value={roas(t.roas)} change={change(t.roas, p?.roas)} icon={KPI_ICON.trend} spark={sparks.roas} source="Meta-attributed" hint="Return on ad spend: how many dollars came back for every $1 spent on ads, by Meta's attribution." />
        <KpiCard compact label="Budget used" value={budgetUse === null ? "—" : `${Math.round(budgetUse * 100)}%`} change={null} icon={KPI_ICON.bars} source="Estimate" hint="Spend this period against today's daily budgets of your running campaigns over the same days. An estimate: budgets change and campaigns start mid-period." />
      </div>
      {weeklyCard}
      {table}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        {chart}
        <section className={`${PANEL} p-5`}>
          <InsightsList items={overview.insights} total={overview.pendingCount} checkedAt={checkedAt} />
        </section>
        <section className={`${PANEL} p-5`}>
          <PlatformSplit publishers={overview.publishers} selectable />
        </section>
      </div>
      <BusinessHealthScore health={report?.health ?? null} />
      <OpportunityRadar radar={report?.radar ?? null} insights={intelligence.insights} />
      <EarlyWarnings insights={intelligence.insights} advanced />
      {timeline}
      {decisionsSection}
    </>
  );

  return (
    <ConsoleOverview organizationId={organizationId} userName={session.user.name ?? ""} days={days} mode="advanced" data={consoleData ?? undefined} above={launchedNotice} below={advancedBelow} />
  );
}
