"use server";

import Stripe from "stripe";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, priceIdFor, statusEntitles } from "@/lib/stripe/client";
import type { SubscriptionTier } from "@/generated/prisma/enums";
import { isSoldTier, planFor, trialDaysFor } from "@/lib/plans";
import { payingBusinessOf } from "@/lib/brands";
import { deniedFor } from "@/lib/members/authorize";
import { beginCheckout, customerStillExists, explainStripeError, originUrl } from "@/lib/billing/checkout";
import { reportError } from "@/lib/monitoring/report";
import { applySubscription } from "@/lib/stripe/apply-subscription";

// Starting a checkout and opening the billing portal. Both hand off to a page
// Stripe hosts, so no card details ever reach this application.

export type BillingActionState = { error?: string; code?: string } | undefined;

/**
 * Sends the client to Stripe to subscribe.
 *
 * Redirects to Stripe's own checkout page on success. Anything that stops it
 * comes back as a message under the button — never a silent trip back to the
 * page the customer was already on (lib/billing/checkout.ts).
 */
export async function startCheckoutAction(
  _prevState: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  // Role check: billing.manage (lib/members/roles.ts).
  const denied = await deniedFor("billing.manage");
  if (denied) return { error: denied };
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.email) {
    redirect("/sign-in");
  }

  const result = await beginCheckout({
    organizationId: session.user.organizationId,
    email: session.user.email,
    tier: String(formData.get("tier") ?? ""),
  });
  if (result.kind === "error") return { error: result.message, code: result.code };

  // Outside any try: Next signals a redirect by throwing.
  redirect(result.url);
}

/**
 * Opens Stripe's billing portal, where the client changes plan, updates a card
 * or cancels. All of that is Stripe's hosted UI — building our own would mean
 * reimplementing proration, invoices and dunning for no benefit.
 */
export async function openBillingPortalAction(): Promise<void> {
  // Role check: billing.manage (lib/members/roles.ts).
  if (await deniedFor("billing.manage")) return;
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organization = await db.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { stripeCustomerId: true },
  });
  if (!organization?.stripeCustomerId) {
    throw new Error("There's no billing account to manage yet.");
  }

  // A customer from a Stripe account this site no longer uses has nothing to
  // manage here. Forget it, and send them back to the plans, where choosing
  // one makes a customer in the current account.
  if (!(await customerStillExists(organization.stripeCustomerId))) {
    await db.organization.update({
      where: { id: session.user.organizationId },
      data: { stripeCustomerId: null },
    });
    redirect("/dashboard/billing");
  }

  const portal = await stripe().billingPortal.sessions.create({
    customer: organization.stripeCustomerId,
    return_url: `${await originUrl()}/dashboard/billing`,
  });
  redirect(portal.url);
}

/**
 * Stripe's cancellation step, reached from "Before you cancel" — after the
 * business has seen which Meta campaigns keep running and had the chance to
 * pause them. Opens the portal straight on cancelling this subscription; a
 * portal set up without that flow falls back to the portal's home, where
 * cancelling is one click.
 */
export async function openCancelPortalAction(): Promise<void> {
  // Role check: billing.manage (lib/members/roles.ts).
  if (await deniedFor("billing.manage")) return;
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organization = await db.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (!organization?.stripeCustomerId) redirect("/dashboard/billing");
  if (!(await customerStillExists(organization.stripeCustomerId))) {
    await db.organization.update({ where: { id: session.user.organizationId }, data: { stripeCustomerId: null } });
    redirect("/dashboard/billing");
  }

  const returnUrl = `${await originUrl()}/dashboard/billing`;
  let url: string;
  try {
    const portal = await stripe().billingPortal.sessions.create({
      customer: organization.stripeCustomerId,
      return_url: returnUrl,
      ...(organization.stripeSubscriptionId
        ? { flow_data: { type: "subscription_cancel" as const, subscription_cancel: { subscription: organization.stripeSubscriptionId }, after_completion: { type: "redirect" as const, redirect: { return_url: `${returnUrl}?cancelled=1` } } } }
        : {}),
    });
    url = portal.url;
  } catch (error) {
    console.error("Stripe wouldn't open the cancellation step; opening the portal instead:", error);
    const portal = await stripe().billingPortal.sessions.create({ customer: organization.stripeCustomerId, return_url: returnUrl });
    url = portal.url;
  }
  redirect(url);
}

/**
 * Moves an existing subscription between MAIRO Pro and MAIRO Scale — and
 * moves a subscriber on an earlier plan onto one of them, when they choose
 * to. Nobody is ever moved without pressing this.
 *
 * An active subscription goes to Stripe's own confirmation page for exactly
 * this change, which shows the prorated amount before anything is charged;
 * nothing changes until the customer confirms there, and the webhook then
 * records the new plan. A Pro trial moving to Scale is the one exception:
 * Scale has no trial, so the trial ends and Scale is charged now — and
 * payment_behavior "error_if_incomplete" means a declined card changes
 * nothing at all, rather than leaving a half-paid subscription.
 */
export async function changePlanAction(_prev: BillingActionState, formData: FormData): Promise<BillingActionState> {
  const denied = await deniedFor("billing.manage");
  if (denied) return { error: denied };
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = session.user.organizationId;

  const tier = String(formData.get("tier") ?? "") as SubscriptionTier;
  if (!isSoldTier(tier)) return { error: "That isn't a plan we sell." };
  const target = tier as Exclude<SubscriptionTier, "NONE">;

  const payer = await payingBusinessOf(organizationId);
  if (payer) return { error: `${payer.name}'s MAIRO Scale plan pays for this business. Plan changes are made there.` };

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true, subscriptionTier: true, subscriptionStatus: true },
  });
  if (!org?.stripeCustomerId || !org.stripeSubscriptionId || !statusEntitles(org.subscriptionStatus)) {
    return { error: "There's no subscription to change yet. Choose a plan instead." };
  }
  if (org.subscriptionTier === target) return { error: `You're already on ${planFor(target).name}.` };

  const returnUrl = `${await originUrl()}/dashboard/billing`;
  let url: string;
  try {
    const subscription = await stripe().subscriptions.retrieve(org.stripeSubscriptionId);
    const item = subscription.items.data[0];
    if (!item) throw new Error("This subscription has no plan on it to change.");
    const price = priceIdFor(target);

    if (subscription.status === "trialing" && trialDaysFor(target) === 0) {
      await stripe().subscriptions.update(subscription.id, {
        items: [{ id: item.id, price }],
        trial_end: "now",
        proration_behavior: "none",
        payment_behavior: "error_if_incomplete",
        metadata: { ...subscription.metadata, organizationId },
      });
      url = `${returnUrl}?changed=1`;
    } else {
      const portal = await stripe().billingPortal.sessions.create({
        customer: org.stripeCustomerId,
        return_url: returnUrl,
        flow_data: {
          type: "subscription_update_confirm",
          subscription_update_confirm: { subscription: subscription.id, items: [{ id: item.id, price, quantity: 1 }] },
          after_completion: { type: "redirect", redirect: { return_url: `${returnUrl}?changed=1` } },
        },
      });
      url = portal.url;
    }
  } catch (error) {
    if (error instanceof Stripe.errors.StripeCardError) {
      return { error: "Your card was declined, so nothing changed — you're still on your current plan. Update your card in Manage billing and try again." };
    }
    const { code, operator } = explainStripeError(error);
    console.error(`Changing plan failed (${code}): ${operator}`);
    await reportError(error, { where: "stripe change plan", tags: { code } });
    return { error: "Stripe couldn't change your plan, so nothing changed — you're still on your current plan. Please try again shortly." };
  }
  redirect(url);
}

/**
 * Ends a free trial today and starts paying — for a business whose Meta ad
 * account already had a trial (lib/billing/trial-claims.ts), or anyone who
 * would rather start now. Only ever from its own button, which says the
 * amount. "error_if_incomplete": a declined card changes nothing, and the
 * trial carries on.
 */
export async function endTrialNowAction(): Promise<BillingActionState> {
  const denied = await deniedFor("billing.manage");
  if (denied) return { error: denied };
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = session.user.organizationId;

  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { stripeSubscriptionId: true, subscriptionStatus: true } });
  if (!org?.stripeSubscriptionId || org.subscriptionStatus !== "trialing") return { error: "You're not on a free trial, so there's nothing to end." };

  try {
    const subscription = await stripe().subscriptions.update(org.stripeSubscriptionId, {
      trial_end: "now",
      proration_behavior: "none",
      payment_behavior: "error_if_incomplete",
    });
    // Recorded now rather than waiting for the webhook, so connecting Meta
    // straight after sees the paid plan.
    await applySubscription(subscription);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeCardError) {
      return { error: "Your card was declined, so nothing changed — your trial carries on. Update your card in Manage billing and try again." };
    }
    const { code, operator } = explainStripeError(error);
    console.error(`Ending a trial failed (${code}): ${operator}`);
    await reportError(error, { where: "stripe end trial", tags: { code } });
    return { error: "Stripe couldn't start your plan, so nothing changed — your trial carries on. Please try again shortly." };
  }
  redirect("/dashboard/billing?trialEnded=1");
}
