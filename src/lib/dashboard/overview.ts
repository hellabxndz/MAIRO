import { db } from "@/lib/db";
import { fetchOrganizationPerformance, type OrganizationReport } from "@/lib/ad-platforms/performance";
import { getAdapter } from "@/lib/ad-platforms/registry";
import { EMPTY_METRICS, type DateRange, type PlatformMetrics } from "@/lib/ad-platforms/types";
import { toView, type DecisionView } from "@/lib/decisions/store";
import type { AdGoal, CampaignStatus } from "@/generated/prisma/enums";

// Everything the dashboard shows, for one period, read once.
//
// Both views — Simple and Advanced — draw from this. They choose different
// numbers to put on the screen, never different numbers for the same thing.
//
// Every figure is Meta's, for the chosen period, compared with the period of
// the same length just before it. When Meta can't be read, the figure is
// missing and the screen says why; it is never filled in.

export const RANGE_OPTIONS = [7, 14, 30, 90] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];
export const DEFAULT_RANGE: RangeDays = 30;

export function parseRange(value: string | string[] | undefined): RangeDays {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (RANGE_OPTIONS as readonly number[]).includes(n) ? (n as RangeDays) : DEFAULT_RANGE;
}

const DAY = 86_400_000;

/** The last `days` days ending today, and the same length just before it. UTC days, as Meta's own ranges are sent. */
export function periodsFor(days: number, now = new Date()): { current: DateRange; previous: DateRange } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const since = today - (days - 1) * DAY;
  return {
    current: { since: new Date(since), until: new Date(today) },
    previous: { since: new Date(since - days * DAY), until: new Date(since - DAY) },
  };
}

export type DailyPoint = {
  date: string;
  spendCents: number;
  revenueCents: number;
  purchases: number;
  /** False on a day Meta returned nothing for — drawn as zero, and said so. */
  delivered: boolean;
};

export type CampaignRow = {
  id: string;
  name: string;
  objective: AdGoal;
  status: CampaignStatus;
  /** Live with more than one version of the ad. */
  testing: boolean;
  adCount: number;
  thumbnailUrl: string | null;
  metrics: PlatformMetrics;
  hasData: boolean;
};

export type Overview = {
  days: RangeDays;
  range: { since: string; until: string };
  current: PlatformMetrics;
  previous: PlatformMetrics | null;
  hasData: boolean;
  /** Null when the network can't give a day-by-day split. */
  daily: DailyPoint[] | null;
  /** Where the ads showed, largest spend first. Null when unavailable. */
  publishers: { publisher: string; metrics: PlatformMetrics }[] | null;
  campaigns: CampaignRow[];
  insights: DecisionView[];
  pendingCount: number;
  problems: OrganizationReport["problems"];
};

export async function loadOverview(organizationId: string, days: RangeDays): Promise<Overview> {
  const { current, previous } = periodsFor(days);

  const [campaigns, now, before, pending, pendingCount] = await Promise.all([
    db.mairoCampaign.findMany({
      where: { organizationId, status: { not: "ARCHIVED" } },
      include: {
        platformCampaigns: { select: { platform: true, externalCampaignId: true, externalAdId: true, extraExternalAdIds: true } },
        ads: { orderBy: { position: "asc" }, select: { imageUrl: true, videoPosterUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    fetchOrganizationPerformance(organizationId, current),
    fetchOrganizationPerformance(organizationId, previous),
    db.mairoDecision.findMany({
      where: { organizationId, status: "PENDING" },
      orderBy: [{ urgent: "desc" }, { createdAt: "desc" }],
      take: 3,
    }),
    db.mairoDecision.count({ where: { organizationId, status: "PENDING" } }),
  ]);

  const [daily, publishers] = await Promise.all([dailySeries(organizationId, campaigns, current), publisherSplit(organizationId, campaigns, current)]);

  const reports = new Map(now.campaigns.map((c) => [c.mairoCampaignId, c]));
  const rows: CampaignRow[] = campaigns.map((c) => {
    const report = reports.get(c.id);
    const extra = c.platformCampaigns.reduce((n, p) => n + p.extraExternalAdIds.length, 0);
    const built = c.platformCampaigns.filter((p) => p.externalAdId).length;
    const firstAd = c.ads.find((a) => a.imageUrl || a.videoPosterUrl);
    return {
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      testing: c.status === "ACTIVE" && extra > 0,
      adCount: Math.max(c.ads.length, built + extra),
      thumbnailUrl: safeImage(firstAd?.imageUrl ?? firstAd?.videoPosterUrl ?? null),
      metrics: report?.total ?? EMPTY_METRICS,
      hasData: report?.hasData ?? false,
    };
  });

  return {
    days,
    range: { since: current.since.toISOString().slice(0, 10), until: current.until.toISOString().slice(0, 10) },
    current: now.total,
    previous: before.hasData ? before.total : null,
    hasData: now.hasData,
    daily,
    publishers,
    campaigns: rows,
    insights: pending.map(toView),
    pendingCount,
    problems: now.problems,
  };
}

type CampaignWithChildren = { platformCampaigns: { platform: string; externalCampaignId: string | null }[] };

function metaIds(campaigns: CampaignWithChildren[]): string[] {
  return campaigns.flatMap((c) => c.platformCampaigns.filter((p) => p.platform === "META" && p.externalCampaignId).map((p) => p.externalCampaignId!));
}

async function dailySeries(organizationId: string, campaigns: CampaignWithChildren[], range: DateRange): Promise<DailyPoint[] | null> {
  const adapter = getAdapter("META");
  const ids = metaIds(campaigns);
  if (!adapter?.getDailyPerformance || ids.length === 0) return null;
  const result = await adapter.getDailyPerformance({ organizationId, externalCampaignIds: ids, range });
  if (!result.ok) return null;
  const byDate = new Map(result.data.map((d) => [d.date, d.metrics]));
  const out: DailyPoint[] = [];
  for (let t = range.since.getTime(); t <= range.until.getTime(); t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10);
    const m = byDate.get(date);
    out.push({
      date,
      spendCents: m?.spendCents ?? 0,
      revenueCents: m?.revenueCents ?? 0,
      purchases: m?.purchases ?? 0,
      delivered: Boolean(m),
    });
  }
  return out;
}

async function publisherSplit(organizationId: string, campaigns: CampaignWithChildren[], range: DateRange) {
  const adapter = getAdapter("META");
  const ids = metaIds(campaigns);
  if (!adapter?.getPublisherBreakdown || ids.length === 0) return null;
  const result = await adapter.getPublisherBreakdown({ organizationId, externalCampaignIds: ids, range });
  if (!result.ok) return null;
  return result.data
    .filter((p) => (p.metrics.spendCents ?? 0) > 0 || (p.metrics.impressions ?? 0) > 0)
    .sort((a, b) => (b.metrics.spendCents ?? 0) - (a.metrics.spendCents ?? 0));
}

/** Only https images are drawn; anything else is left as a placeholder. */
function safeImage(url: string | null): string | null {
  return url && /^https:\/\//.test(url) ? url : null;
}

/** Change from the previous period as a fraction, or null when there's nothing honest to compare with. */
export function change(now: number | null, before: number | null | undefined): number | null {
  if (now === null || before === null || before === undefined || before === 0) return null;
  return (now - before) / before;
}
