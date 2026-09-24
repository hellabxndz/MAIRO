/**
 * Analytics aggregation. Pure functions over real event rows, so the
 * definitions below are the ones the dashboard shows and tests pin down.
 *
 * Definitions
 * - Total conversations: conversations started in the range (excluding
 *   owner preview/test chats).
 * - Unique customer conversations: distinct identified customers among them.
 * - AI resolution rate: conversations marked resolved by the AI without a
 *   human, divided by conversations started. Shown as "—" with no data.
 * - Human escalation rate: conversations escalated to a person, divided by
 *   conversations started.
 * - AI-associated orders / revenue: orders linked to a conversation under the
 *   attribution rule (docs/ANALYTICS.md): the AI recommended a product that
 *   appears in the order, and the order was placed within 7 days of that
 *   recommendation in the same browser session or by the verified customer.
 *   This is association, not proof the AI caused the sale, and it is never
 *   total store revenue.
 */

export const RANGE_KEYS = ["today", "7d", "30d", "90d", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export type DateRange = { key: RangeKey; from: Date; to: Date; label: string };

const DAY = 86_400_000;
const MAX_CUSTOM_DAYS = 366;

function parseDay(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveRange(params: { range?: unknown; from?: unknown; to?: unknown }, now = new Date()): DateRange {
  const key = (RANGE_KEYS as readonly string[]).includes(params.range as string) ? (params.range as RangeKey) : "30d";
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (key === "custom") {
    const from = parseDay(params.from);
    const toDay = parseDay(params.to);
    if (from && toDay && from <= toDay && (toDay.getTime() - from.getTime()) / DAY <= MAX_CUSTOM_DAYS) {
      const to = new Date(Math.min(toDay.getTime() + DAY, now.getTime()));
      return { key, from, to, label: `${params.from} to ${params.to}` };
    }
    return resolveRange({ range: "30d" }, now);
  }
  if (key === "today") return { key, from: startOfToday, to: now, label: "Today" };
  const days = key === "7d" ? 7 : key === "90d" ? 90 : 30;
  return { key, from: new Date(now.getTime() - days * DAY), to: now, label: `Last ${days} days` };
}

export type EventRow = { event_type: string; value: number | string | null; currency: string | null };
export type ConversationRow = { customer_id: string | null };

export type AnalyticsSummary = {
  totalConversations: number;
  uniqueCustomers: number;
  resolvedByAi: number;
  escalated: number;
  aiResolutionRate: number | null;
  escalationRate: number | null;
  productRecommendations: number;
  productLinkClicks: number;
  leadsCollected: number;
  orderRequestsHandled: number;
  returnRequests: number;
  exchangeRequests: number;
  aiAssociatedOrders: number;
  aiAssociatedRevenue: { currency: string; amount: number }[];
};

export function summarize(events: EventRow[], conversations: ConversationRow[]): AnalyticsSummary {
  const n = (type: string) => events.filter((e) => e.event_type === type).length;
  const total = conversations.length;
  const resolved = n("conversation_resolved_by_ai");
  const escalated = n("conversation_escalated");
  const revenue = new Map<string, number>();
  for (const e of events) {
    if (e.event_type !== "ai_attributed_order" || e.value == null) continue;
    const cur = (e.currency ?? "USD").toUpperCase();
    revenue.set(cur, Math.round(((revenue.get(cur) ?? 0) + Number(e.value)) * 100) / 100);
  }
  return {
    totalConversations: total,
    uniqueCustomers: new Set(conversations.map((c) => c.customer_id).filter(Boolean)).size,
    resolvedByAi: resolved,
    escalated,
    aiResolutionRate: total > 0 ? Math.min(1, resolved / total) : null,
    escalationRate: total > 0 ? Math.min(1, escalated / total) : null,
    productRecommendations: n("product_recommended"),
    productLinkClicks: n("product_link_clicked"),
    leadsCollected: n("lead_captured"),
    orderRequestsHandled: n("order_lookup"),
    returnRequests: n("return_request_created"),
    exchangeRequests: n("exchange_request_created"),
    aiAssociatedOrders: n("ai_attributed_order"),
    aiAssociatedRevenue: [...revenue.entries()].map(([currency, amount]) => ({ currency, amount })),
  };
}

export function toCsv(summary: AnalyticsSummary, range: DateRange): string {
  const pct = (v: number | null) => (v == null ? "" : (v * 100).toFixed(1));
  const rows: [string, string | number][] = [
    ["range_from", range.from.toISOString()],
    ["range_to", range.to.toISOString()],
    ["total_conversations", summary.totalConversations],
    ["unique_customer_conversations", summary.uniqueCustomers],
    ["ai_resolution_rate_pct", pct(summary.aiResolutionRate)],
    ["human_escalation_rate_pct", pct(summary.escalationRate)],
    ["product_recommendations", summary.productRecommendations],
    ["product_link_clicks", summary.productLinkClicks],
    ["leads_collected", summary.leadsCollected],
    ["order_requests_handled", summary.orderRequestsHandled],
    ["return_requests_created", summary.returnRequests],
    ["exchange_requests_created", summary.exchangeRequests],
    ["ai_associated_orders", summary.aiAssociatedOrders],
    ...summary.aiAssociatedRevenue.map((r): [string, string] => [`ai_associated_revenue_${r.currency.toLowerCase()}`, r.amount.toFixed(2)]),
  ];
  return ["metric,value", ...rows.map(([k, v]) => `${k},${v}`)].join("\n") + "\n";
}
