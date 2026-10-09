import { db } from "@/lib/db";
import { getAdapter } from "@/lib/ad-platforms/registry";
import type { DateRange, PlatformMetrics } from "@/lib/ad-platforms/types";
import { probeLandingPage } from "@/lib/campaigns/landing-probe";
import { resultsFor } from "@/lib/protection/rules";
import type { AdSnapshot, CampaignSnapshot, DecisionInput, Guardrails } from "./types";

// Reads what Mairo Decisions needs from the ad networks: every running
// campaign's figures over three windows, and the same per ad.
//
// Network-agnostic. Campaigns are grouped by platform and each platform's
// adapter is asked in one call per window, so a second network costs a few
// more requests and no new code here. A network that can't be read is left
// out rather than guessed at — a decision built on a missing figure is worse
// than no decision.

const DAY = 86_400_000;

/** The three windows the rules compare: last 3 days, the 4 before, last 7. */
export function windows(now: Date): { recent: DateRange; prior: DateRange; week: DateRange } {
  // Whole days up to yesterday. Today's figures are partial and would make
  // every "last 3 days" look like a drop.
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY);
  const back = (days: number) => new Date(end.getTime() - days * DAY);
  return {
    recent: { since: back(2), until: end },
    prior: { since: back(6), until: back(3) },
    week: { since: back(6), until: end },
  };
}

export const DEFAULT_GUARDRAILS: Guardrails = {
  maxDailyBudgetCents: null,
  maxDailyIncreasePercent: 20,
  maxDailyDecreasePercent: 30,
  maxBudgetShiftPercent: 15,
  minRoas: null,
  maxCpaCents: null,
};

export async function guardrailsFor(organizationId: string): Promise<Guardrails> {
  const s = await db.autoOptimizeSettings.findUnique({ where: { organizationId } });
  if (!s) return DEFAULT_GUARDRAILS;
  return {
    maxDailyBudgetCents: s.maxDailyBudgetCents,
    maxDailyIncreasePercent: s.maxDailyIncreasePercent,
    maxDailyDecreasePercent: s.maxDailyDecreasePercent,
    maxBudgetShiftPercent: s.maxBudgetShiftPercent,
    minRoas: s.minRoas,
    maxCpaCents: s.maxCpaCents,
  };
}

export async function gatherDecisionInput(organizationId: string, now = new Date()): Promise<DecisionInput> {
  const [campaigns, guardrails] = await Promise.all([
    db.mairoCampaign.findMany({
      where: { organizationId, status: { in: ["ACTIVE", "PAUSED"] } },
      include: {
        platformCampaigns: true,
        ads: { orderBy: { position: "asc" } },
      },
    }),
    guardrailsFor(organizationId),
  ]);

  const w = windows(now);
  const children = campaigns.flatMap((c) =>
    c.platformCampaigns
      .filter((p) => p.externalCampaignId)
      .map((p) => ({ campaign: c, child: p })),
  );

  // Campaign-level figures, one call per platform per window.
  const byPlatform = new Map<string, string[]>();
  for (const { child } of children) {
    byPlatform.set(child.platform, [...(byPlatform.get(child.platform) ?? []), child.externalCampaignId!]);
  }
  const campaignFigures = new Map<string, { recent?: PlatformMetrics; prior?: PlatformMetrics; week?: PlatformMetrics }>();
  await Promise.all(
    [...byPlatform.entries()].flatMap(([platform, ids]) => {
      const adapter = getAdapter(platform as never);
      if (!adapter) return [];
      return (["recent", "prior", "week"] as const).map(async (key) => {
        const res = await adapter.getCampaignPerformance({ organizationId, externalCampaignIds: ids, range: w[key] });
        if (!res.ok) return;
        for (const row of res.data) {
          campaignFigures.set(row.externalCampaignId, { ...campaignFigures.get(row.externalCampaignId), [key]: row.metrics });
        }
      });
    }),
  );

  // Ad-level figures for running campaigns only: paused ones aren't judged.
  const adFigures = new Map<string, { recent?: PlatformMetrics; prior?: PlatformMetrics; week?: PlatformMetrics }>();
  await Promise.all(
    children
      .filter(({ child }) => child.status === "ACTIVE")
      .flatMap(({ child }) => {
        const adapter = getAdapter(child.platform);
        if (!adapter) return [];
        return (["recent", "prior", "week"] as const).map(async (key) => {
          const res = await adapter.getCreativePerformance({
            organizationId,
            externalCampaignId: child.externalCampaignId!,
            range: w[key],
          });
          if (!res.ok) return;
          for (const row of res.data) {
            adFigures.set(row.externalAdId, { ...adFigures.get(row.externalAdId), [key]: row.metrics });
          }
        });
      }),
  );

  const snapshots: CampaignSnapshot[] = children.map(({ campaign: c, child }) => {
    const adapter = getAdapter(child.platform);
    const figures = campaignFigures.get(child.externalCampaignId!) ?? {};
    const adIds = [child.externalAdId, ...child.extraExternalAdIds].filter((id): id is string => Boolean(id));
    const ads: AdSnapshot[] = adIds.map((externalAdId, i) => {
      const row = c.ads[i] ?? null;
      const f = adFigures.get(externalAdId) ?? {};
      return {
        label: `Creative #${i + 1}`,
        campaignAdId: row?.id ?? null,
        kind: row?.kind ?? null,
        externalAdId,
        headline: row?.headline ?? null,
        primaryText: row?.primaryText ?? null,
        callToAction: row?.callToAction ?? null,
        recent: f.recent ?? null,
        prior: f.prior ?? null,
        week: f.week ?? null,
      };
    });
    const lifetime = c.budgetType === "LIFETIME";
    return {
      mairoCampaignId: c.id,
      name: c.name,
      objective: c.objective,
      status: child.status,
      platform: child.platform,
      platformCampaignId: child.id,
      externalCampaignId: child.externalCampaignId!,
      externalAdGroupId: child.externalAdGroupId,
      // A total-budget campaign has no daily budget to move. Zero keeps the
      // budget rules off it (they never propose moving less than $1).
      dailyBudgetCents: lifetime ? 0 : child.dailyBudgetCents,
      liveSince: c.startDate && c.startDate > c.createdAt ? c.startDate : c.createdAt,
      recent: figures.recent ?? null,
      prior: figures.prior ?? null,
      week: figures.week ?? null,
      ads,
      metaFeatures: c.metaFeatures,
      audience: {
        geoKey: c.geoKey,
        geoLabel: c.geoLabel,
        geoRadius: c.geoKey ? (c.geoRadius ?? 10) : null,
        ageMin: c.ageMin,
        ageMax: c.ageMax,
        specialAdCategory: c.specialAdCategory,
        advantageAudience: c.advantageAudience,
      },
      destinationType: c.destinationType,
      destinationUrl: c.destinationUrl,
      canPauseAd: typeof adapter?.pauseAd === "function",
      canChangeAudience: typeof adapter?.updateAdGroupTargeting === "function",
    };
  });

  // A page check only where it could explain something: clicks and no results.
  const landing: DecisionInput["landing"] = {};
  await Promise.all(
    snapshots
      .filter((s) => s.destinationType === "WEBSITE" && s.destinationUrl && (s.week?.clicks ?? 0) >= 50)
      .filter((s) => resultsFor(s.objective, s.week) === 0)
      .map(async (s) => {
        landing[s.mairoCampaignId] = await probeLandingPage(s.destinationUrl!).catch(() => null);
      }),
  );

  // The business's own word on its recent leads, so a campaign Meta says is
  // bringing in cheap leads isn't given more money when the business has been
  // marking those leads as junk.
  const marked = await db.lead.groupBy({
    by: ["status"],
    where: { organizationId, createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) }, status: { not: "NEW" } },
    _count: { _all: true },
  });
  const count = (statuses: string[]) => marked.filter((m) => statuses.includes(m.status)).reduce((n, m) => n + m._count._all, 0);
  const total = count(["QUALIFIED", "BOOKED", "WON", "LOST", "SPAM"]);
  const leadQuality = total > 0 ? { marked: total, junk: count(["LOST", "SPAM"]), good: count(["QUALIFIED", "BOOKED", "WON"]) } : null;

  return { now, campaigns: snapshots, guardrails, landing, leadQuality };
}
