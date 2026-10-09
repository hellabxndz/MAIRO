import { db } from "@/lib/db";
import type { CoachFinding } from "@/generated/prisma/client";
import type { Explanation, Finding, Measure, PlanStep } from "./types";

// Findings as the business sees them, kept across reviews: a situation seen
// again updates its row (the business's progress on its plan is kept), one
// no longer seen is marked resolved, and one the business dismissed stays
// dismissed. Every read and write is scoped to one organization.

const ACTIVE = ["OPEN", "APPROVED"] as const;

const parse = <T,>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

/** Keep the business's progress: a step it marked done stays done. */
export function mergeSteps(next: PlanStep[], previous: PlanStep[]): PlanStep[] {
  const was = new Map(previous.map((s) => [s.id, s.status]));
  return next.map((s) => ({ ...s, status: was.get(s.id) ?? s.status }));
}

function content(f: Finding) {
  return {
    mairoCampaignId: f.mairoCampaignId,
    campaignName: f.campaignName,
    category: f.category,
    severity: f.severity,
    confidence: f.confidence,
    priority: f.priority,
    title: f.title,
    plain: f.plain,
    noticed: f.noticed,
    explanationsJson: JSON.stringify(f.explanations),
    recommendation: f.recommendation,
    alternativesJson: JSON.stringify(f.alternatives),
    evidenceJson: JSON.stringify(f.evidence),
    limitations: f.limitations,
    missingJson: JSON.stringify(f.missing),
    agentsJson: JSON.stringify(f.agents),
  };
}

/**
 * Saves a review's findings. `complete` says the review read everything it
 * needed; only then is an open finding that wasn't seen again marked
 * resolved — a review that couldn't read Meta mustn't close anything.
 */
export async function persistFindings(organizationId: string, findings: Finding[], opts: { now: Date; complete: boolean }): Promise<{ created: { id: string; finding: Finding }[]; ids: Map<string, string> }> {
  const active = await db.coachFinding.findMany({ where: { organizationId, status: { in: [...ACTIVE] } } });
  const byKey = new Map(active.map((a) => [a.key, a]));
  const created: { id: string; finding: Finding }[] = [];
  const ids = new Map<string, string>();
  for (const f of findings) {
    const existing = byKey.get(f.key);
    if (existing) {
      const steps = mergeSteps(f.steps, parse<PlanStep[]>(existing.stepsJson, []));
      await db.coachFinding.update({
        where: { id: existing.id },
        data: {
          ...content(f),
          stepsJson: JSON.stringify(steps),
          // The figure an approved plan is judged against stays the one it was approved on.
          ...(existing.status === "APPROVED" ? {} : { measureJson: f.measure ? JSON.stringify(f.measure) : null }),
          lastSeenAt: opts.now,
        },
      });
      ids.set(f.key, existing.id);
      byKey.delete(f.key);
    } else {
      const row = await db.coachFinding.create({
        data: { organizationId, key: f.key, ...content(f), stepsJson: JSON.stringify(f.steps), measureJson: f.measure ? JSON.stringify(f.measure) : null, firstSeenAt: opts.now, lastSeenAt: opts.now },
        select: { id: true },
      });
      created.push({ id: row.id, finding: f });
      ids.set(f.key, row.id);
    }
  }
  if (opts.complete) {
    const gone = [...byKey.values()].filter((a) => a.status === "OPEN");
    if (gone.length) {
      await db.coachFinding.updateMany({
        where: { organizationId, id: { in: gone.map((g) => g.id) }, status: "OPEN" },
        data: { status: "RESOLVED", resolvedAt: opts.now, verdictNote: `No longer seen in the review on ${opts.now.toDateString()}.` },
      });
    }
  }
  return { created, ids };
}

export type FindingView = {
  id: string;
  key: string;
  category: CoachFinding["category"];
  severity: string;
  confidence: CoachFinding["confidence"];
  priority: number;
  status: CoachFinding["status"];
  mairoCampaignId: string | null;
  campaignName: string | null;
  title: string;
  plain: string;
  noticed: string;
  explanations: Explanation[];
  recommendation: string;
  /** The recommendation currently shown, after "another recommendation". */
  shownRecommendation: string;
  hasAnother: boolean;
  evidence: { label: string; value: string }[];
  limitations: string;
  missing: string[];
  steps: PlanStep[];
  agents: string[];
  measure: Measure | null;
  decisionId: string | null;
  decisionStatus: string | null;
  feedback: string | null;
  verdict: string | null;
  verdictNote: string | null;
  checkAfter: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  decidedAt: Date | null;
  resolvedAt: Date | null;
};

export function toView(f: CoachFinding, decisionStatus: string | null = null): FindingView {
  const alternatives = parse<string[]>(f.alternativesJson, []);
  const options = [f.recommendation, ...alternatives];
  return {
    id: f.id,
    key: f.key,
    category: f.category,
    severity: f.severity,
    confidence: f.confidence,
    priority: f.priority,
    status: f.status,
    mairoCampaignId: f.mairoCampaignId,
    campaignName: f.campaignName,
    title: f.title,
    plain: f.plain,
    noticed: f.noticed,
    explanations: parse<Explanation[]>(f.explanationsJson, []),
    recommendation: f.recommendation,
    shownRecommendation: options[f.alternativeIndex % options.length],
    hasAnother: options.length > 1,
    evidence: parse(f.evidenceJson, []),
    limitations: f.limitations,
    missing: parse<string[]>(f.missingJson, []),
    steps: parse<PlanStep[]>(f.stepsJson, []),
    agents: parse<string[]>(f.agentsJson, []),
    measure: parse<Measure | null>(f.measureJson, null),
    decisionId: f.decisionId,
    decisionStatus,
    feedback: f.feedback,
    verdict: f.verdict,
    verdictNote: f.verdictNote,
    checkAfter: f.checkAfter,
    firstSeenAt: f.firstSeenAt,
    lastSeenAt: f.lastSeenAt,
    decidedAt: f.decidedAt,
    resolvedAt: f.resolvedAt,
  };
}

const SEVERITY_ORDER: Record<string, number> = { ATTENTION: 0, OPPORTUNITY: 1, WATCH: 2 };

/** What the Coach page shows: active findings first, then what was tried and what followed. */
export async function loadFindings(organizationId: string, now = new Date()) {
  const [rows, lastRun] = await Promise.all([
    db.coachFinding.findMany({
      where: { organizationId, OR: [{ status: { in: [...ACTIVE] } }, { updatedAt: { gte: new Date(now.getTime() - 90 * 86_400_000) } }] },
      orderBy: { lastSeenAt: "desc" },
      take: 100,
    }),
    db.agentRun.findFirst({ where: { organizationId, task: { in: ["coach-review", "coach-funnel"] }, status: { in: ["DONE", "NOTHING"] } }, orderBy: { startedAt: "desc" }, select: { finishedAt: true, startedAt: true } }),
  ]);
  const decisionIds = rows.map((r) => r.decisionId).filter((x): x is string => Boolean(x));
  const decisions = decisionIds.length ? await db.mairoDecision.findMany({ where: { organizationId, id: { in: decisionIds } }, select: { id: true, status: true } }) : [];
  const statusOf = new Map(decisions.map((d) => [d.id, d.status]));
  const views = rows.map((r) => toView(r, r.decisionId ? (statusOf.get(r.decisionId) ?? null) : null));
  const order = new Map(rows.map((r) => [r.id, r.priority]));
  // Severity, then the investigation's own ranking, then age — a stable order,
  // so a card doesn't jump when the business acts on it.
  const active = views
    .filter((v) => v.status === "OPEN" || v.status === "APPROVED")
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) || (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0) || a.firstSeenAt.getTime() - b.firstSeenAt.getTime() || a.id.localeCompare(b.id));
  const past = views.filter((v) => v.status === "RESOLVED" || v.status === "DISMISSED");
  return { active, past, lastReviewedAt: lastRun ? (lastRun.finishedAt ?? lastRun.startedAt) : null };
}

/** Changes carried out on Meta lately, with what followed them once it could be measured. */
export async function loadChangeHistory(organizationId: string, now = new Date()) {
  return db.mairoDecision.findMany({
    where: { organizationId, status: "APPLIED", decidedAt: { gte: new Date(now.getTime() - 120 * 86_400_000) } },
    orderBy: { decidedAt: "desc" },
    take: 20,
    select: { id: true, title: true, kind: true, decidedAt: true, automatic: true, verdict: true, verdictNote: true, verdictAt: true, findingId: true },
  });
}
