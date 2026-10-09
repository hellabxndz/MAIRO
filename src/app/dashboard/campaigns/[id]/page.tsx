import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { readinessFor } from "@/lib/readiness";
import { campaignTimeline } from "@/lib/campaigns/timeline";
import { campaignHealth } from "@/lib/campaigns/health";
import { campaignActions } from "@/lib/campaigns/action-log";
import { describeAudience, normalizeAudience } from "@/lib/campaigns/audience";
import { CampaignTimeline } from "@/components/mairo/campaign-timeline";
import { CampaignTimeline as CampaignJourneyTimeline } from "@/components/intelligence/campaign-timeline";
import { campaignJourney } from "@/lib/intelligence/timeline";
import { viewMode } from "@/lib/view-mode";
import {
  CampaignMetric,
  CampaignHealthPanel,
  AIActionCard,
  NoActionsYet,
  money,
  count,
  ratio,
  percent,
} from "@/components/mairo/campaign-parts";
import { GlassPanel } from "@/components/mairo";
import { EmptyState } from "@/components/ui";
import { CampaignTabs } from "./tabs";
import { parseTab } from "./tab-list";
import { CampaignApproval } from "./approval";
import { syncAdReviews } from "@/lib/campaigns/ad-review-sync";
import { campaignAdvice } from "@/lib/campaigns/advice";
import { RunControl } from "./run-control";
import { ScheduleControl } from "../schedule-control";
import { DestinationControl } from "../destination-control";
import { DeleteCampaign } from "../delete-campaign";
import { describeStart, localInputValue } from "@/lib/campaigns/schedule";
import { metaAdsManagerUrl } from "@/lib/ad-platforms/billing";
import { entitlementsFor } from "@/lib/entitlements";
import { planFor, PLANS } from "@/lib/plans";
import { canOptimizeTowards } from "@/lib/tracking/pixels";
import { toView } from "@/lib/decisions/store";
import { MairoDecisionCard } from "@/components/decisions/decision-card";
import { PLACEMENT_OPTIONS } from "@/lib/campaigns/placements";
import { objectiveCapability, optimizationCapability } from "@/lib/meta-intelligence/capabilities";
import { familyFor, goalLabel, optimizingFor, primaryResult, statusLabel } from "@/lib/dashboard/campaigns";
import { performanceTiles } from "@/lib/dashboard/home";
import { EMPTY_METRICS } from "@/lib/ad-platforms/types";

// One campaign, end to end.
//
// This is the screen the whole product points at: what MAIRO is doing with this
// budget, what it has already done, and the one decision that is genuinely the
// customer's — whether to let it run.
//
// Every tab renders on the server from real rows. The figures come from the
// networks through the same performance API the analytics screen uses; the
// action log is applied OptimizationRecommendations; the timeline is derived
// from campaign state. Nothing on this page is generated to fill space, which
// is why several tabs can be empty — a campaign that launched an hour ago has
// no figures and no actions, and saying so is the honest version.

export const dynamic = "force-dynamic";

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab: tabParam }] = await Promise.all([params, searchParams]);
  const tab = parseTab(tabParam);

  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  // Meta's latest verdict on the ads, so a rejection shows here as soon as it
  // happens. Throttled inside: a recent check costs nothing. Only the
  // campaign itself waits for it — everything else on the screen is read at
  // the same time, in one round, rather than three rounds one after another.
  const reviewed = syncAdReviews(organizationId).catch(() => 0);

  const [
    campaign,
    connections,
    performance,
    readiness,
    actions,
    intake,
    autoOptimize,
    protectionLog,
    decisionRows,
    entitlements,
    org,
    pixel,
    campaignCount,
    mode,
  ] = await Promise.all([
    reviewed.then(() => db.mairoCampaign.findFirst({
      // Scoped by organization as well as id: an id in the URL is not
      // authorisation, and this is the only thing standing between one customer
      // and another's campaign.
      where: { id, organizationId },
      include: {
        platformCampaigns: {
          select: {
            id: true,
            platform: true,
            status: true,
            externalCampaignId: true,
            externalAdGroupId: true,
            externalAdId: true,
            lastError: true,
            adReviewState: true,
            adReviewExplanation: true,
            adReviewAction: true,
          },
        },
        ads: { orderBy: { position: "asc" } },
        creatives: {
          select: {
            id: true,
            platform: true,
            headline: true,
            primaryText: true,
            cta: true,
            mediaUrl: true,
          },
        },
      },
    })),
    connectionSummaries(organizationId),
    fetchOrganizationPerformance(organizationId),
    readinessFor(organizationId, { checkFunding: true }),
    // By the id in the URL: read-only, and nothing below is shown unless the
    // campaign above turns out to be this organization's.
    campaignActions(id),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { id: true } }),
    db.autoOptimizeSettings.findUnique({
      where: { organizationId },
      select: { enabled: true },
    }),
    db.protectionEvent.findMany({ where: { organizationId, mairoCampaignId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.mairoDecision.findMany({ where: { organizationId, mairoCampaignId: id, status: "PENDING" }, orderBy: { createdAt: "desc" } }),
    entitlementsFor(organizationId),
    db.organization.findUnique({ where: { id: organizationId }, select: { subscriptionTier: true } }),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } }, select: { status: true } }),
    db.mairoCampaign.count({ where: { organizationId, status: { not: "ARCHIVED" } } }),
    viewMode(),
  ]);
  if (!campaign) notFound();
  const plan = planFor(org?.subscriptionTier ?? "NONE");
  const upgradeTarget = PLANS.find((p) => p.priceMonthly > plan.priceMonthly) ?? PLANS[PLANS.length - 1];
  const atLimit = Number.isFinite(entitlements.campaign_limit) && campaignCount >= entitlements.campaign_limit;
  const hasTracking = pixel ? canOptimizeTowards(pixel.status) : false;
  const family = familyFor(campaign.objective, campaign.destinationType);
  const status = statusLabel(campaign, new Date());
  const report = performance.campaigns.find((c) => c.mairoCampaignId === campaign.id) ?? null;
  const metrics = report?.total ?? null;
  const live = campaign.status === "ACTIVE";
  const health = campaignHealth(metrics, { live });
  const advice = campaignAdvice({
    objective: campaign.objective,
    metrics,
    liveSince: campaign.startDate && campaign.startDate > campaign.createdAt ? campaign.startDate : campaign.createdAt,
    live,
    dailyBudgetCents: campaign.totalDailyBudgetCents,
  });

  const requested = campaign.platformCampaigns.map((p) => p.platform);
  const connected = [...connections.values()].filter((c) => c.connected).map((c) => c.platform);

  // The blockers the timeline reports are the readiness steps that are not
  // done and are waiting on the customer — phrased as they already are on the
  // dashboard, so the two screens never describe the same problem differently.
  const blockers = readiness.steps
    .filter((s) => !s.done && s.id !== "campaign")
    .map((s) => s.label.toLowerCase());

  const audience = normalizeAudience({
    geoKey: campaign.geoKey,
    geoLabel: campaign.geoLabel,
    geoRadius: campaign.geoRadius,
    ageMin: campaign.ageMin,
    ageMax: campaign.ageMax,
    genders: campaign.genders,
  });

  const steps = campaignTimeline({
    status: campaign.status,
    hasIntake: Boolean(intake),
    connected,
    requested,
    creativeCount: campaign.creatives.length,
    hasTargeting: Boolean(campaign.geoKey) || campaign.ageMin !== 18 || campaign.ageMax !== 65,
    blockers,
    appliedActions: actions.length,
    autoOptimizeOn: autoOptimize?.enabled ?? false,
    startsAt: campaign.startDate,
  });

  const placements = campaign.placements.length
    ? PLACEMENT_OPTIONS.filter((p) => campaign.placements.includes(p.value)).map((p) => p.label).join(", ")
    : "Everywhere Meta finds works best (Advantage+ placements)";
  const metaAccountId = connections.get("META")?.accountId;
  const metaCampaignId = campaign.platformCampaigns.find((c) => c.platform === "META" && c.externalCampaignId)?.externalCampaignId;
  const result = primaryResult(campaign.objective, campaign.destinationType, metrics);
  const decisions = decisionRows.map(toView);
  const instantForm = campaign.destinationType === "LEAD_FORM" && campaign.leadFormDelivery === "META_NATIVE";

  return (
    <div className="mx-auto max-w-[1180px]">
      <Link href="/dashboard/campaigns" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-white">
        <span aria-hidden>←</span>
        All campaigns
      </Link>

      {/* ---- Header: name, goal, status, the one thing that matters ---- */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[clamp(22px,3vw,28px)] font-semibold tracking-[-0.02em] text-white">{campaign.name}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted">
            <span>{goalLabel(campaign.objective)}</span>
            <span className="text-white/85">{status.dot} {status.text}</span>
            <span>{money(campaign.totalDailyBudgetCents)} a day</span>
          </p>
        </div>
        {(campaign.status === "ACTIVE" || campaign.status === "PAUSED") && (
          <RunControl campaignId={campaign.id} status={campaign.status} dailyBudgetLabel={money(campaign.totalDailyBudgetCents)} />
        )}
      </div>

      <CampaignTabs active={tab} />

      {/* ---- Performance ---- */}
      {tab === "performance" && (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-[24px] p-6 lg:grid-cols-4" style={{ background: "linear-gradient(180deg, rgba(var(--mairo-fg-rgb),0.035), rgba(var(--mairo-fg-rgb),0.015))" }}>
            {performanceTiles(family, metrics ?? EMPTY_METRICS).map((t) => (
              <div key={t.label}>
                <dd className="text-[clamp(24px,3vw,32px)] font-light tabular-nums text-white">{t.value}</dd>
                <dt className="mt-1.5 text-[13px] text-muted">{t.label}</dt>
              </div>
            ))}
          </dl>
          <p className="text-[13.5px] text-muted">
            <span className="text-white/85">What MAIRO is optimizing for:</span> {optimizingFor(campaign.objective, campaign.destinationType, hasTracking || instantForm)}. {result.label} so far: <span className="text-white">{result.value}</span>.
          </p>

          {campaign.platformCampaigns
            .filter((p) => p.adReviewState === "REJECTED" || p.adReviewState === "WITH_ISSUES")
            .map((p) => (
              <section key={p.platform} className="rounded-[20px] p-5" style={{ background: "rgba(248,113,113,0.06)" }}>
                <p className="text-[15px] font-medium text-white">{p.adReviewState === "REJECTED" ? "Meta didn't approve this ad" : "Meta flagged a problem with this ad"}</p>
                {p.adReviewExplanation && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{p.adReviewExplanation}</p>}
                {p.adReviewAction && <p className="mt-2 text-[13px] leading-relaxed text-white/90">What to do: {p.adReviewAction}</p>}
                <Link href="/dashboard/create" className="mt-4 inline-flex rounded-full px-4 py-2 text-[12.5px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)" }}>Make a new ad</Link>
              </section>
            ))}
          {campaign.platformCampaigns.some((p) => p.adReviewState === "PENDING") && (
            <p className="text-[12.5px] text-muted">Meta is reviewing the ad — usually within a day. MAIRO tells you if anything needs changing.</p>
          )}

          <CampaignHealthPanel health={health} />

          {advice.length > 0 && (
            <section>
              <h2 className="mb-3 text-[15px] font-medium text-white">What MAIRO recommends</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {advice.map((a) => (
                  <GlassPanel key={a.title} className="p-4">
                    <p className="flex items-center gap-2 text-[14px] text-white">
                      <span className="h-2 w-2 flex-none rounded-full" style={{ background: a.tone === "good" ? "#34d399" : a.tone === "fix" ? "#fbbf24" : a.tone === "idea" ? "#6c9eff" : "rgba(var(--mairo-fg-rgb),0.35)" }} aria-hidden />
                      {a.title}
                    </p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{a.detail}</p>
                    {a.href && <Link href={a.href} className="mt-3 inline-block text-[12.5px] text-white/90 underline underline-offset-4">{a.hrefLabel}</Link>}
                  </GlassPanel>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] text-faint">Advice only — MAIRO doesn&rsquo;t change anything here without you.</p>
            </section>
          )}

          {!live && <CampaignApproval campaignId={campaign.id} blockers={blockers} />}
        </div>
      )}

      {/* ---- Creatives ---- */}
      {tab === "creatives" && (
        <div>
          {campaign.ads.length === 0 && campaign.creatives.length === 0 ? (
            <EmptyState title="No ads on this campaign yet" description="MAIRO writes them as part of building the campaign. They appear here the moment it has." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {campaign.ads.map((ad, i) => {
                let why: string | null = null;
                try {
                  why = ad.briefJson ? (JSON.parse(ad.briefJson) as { reason?: string }).reason ?? null : null;
                } catch {
                  why = null;
                }
                const preview = ad.imageUrl ?? ad.videoPosterUrl;
                return (
                  <GlassPanel key={ad.id} className="flex flex-col p-4">
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt="" className="mb-4 aspect-[4/5] w-full rounded-lg object-cover" />
                    ) : (
                      <div className="mb-4 flex aspect-[4/5] w-full items-center justify-center rounded-lg border border-dashed text-[12px] text-faint" style={{ borderColor: "var(--mairo-line)" }}>
                        {ad.kind === "EXISTING_AD" ? ad.sourceAdName ?? "Existing ad" : "Words only"}
                      </div>
                    )}
                    <p className="text-[12px] text-faint">{i === 0 ? "Main ad" : `Version ${i + 1}`} · {ad.kind === "VIDEO" ? "Video" : ad.kind === "EXISTING_AD" ? "Existing ad" : "Image"}</p>
                    {ad.headline && <p className="mt-1.5 text-[14px] font-medium text-white">{ad.headline}</p>}
                    {ad.primaryText && <p className="mt-1.5 line-clamp-4 flex-1 text-[12.5px] leading-relaxed text-muted">{ad.primaryText}</p>}
                    {why && <p className="mt-3 rounded-lg bg-violet/[0.08] px-3 py-2 text-[12px] text-white/80"><span className="text-violet-bright">Why MAIRO made it: </span>{why}</p>}
                  </GlassPanel>
                );
              })}
              {campaign.ads.length === 0 && campaign.creatives.map((c) => (
                <GlassPanel key={c.id} className="flex flex-col p-4">
                  {c.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.mediaUrl} alt="" className="mb-4 aspect-[4/5] w-full rounded-lg object-cover" />
                  ) : (
                    <div className="mb-4 flex aspect-[4/5] w-full items-center justify-center rounded-lg border border-dashed text-[12px] text-faint" style={{ borderColor: "var(--mairo-line)" }}>Words only</div>
                  )}
                  <p className="text-[14px] font-medium text-white">{c.headline}</p>
                  <p className="mt-1.5 line-clamp-4 flex-1 text-[12.5px] leading-relaxed text-muted">{c.primaryText}</p>
                </GlassPanel>
              ))}
            </div>
          )}
          <Link href="/dashboard/creatives" className="mt-5 inline-block text-[13px] text-violet-bright hover:underline">All your creatives →</Link>
        </div>
      )}

      {/* ---- Audience ---- */}
      {tab === "audience" && (
        <GlassPanel className="p-5 sm:p-6">
          <dl className="space-y-4">
            {[
              ["Who sees it", describeAudience(audience)],
              ["Where it shows", placements],
              ["Let Meta find more people like this", campaign.specialAdCategory ? "Not allowed for this kind of ad" : campaign.advantageAudience ? "On — Meta can reach beyond your choices when it expects better results" : "Off — only the people you chose"],
              ...(campaign.specialAdCategory ? [["Special category", `${campaign.specialAdCategory.toLowerCase().replace(/_/g, " ")} — Meta limits targeting for these ads`]] : []),
            ].map(([k, v]) => (
              <div key={k} className="grid gap-1 sm:grid-cols-[240px_minmax(0,1fr)]">
                <dt className="text-[13px] text-muted">{k}</dt>
                <dd className="text-[14px] text-white">{v}</dd>
              </div>
            ))}
          </dl>
        </GlassPanel>
      )}

      {/* ---- Budget ---- */}
      {tab === "budget" && (
        <div className="space-y-4">
          <GlassPanel className="p-5 sm:p-6">
            <dl className="grid gap-5 sm:grid-cols-3">
              <div><dd className="text-[26px] font-light tabular-nums text-white">{campaign.budgetType === "LIFETIME" && campaign.lifetimeBudgetCents ? money(campaign.lifetimeBudgetCents) : `${money(campaign.totalDailyBudgetCents)}`}</dd><dt className="text-[13px] text-muted">{campaign.budgetType === "LIFETIME" ? "Total budget" : "Per day"}</dt></div>
              <div><dd className="text-[26px] font-light tabular-nums text-white">{money(metrics?.spendCents)}</dd><dt className="text-[13px] text-muted">Spent so far</dt></div>
              <div><dd className="text-[26px] font-light tabular-nums text-white">{campaign.endDate ? campaign.endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No end date"}</dd><dt className="text-[13px] text-muted">Runs until</dt></div>
            </dl>
            <p className="mt-5 text-[13px] text-muted">MAIRO never raises your budget on its own. Any change it suggests waits for your approval in Mairo Decisions.</p>
          </GlassPanel>
          {protectionLog.length > 0 && (
            <GlassPanel className="p-5">
              <h2 className="text-[15px] font-medium text-white">Spend Protection</h2>
              <ul className="mt-2 space-y-2">
                {protectionLog.map((e) => (
                  <li key={e.id} className="text-[12.5px] leading-relaxed text-muted"><span className="text-faint">{e.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> · {e.message}</li>
                ))}
              </ul>
            </GlassPanel>
          )}
          <Link href="/dashboard/settings#spend-protection" className="inline-block text-[13px] text-violet-bright hover:underline">Your spending limits →</Link>
        </div>
      )}

      {/* ---- Mairo Decisions ---- */}
      {tab === "decisions" && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-[15px] font-medium text-white">Waiting for you</h2>
            {decisions.length === 0 ? (
              <p className="text-[13.5px] text-muted">Nothing to decide on this campaign right now. MAIRO looks again every day.</p>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">{decisions.map((d) => <MairoDecisionCard key={d.id} decision={d} advanced={mode === "advanced"} />)}</div>
            )}
          </section>
          <section>
            <h2 className="mb-3 text-[15px] font-medium text-white">What MAIRO has done</h2>
            {actions.length === 0 ? <NoActionsYet live={live} /> : <div className="space-y-3">{actions.map((a) => <AIActionCard key={a.id} entry={a} />)}</div>}
          </section>
        </div>
      )}

      {/* ---- History ---- */}
      {tab === "history" && (
        <div className="space-y-5">
          <GlassPanel className="p-5 sm:p-6">
            <CampaignTimeline steps={steps} />
          </GlassPanel>
          <CampaignJourneyTimeline journey={await campaignJourney(organizationId, campaign.id).catch(() => null)} campaigns={[]} advanced={mode === "advanced"} />
        </div>
      )}

      {/* ---- Advanced Settings ---- */}
      {tab === "advanced" && (
        <div className="space-y-5">
          <GlassPanel className="p-5 sm:p-6">
            <h2 className="text-[15px] font-medium text-white">How it&rsquo;s set up on Meta</h2>
            <dl className="mt-4 space-y-3">
              {[
                ["Campaign objective", objectiveCapability(campaign.objective, hasTracking, instantForm).value],
                ["Optimization goal", optimizationCapability(campaign.objective, { hasPixel: hasTracking, instantForm, destination: campaign.destinationType }).value],
                ["Destination", campaign.destinationType.toLowerCase().replace(/_/g, " ")],
                ["Networks", requested.join(", ") || "—"],
                ["Placements", campaign.placements.length ? campaign.placements.join(", ") : "Advantage+ placements"],
                ["Advantage+ audience", campaign.advantageAudience && !campaign.specialAdCategory ? "On" : "Off"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-3">
                  <dt className="text-[13px] text-muted">{k}</dt>
                  <dd className="font-mono text-[12.5px] text-white">{v}</dd>
                </div>
              ))}
            </dl>
            {metaAccountId && metaCampaignId && (
              <a href={metaAdsManagerUrl(metaAccountId, metaCampaignId)} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mairo-line)] px-4 py-2 text-[13px] text-white/90 hover:text-white">
                Open in Ads Manager <span aria-hidden>↗</span>
              </a>
            )}
          </GlassPanel>

          {report?.hasData && (
            <GlassPanel className="p-5 sm:p-6">
              <h2 className="mb-4 text-[15px] font-medium text-white">Detailed figures</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CampaignMetric label="Impressions" value={count(metrics?.impressions)} />
                <CampaignMetric label="Reach" value={count(metrics?.reach)} hint="People" />
                <CampaignMetric label="Clicks" value={count(metrics?.clicks)} />
                <CampaignMetric label="Click rate" value={percent(metrics?.ctr)} hint="CTR" />
                <CampaignMetric label="Cost per click" value={money(metrics?.cpcCents)} hint="CPC" />
                <CampaignMetric label="Cost per 1,000" value={money(metrics?.cpmCents)} hint="CPM" />
                <CampaignMetric label="Cost per purchase" value={money(metrics?.costPerPurchaseCents)} hint="CPA" />
                <CampaignMetric label="Return" value={ratio(metrics?.roas)} hint="ROAS" />
              </div>
            </GlassPanel>
          )}

          {campaign.status !== "ARCHIVED" && (
            <GlassPanel className="p-5 sm:p-6">
              <h2 className="text-[15px] font-medium text-white">Schedule and destination</h2>
              <ScheduleControl
                campaignId={campaign.id}
                running={campaign.status === "ACTIVE"}
                describedStart={campaign.startDate ? describeStart(campaign.startDate, campaign.startTimeZone) : null}
                startLocal={campaign.startDate ? localInputValue(campaign.startDate, campaign.startTimeZone) : null}
              />
              <DestinationControl
                campaignId={campaign.id}
                type={campaign.destinationType}
                url={campaign.destinationUrl}
                phone={campaign.destinationPhone}
                channel={campaign.messageChannel}
                built={campaign.platformCampaigns.some((c) => c.externalAdId)}
              />
            </GlassPanel>
          )}

          {campaign.platformCampaigns.filter((c) => c.lastError || (c.externalCampaignId && !c.externalAdId)).length > 0 && (
            <GlassPanel className="p-5 sm:p-6">
              <h2 className="text-[15px] font-medium text-white">Delivery problems</h2>
              {campaign.platformCampaigns.map((c) => (
                <div key={c.id} className="mt-2 space-y-1 text-[13px] text-amber-200/90">
                  {c.externalCampaignId && !c.externalAdId && <p>{c.externalAdGroupId ? "Created, but there is no ad in it yet — so it cannot show to anyone." : "Only the campaign was created — it has no audience or ad yet."}</p>}
                  {c.lastError && <p>{c.lastError}</p>}
                </div>
              ))}
            </GlassPanel>
          )}

          {campaign.status !== "ARCHIVED" && (
            <GlassPanel className="p-5 sm:p-6">
              <DeleteCampaign
                campaignId={campaign.id}
                name={campaign.name}
                running={campaign.status === "ACTIVE"}
                freesSlot={atLimit}
                upgrade={upgradeTarget.limits.campaigns > entitlements.campaign_limit ? { name: upgradeTarget.name, price: upgradeTarget.priceMonthly, campaigns: upgradeTarget.limits.campaigns } : null}
              />
            </GlassPanel>
          )}
        </div>
      )}
    </div>
  );
}
