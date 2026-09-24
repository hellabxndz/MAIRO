import "server-only";
import { appUrl } from "@/lib/env";
import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDueJobs } from "./runner";

/**
 * Run due jobs until the queue is empty or the time budget is spent. Long
 * syncs continue in slices; if work is still due when the budget runs out,
 * the job endpoint is called again so the next slice starts right away
 * instead of waiting for the daily cron.
 */
export async function drainJobs(worker: string, budgetMs = 40_000) {
  const started = Date.now();
  const totals = { claimed: 0, succeeded: 0, failed: 0 };
  while (Date.now() - started < budgetMs) {
    const r = await runDueJobs(worker, 5);
    totals.claimed += r.claimed;
    totals.succeeded += r.succeeded;
    totals.failed += r.failed;
    if (r.claimed === 0) return totals;
  }
  const { count } = await createAdminClient()
    .from("background_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .lte("run_at", new Date().toISOString());
  if (count) await kickJobRunner();
  return totals;
}

/** Marks a continuation call, as opposed to the scheduled cron run. */
export const KICK_HEADER = "x-mairo-continue";

/** Ask a fresh function invocation to keep draining the queue. */
export async function kickJobRunner() {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  try {
    // Only the request needs to arrive; the run itself continues on its own.
    await fetch(`${appUrl()}/api/cron/jobs`, { headers: { authorization: `Bearer ${secret}`, [KICK_HEADER]: "1" }, signal: AbortSignal.timeout(2_000) });
  } catch (e) {
    if (!(e instanceof Error && e.name === "TimeoutError")) log.warn("jobs.kick_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}
