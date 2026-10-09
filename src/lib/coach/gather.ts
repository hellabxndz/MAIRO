import { db } from "@/lib/db";
import { getAdapter } from "@/lib/ad-platforms/registry";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { guardrailsFor } from "@/lib/decisions/gather";
import type { DecisionInput } from "@/lib/decisions/types";
import { stageLabels } from "@/lib/leads/details";
import type { CoachCampaign, CoachInput, CoachTracking, Period } from "./types";

// Everything the Performance Coach reads, for one business: Meta's figures
// for MAIRO's campaigns over two matching two-week periods, the leads MAIRO
// stored with what the business marked on them, the tracking state, the
// business's limits, and what happened to earlier recommendations.
//
// Two reads per network (both periods, every campaign at once). The ads'
// own figures come from the daily review's snapshot when there is one, so
// the coach adds no ad-level reads of its own.

const DAY = 86_400_000;

/** Two matching two-week periods of whole days, ending yesterday. */
export function coachPeriods(now: Date): { current: Period; previous: Period } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY);
  const back = (d: number) => new Date(end.getTime() - d * DAY);
  return { current: { since: back(13), until: end }, previous: { since: back(27), until: back(14) } };
}

export class CoachReadError extends Error {}

export async function gatherCoachInput(organizationId: string, opts: { now?: Date; decisionInput?: DecisionInput | null } = {}): Promise<CoachInput> {
  const now = opts.now ?? new Date();
  const { current, previous } = coachPeriods(now);

  const [campaigns, leads, pixel, store, org, guardrails, ordersNow, ordersBefore, worsened, dismissed] = await Promise.all([
    db.mairoCampaign.findMany({
      where: { organizationId, status: { in: ["ACTIVE", "PAUSED"] } },
      include: { platformCampaigns: { where: { externalCampaignId: { not: null } } } },
    }),
    db.lead.findMany({
      where: { organizationId, OR: [{ createdAt: { gte: previous.since } }, { status: "ESTIMATE_SENT" }] },
      select: { id: true, createdAt: true, status: true, source: true, mairoCampaignId: true, firstContactedAt: true, appointmentAt: true, nextFollowUpAt: true, statusChangedAt: true, estimatedValueCents: true, valueCents: true, lostReason: true },
      orderBy: { createdAt: "desc" },
      take: 5_000,
    }),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } }, select: { status: true, lastFiredAt: true } }),
    db.storeIngest.findUnique({ where: { organizationId }, select: { id: true } }),
    db.organization.findUnique({ where: { id: organizationId }, select: { industry: true, leadStagesJson: true } }),
    guardrailsFor(organizationId),
    db.conversionEvent.aggregate({ where: { organizationId, eventName: "Purchase", occurredAt: { gte: current.since, lt: new Date(current.until.getTime() + DAY) } }, _count: { _all: true }, _sum: { valueCents: true } }),
    db.conversionEvent.aggregate({ where: { organizationId, eventName: "Purchase", occurredAt: { gte: previous.since, lt: new Date(previous.until.getTime() + DAY) } }, _count: { _all: true }, _sum: { valueCents: true } }),
    db.mairoDecision.findMany({ where: { organizationId, verdict: "WORSENED", decidedAt: { gte: new Date(now.getTime() - 180 * DAY) } }, select: { kind: true, mairoCampaignId: true, decidedAt: true } }),
    db.coachFinding.findMany({ where: { organizationId, status: "DISMISSED", decidedAt: { gte: new Date(now.getTime() - 30 * DAY) } }, select: { key: true } }),
  ]);

  // Meta's figures for both periods, every campaign in one call per network.
  const children = campaigns.flatMap((c) => c.platformCampaigns.map((p) => ({ c, p })));
  const figures = new Map<string, { current?: PlatformMetrics; previous?: PlatformMetrics }>();
  const byPlatform = new Map<string, string[]>();
  for (const { p } of children) byPlatform.set(p.platform, [...(byPlatform.get(p.platform) ?? []), p.externalCampaignId!]);
  let failures = 0;
  await Promise.all(
    [...byPlatform.entries()].flatMap(([platform, ids]) => {
      const adapter = getAdapter(platform as never);
      if (!adapter) return [];
      return (["current", "previous"] as const).map(async (key) => {
        const res = await adapter.getCampaignPerformance({ organizationId, externalCampaignIds: ids, range: key === "current" ? current : previous });
        if (!res.ok) {
          failures++;
          return;
        }
        for (const row of res.data) figures.set(row.externalCampaignId, { ...figures.get(row.externalCampaignId), [key]: row.metrics });
      });
    }),
  );
  // Half an answer would read as a real drop. If Meta couldn't be read, say so instead.
  if (children.length > 0 && failures > 0) throw new CoachReadError("Couldn't read your results from Meta this time.");

  const adsFor = new Map((opts.decisionInput?.campaigns ?? []).map((s) => [s.platformCampaignId, s.ads]));
  const coachCampaigns: CoachCampaign[] = children.map(({ c, p }) => ({
    mairoCampaignId: c.id,
    name: c.name,
    objective: c.objective,
    status: c.status,
    platform: p.platform,
    platformCampaignId: p.id,
    externalCampaignId: p.externalCampaignId!,
    dailyBudgetCents: c.budgetType === "LIFETIME" ? 0 : p.dailyBudgetCents,
    liveSince: c.startDate && c.startDate > c.createdAt ? c.startDate : c.createdAt,
    current: figures.get(p.externalCampaignId!)?.current ?? null,
    previous: figures.get(p.externalCampaignId!)?.previous ?? null,
    ads: (adsFor.get(p.id) ?? []).map((a) => ({ label: a.label, externalAdId: a.externalAdId, headline: a.headline, metrics: a.week })),
    hostedForm: c.destinationType === "LEAD_FORM" && c.leadFormDelivery !== "META_NATIVE",
  }));

  const weekAgo = now.getTime() - 7 * DAY;
  const tracking: CoachTracking = {
    pixel: !pixel ? "none" : pixel.lastFiredAt ? (pixel.lastFiredAt.getTime() >= weekAgo ? "firing" : "stopped") : "waiting",
    pixelLastFiredAt: pixel?.lastFiredAt ?? null,
    storeConnected: Boolean(store),
  };

  return {
    now,
    current,
    previous,
    campaigns: coachCampaigns,
    leads,
    tracking,
    guardrails,
    labels: stageLabels(org?.industry, org?.leadStagesJson),
    orders: store
      ? {
          current: { count: ordersNow._count._all, valueCents: ordersNow._sum.valueCents ?? 0 },
          previous: { count: ordersBefore._count._all, valueCents: ordersBefore._sum.valueCents ?? 0 },
        }
      : null,
    history: {
      worsened: worsened.filter((w) => w.decidedAt).map((w) => ({ kind: w.kind, mairoCampaignId: w.mairoCampaignId, at: w.decidedAt! })),
      dismissedKeys: dismissed.map((d) => d.key),
    },
  };
}
