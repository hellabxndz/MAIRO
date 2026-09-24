import "server-only";
import { log } from "@/lib/log";
import { handleShopifyWebhook, handleSyncOrders, handleSyncProducts } from "@/lib/shopify/jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export type Job = { id: string; type: string; payload: Record<string, unknown>; business_id: string | null; attempts: number };
/**
 * A handler either finishes (returns nothing) or asks to continue later with
 * a new payload — long syncs run in slices so no single run hits the
 * function time limit.
 */
export type JobResult = void | { continueWith: Record<string, unknown>; delaySeconds?: number };
type Handler = (job: Job) => Promise<JobResult>;

/**
 * Job handlers by type. A job with no handler fails (and eventually
 * dead-letters) rather than being silently marked done.
 */
const HANDLERS: Record<string, Handler> = {
  "shopify.sync_products": handleSyncProducts,
  "shopify.sync_orders": handleSyncOrders,
  "shopify.webhook": handleShopifyWebhook,
};

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
      const result = await handler(job);
      if (result) {
        // Continue in a fresh slice; attempts reset because this slice succeeded.
        await admin
          .from("background_jobs")
          .update({
            status: "queued",
            payload: result.continueWith,
            run_at: new Date(Date.now() + (result.delaySeconds ?? 0) * 1000).toISOString(),
            attempts: 0,
            locked_at: null,
            locked_by: null,
            last_error: null,
          })
          .eq("id", job.id);
        succeeded++;
        continue;
      }
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
