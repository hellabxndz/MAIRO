import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { drainJobs, KICK_HEADER } from "@/lib/jobs/drain";
import { enqueueSync } from "@/lib/shopify/jobs";
import { log } from "@/lib/log";
import { safeEqual } from "@/lib/security/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Scheduled maintenance: drains the background job queue and applies each
 * business's conversation retention setting. Vercel Cron calls it with
 * `Authorization: Bearer $CRON_SECRET`; anything else is refused. The app
 * also calls it to continue long-running syncs.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse("Unauthorized", { status: 401 });
  if (!isSupabaseAdminConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  // The scheduled run also refreshes every connected store (orders can't
  // arrive by webhook until Shopify approves protected customer data).
  // Continuation calls only drain what's already queued.
  if (!request.headers.get(KICK_HEADER)) {
    const { data: stores } = await createAdminClient().from("shopify_connections").select("id, business_id").eq("status", "active");
    for (const s of stores ?? []) {
      await enqueueSync(s.business_id, s.id, "products").catch((e) => log.warn("cron.enqueue_failed", { error: String(e) }));
    }
  }
  const jobs = await drainJobs(`cron-${Date.now()}`);
  const { data: purged, error } = await createAdminClient().rpc("purge_expired_conversations");
  if (error) log.error("retention.failed", { error: error.message });
  log.info("cron.jobs", { ...jobs, purged: purged ?? 0 });
  return NextResponse.json({ jobs, purgedConversations: error ? null : purged });
}
