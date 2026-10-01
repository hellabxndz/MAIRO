import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardMode } from "@/lib/view-mode";
import { firstNameFrom } from "@/components/mairo/simple-dashboard";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { buildRecommendations } from "@/lib/actions/optimize-actions";
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
import { DashboardModeToggle } from "@/components/dashboard/overview/mode-toggle";
import { MairoDecisionCard } from "@/components/decisions/decision-card";
import { MorningBrief } from "@/components/intelligence/morning-brief";
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
import { SocialManagerPrompt } from "@/components/strategy/social-manager-prompt";
import { socialAccess } from "@/lib/social/access";
import { FreeHome } from "@/components/strategy/free-access";
import { freeHomeState } from "@/lib/strategy/free-home";
import { firstCampaignState } from "@/lib/strategy/first-campaign";

// Results are read live from Meta on every load, so this page is only as fast
// as their API is. The default budget is not enough when several campaigns are
// queried at once and Meta is having a slow moment.
export const maxDuration = 30;

export default async function DashboardOverviewPage({ searchParams }: { searchParams: Promise<{ range?: string; journey?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const days = parseRange((await searchParams).range);

  // A free-plan account that hasn't subscribed: its plan, its next step, and
  // what unlocks with a subscription. Nothing below runs for it.
  const free = await freeHomeState(organizationId);
  if (free) return <FreeHome {...free} />;

  // Active Scale without a Social Manager goal yet: invite them to set one.
  const askSocial =
    (await socialAccess(organizationId)).ok && !(await db.socialStrategy.findUnique({ where: { organizationId }, select: { id: true } }));

  // Before anything is read, anything that is ready goes live.
  //
  // Here rather than behind a button, because the whole promise of MAIRO is
  // that a business owner does not have to know which button. It does nothing
  // at all unless a campaign is built and every setup step is genuinely
  // finished — see src/lib/campaigns/auto-launch.ts for what it refuses to do.
  const launched = await maybeGoLive(organizationId);
  // Spend limits, checked here too: the scheduled run is only daily.
  await maybeRunSpendProtection(organizationId).catch(() => undefined);
  // Approved Instagram posts that are due go out when the business opens MAIRO.
  await publishDuePosts({ organizationId, limit: 2, budgetMs: 8_000 }).catch(() => undefined);

  const [organization, connections] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId } }),
    connectionSummaries(organizationId),
  ]);
  const connectedPlatforms = [...connections.values()].filter((c) => c.connected);

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

  // Mairo Decisions. The daily look runs here too when it's gone stale, so
  // the insights are about this morning's numbers, not yesterday's.
  await refreshDecisions(organizationId).catch((error) => console.error("Decisions refresh failed:", error));

  // Simple, Advanced and Profit First are the same screen at different
  // depths, not three products: everything below is read once, and the mode
  // only decides which of it goes on the screen — so they can never disagree
  // about the state of an account.
  const mode = await dashboardMode();
  const advanced = mode === "advanced";
  const [overview, fresh, intelligence, latestReport, reportSettings] = await Promise.all([
    loadOverview(organizationId, days, { adBreakdown: advanced }),
    db.organization.findUnique({ where: { id: organizationId }, select: { decisionsCheckedAt: true, briefFrequency: true } }),
    loadIntelligence(organizationId),
    db.weeklyReport.findFirst({ where: { organizationId }, orderBy: { weekStart: "desc" } }),
    db.reportSettings.findUnique({ where: { organizationId } }),
  ]);
  const latestData = latestReport ? parseReport(latestReport.dataJson) : null;
  // A business that came through the free plan: its first campaign's state.
  const firstCampaign = await firstCampaignState(organizationId);
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

  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: organization?.timezone || "America/New_York" }).format(now),
  );
  const greeting = `${Number.isFinite(hour) && hour < 12 ? "Good morning" : Number.isFinite(hour) && hour < 18 ? "Good afternoon" : "Good evening"}${
    session.user.name ? `, ${firstNameFrom(session.user.name, "")}` : ""
  }.`;
  const checkedAt = fresh?.decisionsCheckedAt
    ? fresh.decisionsCheckedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  const { current: t, previous: p } = overview;
  const report = intelligence.report;
  const briefActions = intelligence.insights.filter((i) => i.severity !== "INFO").slice(0, 2);
  const journeyCampaigns = overview.campaigns.map((c) => ({ id: c.id, name: c.name }));

  const alerts = (
    <>
      {firstCampaign && <FirstCampaignCard state={firstCampaign} />}
      {askSocial && <SocialManagerPrompt />}
      {/* MAIRO acted on its own, so it says so — before the customer finds a
          live campaign they did not press anything to start. */}
      {launched.launched && (
        <Card className="mb-6 border-emerald-400/25 bg-emerald-400/[0.05]">
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
          {mode === "profit" ? "Is your advertising making money?" : advanced ? "Here’s how your ads are performing" : "Here’s how your ads are doing"}
        </h1>
        {mode === "simple" && <p className="mt-1.5 text-[14.5px] text-muted">{summarySentence(t, p, days)}</p>}
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
    <section className="rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Mairo decisions</h2>
        <Link href="/dashboard/decisions" className="text-[12.5px] text-violet-bright hover:text-white">
          View all{overview.pendingCount > 0 ? ` ${overview.pendingCount}` : ""} →
        </Link>
      </div>
      {overview.insights.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-muted">
          Nothing worth changing right now — Mairo looks again every day.{checkedAt ? ` Last looked ${checkedAt}.` : ""}
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

  if (advanced) {
    return (
      <div className="mx-auto max-w-[1440px]">
        {header}
        {alerts}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard compact label="Amount spent" value={fmtMoney(t.spendCents)} change={change(t.spendCents, p?.spendCents)} icon={KPI_ICON.money} />
          <KpiCard compact label="Impressions" value={count(t.impressions)} change={change(t.impressions, p?.impressions)} icon={KPI_ICON.eye} hint="How many times your ads were shown." />
          <KpiCard compact label="Reach" value={count(t.reach)} change={change(t.reach, p?.reach)} icon={KPI_ICON.users} hint="People who saw your ads, added across campaigns." />
          <KpiCard compact label="Clicks" value={count(t.clicks)} change={change(t.clicks, p?.clicks)} icon={KPI_ICON.cursor} />
          <KpiCard compact label="CTR" value={pct(t.ctr)} change={change(t.ctr, p?.ctr)} icon={KPI_ICON.percent} hint="Click-through rate: out of every 100 people who saw the ad, how many clicked it." />
          <KpiCard compact label="CPC" value={fmtMoney(t.cpcCents)} change={change(t.cpcCents, p?.cpcCents)} goodWhen="down" icon={KPI_ICON.coin} hint="What each click cost, on average." />
          <KpiCard compact label="CPM" value={fmtMoney(t.cpmCents)} change={change(t.cpmCents, p?.cpmCents)} goodWhen="down" icon={KPI_ICON.bars} hint="What it cost to show the ad 1,000 times." />
          <KpiCard compact label="Conversions" value={count(t.purchases ?? t.conversions)} change={change(t.purchases ?? t.conversions, p?.purchases ?? p?.conversions)} icon={KPI_ICON.cart} />
          <KpiCard compact label="CPA" value={fmtMoney(t.costPerPurchaseCents)} change={change(t.costPerPurchaseCents, p?.costPerPurchaseCents)} goodWhen="down" icon={KPI_ICON.tag} hint="Cost per acquisition: what each purchase cost, on average." />
          <KpiCard compact label="ROAS" value={roas(t.roas)} change={change(t.roas, p?.roas)} icon={KPI_ICON.trend} hint="Return on ad spend: how many dollars came back for every $1 spent on ads." />
        </div>
        <div className="mt-4">{weeklyCard}</div>
        <div className="mt-4">{table}</div>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
          {chart}
          <section className={`${PANEL} p-5`}>
            <InsightsList items={overview.insights} total={overview.pendingCount} checkedAt={checkedAt} />
          </section>
          <section className={`${PANEL} p-5`}>
            <PlatformSplit publishers={overview.publishers} selectable />
          </section>
        </div>
        <div className="mt-4">
          <BusinessHealthScore health={report?.health ?? null} />
        </div>
        <div className="mt-4">
          <OpportunityRadar radar={report?.radar ?? null} insights={intelligence.insights} />
        </div>
        <div className="mt-4">
          <EarlyWarnings insights={intelligence.insights} advanced />
        </div>
        <div className="mt-4">{timeline}</div>
        <div className="mt-4">{decisionsSection}</div>
        <ResultsNote className="mt-6" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      {header}
      {alerts}
      <MorningBrief
        greeting={greeting}
        brief={report?.brief ?? null}
        frequency={fresh?.briefFrequency ?? "DAILY"}
        actions={briefActions}
        pendingDecisions={overview.pendingCount}
      />
      <div className="mt-4">{weeklyCard}</div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Money spent" value={fmtMoney(t.spendCents)} change={change(t.spendCents, p?.spendCents)} icon={KPI_ICON.money} />
        <KpiCard label="Revenue" value={fmtMoney(t.revenueCents)} change={change(t.revenueCents, p?.revenueCents)} icon={KPI_ICON.cart} hint="Sales Meta tracked back to your ads." />
        <KpiCard label="Purchases" value={count(t.purchases)} change={change(t.purchases, p?.purchases)} icon={KPI_ICON.bag} />
        <KpiCard label="Cost per sale" value={fmtMoney(t.costPerPurchaseCents)} change={change(t.costPerPurchaseCents, p?.costPerPurchaseCents)} goodWhen="down" icon={KPI_ICON.tag} hint="What you paid in ads, on average, for each sale." />
        <KpiCard label="ROAS" value={roas(t.roas)} change={change(t.roas, p?.roas)} icon={KPI_ICON.bars} hint="Return on ad spend: how many dollars came back for every $1 spent on ads." />
      </div>
      <div className="mt-4">
        <BusinessHealthScore health={report?.health ?? null} />
      </div>
      <div className="mt-4">{decisionsSection}</div>
      <div className="mt-4">
        <OpportunityRadar radar={report?.radar ?? null} insights={intelligence.insights} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        {chart}
        <section className={`${PANEL} p-5`}>
          <PlatformSplit publishers={overview.publishers} />
        </section>
      </div>
      <div className="mt-4">{table}</div>
      <div className="mt-4">
        <EarlyWarnings insights={intelligence.insights} advanced={false} />
      </div>
      <div className="mt-4">{timeline}</div>
      <ResultsNote className="mt-6" />
    </div>
  );
}

/** The Simple view's one-line summary. Only says what the numbers show. */
function summarySentence(t: PlatformMetrics, p: PlatformMetrics | null, days: number): string {
  if (t.spendCents === null || t.spendCents === 0) return `Nothing has been spent on ads in the last ${days} days yet.`;
  const spent = `You spent ${fmtMoney(t.spendCents)}`;
  if (t.revenueCents !== null && t.revenueCents > 0) {
    const move = change(t.revenueCents, p?.revenueCents);
    const tail =
      move === null || Math.abs(move) < 0.005
        ? ""
        : ` That’s a ${Math.abs(Math.round(move * 100))}% ${move > 0 ? "increase" : "drop"} from the period before.`;
    return `${spent} and made ${fmtMoney(t.revenueCents)} in sales from your ads.${tail}`;
  }
  if (t.purchases) return `${spent} and got ${count(t.purchases)} purchase${t.purchases === 1 ? "" : "s"} from your ads.`;
  return `${spent} in the last ${days} days. No sales have been tracked back to your ads yet.`;
}
