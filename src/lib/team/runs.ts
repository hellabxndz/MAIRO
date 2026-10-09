import { db } from "@/lib/db";
import type { AgentRole } from "@/generated/prisma/enums";
import { STUCK_AFTER_MS } from "./status";

// Recording the AI Team's work. Called by the services that do the work, so
// every line on the AI Team screen is something that really ran.
//
// Recording can never break the work: every write here is caught. A run the
// service never got to finish (a crash, a timeout) is left RUNNING and swept
// to FAILED after STUCK_AFTER_MS by the daily cron, so nothing shows as
// "Working" forever.

type RunStart = { organizationId: string; agent: AgentRole; task: string; parentId?: string | null; decisionId?: string | null };
export type RunResult = { status: "DONE" | "NOTHING"; summary: string; detail?: string | null; href?: string | null; decisionId?: string | null };

export async function startRun(r: RunStart): Promise<string | null> {
  try {
    const row = await db.agentRun.create({
      data: { organizationId: r.organizationId, agent: r.agent, task: r.task, parentId: r.parentId ?? null, decisionId: r.decisionId ?? null },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    console.error("Recording an AI Team run failed:", error);
    return null;
  }
}

export async function finishRun(id: string | null, result: RunResult | { status: "FAILED"; summary: string; detail?: string | null }): Promise<void> {
  if (!id) return;
  await db.agentRun
    .update({
      where: { id },
      data: {
        status: result.status,
        summary: result.summary.slice(0, 500),
        detail: result.detail?.slice(0, 4000) ?? null,
        ...("href" in result ? { href: result.href ?? null } : {}),
        ...("decisionId" in result && result.decisionId ? { decisionId: result.decisionId } : {}),
        finishedAt: new Date(),
      },
    })
    .catch((error) => console.error("Recording an AI Team run failed:", error));
}

/** Forgets a run that turned out to have nothing to do (an account with nothing live). */
export async function discardRun(id: string | null): Promise<void> {
  if (!id) return;
  await db.agentRun.delete({ where: { id } }).catch(() => undefined);
}

/** A finished piece of work, recorded in one write. */
export async function recordRun(r: RunStart & RunResult): Promise<void> {
  await db.agentRun
    .create({
      data: {
        organizationId: r.organizationId,
        agent: r.agent,
        task: r.task,
        parentId: r.parentId ?? null,
        decisionId: r.decisionId ?? null,
        status: r.status,
        summary: r.summary.slice(0, 500),
        detail: r.detail?.slice(0, 4000) ?? null,
        href: r.href ?? null,
        finishedAt: new Date(),
      },
    })
    .catch((error) => console.error("Recording an AI Team run failed:", error));
}

/**
 * Runs a piece of work as one specialty's task: recorded as running, then
 * as what it produced, or as failed (and the error passed on unchanged).
 */
export async function agentTask<T>(r: RunStart, work: (runId: string | null) => Promise<T>, describe: (result: T) => RunResult): Promise<T> {
  const id = await startRun(r);
  try {
    const result = await work(id);
    await finishRun(id, describe(result));
    return result;
  } catch (error) {
    await finishRun(id, { status: "FAILED", summary: "Couldn't finish this task. MAIRO will try again.", detail: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/** Runs that never finished are failed, not "working" forever. For the daily cron. */
export async function sweepStuckRuns(now = new Date()): Promise<number> {
  const r = await db.agentRun.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
    data: { status: "FAILED", summary: "Didn't finish. MAIRO tries again at the next check.", finishedAt: now },
  });
  return r.count;
}

/** AI Team work that failed or never finished in the last two days, for AIOS. */
export async function recentFailedRuns(now = new Date()) {
  return db.agentRun.findMany({
    where: {
      startedAt: { gte: new Date(now.getTime() - 48 * 3_600_000) },
      OR: [{ status: "FAILED" }, { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } }],
    },
    orderBy: { startedAt: "desc" },
    take: 30,
    include: { organization: { select: { name: true } } },
  });
}
