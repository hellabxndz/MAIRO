import "server-only";
import { createClient } from "@/lib/supabase/server";
import { effectivePlan, nextReset, periodStart, type Plan } from "./plans";

export type CreditSummary = {
  plan: Plan;
  /** The subscription row (null only if the database has none, which the trigger prevents). */
  subscription: { plan_key: string; status: string; provider: string; current_period_end: string | null; cancel_at_period_end: boolean } | null;
  used: number;
  limit: number;
  remaining: number;
  resetsAt: Date;
};

/** The business's plan and this month's AI response credits, read as the signed-in member. */
export async function loadCredits(businessId: string): Promise<CreditSummary> {
  const supabase = await createClient();
  const [{ data: planRows }, { data: used }, { data: sub }] = await Promise.all([
    supabase.rpc("business_plan", { p_business_id: businessId }),
    supabase.rpc("business_credit_usage", { p_business_id: businessId, p_period_start: periodStart() }),
    // Billing details are visible to owners and admins only; others get null.
    supabase.from("subscriptions").select("plan_key, status, provider, current_period_end, cancel_at_period_end").eq("business_id", businessId).maybeSingle(),
  ]);
  const row = Array.isArray(planRows) ? planRows[0] : null;
  const plan = effectivePlan(row);
  const usedCount = typeof used === "number" ? used : 0;
  const limit = plan.limits.aiResponsesPerMonth;
  return { plan, subscription: sub, used: usedCount, limit, remaining: Math.max(0, limit - usedCount), resetsAt: nextReset() };
}
