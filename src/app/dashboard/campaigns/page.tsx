import { after } from "next/server";
import { Suspense } from "react";
import { SectionSkeleton } from "@/components/mairo/page-skeleton";
import { AccountCampaigns } from "./account-campaigns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, EmptyState, primaryButtonClass } from "@/components/ui";
import { campaignLimitText, planFor, PLANS } from "@/lib/plans";
import { entitlementsFor } from "@/lib/entitlements";
import { NewCampaignForm, type PlanContext } from "./new-campaign-form";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { formatMoney, NO_VALUE } from "@/components/metrics";
import { activeOrganizationId } from "@/lib/active-org";
import { readinessFor } from "@/lib/readiness";
import { maybeGoLive } from "@/lib/campaigns/auto-launch";
import { maybeRunSpendProtection } from "@/lib/protection/run";
import { syncAdReviews } from "@/lib/campaigns/ad-review-sync";
import type { AdPlatform } from "@/generated/prisma/enums";
import { existingLeadForm, leadFormUrl, previewLeadForm } from "@/lib/leads/forms";
import { siteUrl } from "@/lib/site";
import { asDefaultDestination } from "@/lib/campaigns/destination";
import { viewMode } from "@/lib/view-mode";
import { showsEnquiries } from "@/lib/leads/fields";
import { BOARD_COLUMNS, CAMPAIGN_TABS, boardColumn, campaignTab, goalLabel, primaryResult, statusLabel, type CampaignTab } from "@/lib/dashboard/campaigns";
import { CampaignBoard, type BoardColumnView } from "@/components/viz/campaign-board";
import { PauseEverything } from "./pause-everything";

// Each row's figures are live calls to Meta. See the note in
// src/app/dashboard/page.tsx — same reason, same budget.
export const maxDuration = 30;

function platformLabel(platform: AdPlatform): string {
  return platform === "META"
    ? "Meta"
    : platform === "TIKTOK"
      ? "TikTok"
      : platform;
}

function cents(value: number | null): string {
  return value === null ? NO_VALUE : formatMoney(value / 100);
}

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ tab?: string; view?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId =
    (await activeOrganizationId()) ?? session.user.organizationId;

  // Same as the dashboard: anything ready goes live before the page is drawn,
  // so somebody who finishes their setup and lands here rather than on the
  // overview gets the same behaviour.
  await maybeGoLive(organizationId);
  // Spend limits (the scheduled run is only daily) and Meta's ad review
  // states are checked after the page is sent rather than before: both are
  // upkeep, both used to hold this screen while they asked Meta, and the
  // next screen shows whatever they found.
  after(async () => {
    await maybeRunSpendProtection(organizationId).catch(() => undefined);
    await syncAdReviews(organizationId).catch(() => 0);
  });

  // One round of reads, side by side.
  //
  // The lead form is deliberately not created here. Opening the campaigns
  // page is not asking for a lead form, and writing one for everybody who
  // looks would leave most businesses with a public page they never wanted.
  // What this reads is the form if they already have one, and the questions
  // MAIRO *would* ask if they pick it — a preview costs nothing and persists
  // nothing.
  const [
    campaigns,
    organization,
    entitlements,
    connections,
    readiness,
    performance,
    mode,
    leadFormRow,
    leadForm,
    formPreview,
  ] = await Promise.all([
    db.mairoCampaign.findMany({
      where: { organizationId },
      include: { platformCampaigns: true },
      orderBy: { createdAt: "desc" },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: {
      subscriptionTier: true,
      defaultDestination: true,
      defaultMessageChannel: true,
      website: true,
      phone: true,
    },
    }),
    entitlementsFor(organizationId),
    connectionSummaries(organizationId),
    readinessFor(organizationId, { checkFunding: true }),
    fetchOrganizationPerformance(organizationId),
    viewMode(),
    db.leadForm.findFirst({ where: { organizationId }, select: { id: true } }),
    existingLeadForm(organizationId),
    previewLeadForm(organizationId),
  ]);
  const byCampaign = new Map(
    performance.campaigns.map((c) => [c.mairoCampaignId, c]),
  );

  const plan = planFor(organization?.subscriptionTier ?? "NONE");
  // Deleted campaigns are archived rather than erased, so they have to come
  // off the main list — otherwise "delete" visibly does nothing and the
  // customer tries again.
  const live = campaigns.filter((c) => c.status !== "ARCHIVED");
  const activeCount = live.length;
  // Infinity is how an unlimited plan says so, and it must never reach the
  // screen as the word "Infinity".
  const unlimitedCampaigns = !Number.isFinite(entitlements.campaign_limit);
  const atLimit = !unlimitedCampaigns && activeCount >= entitlements.campaign_limit;

  // The next plan up, named in the upgrade prompts.
  const upgradeTarget =
    PLANS.find((p) => p.priceMonthly > plan.priceMonthly) ??
    PLANS[PLANS.length - 1];

  const planContext: PlanContext = {
    currentPlanName: plan.name,
    currentPlanPrice: plan.priceMonthly,
    upgradePlanName: upgradeTarget.name,
    upgradePlanPrice: upgradeTarget.priceMonthly,
    destination: {
      type: asDefaultDestination(organization?.defaultDestination),
      website: organization?.website ?? null,
      phone: organization?.phone ?? null,
      channel: organization?.defaultMessageChannel ?? "MESSENGER",
      formUrl: leadForm ? leadFormUrl(leadForm.slug, siteUrl()) : null,
      formQuestions: formPreview,
    },
    connected: [...connections.values()]
      .filter((c) => c.connected)
      .map((c) => c.platform),
  };

  const now = new Date();
  const buckets = new Map<CampaignTab, typeof campaigns>(CAMPAIGN_TABS.map((t) => [t.key, []]));
  for (const c of campaigns) buckets.get(campaignTab(c, now))!.push(c);
  // Running, or waiting on Meta to run: what "Pause everything" would pause
  // (the same test as protection/run.ts runningOrWaiting).
  const runningCount = campaigns.filter((c) => c.status !== "ARCHIVED" && c.platformCampaigns.some((p) => p.externalCampaignId && (p.status === "ACTIVE" || p.status === "PENDING_REVIEW"))).length;
  const params = await searchParams;
  const requested = params.tab;
  const board = params.view === "board";
  // "On Meta" — the campaigns already on the connected ad account that MAIRO
  // didn't make — once there is an account to read. The list itself is read
  // only on that tab, so the rest of this page never waits on Meta for it.
  const metaConnected = connections.get("META")?.connected ?? false;
  // The tab asked for; otherwise the first one with something in it — and
  // for a connected business with no MAIRO campaigns yet, the campaigns
  // already on its account rather than an empty "Active".
  const tab: CampaignTab | "meta" =
    (requested === "meta" && metaConnected) || CAMPAIGN_TABS.some((t) => t.key === requested)
      ? (requested as CampaignTab | "meta")
      : (CAMPAIGN_TABS.find((t) => (buckets.get(t.key)?.length ?? 0) > 0)?.key ?? (metaConnected ? "meta" : "active"));
  const shown = tab === "meta" ? [] : (buckets.get(tab) ?? []);

  // The board: every campaign in its column, with the recommendations waiting on each.
  let boardColumns: BoardColumnView[] = [];
  let boardGoals: { key: string; label: string }[] = [];
  if (board) {
    const waiting = await db.mairoDecision.groupBy({ by: ["mairoCampaignId"], where: { organizationId, status: "PENDING", mairoCampaignId: { not: null } }, _count: true });
    const decisions = new Map(waiting.map((w) => [w.mairoCampaignId, w._count]));
    const listed = campaigns.filter((c) => c.status !== "ARCHIVED" || (c.endDate && c.endDate < now));
    boardColumns = BOARD_COLUMNS.map((col) => {
      const inCol = listed.filter((c) => boardColumn(c, now) === col.key);
      const daily = inCol.reduce((n, c) => n + c.totalDailyBudgetCents, 0);
      return {
        key: col.key,
        label: col.label,
        budget: col.key === "completed" || inCol.length === 0 ? null : cents(daily),
        cards: inCol.map((c) => {
          const report = byCampaign.get(c.id);
          const result = report?.hasData ? primaryResult(c.objective, c.destinationType, report.total) : null;
          return {
            id: c.id,
            name: c.name,
            goal: goalLabel(c.objective),
            goalKey: c.objective,
            status: statusLabel(c, now),
            budget: cents(c.totalDailyBudgetCents),
            spent: report?.hasData ? cents(report.total.spendCents) : null,
            result: result ? { label: result.label, value: result.value } : null,
            attention: c.platformCampaigns.some((p) => p.lastError || p.adReviewState === "REJECTED" || p.adReviewState === "WITH_ISSUES") || (c.status === "PENDING_REVIEW" && !readiness.ready),
            decisions: decisions.get(c.id) ?? 0,
          };
        }),
      };
    });
    boardGoals = [...new Set(listed.map((c) => c.objective))].map((k) => ({ key: k, label: goalLabel(k) }));
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title="Campaigns"
        description="Every campaign, its budget and how it's doing. Open one to pause it, change it or see its history."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {runningCount > 0 && <PauseEverything count={runningCount} />}
            {showsEnquiries({ hasForm: Boolean(leadFormRow) }) && (
              <Link href="/dashboard/leads" className="inline-flex min-h-[38px] items-center rounded-full border border-[color:var(--mairo-line)] px-4 text-[13px] text-white/85 hover:text-white">Enquiries</Link>
            )}
            <Link href="/dashboard/create" className={primaryButtonClass}>+ Create campaign</Link>
          </div>
        }
      />

      {performance.problems.length > 0 && (
        <p className="mb-5 rounded-2xl bg-amber-400/[0.06] px-4 py-3 text-[13px] text-amber-200/90">
          {performance.problems.map((p) => `${platformLabel(p.platform)}: ${p.message}`).join(" ")}
        </p>
      )}

      <div className="mb-5 flex items-center gap-2" role="group" aria-label="View">
        {[{ key: "list", label: "List", href: `/dashboard/campaigns${requested ? `?tab=${requested}` : ""}` }, { key: "board", label: "Board", href: "/dashboard/campaigns?view=board" }].map((v) => (
          <Link key={v.key} href={v.href} aria-current={(v.key === "board") === board ? "page" : undefined}
            className={`min-h-9 rounded-full border px-4 py-1.5 text-[13px] transition ${(v.key === "board") === board ? "border-[color:var(--mairo-line-lit)] bg-white/[0.06] text-white" : "border-[color:var(--mairo-line)] text-muted hover:text-white"}`}>
            {v.label}
          </Link>
        ))}
      </div>

      {board ? (
        campaigns.length === 0 ? (
          <EmptyState title="No campaigns yet" description="Tell MAIRO what you want to achieve and it builds the campaign for you to confirm." />
        ) : (
          <CampaignBoard columns={boardColumns} goals={boardGoals} />
        )
      ) : (
      <>
      <nav aria-label="Campaign status" className="-mx-1 mb-6 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
        {CAMPAIGN_TABS.map((t) => {
          const n = buckets.get(t.key)?.length ?? 0;
          return (
            <Link key={t.key} href={`/dashboard/campaigns?tab=${t.key}`} aria-current={t.key === tab ? "page" : undefined}
              className={`shrink-0 rounded-full px-4 py-2 text-[13.5px] transition ${t.key === tab ? "bg-white/[0.1] text-white" : "text-muted hover:text-white"}`}>
              {t.label}{n > 0 ? <span className="ml-1.5 text-faint">{n}</span> : null}
            </Link>
          );
        })}
        {metaConnected && (
          <Link href="/dashboard/campaigns?tab=meta" aria-current={tab === "meta" ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-[13.5px] transition ${tab === "meta" ? "bg-white/[0.1] text-white" : "text-muted hover:text-white"}`}>
            On Meta
          </Link>
        )}
      </nav>

      {atLimit && tab === "active" && (
        <p className="mb-5 text-[13px] text-muted">
          {plan.name} runs {entitlements.campaign_limit === 1 ? "one campaign" : `${entitlements.campaign_limit} campaigns`} at a time.{" "}
          <Link href="/dashboard/billing" className="text-violet-bright underline underline-offset-4">{upgradeTarget.name} runs {campaignLimitText(upgradeTarget.limits.campaigns)}</Link>
        </p>
      )}

      {tab === "meta" ? (
        <Suspense fallback={<SectionSkeleton panels={2} />}>
          <AccountCampaigns organizationId={organizationId} />
        </Suspense>
      ) : shown.length === 0 ? (
        <EmptyState
          title={tab === "active" ? "No campaigns running" : tab === "drafts" ? "No drafts" : tab === "paused" ? "Nothing paused" : "No completed campaigns yet"}
          description={tab === "active" ? "Tell MAIRO what you want to achieve and it builds the campaign for you to confirm." : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((campaign) => {
            const report = byCampaign.get(campaign.id);
            const status = statusLabel(campaign, now);
            const result = primaryResult(campaign.objective, campaign.destinationType, report?.total ?? null);
            const attention =
              campaign.platformCampaigns.some((c) => c.lastError || c.adReviewState === "REJECTED" || c.adReviewState === "WITH_ISSUES") ||
              (campaign.status === "PENDING_REVIEW" && !readiness.ready);
            return (
              <Link key={campaign.id} href={`/dashboard/campaigns/${campaign.id}`}
                className="group block rounded-[24px] p-5 transition hover:bg-white/[0.045]"
                style={{ background: "linear-gradient(180deg, rgba(var(--mairo-fg-rgb),0.035), rgba(var(--mairo-fg-rgb),0.015))" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-[16.5px] font-medium text-white">{campaign.name}</h2>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {goalLabel(campaign.objective)} · {campaign.budgetType === "LIFETIME" && campaign.lifetimeBudgetCents ? `${cents(campaign.lifetimeBudgetCents)} in total` : `${cents(campaign.totalDailyBudgetCents)} a day`}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] text-white/85">{status.dot} {status.text}</span>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4">
                  <div>
                    <dd className="text-[24px] font-light tabular-nums text-white">{cents(report?.total.spendCents ?? null)}</dd>
                    <dt className="text-[12.5px] text-muted">Spent</dt>
                  </div>
                  <div>
                    <dd className="text-[24px] font-light tabular-nums text-white">{result.value}</dd>
                    <dt className="text-[12.5px] text-muted">{result.label}</dt>
                  </div>
                </dl>
                {attention && <p className="mt-3 text-[12.5px] text-amber-200">Needs your attention — open it to see why.</p>}
              </Link>
            );
          })}
        </div>
      )}

      </>
      )}

      {/* The older one-screen campaign form, for people who want every setting
          at once. Advanced only; everyone else starts from + New campaign. */}
      {mode === "advanced" && !atLimit && (
        <details className="mt-10">
          <summary className="cursor-pointer text-[13px] text-muted hover:text-white">Quick campaign form (advanced)</summary>
          <Card className="mt-4">
            <NewCampaignForm plan={planContext} />
          </Card>
        </details>
      )}
    </div>
  );
}
