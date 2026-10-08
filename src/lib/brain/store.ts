import { db } from "@/lib/db";
import { loadAccountHistory } from "@/lib/meta/account-history";
import { historyBrief, historyPoints, type HistoryPoints } from "@/lib/meta/account-history-rules";
import { brainBrief, loadBrain, saveBrain, type BrainProfile, type BrainRecord, type HistoricalFact } from "@/lib/business/brain";
import { missionGoal, type MetricFamily } from "@/lib/mission/goals";
import { businessCategory, type Category } from "@/lib/social/goals";
import { questionsFor, type KnownBusiness, type ReviewQuestion } from "@/lib/score/questions";
import { BRAIN_FIELDS, type FactMeta, type FactSource } from "./catalog";
import { applyChange, type FactChange } from "./edit";
import { imageBrandDirection } from "./visual";
import {
  GOAL_PRIORITY,
  carefulWording,
  confidenceWords,
  factToVerify,
  hasValue,
  insightMark,
  metaFor,
  promoCode,
  promoState,
  understanding,
  type PromoState,
  type Understanding,
  type Verification,
} from "./rules";

// The MAIRO Business Brain, as the rest of MAIRO reads and writes it.
//
//   BUSINESS BRAIN  what MAIRO knows          ← loadBrainState / brainPrompt
//   MISSION         what the business wants
//   STRATEGY        what MAIRO recommends
//   EXECUTION       ads, creatives, promotions, Scale social
//   RESULTS         what happened
//   LEARNING        what MAIRO discovered     → saved as learnings (engine, reports)
//   BUSINESS BRAIN  updated                   ← changeBrain
//
// Four kinds of knowledge, never mixed up:
//   Current facts    the profile, each with its source and last confirmation
//   Historical facts what used to be true (history), never read as current
//   Temporary        promotions with dates, sold-out items — expire on their own
//   Learned          patterns from results, with confidence and evidence

const DAY = 86_400_000;

export type GoalEntry = { goal: string; label: string; secondary: string | null; from: Date; to: Date | null };
export type TemporaryInfo = { id: string; kind: "promotion" | "unavailable"; text: string; code: string | null; state: PromoState; startsAt: Date | null; endsAt: Date | null };
export type LearnedInsight = {
  id: string;
  statement: string;
  /** "MAIRO has noticed: …", worded as an observation, never a cause. */
  said: string;
  mark: string;
  confidence: string;
  detail: string;
  evidence: { label: string; value: string }[];
  goal: string | null;
  sampleSize: number | null;
  discoveredAt: Date;
  validatedAt: Date;
  active: boolean;
};

export type BrainState = {
  record: BrainRecord;
  profile: BrainProfile;
  meta: (key: string) => FactMeta;
  history: HistoricalFact[];
  goals: { current: GoalEntry | null; history: GoalEntry[] };
  family: MetricFamily | null;
  temporary: TemporaryInfo[];
  learned: LearnedInsight[];
  category: Category;
  questions: ReviewQuestion[];
  verify: Verification | null;
  understanding: Understanding;
  /**
   * What the business ran on its Meta ad account outside MAIRO — or null
   * (not connected, nothing ran, or Meta didn't answer).
   */
  accountHistory: HistoryPoints | null;
};

export function knownOf(p: BrainProfile): KnownBusiness {
  return p as unknown as KnownBusiness;
}

function evidenceOf(raw: string): { label: string; value: string }[] {
  try {
    const v = JSON.parse(raw) as unknown;
    const list = Array.isArray(v) ? v : ((v as { evidence?: unknown[] })?.evidence ?? []);
    return (list as { label?: unknown; value?: unknown }[])
      .filter((x) => typeof x?.label === "string" && (typeof x?.value === "string" || typeof x?.value === "number"))
      .slice(0, 6)
      .map((x) => ({ label: String(x.label), value: String(x.value) }));
  } catch {
    return [];
  }
}

/** Ended promotions stop being current on their own. They stay in history, never as a business fact. */
export async function expirePromotions(organizationId: string, now = new Date()): Promise<number> {
  const ended = await db.missionNote.findMany({ where: { organizationId, kind: { in: ["PROMOTION", "SALE"] }, active: true, endsAt: { lt: now } }, select: { id: true, text: true } });
  if (ended.length === 0) return 0;
  await db.missionNote.updateMany({ where: { id: { in: ended.map((e) => e.id) } }, data: { active: false } });
  await db.brainEvent.createMany({ data: ended.map((e) => ({ organizationId, kind: "note", text: `Promotion ended: ${e.text.slice(0, 160)}`, source: "customer" })) });
  return ended.length;
}

/** Everything MAIRO knows about a business, in one read. */
export async function loadBrainState(organizationId: string, now = new Date()): Promise<BrainState> {
  // Expiring runs alongside the reads rather than before them — the notes
  // read leaves out anything already past its end, so it never shows an
  // ended promotion as current whichever finishes first.
  const [, record, missions, notes, learnings, accountHistory] = await Promise.all([
    expirePromotions(organizationId, now),
    loadBrain(organizationId),
    db.marketingMission.findMany({ where: { organizationId, status: { in: ["ACTIVE", "ARCHIVED"] }, approvedAt: { not: null } }, orderBy: { approvedAt: "asc" }, select: { primaryGoal: true, secondaryGoal: true, approvedAt: true, status: true } }),
    db.missionNote.findMany({ where: { organizationId, active: true, kind: { in: ["PROMOTION", "SALE", "UNAVAILABLE"] }, OR: [{ kind: "UNAVAILABLE" }, { endsAt: null }, { endsAt: { gte: now } }] }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.mairoLearning.findMany({ where: { organizationId }, orderBy: [{ active: "desc" }, { lastSeenAt: "desc" }], take: 30 }),
    // Campaigns run outside MAIRO. Never allowed to hold up or break the
    // Brain: no answer from Meta is simply no history.
    loadAccountHistory(organizationId, now)
      .then((h) => (h.ok ? historyPoints(h.campaigns) : null))
      .catch(() => null),
  ]);
  const profile = record.profile;
  const legacy = { edited: record.editedFields, analyzedAt: record.analyzedAt, updatedAt: record.updatedAt };
  const meta = (key: string) => metaFor(key, record.meta, legacy);

  const history: GoalEntry[] = missions.map((m, i) => ({
    goal: m.primaryGoal,
    label: missionGoal(m.primaryGoal).label,
    secondary: m.secondaryGoal ? missionGoal(m.secondaryGoal).label : null,
    from: m.approvedAt!,
    to: missions[i + 1]?.approvedAt ?? null,
  }));
  const active = missions.findLast((m) => m.status === "ACTIVE");
  const current = active ? history.find((h) => h.from.getTime() === active.approvedAt!.getTime()) ?? null : null;
  const family = active ? missionGoal(active.primaryGoal).metrics : null;

  const temporary: TemporaryInfo[] = notes.map((n) => ({
    id: n.id,
    kind: n.kind === "UNAVAILABLE" ? "unavailable" : "promotion",
    text: n.text,
    code: promoCode(n.text),
    state: n.kind === "UNAVAILABLE" ? "active" : promoState(n.startsAt, n.endsAt, now),
    startsAt: n.startsAt,
    endsAt: n.endsAt,
  }));

  const learned: LearnedInsight[] = learnings.map((l) => ({
    id: l.id,
    statement: l.statement,
    said: `${confidenceWords(l.confidence)}: ${carefulWording(l.statement.charAt(0).toLowerCase() + l.statement.slice(1))}`,
    mark: insightMark(l.confidence),
    confidence: l.confidence,
    detail: carefulWording(l.detail),
    evidence: evidenceOf(l.evidenceJson),
    goal: l.goal,
    sampleSize: l.sampleSize,
    discoveredAt: l.firstLearnedAt,
    validatedAt: l.lastSeenAt,
    active: l.active,
  }));

  const category = businessCategory(`${profile.industry} ${profile.overview}`);
  const prefer = family ? GOAL_PRIORITY[family] : undefined;
  const all = questionsFor({ areas: ["setup", "offer", "hook", "audience", "creative", "landing"], category, goal: null, known: knownOf(profile), context: { promotion: "", promotionEnds: "", urgency: "", answers: {}, kept: [] }, limit: 12, prefer });
  const questions = all.filter((q) => q.scope === "business" && q.mode === "ask").slice(0, 3);
  const active_ = learned.filter((l) => l.active);

  return {
    record,
    profile,
    meta,
    history: record.history,
    goals: { current, history: history.slice().reverse() },
    family,
    temporary,
    learned,
    category,
    questions,
    verify: factToVerify(profile as unknown as Record<string, unknown>, meta, now),
    understanding: understanding(profile as unknown as Record<string, unknown>, active_, questions.length),
    accountHistory,
  };
}

/**
 * The Business Brain for an AI prompt: current facts, the goal, what's
 * temporary (with its end), what's unavailable, what used to be true, and
 * what MAIRO has learned — worded as observations with confidence. Every
 * feature that writes or plans reads this one block, so none of them starts
 * from zero and none keeps its own memory.
 */
export function brainPrompt(s: BrainState): string {
  const lines: string[] = [brainBrief(s.profile)];
  const inferred = BRAIN_FIELDS.filter((d) => hasValue((s.profile as unknown as Record<string, unknown>)[d.key]) && s.meta(d.key).status === "inferred").map((d) => d.label);
  if (inferred.length) lines.push(`Inferred (from the website or results, not yet confirmed by the business — use carefully): ${inferred.join(", ")}.`);
  if (s.goals.current) lines.push(`Current goal: ${s.goals.current.label}${s.goals.current.secondary ? ` (also: ${s.goals.current.secondary})` : ""}, since ${s.goals.current.from.toISOString().slice(0, 10)}.`);
  const promos = s.temporary.filter((t) => t.kind === "promotion" && t.state !== "ended");
  if (promos.length) lines.push("Temporary — true only until it ends, never a permanent fact:", ...promos.map((p) => `- ${p.text}${p.code ? ` (code ${p.code})` : ""}${p.endsAt ? `, ends ${p.endsAt.toISOString().slice(0, 10)}` : ""}${p.state === "scheduled" ? " (scheduled)" : ""}`));
  const sold = s.temporary.filter((t) => t.kind === "unavailable");
  const soldProducts = s.profile.products.filter((p) => p.status === "unavailable").map((p) => p.name);
  if (sold.length || soldProducts.length) lines.push(`Unavailable right now — never promote: ${[...soldProducts, ...sold.map((x) => x.text)].join("; ")}.`);
  if (s.history.length) lines.push("Used to be true (history — not current):", ...s.history.slice(-5).map((h) => `- ${h.text}`));
  const learned = s.learned.filter((l) => l.active && l.confidence !== "EARLY").slice(0, 8);
  if (learned.length) lines.push("What MAIRO has learned from this business's own results (observations, not causes — say “has generated” or “has seen”, never “caused”):", ...learned.map((l) => `- ${l.said}${l.sampleSize ? ` (based on ${l.sampleSize} compared)` : ""}`));
  const early = s.learned.filter((l) => l.active && l.confidence === "EARLY").length;
  if (early) lines.push(`MAIRO is still learning ${early} other pattern${early === 1 ? "" : "s"} from too little data to rely on.`);
  const past = historyBrief(s.accountHistory);
  if (past) lines.push(past);
  return lines.join("\n");
}

export async function brainPromptFor(organizationId: string): Promise<string> {
  return brainPrompt(await loadBrainState(organizationId));
}

/** The Business Brain's visual brief for an image (Creative Studio), or null when MAIRO knows nothing visual yet. */
export async function brainImageDirectionFor(organizationId: string): Promise<string | null> {
  const { profile } = await loadBrain(organizationId);
  return imageBrandDirection(profile);
}

export type ChangeOutcome = { ok: true; changed: boolean; text: string } | { ok: false; error: string };

/**
 * One change to the Business Brain from anywhere — the page, a Campaign
 * Review answer, the assistant, a website read — saved with its source and a
 * line on the business's timeline.
 */
export async function changeBrain(organizationId: string, change: FactChange, source: FactSource, now = new Date()): Promise<ChangeOutcome> {
  const record = await loadBrain(organizationId);
  const legacy = { edited: record.editedFields, analyzedAt: record.analyzedAt, updatedAt: record.updatedAt };
  const resolved: Record<string, FactMeta> = {};
  for (const d of BRAIN_FIELDS) if (hasValue((record.profile as unknown as Record<string, unknown>)[d.key])) resolved[d.key] = metaFor(d.key, record.meta, legacy);
  const result = applyChange({ profile: record.profile as unknown as Parameters<typeof applyChange>[0]["profile"], meta: { ...resolved, ...record.meta }, history: record.history }, change, source, now);
  if (result.refused) return { ok: false, error: result.refused };
  if (!result.changed) return { ok: true, changed: false, text: result.text };
  const confirmedFields = Object.entries(result.state.meta).filter(([, m]) => m.status === "confirmed").map(([k]) => k);
  await saveBrain(organizationId, {
    profile: result.state.profile as unknown as BrainProfile,
    // Fields the business confirmed are never overwritten by a website re-read.
    editedFields: [...new Set([...record.editedFields, ...confirmedFields])],
    meta: result.state.meta,
    history: result.state.history,
  });
  const field = change.op === "product" || change.op === "remove-product" ? "products" : change.field;
  const kind = change.op === "remove" || change.op === "remove-product" ? "removed" : change.op === "confirm" ? "confirmed" : change.op === "product" ? "product" : source === "customer" || source === "assistant" ? "corrected" : "learned";
  await db.brainEvent.create({ data: { organizationId, kind, text: result.text, field, source } });
  return { ok: true, changed: true, text: result.text };
}

export type TimelineItem = { at: Date; text: string; kind: string };

/** The business's history: goals, promotions, what MAIRO learned and what changed — newest first. */
export async function brainTimeline(organizationId: string, limit = 30): Promise<TimelineItem[]> {
  const [events, missions, notes, learnings, brain] = await Promise.all([
    db.brainEvent.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: limit }),
    db.marketingMission.findMany({ where: { organizationId, approvedAt: { not: null } }, select: { primaryGoal: true, approvedAt: true } }),
    db.missionNote.findMany({ where: { organizationId, kind: { in: ["PROMOTION", "SALE"] } }, orderBy: { createdAt: "desc" }, take: 10, select: { text: true, startsAt: true, createdAt: true } }),
    db.mairoLearning.findMany({ where: { organizationId, confidence: { in: ["MEDIUM", "HIGH"] } }, orderBy: { firstLearnedAt: "desc" }, take: 10, select: { statement: true, firstLearnedAt: true } }),
    db.businessBrain.findUnique({ where: { organizationId }, select: { analyzedAt: true } }),
  ]);
  const items: TimelineItem[] = [
    ...events.map((e) => ({ at: e.createdAt, text: e.text, kind: e.kind })),
    ...missions.map((m) => ({ at: m.approvedAt!, text: `Goal changed to ${missionGoal(m.primaryGoal).label}.`, kind: "goal" })),
    ...notes.map((n) => ({ at: n.startsAt ?? n.createdAt, text: `Promotion: ${n.text.slice(0, 120)}`, kind: "promotion" })),
    ...learnings.map((l) => ({ at: l.firstLearnedAt, text: `MAIRO learned: ${carefulWording(l.statement)}`, kind: "learned" })),
    ...(brain?.analyzedAt ? [{ at: brain.analyzedAt, text: "MAIRO read your website.", kind: "website" }] : []),
  ];
  // Promotion-ended events duplicate nothing above; everything else is unique by source.
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** For the Overview card: how many useful things MAIRO has learned, and the latest. */
export async function brainHeadline(organizationId: string): Promise<{ learnedCount: number; latest: string | null; questions: number }> {
  const s = await loadBrainState(organizationId);
  const facts = BRAIN_FIELDS.filter((d) => hasValue((s.profile as unknown as Record<string, unknown>)[d.key])).length + (s.profile.products.length ? 1 : 0);
  const strong = s.learned.filter((l) => l.active && l.confidence !== "EARLY");
  return { learnedCount: facts + strong.length, latest: strong[0]?.said ?? null, questions: s.questions.length };
}

export { DAY as BRAIN_DAY };
