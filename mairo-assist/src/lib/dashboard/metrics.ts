import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BusinessContext } from "@/lib/tenancy/context";

export type OverviewMetrics = {
  periodDays: number;
  conversations: number;
  resolvedByAi: number;
  needsAttention: number;
  newLeads: number;
  openSupportRequests: number;
  awaitingApproval: number;
  /** null when the viewer may not see analytics (e.g. support agents). */
  aiAssistedOrders: number | null;
  aiAssistedRevenue: { amount: number; currency: string }[] | null;
  escalations: number | null;
  productRecommendations: number | null;
};

/**
 * Every number here is a count of real rows. Nothing is estimated or padded;
 * zero means zero. Queries run as the signed-in user, so RLS applies.
 */
export async function loadOverviewMetrics(ctx: BusinessContext, periodDays = 30): Promise<OverviewMetrics> {
  const supabase = await createClient();
  const since = new Date(Date.now() - periodDays * 86_400_000).toISOString();
  const b = ctx.business.id;
  const canAnalytics = ctx.permissions.has("analytics.view");

  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count, error } = await q;
    if (error) throw new Error("Could not load dashboard metrics");
    return count ?? 0;
  };
  const eventCount = (type: string) =>
    count(
      supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("business_id", b)
        .eq("event_type", type)
        .gte("occurred_at", since),
    );

  const [conversations, needsAttention, newLeads, openSupportRequests, awaitingApproval] = await Promise.all([
    count(supabase.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", b).neq("channel", "preview").gte("created_at", since)),
    count(supabase.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", b).eq("status", "needs_attention")),
    count(supabase.from("leads").select("id", { count: "exact", head: true }).eq("business_id", b).gte("created_at", since)),
    count(supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("business_id", b).in("status", ["open", "pending"])),
    count(supabase.from("order_action_requests").select("id", { count: "exact", head: true }).eq("business_id", b).eq("status", "awaiting_approval")),
  ]);

  let resolvedByAi = 0;
  let aiAssistedOrders: number | null = null;
  let aiAssistedRevenue: OverviewMetrics["aiAssistedRevenue"] = null;
  let escalations: number | null = null;
  let productRecommendations: number | null = null;

  if (canAnalytics) {
    const [resolved, esc, recs, attributed] = await Promise.all([
      eventCount("conversation_resolved_by_ai"),
      eventCount("conversation_escalated"),
      eventCount("product_recommended"),
      supabase
        .from("analytics_events")
        .select("value, currency")
        .eq("business_id", b)
        .eq("event_type", "ai_attributed_order")
        .gte("occurred_at", since)
        .limit(10000),
    ]);
    if (attributed.error) throw new Error("Could not load dashboard metrics");
    resolvedByAi = resolved;
    escalations = esc;
    productRecommendations = recs;
    aiAssistedOrders = attributed.data.length;
    const totals = new Map<string, number>();
    for (const row of attributed.data) {
      if (row.value == null) continue;
      const cur = (row.currency ?? "USD").toUpperCase();
      totals.set(cur, (totals.get(cur) ?? 0) + Number(row.value));
    }
    aiAssistedRevenue = [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
  }

  return {
    periodDays,
    conversations,
    resolvedByAi,
    needsAttention,
    newLeads,
    openSupportRequests,
    awaitingApproval,
    aiAssistedOrders,
    aiAssistedRevenue,
    escalations,
    productRecommendations,
  };
}

export async function loadRecentActivity(businessId: string, limit = 12) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_logs")
    .select("id, type, summary, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Could not load activity");
  return data ?? [];
}

export async function loadAiEmployee(businessId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_employees")
    .select("id, name, status, tested_at, published_version_id, activated_at, paused_at, draft_config")
    .eq("business_id", businessId)
    .maybeSingle();
  return data;
}

export async function loadShopifyConnection(businessId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shopify_connections")
    .select("id, shop_domain, shop_name, status, validated_at, last_sync_at, last_sync_status, last_error")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
