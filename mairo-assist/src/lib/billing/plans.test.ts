import { describe, expect, it } from "vitest";
import { entitledPlan, formatPlanPrice, hasFeature, minimumPlanFor, PLAN_LIST, PLANS, usageStatus } from "./plans";

describe("plan configuration", () => {
  it("has the published prices", () => {
    expect(PLAN_LIST.map((p) => [p.key, p.monthlyPriceCents])).toEqual([
      ["starter", 14900],
      ["growth", 29900],
      ["pro", 49900],
      ["enterprise", 99900],
    ]);
    expect(formatPlanPrice(PLANS.starter)).toBe("$149");
    expect(formatPlanPrice(PLANS.enterprise)).toBe("From $999");
  });

  it("each tier includes everything in the tier below", () => {
    for (let i = 1; i < PLAN_LIST.length; i++) {
      for (const f of PLAN_LIST[i - 1].features) expect(PLAN_LIST[i].features).toContain(f);
      expect(PLAN_LIST[i].limits.conversationsPerMonth).toBeGreaterThan(PLAN_LIST[i - 1].limits.conversationsPerMonth);
    }
  });

  it("gates features by plan", () => {
    expect(hasFeature({ plan_key: "starter", status: "active" }, "shopify_order_lookup")).toBe(false);
    expect(hasFeature({ plan_key: "growth", status: "active" }, "shopify_order_lookup")).toBe(true);
    expect(hasFeature({ plan_key: "growth", status: "active" }, "team_access")).toBe(false);
    expect(minimumPlanFor("team_access").key).toBe("pro");
    expect(minimumPlanFor("multiple_stores").key).toBe("enterprise");
  });

  it("grants nothing without an entitled subscription", () => {
    expect(entitledPlan(null)).toBeNull();
    expect(entitledPlan({ plan_key: "pro", status: "canceled" })).toBeNull();
    expect(entitledPlan({ plan_key: "pro", status: "incomplete" })).toBeNull();
    expect(entitledPlan({ plan_key: "unknown", status: "active" })).toBeNull();
    expect(entitledPlan({ plan_key: "pro", status: "past_due" })?.key).toBe("pro");
  });

  it("warns near the allowance and applies the configured behavior at the limit", () => {
    const plan = PLANS.starter;
    expect(usageStatus(plan, { conversations: 100, aiRequests: 100 }).warning).toBe(false);
    const near = usageStatus(plan, { conversations: 850, aiRequests: 100 });
    expect(near.warning).toBe(true);
    expect(near.behavior).toBeNull();
    const over = usageStatus(plan, { conversations: 10, aiRequests: 5000 });
    expect(over.exceeded).toBe(true);
    expect(over.behavior).toBe("handoff_to_human");
  });
});
