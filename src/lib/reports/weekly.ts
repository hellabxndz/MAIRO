import { randomBytes } from "node:crypto";
import { activeMission } from "@/lib/mission/store";
import { missionGoal, resultsForGoal } from "@/lib/mission/goals";
import { db } from "@/lib/db";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { getAdapter } from "@/lib/ad-platforms/registry";
import type { DateRange, PlatformMetrics } from "@/lib/ad-platforms/types";
import { organizationActions } from "@/lib/campaigns/action-log";
import { effectiveLevel } from "@/lib/decisions/store";
import { refreshDecisions } from "@/lib/decisions/run";
import { loadBrain } from "@/lib/business/brain";
import { loadIntelligence } from "@/lib/intelligence/run";
import { DEFAULT_PROFIT_INPUTS, estimateProfit, type ProfitInputs } from "@/lib/intelligence/profit";
import { notify } from "@/lib/notifications/notify";
import { sendSms } from "@/lib/sms/send";
import { resultsFor, resultWord as wordFor } from "@/lib/protection/rules";
import { summarizeWeek } from "@/lib/ai/weekly-summary";
import {
  budgetNote,
  creativeSummary,
  healthWhy,
  learnings as findLearnings,
  nextWeekPlan,
  pickWin,
  plainSummary,
  platformNote,
  usd,
  type AdWeek,
  type ChangeItem,
  type Figures,
  type HealthSnapshot,
  type Learning,
  type PlatformRow,
  type WeeklyReportData,
} from "./weekly-logic";

// The Automatic Weekly Report: a summary layer over what Mairo already knows.
//
// Nothing here detects anything. The week's figures come from the ad networks
// through the same adapters the dashboard uses; what needs attention and the
// plan for next week are the open Insights; health is Business Health; the
// changes are Mairo Activity. This file gathers the week, hands it to the
// pure judgement in weekly-logic.ts, and keeps the result — so a report reads
// the way the week actually looked, even months later.

const DAY = 86_400_000;
const PUBLISHER: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", audience_network: "Audience Network", messenger: "Messenger", threads: "Threads" };

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekLabel(since: string, until: string): string {
  const f = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  return `${f(since)} – ${f(until)}`;
}

/** Today's weekday and date in the business's own time zone. */
export function localToday(now: Date, timeZone: string): { weekday: number; date: Date } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))));
  return { weekday: date.getUTCDay(), date };
}

/** The seven days before today, in the business's own calendar. */
export function lastWeekFor(now: Date, timeZone: string): DateRange {
  const { date } = localToday(now, timeZone);
  const until = new Date(date.getTime() - DAY);
  return { since: new Date(until.getTime() - 6 * DAY), until };
}

// --- gathering --------------------------------------------------------------------

function figuresFrom(m: PlatformMetrics, results: number | null, word: string, profitCents: number | null): Figures {
  return {
    spendCents: m.spendCents,
    revenueCents: m.revenueCents,
    purchases: m.purchases,
    results,
    resultWord: word,
    costPerResultCents: m.spendCents !== null && results ? Math.round(m.spendCents / results) : null,
    roas: m.roas,
    impressions: m.impressions,
    reach: m.reach,
    clicks: m.clicks,
    ctr: m.ctr,
    cpcCents: m.cpcCents,
    cpmCents: m.cpmCents,
    profitCents,
  };
}

async function adWeeks(
  organizationId: string,
  campaigns: Awaited<ReturnType<typeof loadCampaigns>>,
  current: DateRange,
  previous: DateRange,
): Promise<AdWeek[]> {
  const adapter = getAdapter("META");
  if (!adapter) return [];
  const rows = await Promise.all(
    campaigns.slice(0, 12).map(async (c) => {
      const child = c.platformCampaigns.find((p) => p.platform === "META" && p.externalCampaignId);
      if (!child) return [];
      const [now, before] = await Promise.all(
        [current, previous].map(async (range) => {
          const r = await adapter.getCreativePerformance({ organizationId, externalCampaignId: child.externalCampaignId!, range });
          return new Map(r.ok ? r.data.map((x) => [x.externalAdId, x.metrics]) : []);
        }),
      );
      const ids = [child.externalAdId, ...child.extraExternalAdIds].filter((x): x is string => Boolean(x));
      return ids.map((id, i): AdWeek => {
        const row = c.ads[i] ?? null;
        return {
          key: id,
          label: `Creative #${i + 1}`,
          campaignId: c.id,
          campaignName: c.name,
          objective: c.objective,
          kind: row?.kind ?? null,
          createdAt: row?.createdAt.toISOString() ?? null,
          current: now.get(id) ?? null,
          previous: before.get(id) ?? null,
        };
      });
    }),
  );
  return rows.flat().filter((a) => a.current !== null);
}

function loadCampaigns(organizationId: string) {
  return db.mairoCampaign.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    include: { platformCampaigns: true, ads: { orderBy: { position: "asc" }, select: { kind: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
  });
}

function snapshotOf(h: { score: number | null; status: string | null; areas: { key: string; label: string; score: number | null }[] } | null | undefined): HealthSnapshot | null {
  return h ? { score: h.score, status: h.status, areas: h.areas.map((a) => ({ key: a.key, label: a.label, score: a.score })) } : null;
}

export async function buildWeeklyReport(organizationId: string, week: DateRange): Promise<WeeklyReportData> {
  const since = isoDay(week.since);
  const until = isoDay(week.until);
  const previous: DateRange = { since: new Date(week.since.getTime() - 7 * DAY), until: new Date(week.since.getTime() - DAY) };
  const end = new Date(week.until.getTime() + DAY);

  const [org, campaigns, now, before, settings, brain, intelligence, level, prevReport] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    loadCampaigns(organizationId),
    fetchOrganizationPerformance(organizationId, week),
    fetchOrganizationPerformance(organizationId, previous),
    db.profitSettings.findUnique({ where: { organizationId } }),
    loadBrain(organizationId),
    loadIntelligence(organizationId),
    effectiveLevel(organizationId),
    db.weeklyReport.findFirst({ where: { organizationId, weekStart: { lt: week.since } }, orderBy: { weekStart: "desc" } }),
  ]);

  const word = campaigns.some((c) => c.objective === "SALES") ? "purchase" : campaigns.some((c) => c.objective === "LEADS") ? "lead" : wordFor(campaigns[0]?.objective ?? "SALES");
  const objectiveOf = new Map(campaigns.map((c) => [c.id, c.objective]));
  const resultsIn = (r: typeof now) => (r.hasData ? r.campaigns.reduce((n, c) => n + (resultsFor(objectiveOf.get(c.mairoCampaignId) ?? "SALES", c.hasData ? c.total : null) ?? 0), 0) : null);

  const inputs: ProfitInputs = { ...DEFAULT_PROFIT_INPUTS, ...(settings ?? {}), brainMarginPercent: brain.profile.profitMarginPercent };
  const profitNow = estimateProfit({ revenueCents: now.total.revenueCents, spendCents: now.total.spendCents, purchases: now.total.purchases }, inputs, 7);
  const profitBefore = estimateProfit({ revenueCents: before.total.revenueCents, spendCents: before.total.spendCents, purchases: before.total.purchases }, inputs, 7);
  const current = figuresFrom(now.total, resultsIn(now), word, profitNow.profitCents);
  const prior = before.hasData ? figuresFrom(before.total, resultsIn(before), word, profitBefore.profitCents) : null;

  // Where the ads showed.
  const metaIds = campaigns.flatMap((c) => c.platformCampaigns.filter((p) => p.platform === "META" && p.externalCampaignId).map((p) => p.externalCampaignId!));
  const adapter = getAdapter("META");
  const pubs = adapter?.getPublisherBreakdown && metaIds.length ? await adapter.getPublisherBreakdown({ organizationId, externalCampaignIds: metaIds, range: week }) : null;
  const platformRows: PlatformRow[] = (pubs?.ok ? pubs.data : [])
    .filter((p) => (p.metrics.spendCents ?? 0) > 0)
    .map((p) => {
      const res = p.metrics.purchases ?? p.metrics.conversions ?? 0;
      return {
        name: PUBLISHER[p.publisher] ?? p.publisher,
        spendCents: p.metrics.spendCents ?? 0,
        revenueCents: p.metrics.revenueCents,
        results: res,
        costPerResultCents: res > 0 && p.metrics.spendCents ? Math.round(p.metrics.spendCents / res) : null,
        roas: p.metrics.revenueCents && p.metrics.spendCents ? p.metrics.revenueCents / p.metrics.spendCents : null,
      };
    })
    .sort((a, b) => b.spendCents - a.spendCents);

  const ads = await adWeeks(organizationId, campaigns, week, previous);
  const { win, note: winNote } = pickWin(ads, current);
  const learned = findLearnings(ads, platformRows, win, word);

  // What changed, from Mairo's own records.
  const [activity, optimizer, protection] = await Promise.all([
    db.mairoActivity.findMany({ where: { organizationId, createdAt: { gte: week.since, lt: end } }, orderBy: { createdAt: "asc" } }),
    organizationActions(organizationId, 50),
    db.protectionEvent.findMany({ where: { organizationId, createdAt: { gte: week.since, lt: end }, action: { in: ["PAUSED", "RESUMED"] } }, orderBy: { createdAt: "asc" } }),
  ]);
  const autoBy = level === "AUTOPILOT" ? "autopilot" : "ai-assist";
  const changes: ChangeItem[] = [
    ...activity.map((a) => ({ at: a.createdAt.toISOString(), title: a.action, summary: a.summary, reason: a.reason, before: a.before, after: a.after, by: a.automatic ? autoBy : "you" }) as ChangeItem),
    ...optimizer
      .filter((o) => o.at >= week.since && o.at < end)
      .map((o) => ({ at: o.at.toISOString(), title: o.kind, summary: `${o.kind} on ${o.campaignName}.`, reason: o.rationale, before: null, after: null, by: o.automatic ? autoBy : "you" }) as ChangeItem),
    ...protection.map((p) => ({
      at: p.createdAt.toISOString(),
      title: p.action === "PAUSED" ? "Paused by Spend Protection" : "Resumed",
      summary: p.message,
      reason: p.kind === "PAUSED_BY_YOU" ? "You asked for it." : "Your Spend Protection limits.",
      before: null,
      after: null,
      by: p.kind === "PAUSED_BY_YOU" || p.action === "RESUMED" ? "you" : "spend-protection",
    }) as ChangeItem),
  ].sort((a, b) => a.at.localeCompare(b.at));

  // Needs attention and next week: the open Insights, as the dashboard shows them.
  const open = intelligence.insights;
  const attention = open
    .filter((i) => i.severity === "URGENT" || i.severity === "ATTENTION")
    .slice(0, 3)
    .map((i) => ({
      insightId: i.id,
      title: i.title,
      happened: i.happened,
      happenedAdvanced: i.happenedAdvanced,
      metric: i.metric,
      before: i.previousValue,
      now: i.currentValue,
      interpretation: i.whyItMatters,
      recommendation: i.recommendation,
      decisionId: i.decisionId,
      action: i.action,
      campaignId: i.mairoCampaignId,
      severity: i.severity,
    }));
  const plan = nextWeekPlan(open.map((i) => ({ title: i.title, happened: i.happened, recommendation: i.recommendation, severity: i.severity, confidence: i.confidence, category: i.category, decisionId: i.decisionId, action: i.action })));

  // Budget.
  const running = campaigns.filter((c) => c.status === "ACTIVE" && c.budgetType !== "LIFETIME");
  const planned = running.length ? running.reduce((n, c) => n + c.totalDailyBudgetCents * 7, 0) : null;
  const testing = now.campaigns
    .filter((r) => campaigns.find((c) => c.id === r.mairoCampaignId)?.platformCampaigns.some((p) => p.extraExternalAdIds.length > 0))
    .reduce((n, r) => n + (r.total.spendCents ?? 0), 0);
  const spent = current.spendCents;
  const budgetChanges = changes.filter((c) => /budget/i.test(c.title)).length;

  const healthNow = snapshotOf(intelligence.report?.health);
  let healthBefore: HealthSnapshot | null = null;
  try {
    healthBefore = prevReport ? ((JSON.parse(prevReport.dataJson) as WeeklyReportData).health.now ?? null) : null;
  } catch {
    healthBefore = null;
  }

  const base = { glance: { current, previous: prior, profitKnown: profitNow.profitCents !== null }, win, attention, changes, resultWord: word };
  const plainSimple = plainSummary(base, false);
  const plainAdvanced = plainSummary(base, true);
  const facts = JSON.stringify({
    week: weekLabel(since, until),
    thisWeek: { spend: usd(current.spendCents), revenue: usd(current.revenueCents), results: current.results, resultWord: word, costPerResult: usd(current.costPerResultCents), roas: current.roas?.toFixed(2) ?? null, ctr: current.ctr ? `${(current.ctr * 100).toFixed(2)}%` : null },
    lastWeek: prior ? { spend: usd(prior.spendCents), revenue: usd(prior.revenueCents), results: prior.results, costPerResult: usd(prior.costPerResultCents), roas: prior.roas?.toFixed(2) ?? null } : "no data",
    strongestAd: win ? { ad: win.label, campaign: win.campaignName, costPerResult: usd(win.costPerResultCents) } : winNote,
    needsAttention: attention.map((a) => a.title),
    mairoChanges: changes.length,
    platforms: platformRows.map((p) => ({ name: p.name, spend: usd(p.spendCents), costPerResult: usd(p.costPerResultCents) })),
  });
  const summary = await summarizeWeek(facts, plainSimple, plainAdvanced);

  // Your Week With MAIRO: the same week, measured against the mission's goal.
  const missionWeek = await (async () => {
    const m = await activeMission(organizationId);
    if (!m) return null;
    const g = missionGoal(m.primaryGoal);
    const [adsTested, posts, promos] = await Promise.all([
      db.campaignAd.count({ where: { mairoCampaign: { organizationId, status: { in: ["ACTIVE", "PAUSED"] } }, createdAt: { lt: end } } }),
      db.instagramPost.aggregate({ where: { organizationId, status: "PUBLISHED", postedAt: { gte: week.since, lt: end } }, _count: { _all: true }, _sum: { likeCount: true, commentCount: true } }),
      db.missionNote.findMany({ where: { organizationId, kind: "PROMOTION", OR: [{ endsAt: { gte: week.since } }, { endsAt: null }], createdAt: { lt: end } }, select: { text: true } }),
    ]);
    const running = campaigns.filter((c) => c.status === "ACTIVE").length;
    const did = [
      `Ran ${running} campaign${running === 1 ? "" : "s"}`,
      `Tested ${adsTested} ad creative${adsTested === 1 ? "" : "s"}`,
      posts._count._all ? `Published ${posts._count._all} social post${posts._count._all === 1 ? "" : "s"} (Scale)` : null,
      ...promos.slice(0, 2).map((p) => `Promoted: ${p.text}`),
      changes.length ? `Made ${changes.length} change${changes.length === 1 ? "" : "s"} to your campaigns` : null,
    ].filter(Boolean) as string[];
    const tiles = resultsForGoal(g.metrics, now.total, { likes: posts._sum.likeCount ?? 0, comments: posts._sum.commentCount ?? 0, posts: posts._count._all });
    return {
      goal: g.label,
      title: m.title,
      did,
      results: tiles.map((t) => ({ label: t.label, value: t.value })),
      learned: learned.find((l) => l.saved)?.statement ?? learned[0]?.statement ?? null,
      next: plan[0] ? `${plan[0].action}` : `MAIRO keeps working on "${m.title}" and tests what's working best.`,
    };
  })().catch(() => null);

  return {
    version: 1,
    mission: missionWeek,
    period: { since, until, label: weekLabel(since, until) },
    businessName: org?.name ?? "",
    resultWord: word,
    glance: base.glance,
    summary,
    win,
    winNote,
    attention,
    changes,
    learnings: learned,
    platforms: platformRows.length ? { rows: platformRows, note: platformNote(platformRows, word) } : null,
    creatives: creativeSummary(ads, win, learned, since),
    budget: {
      plannedCents: planned,
      spentCents: spent,
      remainingCents: planned !== null && spent !== null ? Math.max(0, planned - spent) : null,
      utilization: planned && spent !== null ? spent / planned : null,
      byPlacement: platformRows.map((p) => ({ name: p.name, spendCents: p.spendCents })),
      testingCents: testing > 0 ? testing : null,
      note: budgetNote(planned, spent, budgetChanges, spent ? testing / spent : null),
    },
    health: { now: healthNow, before: healthBefore, why: healthWhy(healthNow, healthBefore) },
    plan,
    campaignsActive: campaigns.filter((c) => c.status === "ACTIVE").length,
    dataNote: now.problems.length ? now.problems.map((p) => p.message).join(" ") : null,
  };
}

// --- Learning Memory ------------------------------------------------------------------

const CONF_RANK = { EARLY: 0, MEDIUM: 1, HIGH: 2 } as const;

export async function saveLearnings(organizationId: string, items: Learning[], reportId: string): Promise<void> {
  for (const l of items.filter((x) => x.saved)) {
    const existing = await db.mairoLearning.findUnique({ where: { organizationId_key: { organizationId, key: l.key } } });
    if (existing) {
      await db.mairoLearning.update({
        where: { id: existing.id },
        data: {
          statement: l.statement,
          detail: l.detail,
          evidenceJson: JSON.stringify(l.evidence),
          confidence: CONF_RANK[l.confidence] > CONF_RANK[existing.confidence] ? l.confidence : existing.confidence,
          timesSeen: existing.timesSeen + 1,
          lastSeenAt: new Date(),
          sourceReportId: reportId,
        },
      });
    } else {
      await db.mairoLearning.create({
        data: { organizationId, key: l.key, category: l.category, statement: l.statement, detail: l.detail, evidenceJson: JSON.stringify(l.evidence), confidence: l.confidence, sourceReportId: reportId },
      });
    }
  }
}

export { learningsBrief } from "./learnings";

// --- generating and delivering ------------------------------------------------------------

export async function generateWeeklyReport(organizationId: string, week: DateRange): Promise<{ id: string; data: WeeklyReportData }> {
  const data = await buildWeeklyReport(organizationId, week);
  const row = await db.weeklyReport.upsert({
    where: { organizationId_weekStart: { organizationId, weekStart: week.since } },
    create: { organizationId, weekStart: week.since, weekEnd: week.until, dataJson: JSON.stringify(data) },
    update: { weekEnd: week.until, dataJson: JSON.stringify(data), generatedAt: new Date() },
  });
  await saveLearnings(organizationId, data.learnings, row.id);
  return { id: row.id, data };
}

export function newShareToken(): string {
  return randomBytes(18).toString("base64url");
}

/** Tells the business the report is ready, the ways it asked to be told. */
async function deliver(organizationId: string, reportId: string, data: WeeklyReportData, inApp: boolean): Promise<void> {
  const c = data.glance.current;
  const actions = data.attention.length;
  const body = `${data.period.label}: ${usd(c.revenueCents, true)} in tracked sales${c.roas !== null ? `, ${c.roas.toFixed(1)}x ROAS` : ""}. ${actions ? `${actions} thing${actions === 1 ? "" : "s"} need${actions === 1 ? "s" : ""} your attention.` : "No major issues this week."}`;
  const smsBody = `Your Mairo weekly report is ready. ${body}`;
  if (inApp) {
    await notify({
      organizationId,
      kind: "WEEKLY_REPORT",
      dedupeKey: `weekly:${data.period.since}`,
      title: "Your Mairo Weekly Report is ready",
      body,
      actionLabel: "Open report",
      actionHref: `/dashboard/reports/weekly/${reportId}`,
      smsBody,
    });
  } else {
    await sendSms(organizationId, "weekly-summary", smsBody).catch(() => undefined);
  }
}

/**
 * The daily cron's part: every business whose delivery day it is, and whose
 * report for the week just ended isn't written yet. Stops early rather than
 * run past the cron's time limit; anyone not reached gets theirs when they
 * next open Reports.
 */
export async function generateDueWeeklyReports(now = new Date(), opts: { limit?: number; budgetMs?: number } = {}): Promise<{ generated: number; skipped: number }> {
  const started = Date.now();
  const orgs = await db.organization.findMany({
    where: { mairoCampaigns: { some: { platformCampaigns: { some: { externalCampaignId: { not: null } } } } } },
    select: { id: true, timezone: true, parentId: true, reportSettings: true },
    take: 200,
  });
  let generated = 0;
  let skipped = 0;
  for (const o of orgs) {
    if (generated >= (opts.limit ?? 3) || Date.now() - started > (opts.budgetMs ?? 35_000)) break;
    const s = o.reportSettings;
    if (s && !s.weeklyEnabled) continue;
    const tz = o.timezone || "America/New_York";
    if (localToday(now, tz).weekday !== (s?.deliveryDay ?? 1)) continue;
    const week = lastWeekFor(now, tz);
    const exists = await db.weeklyReport.findUnique({ where: { organizationId_weekStart: { organizationId: o.id, weekStart: week.since } }, select: { id: true } });
    if (exists) continue;
    if ((s?.onlyWhenActive ?? true) && (await db.mairoCampaign.count({ where: { organizationId: o.id, status: "ACTIVE" } })) === 0) {
      skipped++;
      continue;
    }
    try {
      await refreshDecisions(o.id).catch(() => undefined);
      const { id, data } = await generateWeeklyReport(o.id, week);
      await approveIfAgencyAllows(o.id, o.parentId, id);
      await deliver(o.id, id, data, s?.inApp ?? true);
      generated++;
    } catch (error) {
      console.error(`Weekly report failed for ${o.id}:`, error);
      skipped++;
    }
  }
  return { generated, skipped };
}

/** A client report is shared only when the agency has said so. */
async function approveIfAgencyAllows(organizationId: string, parentId: string | null, reportId: string): Promise<void> {
  if (!parentId) return;
  const agency = await db.reportSettings.findUnique({ where: { organizationId: parentId }, select: { autoApprove: true } });
  if (!agency?.autoApprove) return;
  await db.weeklyReport.update({ where: { id: reportId }, data: { approvedAt: new Date(), shareToken: newShareToken() } });
}

/**
 * The report for the week that just ended, written now if it's due and
 * missing — for the business the cron didn't reach, or one that opens Reports
 * before the cron runs.
 */
export async function ensureLatestWeeklyReport(organizationId: string, now = new Date()): Promise<string | null> {
  const [org, s] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true, parentId: true } }),
    db.reportSettings.findUnique({ where: { organizationId } }),
  ]);
  if (!org || (s && !s.weeklyEnabled)) return null;
  const tz = org.timezone || "America/New_York";
  const today = localToday(now, tz);
  // The most recent delivery day, today included.
  const back = (today.weekday - (s?.deliveryDay ?? 1) + 7) % 7;
  const delivery = new Date(today.date.getTime() - back * DAY);
  const until = new Date(delivery.getTime() - DAY);
  const week = { since: new Date(until.getTime() - 6 * DAY), until };
  const exists = await db.weeklyReport.findUnique({ where: { organizationId_weekStart: { organizationId, weekStart: week.since } }, select: { id: true } });
  if (exists) return exists.id;
  const hasCampaigns = await db.mairoCampaign.count({ where: { organizationId, platformCampaigns: { some: { externalCampaignId: { not: null } } } } });
  if (!hasCampaigns) return null;
  if ((s?.onlyWhenActive ?? true) && (await db.mairoCampaign.count({ where: { organizationId, status: "ACTIVE" } })) === 0) return null;
  await refreshDecisions(organizationId).catch(() => undefined);
  const { id, data } = await generateWeeklyReport(organizationId, week);
  await approveIfAgencyAllows(organizationId, org.parentId, id);
  await deliver(organizationId, id, data, s?.inApp ?? true);
  return id;
}

/** Written in the last seven days — still "this week's" report on the dashboard. */
export function reportIsFresh(generatedAt: Date, now = new Date()): boolean {
  return now.getTime() - generatedAt.getTime() < 7 * DAY;
}

export function parseReport(json: string): WeeklyReportData | null {
  try {
    const d = JSON.parse(json) as WeeklyReportData;
    return d.version === 1 ? d : null;
  } catch {
    return null;
  }
}

