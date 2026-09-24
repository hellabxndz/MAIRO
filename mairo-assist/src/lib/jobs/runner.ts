import "server-only";
import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";

type Job = { id: string; type: string; payload: Record<string, unknown>; business_id: string | null; attempts: number };
type Handler = (job: Job) => Promise<void>;

/**
 * Job handlers by type. Shopify sync and webhook processing register here in
 * Phase 3. A job with no handler fails (and eventually dead-letters) rather
 * than being silently marked done.
 */
const HANDLERS: Record<string, Handler> = {};

export async function runDueJobs(worker: string, limit = 20) {
  const admin = createAdminClient();
  const { data: jobs, error } = await admin.rpc("claim_background_jobs", { p_worker: worker, p_limit: limit });
  if (error) throw new Error(`Could not claim jobs: ${error.message}`);
  let succeeded = 0;
  let failed = 0;
  for (const job of (jobs ?? []) as Job[]) {
    const handler = HANDLERS[job.type];
    try {
      if (!handler) throw new Error(`No handler for job type "${job.type}"`);
      await handler(job);
      await admin.from("background_jobs").update({ status: "succeeded", completed_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: null }).eq("id", job.id);
      succeeded++;
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : String(e);
      log.warn("jobs.failed", { type: job.type, attempts: job.attempts, error: message });
      await admin.rpc("fail_background_job", { p_job_id: job.id, p_error: message });
    }
  }
  return { claimed: jobs?.length ?? 0, succeeded, failed };
}
