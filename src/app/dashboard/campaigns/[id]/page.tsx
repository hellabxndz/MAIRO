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
import { Badge, EmptyState } from "@/components/ui";
import { PlatformIcons } from "@/components/platform-icons";
import { CampaignTabs } from "./tabs";
import { parseTab } from "./tab-list";
import { CampaignApproval } from "./approval";
import { syncAdReviews } from "@/lib/campaigns/ad-review-sync";
import { campaignAdvice } from "@/lib/campaigns/advice";
import { RunControl } from "./run-control";

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
  // happens. Throttled inside: a recent check costs nothing.
  await syncAdReviews(organizationId).catch(() => 0);

  const campaign = await db.mairoCampaign.findFirst({
    // Scoped by organization as well as id: an id in the URL is not
    // authorisation, and this is the only thing standing between one customer
    // and another's campaign.
    where: { id, organizationId },
    include: {
      platformCampaigns: {
        select: {
          platform: true,
          status: true,
          externalAdId: true,
          adReviewState: true,
          adReviewExplanation: true,
          adReviewAction: true,
        },
      },
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
  });
  if (!campaign) notFound();

  const [connections, performance, readiness, actions, intake, autoOptimize] = await Promise.all([
    connectionSummaries(organizationId),
    fetchOrganizationPerformance(organizationId),
    readinessFor(organizationId, { checkFunding: true }),
    campaignActions(campaign.id),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { id: true } }),
    db.autoOptimizeSettings.findUnique({
      where: { organizationId },
      select: { enabled: true },
    }),
  ]);

  const protectionLog = await db.protectionEvent.findMany({
    where: { organizationId, mairoCampaignId: campaign.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
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

  const statusTone =
    campaign.status === "ACTIVE"
      ? "green"
      : campaign.status === "PAUSED"
        ? "yellow"
        : campaign.status === "ARCHIVED"
          ? "neutral"
          : "blue";

  return (
    <div>
      <Link
        href="/dashboard/campaigns"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-white"
      >
        <span aria-hidden>←</span>
        All campaigns
      </Link>

      {/* ---- Header ---- */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-white sm:text-[26px]">
              {campaign.name}
            </h1>
            <Badge tone={statusTone}>{campaign.status.toLowerCase().replace("_", " ")}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-muted">
            <PlatformIcons platforms={requested} />
            <span>{money(campaign.totalDailyBudgetCents)} a day</span>
          </div>
        </div>
        {(campaign.status === "ACTIVE" || campaign.status === "PAUSED") && (
          <RunControl campaignId={campaign.id} status={campaign.status} dailyBudgetLabel={money(campaign.totalDailyBudgetCents)} />
        )}
      </div>

      <CampaignTabs active={tab} />

      {/* ---- Overview ---- */}
      {tab === "overview" && (
        <div className="space-y-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CampaignMetric label="Spent" value={money(metrics?.spendCents)} hint="All time" />
            <CampaignMetric label="Revenue" value={money(metrics?.revenueCents)} hint="All time" />
            <CampaignMetric label="Return" value={ratio(metrics?.roas)} hint="Revenue per $1" emphasis />
            <CampaignMetric
              label={campaign.objective === "SALES" ? "Purchases" : "Results"}
              value={count(metrics?.purchases ?? metrics?.conversions)}
              hint="All time"
            />
          </div>

          {campaign.platformCampaigns
            .filter((p) => p.adReviewState === "REJECTED" || p.adReviewState === "WITH_ISSUES")
            .map((p) => (
              <section
                key={p.platform}
                className="rounded-xl border p-5"
                style={{ borderColor: "rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.05)" }}
              >
                <p className="text-[15px] font-medium text-white">
                  {p.adReviewState === "REJECTED" ? "Meta didn't approve this ad" : "Meta flagged a problem with this ad"}
                </p>
                {p.adReviewExplanation && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{p.adReviewExplanation}</p>}
                {p.adReviewAction && <p className="mt-2 text-[13px] leading-relaxed text-white/90">What to do: {p.adReviewAction}</p>}
                <Link
                  href="/dashboard/create"
                  className="mt-4 inline-flex rounded-full px-4 py-2 text-[12.5px] font-medium text-white"
                  style={{ backgroundImage: "var(--mairo-ramp)" }}
                >
                  Make a new ad
                </Link>
              </section>
            ))}
          {campaign.platformCampaigns.some((p) => p.adReviewState === "PENDING") && (
            <p className="text-[12.5px] text-muted">
              Meta is reviewing the ad — usually within a day. MAIRO tells you if anything needs changing.
            </p>
          )}

          <CampaignHealthPanel health={health} />

          {advice.length > 0 && (
            <section>
              <h2 className="mb-3 text-[15px] font-medium text-white">What MAIRO recommends</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {advice.map((a) => (
                  <GlassPanel key={a.title} className="p-4">
                    <p className="flex items-center gap-2 text-[14px] text-white">
                      <span
                        className="h-2 w-2 flex-none rounded-full"
                        style={{ background: a.tone === "good" ? "#34d399" : a.tone === "fix" ? "#fbbf24" : a.tone === "idea" ? "#6c9eff" : "rgba(255,255,255,0.35)" }}
                        aria-hidden
                      />
                      {a.title}
                    </p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{a.detail}</p>
                    {a.href && (
                      <Link href={a.href} className="mt-3 inline-block text-[12.5px] text-white/90 underline underline-offset-4">
                        {a.hrefLabel}
                      </Link>
                    )}
                  </GlassPanel>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] text-faint">Advice only — MAIRO doesn&rsquo;t change anything here without you.</p>
            </section>
          )}

          {protectionLog.length > 0 && (
            <section>
              <h2 className="mb-3 text-[15px] font-medium text-white">Spend Protection</h2>
              <GlassPanel className="p-4">
                <ul className="space-y-2">
                  {protectionLog.map((e) => (
                    <li key={e.id} className="text-[12.5px] leading-relaxed text-muted">
                      <span className="text-faint">{e.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> · {e.message}
                    </li>
                  ))}
                </ul>
                <Link href="/dashboard/settings#spend-protection" className="mt-3 inline-block text-[12px] text-muted underline underline-offset-4">
                  Change your limits
                </Link>
              </GlassPanel>
            </section>
          )}

          {!live && <CampaignApproval campaignId={campaign.id} blockers={blockers} />}

          <section>
            <h2 className="mb-3 text-[15px] font-medium text-white">Where it&apos;s up to</h2>
            <GlassPanel className="p-4 sm:p-5">
              <CampaignTimeline steps={steps} />
            </GlassPanel>
          </section>
        </div>
      )}

      {/* ---- Timeline ---- */}
      {tab === "timeline" && (
        <GlassPanel className="p-5 sm:p-6">
          <CampaignTimeline steps={steps} />
        </GlassPanel>
      )}

      {/* ---- Creatives ---- */}
      {tab === "creatives" && (
        <div>
          {campaign.creatives.length === 0 ? (
            <EmptyState
              title="No ads on this campaign yet"
              description="MAIRO writes them as part of building the campaign. They appear here the moment it has."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {campaign.creatives.map((c) => (
                <GlassPanel key={c.id} className="flex flex-col p-4">
                  {c.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.mediaUrl}
                      alt=""
                      className="mb-4 aspect-[4/5] w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div
                      className="mb-4 flex aspect-[4/5] w-full items-center justify-center rounded-lg border border-dashed text-[12px] text-faint"
                      style={{ borderColor: "var(--mairo-line)" }}
                    >
                      Words only
                    </div>
                  )}
                  <Badge tone="blue">{c.platform}</Badge>
                  <p className="mt-3 text-[14px] font-medium text-white">{c.headline}</p>
                  <p className="mt-1.5 line-clamp-4 flex-1 text-[12.5px] leading-relaxed text-muted">
                    {c.primaryText}
                  </p>
                  {c.cta && (
                    <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-blue-bright">
                      {c.cta.replace(/_/g, " ")}
                    </p>
                  )}
                </GlassPanel>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- Analytics ---- */}
      {tab === "analytics" && (
        <div className="space-y-8">
          {!report?.hasData ? (
            <EmptyState
              title="No figures yet"
              description="The networks report a few hours after a campaign starts delivering. Nothing is missing — there is just nothing to show yet."
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CampaignMetric label="Impressions" value={count(metrics?.impressions)} />
                <CampaignMetric label="Clicks" value={count(metrics?.clicks)} />
                <CampaignMetric label="Click rate" value={percent(metrics?.ctr)} hint="CTR" />
                <CampaignMetric label="Cost per click" value={money(metrics?.cpcCents)} hint="CPC" />
                <CampaignMetric label="Cost per 1,000" value={money(metrics?.cpmCents)} hint="CPM" />
                <CampaignMetric
                  label="Cost per purchase"
                  value={money(metrics?.costPerPurchaseCents)}
                  hint="CPA"
                />
                <CampaignMetric label="Conversions" value={count(metrics?.conversions)} />
                <CampaignMetric label="Reach" value={count(metrics?.reach)} hint="People" />
              </div>

              {report.byPlatform.length > 1 && (
                <section>
                  <h2 className="mb-3 text-[15px] font-medium text-white">By network</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {report.byPlatform.map((p) => (
                      <GlassPanel key={p.platform} className="p-5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[14px] font-medium text-white">{p.platform}</p>
                          {p.unavailable ? (
                            <Badge tone="yellow">Unavailable</Badge>
                          ) : (
                            <Badge tone={p.hasData ? "green" : "neutral"}>
                              {p.hasData ? "Reporting" : "No data"}
                            </Badge>
                          )}
                        </div>
                        {p.unavailable ? (
                          <p className="mt-3 text-[12.5px] text-muted">{p.unavailable}</p>
                        ) : (
                          <dl className="mt-4 grid grid-cols-2 gap-3">
                            {[
                              ["Spent", money(p.metrics.spendCents)],
                              ["Revenue", money(p.metrics.revenueCents)],
                              ["Return", ratio(p.metrics.roas)],
                              ["Clicks", count(p.metrics.clicks)],
                            ].map(([k, v]) => (
                              <div key={k}>
                                <dt className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-faint">
                                  {k}
                                </dt>
                                <dd className="mt-1 text-[16px] tabular-nums text-white">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </GlassPanel>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* ---- MAIRO actions ---- */}
      {tab === "actions" && (
        <div>
          <p className="mb-5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            Everything MAIRO has changed on this campaign by itself, with the numbers behind each
            decision. Nothing here is a summary — it is what MAIRO wrote at the time it decided.
          </p>
          {actions.length === 0 ? (
            <NoActionsYet live={live} />
          ) : (
            <div className="space-y-3">
              {actions.map((a) => (
                <AIActionCard key={a.id} entry={a} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- Settings ---- */}
      {tab === "settings" && (
        <div className="space-y-4">
          <GlassPanel className="p-5 sm:p-6">
            <h2 className="text-[15px] font-medium text-white">What this campaign is</h2>
            <dl className="mt-4 space-y-3">
              {[
                ["Goal", campaign.objective.toLowerCase()],
                ["Budget", `${money(campaign.totalDailyBudgetCents)} a day`],
                ["Networks", requested.join(", ") || "—"],
                ["Audience", describeAudience(audience)],
                [
                  "Where the ad sends people",
                  campaign.destinationType.toLowerCase().replace(/_/g, " "),
                ],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-3">
                  <dt className="text-[13px] text-muted">{k}</dt>
                  <dd className="text-[13px] text-white">{v}</dd>
                </div>
              ))}
            </dl>
          </GlassPanel>

          <GlassPanel className="p-5 sm:p-6">
            <h2 className="text-[15px] font-medium text-white">Controls</h2>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
              Budget, schedule, targeting and where the ad points are changed on the campaigns
              screen, which is also where this campaign can be removed.
            </p>
            <Link
              href="/dashboard/campaigns"
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-blue-bright transition-colors hover:text-white"
            >
              Open campaign controls
              <span aria-hidden>→</span>
            </Link>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
