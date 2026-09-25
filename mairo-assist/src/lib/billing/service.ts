import "server-only";
import { recordActivity, recordAudit } from "@/lib/audit";
import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS } from "./plans";
import { periodOf, planForPrice, retrieveCheckoutSession, retrieveSubscription, type StripeSubscription } from "./stripe";

const ENTITLED = new Set(["active", "trialing", "past_due", "unpaid"]);

/**
 * Make our subscription row match Stripe's. A paid plan is written only while
 * Stripe reports the subscription as paid up (active/trialing) or in its
 * payment-retry window (past_due); an ended subscription moves the business
 * back to Free. Nothing else about the business changes: AI settings, store
 * connection and conversations are untouched by plan changes.
 */
export async function applyStripeSubscription(businessId: string, sub: StripeSubscription) {
  const admin = createAdminClient();
  const { data: current } = await admin
    .from("subscriptions")
    .select("plan_key, provider, provider_subscription_id, status")
    .eq("business_id", businessId)
    .maybeSingle();
  const isThisSub = current?.provider_subscription_id === sub.id;
  const plan = planForPrice(sub.items.data[0]?.price.id);
  const { start, end } = periodOf(sub);

  if (ENTITLED.has(sub.status) && plan) {
    const status = sub.status === "unpaid" ? "past_due" : sub.status;
    const { error } = await admin
      .from("subscriptions")
      .update({
        plan_key: plan,
        status,
        provider: "stripe",
        provider_customer_id: sub.customer,
        provider_subscription_id: sub.id,
        price_cents: sub.items.data[0]?.price.unit_amount ?? PLANS[plan].monthlyPriceCents,
        currency: sub.items.data[0]?.price.currency ?? "usd",
        current_period_start: start,
        current_period_end: end,
        cancel_at_period_end: sub.cancel_at_period_end,
        canceled_at: null,
      })
      .eq("business_id", businessId);
    if (error) throw new Error(`Could not update the subscription: ${error.message}`);
    if (current?.plan_key !== plan || !isThisSub) {
      await recordAudit({ businessId, actorUserId: null, actorType: "system", action: "billing.plan_changed", metadata: { from: current?.plan_key ?? null, to: plan, provider: "stripe" } });
      await recordActivity({ businessId, type: "plan_changed", summary: `Your plan is now ${PLANS[plan].name}.` });
    }
    return plan;
  }

  // Ended (or never completed) subscriptions only affect the row if it's this subscription.
  if (!isThisSub) return current?.plan_key ?? "free";
  if (sub.status === "canceled" || sub.status === "incomplete_expired") {
    const { error } = await admin
      .from("subscriptions")
      .update({
        plan_key: "free",
        status: "active",
        provider: "none",
        provider_subscription_id: null,
        price_cents: 0,
        current_period_start: new Date().toISOString(),
        current_period_end: null,
        cancel_at_period_end: false,
        canceled_at: new Date().toISOString(),
      })
      .eq("business_id", businessId);
    if (error) throw new Error(`Could not end the subscription: ${error.message}`);
    await recordAudit({ businessId, actorUserId: null, actorType: "system", action: "billing.plan_changed", metadata: { from: current?.plan_key ?? null, to: "free", provider: "stripe" } });
    await recordActivity({ businessId, type: "plan_changed", summary: "Your paid plan ended. You're on Free — your AI employee and data are unchanged." });
    return "free";
  }
  // incomplete / paused: not entitled; the plan key stays for display but features fall back to Free.
  await admin.from("subscriptions").update({ status: sub.status === "paused" ? "paused" : "incomplete" }).eq("business_id", businessId);
  return current?.plan_key ?? "free";
}

export type CheckoutOutcome = "activated" | "pending" | "not_found" | "failed";

/**
 * Confirm a Checkout session with Stripe (never trusting the redirect alone)
 * and activate the plan if it's paid. Only a session this app created for this
 * business counts. Safe to run more than once (return page and webhook both do).
 */
export async function confirmCheckout(sessionId: string, businessId: string): Promise<CheckoutOutcome> {
  const admin = createAdminClient();
  const { data: checkout } = await admin
    .from("billing_checkouts")
    .select("id, business_id, plan_key, status")
    .eq("provider_session_id", sessionId)
    .maybeSingle();
  if (!checkout || checkout.business_id !== businessId) return "not_found";

  try {
    const session = await retrieveCheckoutSession(sessionId);
    if (session.client_reference_id !== businessId) return "not_found";
    const paid = session.status === "complete" && (session.payment_status === "paid" || session.payment_status === "no_payment_required");
    if (!paid || !session.subscription) return session.status === "expired" ? "failed" : "pending";

    const sub = typeof session.subscription === "string" ? await retrieveSubscription(session.subscription) : session.subscription;
    const plan = await applyStripeSubscription(businessId, sub);
    await admin.from("billing_checkouts").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", checkout.id).eq("status", "open");
    return plan === "free" ? "pending" : "activated";
  } catch (e) {
    log.warn("billing.confirm_failed", { error: e instanceof Error ? e.message : String(e) });
    return "failed";
  }
}
