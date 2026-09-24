import { describe, expect, it } from "vitest";
import { resolveRange, summarize, toCsv } from "./summary";

const NOW = new Date("2026-09-24T15:30:00Z");

describe("date ranges", () => {
  it("defaults to 30 days", () => {
    const r = resolveRange({}, NOW);
    expect(r.key).toBe("30d");
    expect(NOW.getTime() - r.from.getTime()).toBe(30 * 86_400_000);
  });
  it("supports today, 7 and 90 days", () => {
    expect(resolveRange({ range: "today" }, NOW).from.toISOString()).toBe("2026-09-24T00:00:00.000Z");
    expect(resolveRange({ range: "7d" }, NOW).label).toBe("Last 7 days");
    expect(resolveRange({ range: "90d" }, NOW).label).toBe("Last 90 days");
  });
  it("accepts a valid custom range, inclusive of the end day", () => {
    const r = resolveRange({ range: "custom", from: "2026-09-01", to: "2026-09-10" }, NOW);
    expect(r.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-09-11T00:00:00.000Z");
  });
  it("falls back on invalid custom ranges", () => {
    expect(resolveRange({ range: "custom", from: "2026-09-10", to: "2026-09-01" }, NOW).key).toBe("30d");
    expect(resolveRange({ range: "custom", from: "2020-01-01", to: "2026-09-01" }, NOW).key).toBe("30d");
    expect(resolveRange({ range: "custom", from: "nope", to: "2026-09-01" }, NOW).key).toBe("30d");
  });
});

describe("summary", () => {
  it("shows no rates without conversations instead of 0%", () => {
    const s = summarize([], []);
    expect(s.aiResolutionRate).toBeNull();
    expect(s.escalationRate).toBeNull();
    expect(s.aiAssociatedRevenue).toEqual([]);
  });

  it("counts only real events and keeps currencies apart", () => {
    const s = summarize(
      [
        { event_type: "conversation_resolved_by_ai", value: null, currency: null },
        { event_type: "conversation_escalated", value: null, currency: null },
        { event_type: "ai_attributed_order", value: "10.10", currency: "usd" },
        { event_type: "ai_attributed_order", value: 20.2, currency: "USD" },
        { event_type: "ai_attributed_order", value: 5, currency: "EUR" },
        { event_type: "exchange_request_created", value: null, currency: null },
      ],
      [{ customer_id: "a" }, { customer_id: "a" }, { customer_id: null }, { customer_id: "b" }],
    );
    expect(s.totalConversations).toBe(4);
    expect(s.uniqueCustomers).toBe(2);
    expect(s.aiResolutionRate).toBe(0.25);
    expect(s.escalationRate).toBe(0.25);
    expect(s.aiAssociatedOrders).toBe(3);
    expect(s.aiAssociatedRevenue).toEqual([
      { currency: "USD", amount: 30.3 },
      { currency: "EUR", amount: 5 },
    ]);
    expect(s.exchangeRequests).toBe(1);
    const csv = toCsv(s, resolveRange({}, NOW));
    expect(csv).toContain("ai_associated_revenue_usd,30.30");
    expect(csv).not.toMatch(/@/);
  });
});
