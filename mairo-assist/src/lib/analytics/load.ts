import "server-only";
import { createClient } from "@/lib/supabase/server";
import { summarize, type DateRange } from "./summary";

const MAX_ROWS = 50_000;

export async function loadAnalytics(businessId: string, range: DateRange) {
  const supabase = await createClient();
  const [events, conversations] = await Promise.all([
    supabase
      .from("analytics_events")
      .select("event_type, value, currency")
      .eq("business_id", businessId)
      .gte("occurred_at", range.from.toISOString())
      .lt("occurred_at", range.to.toISOString())
      .limit(MAX_ROWS),
    supabase
      .from("conversations")
      .select("customer_id")
      .eq("business_id", businessId)
      .neq("channel", "preview")
      .gte("created_at", range.from.toISOString())
      .lt("created_at", range.to.toISOString())
      .limit(MAX_ROWS),
  ]);
  if (events.error || conversations.error) throw new Error("Could not load analytics");
  return summarize(events.data, conversations.data);
}
