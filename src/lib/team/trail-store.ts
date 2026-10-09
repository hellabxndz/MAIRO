import { db } from "@/lib/db";
import { parseChanges } from "@/lib/decisions/store";
import { buildTrail, type TrailDecision, type TrailRun, type TrailStep } from "./trail";

// Reading the records a recommendation's trail is built from — all scoped to
// one organization: the decisions, the steps of the reviews that produced
// them, and the runs recorded against them.

const DAY = 86_400_000;

export type DecisionTrail = { decisionId: string; title: string; status: string; createdAt: Date; mairoCampaignId: string | null; steps: TrailStep[] };

const parseResult = (json: string | null): TrailDecision["result"] => {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as { label: string; ok: boolean; error: string | null }[]) : null;
  } catch {
    return null;
  }
};

async function trailsFor(organizationId: string, rows: Awaited<ReturnType<typeof db.mairoDecision.findMany>>): Promise<DecisionTrail[]> {
  if (!rows.length) return [];
  const reviewIds = [...new Set(rows.map((r) => r.reviewRunId).filter((x): x is string => Boolean(x)))];
  const select = { id: true, agent: true, task: true, status: true, summary: true, detail: true, decisionId: true, startedAt: true, finishedAt: true, parentId: true } as const;
  const [steps, linked] = await Promise.all([
    reviewIds.length ? db.agentRun.findMany({ where: { organizationId, parentId: { in: reviewIds } }, select, orderBy: { startedAt: "asc" } }) : Promise.resolve([]),
    db.agentRun.findMany({ where: { organizationId, decisionId: { in: rows.map((r) => r.id) } }, select, orderBy: { startedAt: "asc" } }),
  ]);
  return rows.map((r) => {
    const reviewSteps: TrailRun[] = r.reviewRunId ? steps.filter((s) => s.parentId === r.reviewRunId) : [];
    const decisionRuns: TrailRun[] = linked.filter((s) => s.decisionId === r.id && s.parentId !== r.reviewRunId);
    const decision: TrailDecision = {
      id: r.id,
      kind: r.kind,
      category: r.category,
      title: r.title,
      status: r.status,
      automatic: r.automatic,
      source: r.source,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      changes: parseChanges(r.changesJson),
      result: parseResult(r.resultJson),
      verdict: r.verdict,
      verdictNote: r.verdictNote,
      verdictAt: r.verdictAt,
    };
    return { decisionId: r.id, title: r.title, status: r.status, createdAt: r.createdAt, mairoCampaignId: r.mairoCampaignId, steps: buildTrail(decision, reviewSteps, decisionRuns) };
  });
}

/** The trails of these recommendations, by id. Ids from another organization are ignored. */
export async function loadTrails(organizationId: string, decisionIds: string[]): Promise<Map<string, DecisionTrail>> {
  if (!decisionIds.length) return new Map();
  const rows = await db.mairoDecision.findMany({ where: { organizationId, id: { in: decisionIds } } });
  return new Map((await trailsFor(organizationId, rows)).map((t) => [t.decisionId, t]));
}

/** The latest recommendations the team worked on — waiting, or decided in the last two weeks. */
export async function recentTrails(organizationId: string, opts: { now?: Date; limit?: number } = {}): Promise<DecisionTrail[]> {
  const now = opts.now ?? new Date();
  const rows = await db.mairoDecision.findMany({
    where: { organizationId, OR: [{ status: "PENDING" }, { status: { in: ["APPLIED", "FAILED", "REJECTED"] }, decidedAt: { gte: new Date(now.getTime() - 14 * DAY) } }] },
    orderBy: [{ updatedAt: "desc" }],
    take: opts.limit ?? 3,
  });
  return trailsFor(organizationId, rows);
}
