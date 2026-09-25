"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit";
import { appUrl } from "@/lib/env";
import { log } from "@/lib/log";
import { rateLimit } from "@/lib/security/rate-limit";
import { safeNextPath } from "@/lib/security/redirect";
import { randomToken } from "@/lib/security/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, PermissionError, type BusinessContext } from "@/lib/tenancy/context";
import { str, type FormState } from "@/lib/validation/form";
import { isPaidSelfServe, isPlanKey } from "./plans";
import { applyStripeSubscription } from "./service";
import {
  cancelAtPeriodEnd,
  changeSubscriptionPlan,
  createCheckoutSession,
  createPortalSession,
  isStripeConfigured,
  planForPrice,
  retrieveSubscription,
  StripeError,
} from "./stripe";

async function owner(): Promise<BusinessContext | null> {
  try {
    return await authorize("billing.manage");
  } catch (e) {
    if (e instanceof PermissionError) return null;
    throw e;
  }
}

const DENIED: FormState = { message: "Only the business owner can change the plan." };
const NOT_AVAILABLE =
  "Paid plans can't be purchased on this deployment yet, so nothing was charged. You're on Free and can keep using your AI employee.";

/**
 * Change plan. Free never involves payment. A first paid plan goes through
 * Stripe Checkout; the plan is activated only after Stripe confirms payment
 * (on the return page and by webhook). An existing subscriber's change is
 * applied only if Stripe collects the prorated payment.
 */
export async function choosePlan(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await owner();
  if (!ctx) return DENIED;
  const target = str(form, "plan");
  const next = safeNextPath(str(form, "next"), "/dashboard/upgrade");
  if (!isPlanKey(target)) return { message: "Choose a plan." };
  if (target === "enterprise") return { message: "Enterprise is arranged with our team — use Contact Sales." };

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("subscriptions")
    .select("plan_key, status, provider, provider_customer_id, provider_subscription_id, cancel_at_period_end, current_period_end")
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  const onStripe = current?.provider === "stripe" && current.provider_subscription_id;

  if (target === "free") {
    if (!onStripe) {
      if (next !== "/dashboard/upgrade") redirect(next);
      return { ok: true, message: "You're on Free. Nothing is charged." };
    }
    if (!isStripeConfigured()) return { message: "Billing isn't available right now. Please try again later." };
    try {
      const sub = await cancelAtPeriodEnd(current!.provider_subscription_id!, true);
      await applyStripeSubscription(ctx.business.id, sub);
      await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "billing.downgrade_scheduled", metadata: { from: current!.plan_key } });
    } catch (e) {
      return stripeFailure(e);
    }
    revalidatePath("/dashboard", "layout");
    // The page re-renders with the new state, so it shows the confirmation itself.
    redirect("/dashboard/upgrade?changed=downgrade");
  }

  if (!isPaidSelfServe(target)) return { message: "Choose a plan." };
  if (!isStripeConfigured()) return { message: NOT_AVAILABLE };
  if (current?.provider === "manual" || current?.provider === "shopify") {
    return { message: "Your plan is managed by our team. Contact support to change it." };
  }
  if (!(await rateLimit(`billing:${ctx.business.id}`, 10, 600))) return { message: "Too many attempts. Please wait a few minutes." };

  // Existing subscriber: change the plan in place (prorated, only if paid).
  if (onStripe) {
    let changed: string;
    try {
      const sub = await retrieveSubscription(current!.provider_subscription_id!);
      if (planForPrice(sub.items.data[0]?.price.id) === target) {
        if (sub.cancel_at_period_end) await applyStripeSubscription(ctx.business.id, await cancelAtPeriodEnd(sub.id, false));
        changed = target;
      } else {
        const updated = await changeSubscriptionPlan(sub, target, `change-${sub.id}-${target}-${randomToken(8)}`);
        const plan = await applyStripeSubscription(ctx.business.id, updated);
        if (plan !== target) {
          return { message: "The payment for this change didn't go through, so your plan wasn't changed. Update your payment method under Manage billing." };
        }
        changed = target;
      }
    } catch (e) {
      return stripeFailure(e);
    }
    revalidatePath("/dashboard", "layout");
    redirect(`/dashboard/upgrade?changed=${changed}`);
  }

  // First purchase: Stripe Checkout. Nothing changes until Stripe confirms payment.
  const returnTo = encodeURIComponent(next);
  let url: string | null = null;
  try {
    const session = await createCheckoutSession({
      businessId: ctx.business.id,
      plan: target,
      email: ctx.user.email,
      customerId: current?.provider_customer_id ?? null,
      successUrl: `${appUrl()}/api/billing/return?session_id={CHECKOUT_SESSION_ID}&next=${returnTo}`,
      cancelUrl: `${appUrl()}${next}${next.includes("?") ? "&" : "?"}checkout=canceled`,
      idempotencyKey: `checkout-${ctx.business.id}-${target}-${randomToken(8)}`,
    });
    const { error } = await admin.from("billing_checkouts").insert({
      business_id: ctx.business.id,
      user_id: ctx.user.id,
      provider: "stripe",
      provider_session_id: session.id,
      plan_key: target,
    });
    if (error) throw new Error(error.message);
    url = session.url;
  } catch (e) {
    return stripeFailure(e);
  }
  if (!url) return { message: "Stripe didn't return a checkout page. Please try again." };
  redirect(url);
}

/** Stripe's hosted page for payment methods, invoices and cancellation. */
export async function openBillingPortal(): Promise<FormState> {
  const ctx = await owner();
  if (!ctx) return DENIED;
  const { data: sub } = await createAdminClient().from("subscriptions").select("provider_customer_id").eq("business_id", ctx.business.id).maybeSingle();
  if (!sub?.provider_customer_id || !isStripeConfigured()) return { message: "There's no billing account yet — you haven't paid for a plan." };
  let url: string;
  try {
    url = (await createPortalSession(sub.provider_customer_id, `${appUrl()}/dashboard/upgrade`)).url;
  } catch (e) {
    return stripeFailure(e);
  }
  redirect(url);
}

function stripeFailure(e: unknown): FormState {
  log.warn("billing.stripe_error", { error: e instanceof Error ? e.message : String(e), status: e instanceof StripeError ? e.status : undefined });
  const card = e instanceof StripeError && (e.code === "card_declined" || e.status === 402);
  return { message: card ? "The payment was declined. Nothing was changed." : "We couldn't reach the payment provider. Nothing was changed — please try again." };
}
