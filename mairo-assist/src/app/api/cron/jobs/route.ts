import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { runDueJobs } from "@/lib/jobs/runner";
import { log } from "@/lib/log";
import { safeEqual } from "@/lib/security/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Scheduled maintenance: drains the background job queue and applies each
 * business's conversation retention setting. Vercel Cron calls it with
 * `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse("Unauthorized", { status: 401 });
  if (!isSupabaseAdminConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const jobs = await runDueJobs(`cron-${Date.now()}`);
  const { data: purged, error } = await createAdminClient().rpc("purge_expired_conversations");
  if (error) log.error("retention.failed", { error: error.message });
  log.info("cron.jobs", { ...jobs, purged: purged ?? 0 });
  return NextResponse.json({ jobs, purgedConversations: error ? null : purged });
}
