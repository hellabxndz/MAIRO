import { db } from "@/lib/db";
import { getAdapter } from "@/lib/ad-platforms/registry";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { campaignActions } from "@/lib/campaigns/action-log";
import { LEARNING_DAYS } from "@/lib/decisions/rules";
import { parseChanges } from "@/lib/decisions/store";
import { usd } from "@/lib/protection/rules";

// Campaign Journey: what has happened to one campaign since it launched, and
// what MAIRO did about it, day by day.
//
// Every event is a row that exists — the campaign itself, its ads, MAIRO
// Decisions and what came of them, MAIRO Activity, Insights, Spend
// Protection, the earlier optimizer. Nothing is written for the timeline;
// it is read from what the rest of MAIRO already records.

export type TimelineKind = "launch" | "data" | "winner" | "budget" | "creative" | "audience" | "retargeting" | "website" | "warning" | "optimization" | "review";

export type TimelineFilter = "all" | "budget" | "creative" | "audience" | "website" | "platform" | "ai";

export type TimelineEvent = {
  id: string;
  at: string;
  /** Days since launch, from 1. */
  day: number;
  kind: TimelineKind;
  filters: TimelineFilter[];
  title: string;
  /** Plain words. */
  body: string;
  /** The figures behind it, for Advanced mode. */
  details: { label: string; value: string }[];
  /** MAIRO did or proposed this. */
  ai: boolean;
};

export type CampaignJourney = {
  campaign: { id: string; name: string; status: string; objective: string; dailyBudgetCents: number; liveSince: string };
  events: TimelineEvent[];
};

const DAY = 86_400_000;

const GOAL: Record<string, string> = { SALES: "Purchases", LEADS: "Leads", TRAFFIC: "Website visits", AWARENESS: "Awareness", ENGAGEMENT: "Engagement", APP_PROMOTION: "App installs" };

const INSIGHT_KIND: Record<string, { kind: TimelineKind; filters: TimelineFilter[] }> = {
  "creative-fatigue": { kind: "creative", filters: ["creative"] },
  "pause-ad": { kind: "creative", filters: ["creative"] },
  "test-variation": { kind: "creative", filters: ["creative"] },
  "scale-winner": { kind: "winner", filters: ["budget"] },
  "shift-budget": { kind: "budget", filters: ["budget"] },
  "widen-audience": { kind: "audience", filters: ["audience"] },
  "audience-fatigue": { kind: "audience", filters: ["audience"] },
  "under-delivering": { kind: "budget", filters: ["budget"] },
  retargeting: { kind: "retargeting", filters: ["audience"] },
  "landing-page": { kind: "website", filters: ["website"] },
  "conversion-drop": { kind: "website", filters: ["website"] },
  "page-problem": { kind: "website", filters: ["website"] },
  "platform-split": { kind: "optimization", filters: ["platform"] },
  "cpa-rising": { kind: "warning", filters: ["budget"] },
  "near-target-cpa": { kind: "warning", filters: ["budget"] },
  "tracking-drop": { kind: "warning", filters: ["website"] },
  "not-spending": { kind: "warning", filters: ["budget"] },
};

function kindForChange(type: string | undefined): { kind: TimelineKind; filters: TimelineFilter[] } {
  switch (type) {
    case "set-budget":
      return { kind: "budget", filters: ["budget"] };
    case "pause-ad":
    case "new-ad-variation":
      return { kind: "creative", filters: ["creative"] };
    case "widen-audience":
      return { kind: "audience", filters: ["audience"] };
    default:
      return { kind: "optimization", filters: [] };
  }
}

async function lifetime(organizationId: string, externalIds: string[]): Promise<PlatformMetrics | null> {
  const adapter = getAdapter("META");
  if (!adapter || externalIds.length === 0) return null;
  const r = await adapter.getCampaignPerformance({ organizationId, externalCampaignIds: externalIds });
  if (!r.ok || r.data.length === 0) return null;
  return r.data[0].metrics;
}

export async function campaignJourney(organizationId: string, mairoCampaignId: string, now = new Date()): Promise<CampaignJourney | null> {
  const c = await db.mairoCampaign.findFirst({
    where: { id: mairoCampaignId, organizationId },
    include: { platformCampaigns: true, ads: { orderBy: { position: "asc" } } },
  });
  if (!c) return null;

  const liveSince = c.startDate && c.startDate > c.createdAt ? c.startDate : c.createdAt;
  const dayOf = (at: Date) => Math.max(1, Math.floor((at.getTime() - liveSince.getTime()) / DAY) + 1);
  const events: TimelineEvent[] = [];
  const push = (e: Omit<TimelineEvent, "day" | "at"> & { at: Date }) => events.push({ ...e, at: e.at.toISOString(), day: dayOf(e.at) });

  const [decisions, activity, insights, protection, optimizer, metrics] = await Promise.all([
    db.mairoDecision.findMany({ where: { organizationId, mairoCampaignId }, orderBy: { createdAt: "asc" } }),
    db.mairoActivity.findMany({ where: { organizationId, mairoCampaignId }, orderBy: { createdAt: "asc" } }),
    db.mairoInsight.findMany({ where: { organizationId, mairoCampaignId, decisionDedupeKey: null }, orderBy: { firstSeenAt: "asc" } }),
    db.protectionEvent.findMany({ where: { organizationId, mairoCampaignId }, orderBy: { createdAt: "asc" } }),
    campaignActions(mairoCampaignId, 30),
    c.status === "DRAFT" ? Promise.resolve(null) : lifetime(organizationId, c.platformCampaigns.map((p) => p.externalCampaignId).filter((x): x is string => Boolean(x))).catch(() => null),
  ]);

  const launched = c.platformCampaigns.some((p) => p.externalCampaignId);
  push({
    id: `launch:${c.id}`,
    at: liveSince,
    kind: "launch",
    filters: [],
    title: launched ? "Campaign launched" : "Campaign created",
    body: `${usd(c.totalDailyBudgetCents)}/day on Facebook & Instagram, aiming for ${GOAL[c.objective]?.toLowerCase() ?? c.objective}.`,
    details: [
      { label: "Budget", value: `${usd(c.totalDailyBudgetCents)}/day` },
      { label: "Platform", value: "Meta" },
      { label: "Goal", value: GOAL[c.objective] ?? c.objective },
      ...(c.geoLabel ? [{ label: "Where", value: `${c.geoLabel}${c.geoRadius ? `, ${c.geoRadius} mi` : ""}` }] : []),
      { label: "Ages", value: `${c.ageMin}–${c.ageMax}` },
    ],
    ai: false,
  });

  if (launched && now.getTime() - liveSince.getTime() >= DAY) {
    push({
      id: `data:${c.id}`,
      at: new Date(liveSince.getTime() + DAY),
      kind: "data",
      filters: [],
      title: "Data collection",
      body: `MAIRO gathers early performance signals for the first ${LEARNING_DAYS} days and recommends no changes — Meta is still learning who responds.`,
      details: [{ label: "Learning period", value: `${LEARNING_DAYS} days and $20 spent` }],
      ai: true,
    });
  }

  // Ads added after launch are new creatives.
  for (const a of c.ads.filter((x) => x.createdAt.getTime() - c.createdAt.getTime() > 60 * 60 * 1000)) {
    push({
      id: `ad:${a.id}`,
      at: a.createdAt,
      kind: "creative",
      filters: ["creative"],
      title: "New creative launched",
      body: `Creative #${a.position + 1} was added to the campaign${a.headline ? `: “${a.headline}”` : ""}.`,
      details: [{ label: "Kind", value: a.kind.toLowerCase() }],
      ai: false,
    });
  }

  for (const d of decisions) {
    const first = parseChanges(d.changesJson)[0];
    const k = kindForChange(first?.type);
    const byCategory: Partial<Record<string, TimelineKind>> = { CREATIVE: "creative", TESTING: "creative", AUDIENCE: "audience", RETARGETING: "retargeting", BUDGET: "budget", WEBSITE: "website", NEEDS_ATTENTION: "warning" };
    const kind = d.kind === "scale-winner" ? "winner" : (byCategory[d.category] ?? k.kind);
    const filters = [...new Set([...k.filters, ...(d.category === "WEBSITE" ? (["website"] as const) : []), "ai" as const])];
    push({ id: `dec:${d.id}`, at: d.createdAt, kind, filters, title: d.title, body: `${d.noticed} MAIRO recommended: ${d.recommendation}`, details: [{ label: "What MAIRO saw", value: d.noticedAdvanced }], ai: true });
    if (d.decidedAt && (d.status === "REJECTED" || d.status === "IGNORED")) {
      push({ id: `dec-no:${d.id}`, at: d.decidedAt, kind: "optimization", filters: ["ai"], title: "Recommendation declined", body: `You chose not to: ${d.title.toLowerCase()}.`, details: [], ai: false });
    }
  }

  for (const a of activity) {
    const k = kindForChange(a.action.includes("budget") || a.action.includes("Budget") ? "set-budget" : a.action.toLowerCase().includes("audience") ? "widen-audience" : a.action.toLowerCase().includes("ad") ? "new-ad-variation" : undefined);
    push({
      id: `act:${a.id}`,
      at: a.createdAt,
      kind: k.kind,
      filters: [...k.filters, ...(a.automatic ? (["ai"] as const) : [])],
      title: a.action,
      body: a.summary,
      details: [...(a.before ? [{ label: "Before", value: a.before }] : []), ...(a.after ? [{ label: "After", value: a.after }] : []), { label: "Why", value: a.reason }],
      ai: a.automatic,
    });
  }

  for (const i of insights) {
    const k = INSIGHT_KIND[i.type] ?? { kind: "warning" as const, filters: [] };
    push({
      id: `ins:${i.id}`,
      at: i.firstSeenAt,
      kind: k.kind,
      filters: [...k.filters, "ai"],
      title: i.title,
      body: `${i.happened} MAIRO recommendation: ${i.recommendation}`,
      details: [{ label: "What MAIRO saw", value: i.happenedAdvanced }, ...(i.metric && i.currentValue ? [{ label: i.metric, value: `${i.previousValue ? `${i.previousValue} → ` : ""}${i.currentValue}` }] : [])],
      ai: true,
    });
  }

  for (const p of protection) {
    push({
      id: `prot:${p.id}`,
      at: p.createdAt,
      kind: p.action === "PAUSED" ? "warning" : "budget",
      filters: ["budget", ...(p.kind === "PAUSED_BY_YOU" ? [] : (["ai"] as const))],
      title: p.action === "PAUSED" ? "Paused by Spend Protection" : p.action === "RESUMED" ? "Resumed" : "Spend warning",
      body: p.message,
      details: p.amountCents ? [{ label: "Amount", value: usd(p.amountCents) }] : [],
      ai: p.kind !== "PAUSED_BY_YOU",
    });
  }

  for (const o of optimizer) {
    push({ id: `opt:${o.id}`, at: o.at, kind: "budget", filters: ["budget", ...(o.automatic ? (["ai"] as const) : [])], title: o.kind, body: o.rationale, details: [], ai: o.automatic });
  }

  if (metrics && (metrics.spendCents ?? 0) > 0) {
    const results = c.objective === "SALES" ? metrics.purchases : c.objective === "LEADS" ? metrics.conversions : metrics.clicks;
    push({
      id: `review:${c.id}`,
      at: now,
      kind: "review",
      filters: [],
      title: "Campaign review",
      body: `So far: ${usd(metrics.spendCents ?? 0)} spent${metrics.revenueCents ? `, ${usd(metrics.revenueCents)} in tracked sales` : ""}${results !== null ? `, ${results} ${c.objective === "SALES" ? "purchases" : c.objective === "LEADS" ? "leads" : "clicks"}` : ""}.`,
      details: [
        { label: "Spend", value: usd(metrics.spendCents ?? 0) },
        ...(metrics.revenueCents !== null ? [{ label: "Revenue", value: usd(metrics.revenueCents) }] : []),
        ...(metrics.purchases !== null ? [{ label: "Purchases", value: String(metrics.purchases) }] : []),
        ...(metrics.roas !== null ? [{ label: "ROAS", value: `${metrics.roas.toFixed(1)}x` }] : []),
        ...(metrics.ctr !== null ? [{ label: "CTR", value: `${(metrics.ctr * 100).toFixed(2)}%` }] : []),
      ],
      ai: false,
    });
  }

  events.sort((a, b) => a.at.localeCompare(b.at));
  return {
    campaign: { id: c.id, name: c.name, status: c.status, objective: c.objective, dailyBudgetCents: c.totalDailyBudgetCents, liveSince: liveSince.toISOString() },
    events,
  };
}
