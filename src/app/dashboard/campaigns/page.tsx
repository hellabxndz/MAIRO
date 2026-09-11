import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { planFor, PLANS } from "@/lib/plans";
import { entitlementsFor } from "@/lib/entitlements";
import { NewCampaignForm, type PlanContext } from "./new-campaign-form";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { PlatformIcons, PlatformIcon } from "@/components/platform-icons";
import { formatInteger, formatMoney, NO_VALUE } from "@/components/metrics";
import { activeOrganizationId } from "@/lib/active-org";
import type { AdPlatform } from "@/generated/prisma/enums";

// Each row's figures are live calls to Meta and TikTok. See the note in
// src/app/dashboard/page.tsx — same reason, same budget, now doubled because
// there are two networks to ask.
export const maxDuration = 30;

const statusTone = {
  DRAFT: "neutral",
  PENDING_REVIEW: "yellow",
  ACTIVE: "green",
  PAUSED: "yellow",
  ARCHIVED: "neutral",
} as const;

function platformLabel(platform: AdPlatform): string {
  return platform === "META" ? "Meta" : platform === "TIKTOK" ? "TikTok" : platform;
}

function roas(value: number | null): string {
  return value === null ? NO_VALUE : `${value.toFixed(2)}x`;
}

function cents(value: number | null): string {
  return value === null ? NO_VALUE : formatMoney(value / 100);
}

export default async function CampaignsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [campaigns, organization, entitlements, connections] = await Promise.all([
    db.mairoCampaign.findMany({
      where: { organizationId },
      include: { platformCampaigns: true },
      orderBy: { createdAt: "desc" },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionTier: true },
    }),
    entitlementsFor(organizationId),
    connectionSummaries(organizationId),
  ]);

  const performance = await fetchOrganizationPerformance(organizationId);
  const byCampaign = new Map(performance.campaigns.map((c) => [c.mairoCampaignId, c]));

  const plan = planFor(organization?.subscriptionTier ?? "NONE");
  const activeCount = campaigns.filter((c) => c.status !== "ARCHIVED").length;
  const atLimit = activeCount >= entitlements.campaign_limit;

  // The plan to sell if they reach for something they don't have. Asked for by
  // capability rather than named, so changing which plan includes TikTok
  // changes this automatically.
  const upgradeTarget =
    PLANS.find((p) => p.priceMonthly > plan.priceMonthly) ??
    PLANS[PLANS.length - 1];

  const planContext: PlanContext = {
    tiktokAllowed: entitlements.tiktok_ads,
    crossPlatformAllowed: entitlements.cross_platform_campaigns,
    growthModeAllowed: entitlements.tiktok_growth,
    currentPlanName: plan.name,
    currentPlanPrice: plan.priceMonthly,
    upgradePlanName: upgradeTarget.name,
    upgradePlanPrice: upgradeTarget.priceMonthly,
    connected: [...connections.values()].filter((c) => c.connected).map((c) => c.platform),
  };

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="One campaign, however many places it runs. MAIRO handles the rest."
        action={
          <Badge tone={atLimit ? "yellow" : "neutral"}>
            {activeCount} of {entitlements.campaign_limit} campaigns
          </Badge>
        }
      />

      {/* A network being unreachable is worth one quiet line, not a red alert
          on every row that would otherwise show its numbers. */}
      {performance.problems.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-4">
          {performance.problems.map((p) => (
            <p key={p.platform} className="text-xs text-amber-200/90">
              <span className="font-medium">{platformLabel(p.platform)}:</span> {p.message}
            </p>
          ))}
        </div>
      )}

      {!atLimit && (
        <Card className="mb-8">
          <NewCampaignForm plan={planContext} />
        </Card>
      )}

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create one above. Tell MAIRO what you want and how much you want to spend, and it takes care of the rest."
        />
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => {
            const report = byCampaign.get(campaign.id);
            const platforms = campaign.platformCampaigns.map((c) => c.platform);

            return (
              <Card key={campaign.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-base text-white">{campaign.name}</h3>
                      <PlatformIcons platforms={platforms} />
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {campaign.objective.toLowerCase().replace("_", " ")} ·{" "}
                      {formatMoney(campaign.totalDailyBudgetCents / 100)} a day
                      {campaign.tiktokGrowthMode && " · Growth Mode"}
                    </p>
                  </div>
                  <Badge tone={statusTone[campaign.status]}>
                    {campaign.status.toLowerCase().replace("_", " ")}
                  </Badge>
                </div>

                {/* The combined figures — the number the customer actually
                    cares about, before any per-network detail. */}
                <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Figure label="Total spend" value={cents(report?.total.spendCents ?? null)} />
                  <Figure label="Revenue" value={cents(report?.total.revenueCents ?? null)} />
                  <Figure label="ROAS" value={roas(report?.total.roas ?? null)} />
                  <Figure
                    label="Purchases"
                    value={
                      report?.total.purchases === null || report?.total.purchases === undefined
                        ? NO_VALUE
                        : formatInteger(report.total.purchases)
                    }
                  />
                </div>

                {/* Then the breakdown, only where there is more than one
                    network to break down. */}
                {platforms.length > 1 && report && (
                  <div className="mt-5 space-y-2 border-t border-white/[0.06] pt-5">
                    {report.byPlatform.map((p) => (
                      <div
                        key={p.platform}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.02] px-4 py-3"
                      >
                        <span className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-neutral-400">
                          <PlatformIcon platform={p.platform} className="h-3.5 w-3.5" />
                          {platformLabel(p.platform)}
                        </span>
                        {p.unavailable ? (
                          <span className="text-xs text-amber-200/70">{p.unavailable}</span>
                        ) : (
                          <span className="flex gap-6 text-xs tabular-nums text-neutral-300">
                            <span>
                              <span className="text-neutral-500">Spend </span>
                              {cents(p.metrics.spendCents)}
                            </span>
                            <span>
                              <span className="text-neutral-500">Revenue </span>
                              {cents(p.metrics.revenueCents)}
                            </span>
                            <span>
                              <span className="text-neutral-500">ROAS </span>
                              {roas(p.metrics.roas)}
                            </span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Whether each network can actually serve an impression.
                    A campaign with no ad set and no ad beneath it delivers
                    nothing, and looks identical on this page to one that
                    works — so the difference is stated rather than left for
                    the customer to discover from a dashboard of zeroes. */}
                {campaign.platformCampaigns
                  .filter((c) => c.externalCampaignId && !c.externalAdId)
                  .map((c) => (
                    <p key={`${c.id}-delivery`} className="mt-3 text-xs text-amber-200/90">
                      <span className="font-medium">{platformLabel(c.platform)}:</span>{" "}
                      {c.externalAdGroupId
                        ? "created, but there is no ad in it yet — so it cannot show to anyone."
                        : "only the campaign was created — it has no audience or ad yet, so it cannot show to anyone."}
                    </p>
                  ))}

                {/* A network that refused the campaign says so on its own row,
                    rather than the whole campaign reading as broken. */}
                {campaign.platformCampaigns
                  .filter((c) => c.lastError)
                  .map((c) => (
                    <p key={c.id} className="mt-3 text-xs text-amber-200/80">
                      <span className="font-medium">{platformLabel(c.platform)}:</span>{" "}
                      {c.lastError}
                    </p>
                  ))}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-light tabular-nums text-white">{value}</p>
    </div>
  );
}
