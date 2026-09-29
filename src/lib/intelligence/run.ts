import { db } from "@/lib/db";
import { getAdapter } from "@/lib/ad-platforms/registry";
import type { DateRange, PlatformMetrics } from "@/lib/ad-platforms/types";
import { probeLandingPage } from "@/lib/campaigns/landing-probe";
import { windows } from "@/lib/decisions/gather";
import { pastLearning } from "@/lib/decisions/rules";
import type { DecisionDraft, DecisionInput } from "@/lib/decisions/types";
import { loadBrain } from "@/lib/business/brain";
import { resultsFor, resultWord } from "@/lib/protection/rules";
import type { InsightStatus, MairoInsight } from "@/generated/prisma/client";
import { buildBrief, type BriefAdRow } from "./brief";
import { detectInsights, type IntelligenceContext } from "./detect";
import { aggregateMetrics } from "./metrics";
import { radar, scoreHealth } from "./score";
import type { BriefFigures, BriefReport, Insight, IntelligenceReportData } from "./types";

// The daily look, second half: after Mairo Decisions has read the account and
// written its decisions, this turns the same snapshot into Insights, Business
// Health, the Opportunity Radar and the Morning Brief, and keeps them so the
// dashboard doesn't have to ask Meta again.
//
// Never throws into the decisions run — a problem here costs the intelligence
// screens a refresh, not the customer their decisions.

const DAY = 86_400_000;
const MAX_PAGES = 5;

async function contextFor(organizationId: string, input: DecisionInput): Promise<IntelligenceContext> {
  const w = windows(input.now);
  const metaIds = input.campaigns.filter((c) => c.platform === "META").map((c) => c.externalCampaignId);
  const adapter = getAdapter("META");
  const website = input.campaigns.filter((c) => c.status === "ACTIVE" && c.destinationType === "WEBSITE" && c.destinationUrl).slice(0, MAX_PAGES);

  const [pixels, publishers, pages] = await Promise.all([
    db.trackingPixel.findMany({ where: { organizationId }, select: { status: true } }),
    adapter?.getPublisherBreakdown && metaIds.length
      ? adapter.getPublisherBreakdown({ organizationId, externalCampaignIds: metaIds, range: w.week }).then((r) => (r.ok ? r.data : null))
      : Promise.resolve(null),
    Promise.all(
      website.map(async (c) => {
        const started = Date.now();
        const probe = input.landing[c.mairoCampaignId] ?? (await probeLandingPage(c.destinationUrl!).catch(() => null));
        return [c.mairoCampaignId, { probe, ms: input.landing[c.mairoCampaignId] ? null : Date.now() - started }] as const;
      }),
    ),
  ]);
  return { pixels, publishers, pages: Object.fromEntries(pages) };
}

/** Keeps each Insight by its key: new ones are written, recurring ones refreshed, gone ones resolved. */
async function persistInsights(organizationId: string, insights: Insight[], now: Date): Promise<void> {
  const keys = insights.map((i) => i.dedupeKey);
  for (const i of insights) {
    const data = {
      mairoCampaignId: i.mairoCampaignId,
      campaignName: i.campaignName,
      platform: i.platform,
      type: i.type,
      category: i.category,
      severity: i.severity,
      confidence: i.confidence,
      metric: i.metric,
      previousValue: i.previousValue,
      currentValue: i.currentValue,
      title: i.title,
      happened: i.happened,
      happenedAdvanced: i.happenedAdvanced,
      whyItMatters: i.whyItMatters,
      recommendation: i.recommendation,
      reason: i.reason,
      ifApproved: i.ifApproved,
      evidenceJson: JSON.stringify(i.evidence),
      basedOnJson: JSON.stringify(i.basedOn),
      actionType: i.actionType,
      actionLabel: i.action?.label ?? null,
      actionHref: i.action?.href ?? null,
      radarArea: i.radarArea,
      earlyWarning: i.earlyWarning,
      decisionDedupeKey: i.decisionDedupeKey,
      lastSeenAt: now,
    };
    const existing = await db.mairoInsight.findUnique({ where: { organizationId_dedupeKey: { organizationId, dedupeKey: i.dedupeKey } }, select: { status: true } });
    if (existing) {
      await db.mairoInsight.update({
        where: { organizationId_dedupeKey: { organizationId, dedupeKey: i.dedupeKey } },
        // A dismissed one stays dismissed; a resolved one that's back is open again.
        data: { ...data, ...(existing.status === "RESOLVED" ? { status: "OPEN" as InsightStatus, resolvedAt: null } : {}) },
      });
    } else {
      await db.mairoInsight.create({ data: { ...data, organizationId, dedupeKey: i.dedupeKey, firstSeenAt: now } });
    }
  }
  await db.mairoInsight.updateMany({
    where: { organizationId, status: "OPEN", dedupeKey: { notIn: keys } },
    data: { status: "RESOLVED", resolvedAt: now },
  });
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The Brief's period and the one before it: yesterday, or the seven days to yesterday. */
export function briefRanges(now: Date, frequency: "DAILY" | "WEEKLY"): { current: DateRange; before: DateRange } {
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY);
  const days = frequency === "WEEKLY" ? 7 : 1;
  const since = new Date(yesterday.getTime() - (days - 1) * DAY);
  return {
    current: { since, until: yesterday },
    before: { since: new Date(since.getTime() - days * DAY), until: new Date(since.getTime() - DAY) },
  };
}

function figuresOf(input: DecisionInput, rows: Map<string, PlatformMetrics>): BriefFigures | null {
  const parts = input.campaigns.map((c) => ({ c, m: rows.get(c.externalCampaignId) ?? null })).filter((x) => x.m);
  if (parts.length === 0) return null;
  const total = aggregateMetrics(parts.map((x) => x.m));
  const sales = input.campaigns.some((c) => c.objective === "SALES");
  const results = parts.reduce((n, x) => n + (resultsFor(x.c.objective, x.m) ?? 0), 0);
  return {
    spendCents: total.spendCents,
    revenueCents: total.revenueCents,
    results,
    resultWord: sales ? "purchase" : resultWord(input.campaigns[0]?.objective ?? "SALES"),
    roas: total.roas,
  };
}

export async function computeBrief(organizationId: string, input: DecisionInput, insights: Insight[], frequency: "DAILY" | "WEEKLY"): Promise<BriefReport | null> {
  const adapter = getAdapter("META");
  if (!adapter || input.campaigns.length === 0) return null;
  const { current, before } = briefRanges(input.now, frequency);
  const ids = input.campaigns.map((c) => c.externalCampaignId);
  const [now, prev] = await Promise.all(
    [current, before].map(async (range) => {
      const r = await adapter.getCampaignPerformance({ organizationId, externalCampaignIds: ids, range });
      return new Map(r.ok ? r.data.map((row) => [row.externalCampaignId, row.metrics]) : []);
    }),
  );
  const running = input.campaigns.filter((c) => c.status === "ACTIVE");
  const ads: BriefAdRow[] = (
    await Promise.all(
      running.map(async (c) => {
        const r = await adapter.getCreativePerformance({ organizationId, externalCampaignId: c.externalCampaignId, range: current });
        if (!r.ok) return [];
        return c.ads.map((a) => {
          const m = r.data.find((row) => row.externalAdId === a.externalAdId)?.metrics ?? null;
          return { label: a.label, campaignName: c.name, spendCents: m?.spendCents ?? 0, results: resultsFor(c.objective, m) ?? 0 };
        });
      }),
    )
  ).flat();
  return buildBrief({
    period: frequency === "WEEKLY" ? "week" : "yesterday",
    since: isoDay(current.since),
    until: isoDay(current.until),
    figures: figuresOf(input, now),
    before: figuresOf(input, prev),
    ads,
    input,
    insights,
  });
}

export async function runIntelligence(organizationId: string, input: DecisionInput, drafts: DecisionDraft[]): Promise<void> {
  const [ctx, brain, org] = await Promise.all([
    contextFor(organizationId, input),
    loadBrain(organizationId),
    db.organization.findUnique({ where: { id: organizationId }, select: { briefFrequency: true } }),
  ]);
  const insights = detectInsights(input, drafts, ctx);
  await persistInsights(organizationId, insights, input.now);
  const judged = input.campaigns.some((c) => pastLearning(c, input.now));
  const report: IntelligenceReportData = {
    computedAt: input.now.toISOString(),
    judged,
    health: scoreHealth(input, insights, ctx, brain.analysis),
    radar: radar(insights, judged),
    brief: await computeBrief(organizationId, input, insights, org?.briefFrequency ?? "DAILY").catch(() => null),
  };
  await db.intelligenceReport.upsert({
    where: { organizationId },
    create: { organizationId, reportJson: JSON.stringify(report), computedAt: input.now },
    update: { reportJson: JSON.stringify(report), computedAt: input.now },
  });
}

// --- reading it back ------------------------------------------------------------------

export type InsightView = Insight & {
  id: string;
  status: InsightStatus;
  firstSeenAt: string;
  /** The pending Mairo Decision that carries the fix, when there is one. */
  decisionId: string | null;
};

export function toInsightView(row: MairoInsight, decisionId: string | null): InsightView {
  const parse = <T,>(json: string, fallback: T): T => {
    try {
      return JSON.parse(json) as T;
    } catch {
      return fallback;
    }
  };
  return {
    id: row.id,
    status: row.status,
    firstSeenAt: row.firstSeenAt.toISOString(),
    decisionId,
    dedupeKey: row.dedupeKey,
    type: row.type,
    category: row.category,
    severity: row.severity,
    confidence: row.confidence,
    mairoCampaignId: row.mairoCampaignId,
    campaignName: row.campaignName,
    platform: row.platform,
    metric: row.metric,
    previousValue: row.previousValue,
    currentValue: row.currentValue,
    title: row.title,
    happened: row.happened,
    happenedAdvanced: row.happenedAdvanced,
    whyItMatters: row.whyItMatters,
    recommendation: row.recommendation,
    reason: row.reason,
    ifApproved: row.ifApproved,
    evidence: parse(row.evidenceJson, []),
    basedOn: parse(row.basedOnJson, { days: 0, impressions: null, clicks: null, results: null, resultWord: "result" }),
    actionType: (row.actionType as Insight["actionType"]) ?? null,
    action: row.actionLabel && row.actionHref ? { label: row.actionLabel, href: row.actionHref } : null,
    radarArea: (row.radarArea as Insight["radarArea"]) ?? null,
    earlyWarning: row.earlyWarning,
    decisionDedupeKey: row.decisionDedupeKey,
  };
}

export type Intelligence = {
  report: IntelligenceReportData | null;
  /** Open, not dismissed, most important first. */
  insights: InsightView[];
};

const SEVERITY_ORDER = { URGENT: 0, ATTENTION: 1, OPPORTUNITY: 2, INFO: 3 } as const;

export async function loadIntelligence(organizationId: string): Promise<Intelligence> {
  const [row, open] = await Promise.all([
    db.intelligenceReport.findUnique({ where: { organizationId } }),
    db.mairoInsight.findMany({ where: { organizationId, status: "OPEN" }, orderBy: { firstSeenAt: "desc" }, take: 60 }),
  ]);
  const keys = open.map((i) => i.decisionDedupeKey).filter((k): k is string => Boolean(k));
  const decisions = keys.length
    ? await db.mairoDecision.findMany({ where: { organizationId, dedupeKey: { in: keys }, status: "PENDING" }, select: { id: true, dedupeKey: true } })
    : [];
  const byKey = new Map(decisions.map((d) => [d.dedupeKey, d.id]));
  let report: IntelligenceReportData | null = null;
  try {
    report = row ? (JSON.parse(row.reportJson) as IntelligenceReportData) : null;
  } catch {
    report = null;
  }
  const insights = open
    .map((r) => toInsightView(r, r.decisionDedupeKey ? (byKey.get(r.decisionDedupeKey) ?? null) : null))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return { report, insights };
}
