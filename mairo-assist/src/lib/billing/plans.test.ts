import { describe, expect, it } from "vitest";
import {
  addedFeatures,
  effectivePlan,
  entitledPlan,
  formatPlanPrice,
  hasFeature,
  isPaidSelfServe,
  minimumPlanFor,
  nextReset,
  periodStart,
  PLAN_LIST,
  PLANS,
  usageStatus,
} from "./plans";

describe("plan configuration", () => {
  it("has the published prices and credits", () => {
    expect(PLAN_LIST.map((p) => [p.key, p.monthlyPriceCents, p.limits.aiResponsesPerMonth])).toEqual([
      ["free", 0, 100],
      ["starter", 14900, 1000],
      ["growth", 29900, 5000],
      ["pro", 49900, 15000],
      ["enterprise", 99900, 50000],
    ]);
    expect(formatPlanPrice(PLANS.free)).toBe("$0");
    expect(formatPlanPrice(PLANS.starter)).toBe("$149");
    expect(formatPlanPrice(PLANS.enterprise)).toBe("From $999");
  });

  it("each tier includes everything in the tier below", () => {
    for (let i = 1; i < PLAN_LIST.length; i++) {
      for (const f of PLAN_LIST[i - 1].features) expect(PLAN_LIST[i].features).toContain(f);
      expect(PLAN_LIST[i].limits.aiResponsesPerMonth).toBeGreaterThan(PLAN_LIST[i - 1].limits.aiResponsesPerMonth);
    }
  });

  it("gates features by plan", () => {
    expect(hasFeature({ plan_key: "free", status: "active" }, "product_questions")).toBe(true);
    expect(hasFeature({ plan_key: "free", status: "active" }, "customer_inbox")).toBe(false);
    expect(hasFeature({ plan_key: "starter", status: "active" }, "shopify_order_lookup")).toBe(false);
    expect(hasFeature({ plan_key: "growth", status: "active" }, "shopify_order_lookup")).toBe(true);
    expect(minimumPlanFor("team_access").key).toBe("pro");
    expect(minimumPlanFor("multiple_stores").key).toBe("enterprise");
    expect(addedFeatures(PLANS.starter, PLANS.free)).toEqual(["custom_personality", "customer_inbox", "basic_analytics"]);
  });

  it("falls back to Free, never to a paid plan, without an entitled subscription", () => {
    expect(entitledPlan(null)).toBeNull();
    expect(effectivePlan(null).key).toBe("free");
    expect(effectivePlan({ plan_key: "pro", status: "canceled" }).key).toBe("free");
    expect(effectivePlan({ plan_key: "pro", status: "incomplete" }).key).toBe("free");
    expect(effectivePlan({ plan_key: "unknown", status: "active" }).key).toBe("free");
    expect(effectivePlan({ plan_key: "pro", status: "past_due" }).key).toBe("pro");
  });

  it("only sells Starter, Growth and Pro online", () => {
    expect(["free", "starter", "growth", "pro", "enterprise", "x"].filter(isPaidSelfServe)).toEqual(["starter", "growth", "pro"]);
  });

  it("counts credits in AI responses and hands off at the limit", () => {
    const plan = PLANS.free;
    expect(usageStatus(plan, { aiResponses: 10, aiRequests: 20 }).warning).toBe(false);
    const near = usageStatus(plan, { aiResponses: 85, aiRequests: 100 });
    expect(near.warning).toBe(true);
    expect(near.behavior).toBeNull();
    const over = usageStatus(plan, { aiResponses: 100, aiRequests: 150 });
    expect(over.exceeded).toBe(true);
    expect(over.behavior).toBe("handoff_to_human");
  });

  it("resets monthly on the first, UTC", () => {
    const now = new Date("2026-12-15T12:00:00Z");
    expect(periodStart(now)).toBe("2026-12-01");
    expect(nextReset(now).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
