import { db } from "@/lib/db";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import type { DecisionDraft, DecisionInput } from "@/lib/decisions/types";
import { missionGoal, readRequest, type MetricFamily, type MissionGoal, type Understood } from "@/lib/mission/goals";
import type { BusinessFacts } from "@/lib/mission/planner";
import { ALIGNED_AD_GOALS, engineDrafts, type EngineContext } from "./recommend";
import { engineInsights, type MeasuredInsight } from "./learning";
import { buildStrategy, engineConfidence, structureObjective, type Confidence, type EngineInsight, type EngineStrategy, type StrategyInput } from "./core";

// The Strategy Engine, wired to the business's data. Everything that plans,
// writes or recommends marketing asks here: the mission planner (the whole
// strategy), Create (budget, CTA, messaging), the creative tools and Social
// Manager (the brief each piece carries), and the daily decisions (moves
// toward the goal, from what the account's own results have shown).
//
// The rules live in core.ts, learning.ts and recommend.ts, all pure.

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

type Promotion = { id: string; title: string; start: string; end: string | null; discount: string | null };

function details(json: string): Record<string, string | null | undefined> {
  try {
    return JSON.parse(json) as Record<string, string | null | undefined>;
  } catch {
    return {};
  }
}

/** Promotions running now or coming up, and how many there have been lately. */
export async function enginePromotions(organizationId: string, today: string): Promise<{ current: Promotion[]; last30Days: number }> {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * DAY);
  const [notes, social] = await Promise.all([
    db.missionNote.findMany({ where: { organizationId, kind: "PROMOTION", OR: [{ active: true }, { createdAt: { gte: since } }] }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.socialPromotion.findMany({ where: { organizationId, kind: "SALE", OR: [{ status: "ACTIVE" }, { createdAt: { gte: since } }] }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const all: (Promotion & { active: boolean; createdAt: Date })[] = [
    ...notes.map((n) => {
      const d = details(n.detailsJson);
      return { id: n.id, title: d.item ? `${d.discount ?? "Offer"} on ${d.item}` : d.discount ?? n.text.slice(0, 60), start: n.startsAt ? iso(n.startsAt) : iso(n.createdAt), end: n.endsAt ? iso(n.endsAt) : null, discount: d.discount ?? null, active: n.active, createdAt: n.createdAt };
    }),
    ...social.map((p) => {
      const d = details(p.detailsJson);
      return { id: p.id, title: p.title, start: p.startsAt ? iso(p.startsAt) : iso(p.createdAt), end: p.endsAt ? iso(p.endsAt) : null, discount: d.discount ?? null, active: p.status === "ACTIVE", createdAt: p.createdAt };
    }),
  ];
  // The same promotion told to MAIRO and planned by Social Manager counts once.
  const recent = new Set(all.filter((p) => p.createdAt >= since).map((p) => p.start));
  const seen = new Set<string>();
  const current = all
    .filter((p) => p.active && (!p.end || p.end >= today))
    .filter((p) => (seen.has(p.start) ? false : (seen.add(p.start), true)))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(({ id, title, start, end, discount }) => ({ id, title, start, end, discount }));
  return { current, last30Days: recent.size };
}

/** What the engine has learned and kept, as the strategy reads it. */
export async function savedInsights(organizationId: string): Promise<EngineInsight[]> {
  const rows = await db.mairoLearning.findMany({
    where: { organizationId, active: true, key: { startsWith: "engine:" }, confidence: { in: ["HIGH", "MEDIUM"] } },
    orderBy: [{ confidence: "asc" }, { lastSeenAt: "desc" }],
    take: 10,
  });
  return rows.map((r) => {
    let saved: Partial<EngineInsight> = {};
    try {
      saved = (JSON.parse(r.evidenceJson) as { insight?: Partial<EngineInsight> }).insight ?? {};
    } catch {
      // Older rows read from the key and statement alone.
    }
    const [, attribute = "format"] = r.key.split(":");
    return {
      attribute: attribute as EngineInsight["attribute"],
      winner: saved.winner ?? "",
      loser: saved.loser ?? "",
      metric: saved.metric ?? "",
      improvement: saved.improvement ?? 0,
      confidence: r.confidence === "HIGH" ? "HIGH" : "MEDIUM",
      statement: r.statement,
      adjustment: r.detail,
    };
  });
}

/**
 * Keeps what the account's results showed. Seen again, a lesson grows more
 * confident (high after three sightings); a new winner for the same thing
 * retires the old one rather than both standing.
 */
export async function saveInsights(organizationId: string, items: MeasuredInsight[], now = new Date()): Promise<void> {
  for (const i of items) {
    const { evidence, key, ...insight } = i;
    const existing = await db.mairoLearning.findUnique({ where: { organizationId_key: { organizationId, key } } });
    const evidenceJson = JSON.stringify({ evidence, insight });
    if (existing) {
      const timesSeen = existing.timesSeen + 1;
      await db.mairoLearning.update({
        where: { id: existing.id },
        data: { statement: i.statement, detail: i.adjustment, evidenceJson, timesSeen, lastSeenAt: now, confidence: i.confidence === "HIGH" || timesSeen >= 3 ? "HIGH" : "MEDIUM" },
      });
    } else {
      await db.mairoLearning.create({ data: { organizationId, key, category: "Strategy Engine", statement: i.statement, detail: i.adjustment, evidenceJson, confidence: i.confidence } });
    }
    await db.mairoLearning.updateMany({
      where: { organizationId, key: { startsWith: `engine:${i.attribute}:`, not: key }, confidence: { not: "EARLY" } },
      data: { confidence: "EARLY" },
    });
  }
}

export function resultsOf(family: MetricFamily, t: { purchases?: number | null; leads?: number | null; bookings?: number | null; contacts?: number | null; conversions?: number | null; landingPageViews?: number | null; clicks?: number | null } | null | undefined): number {
  if (!t) return 0;
  switch (family) {
    case "sales":
      return t.purchases ?? t.conversions ?? 0;
    case "leads":
      return t.leads ?? t.conversions ?? 0;
    case "bookings":
      return t.bookings ?? t.leads ?? t.conversions ?? 0;
    case "calls":
      return t.contacts ?? t.conversions ?? 0;
    case "traffic":
      return t.landingPageViews ?? t.clicks ?? 0;
    default:
      return t.clicks ?? 0;
  }
}

export type StrategyRequest = {
  goal?: MissionGoal | null;
  secondary?: MissionGoal | null;
  request?: string;
  understood?: Understood | null;
  launch?: { item: string | null; price: string | null; date: string | null; endDate: string | null; discount: string | null } | null;
  today: string;
};

/** The full strategy for a business and what it asked for. */
export async function runStrategyEngine(organizationId: string, facts: BusinessFacts, req: StrategyRequest): Promise<EngineStrategy> {
  const request = req.request ?? "";
  const base = req.understood ?? (request ? readRequest(request, req.today) : null);
  const understood: Understood = {
    intent: base?.intent ?? "goal",
    goal: req.goal ?? base?.goal ?? null,
    item: req.launch?.item ?? base?.item ?? null,
    price: req.launch?.price ?? base?.price ?? null,
    date: req.launch?.date ?? base?.date ?? null,
    endDate: req.launch?.endDate ?? base?.endDate ?? null,
    discount: req.launch?.discount ?? base?.discount ?? null,
  };
  const objective = structureObjective({
    understood,
    request,
    chosenGoal: req.goal ?? null,
    secondaryGoal: req.secondary ?? null,
    business: { industry: facts.industry, text: `${facts.name} ${facts.brief}`.slice(0, 2000), hasPricedProducts: facts.products.some((p) => Boolean(p.price)) },
  });

  const since = new Date(Date.parse(`${req.today}T00:00:00Z`) - 30 * DAY);
  const [running, promos, insights, perf, promoCreative] = await Promise.all([
    db.mairoCampaign.aggregate({ where: { organizationId, status: "ACTIVE" }, _sum: { totalDailyBudgetCents: true }, _count: { _all: true } }),
    enginePromotions(organizationId, req.today),
    savedInsights(organizationId),
    facts.metaConnected ? fetchOrganizationPerformance(organizationId, { since, until: new Date() }).catch(() => null) : Promise.resolve(null),
    db.creativeRequest.count({ where: { organizationId, marketingObjective: "Promotion", createdAt: { gte: since } } }),
  ]);
  // A promotion in what they just told MAIRO counts, even before it's saved.
  const asked = objective.primaryGoal === "PROMOTE_SALE" && (understood.date || understood.discount)
    ? { start: understood.date ?? req.today, end: understood.endDate, discount: understood.discount }
    : null;
  const promotion = asked ?? (promos.current[0] ? { start: promos.current[0].start, end: promos.current[0].end, discount: promos.current[0].discount } : null);

  const input: StrategyInput = {
    objective,
    business: { name: facts.name, offers: facts.offers, pixelActive: facts.pixelActive, hasVideo: facts.media.videos > 0, scale: facts.scale, location: facts.location },
    marketing: {
      monthlyBudgetCents: facts.monthlyBudget ? facts.monthlyBudget * 100 : null,
      currentDailyCents: running._sum.totalDailyBudgetCents ?? 0,
      campaignsRunning: running._count._all,
      promotion,
      promotionsLast30Days: promos.last30Days,
      hasPromoCreative: promoCreative > 0,
    },
    data: { spendCents: perf?.total?.spendCents ?? 0, results: resultsOf(objective.family, perf?.total) },
    insights,
    today: req.today,
  };
  return buildStrategy(input);
}

/**
 * The daily part: learn from the snapshot the decision rules just read, keep
 * what clears the thresholds, and recommend moves toward the active goal.
 * No mission, no goal — and so no strategy recommendations.
 */
export async function runEngineDecisions(organizationId: string, input: DecisionInput, today: string): Promise<DecisionDraft[]> {
  const mission = await db.marketingMission.findFirst({ where: { organizationId, status: "ACTIVE" }, select: { primaryGoal: true } });
  const family = mission ? missionGoal(mission.primaryGoal).metrics : null;
  const measured = engineInsights(input.campaigns, family ? ALIGNED_AD_GOALS[family][0] : null);
  if (measured.length) await saveInsights(organizationId, measured, input.now);
  if (!mission || !family) return [];
  const [insights, promos] = await Promise.all([savedInsights(organizationId), enginePromotions(organizationId, today)]);
  const ctx: EngineContext = {
    family,
    goalLabel: missionGoal(mission.primaryGoal).label,
    insights,
    promotions: promos.current.map((p) => ({ id: p.id, title: p.title, end: p.end })),
    promotionsLast30Days: promos.last30Days,
    today,
  };
  return engineDrafts(input, ctx);
}

/**
 * How sure MAIRO is in the current strategy, from the results so far and
 * what it has learned. Words for the customer; the level stays internal.
 */
export async function missionConfidence(
  organizationId: string,
  family: MetricFamily,
  figures: ({ spendCents?: number | null } & NonNullable<Parameters<typeof resultsOf>[1]>) | null,
): Promise<Confidence> {
  const insights = await savedInsights(organizationId);
  return engineConfidence({
    spendCents: figures?.spendCents ?? 0,
    results: resultsOf(family, figures),
    strongInsights: insights.filter((i) => i.confidence === "HIGH").length,
    anyInsights: insights.length,
  });
}

/** The active strategy, for the assistant's prompt. Empty without a mission. */
export async function strategyEngineBrief(organizationId: string): Promise<string> {
  const row = await db.marketingMission.findFirst({ where: { organizationId, status: "ACTIVE" }, select: { planJson: true } });
  let e: EngineStrategy | undefined;
  try {
    e = row ? (JSON.parse(row.planJson) as { engine?: EngineStrategy }).engine : undefined;
  } catch {
    e = undefined;
  }
  if (!e) return "";
  const o = e.objective;
  return [
    "MAIRO's Strategy Engine — the current strategy (recommendations must fit it):",
    `- Objective: ${o.goalLabel}; customers should: ${o.desiredAction}; industry: ${o.industry}; focus: ${o.marketingFocus}.`,
    `- Strategy: ${e.statement} Creative: ${e.creativeDirection.map((c) => c.angle).join(", ")}. Message: ${e.messaging.join("; ")}. CTA: ${e.cta}.`,
    `- Offer: ${e.offer.guidance} Testing: ${e.testingPlan}`,
    `- Budget: ${e.budget.summary} (a recommendation; the owner can change it).`,
    `- Confidence (say it in these words, never as a number): ${e.confidence.customer}`,
  ].join("\n");
}
