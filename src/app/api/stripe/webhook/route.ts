import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe, tierForPriceId } from "@/lib/stripe/client";

// Stripe tells us here what a client is actually paying for.
//
// This endpoint is public — anyone on the internet can POST to it — and what it
// does is grant and revoke paid access. So the signature check below is not a
// formality: without it, anyone could hand themselves the Scale plan by posting
// a made-up event. Nothing in the request body is trusted until Stripe's
// signature over the exact raw bytes has been verified.
//
// It is also written to be safe to call twice with the same event. Stripe
// retries on any non-2xx response and can deliver the same event more than
// once, so every write here sets an absolute state rather than adjusting one.

export const dynamic = "force-dynamic";

// Only the events that actually change entitlement. Stripe sends dozens more;
// answering 200 to those without doing anything is correct and stops it
// retrying them.
const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set.");
    return NextResponse.json({ error: "Billing is not configured." }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // The raw body, byte for byte. Parsing it first would change the bytes and
  // the signature would never verify.
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    // A bad signature is either a misconfigured secret or someone forging
    // events. Neither should be retried, so this is a 400 and not a 500.
    console.error("Stripe webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (!HANDLED.has(event.type)) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const checkout = event.data.object as Stripe.Checkout.Session;
      // The subscription object arrives moments later as its own event with
      // the full detail. Fetching it here means entitlement is correct
      // immediately rather than a few seconds after the client is redirected
      // back and looking at the page.
      if (typeof checkout.subscription === "string") {
        const subscription = await stripe().subscriptions.retrieve(checkout.subscription);
        await applySubscription(subscription);
      }
    } else {
      await applySubscription(event.data.object as Stripe.Subscription);
    }
  } catch (error) {
    // A 500 asks Stripe to retry, which is what we want for a transient
    // database problem — the alternative is a paying customer stuck on the
    // free tier because one write failed once.
    console.error(`Stripe webhook ${event.type} failed:`, error);
    return NextResponse.json({ error: "Failed to record subscription." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Writes Stripe's view of a subscription onto the organization it belongs to.
 *
 * Sets absolute values rather than adjusting anything, so replaying an event
 * lands in the same place. Events can also arrive out of order on retry; every
 * one of them carries the subscription's current state, so the last write wins
 * and that is the right answer.
 */
async function applySubscription(subscription: Stripe.Subscription): Promise<void> {
  const organizationId = await resolveOrganizationId(subscription);
  if (!organizationId) {
    // A subscription we cannot attribute — created directly in the Stripe
    // dashboard, or belonging to a deleted organization. Logged rather than
    // thrown: retrying will not find an organization that does not exist, and
    // a permanently failing webhook is noise that hides real failures.
    console.warn(
      `Stripe subscription ${subscription.id} could not be matched to an organization.`
    );
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id;
  const tier = priceId ? tierForPriceId(priceId) : null;

  // "canceled" and "incomplete_expired" are terminal: the client is no longer
  // paying, so the tier goes back to NONE. Everything else keeps whichever
  // tier the price maps to.
  const finished = subscription.status === "canceled" || subscription.status === "incomplete_expired";

  const periodEnd = subscription.items.data[0]?.current_period_end;

  await db.organization.update({
    where: { id: organizationId },
    data: {
      stripeSubscriptionId: finished ? null : subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionTier: finished ? "NONE" : tier ?? "NONE",
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    },
  });
}

/**
 * Works out which organization a subscription belongs to.
 *
 * The metadata set at checkout is the direct answer. The customer id is the
 * fallback for a subscription created some other way — in the Stripe dashboard
 * by hand, for instance.
 */
async function resolveOrganizationId(
  subscription: Stripe.Subscription
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.organizationId;
  if (fromMetadata) {
    const exists = await db.organization.findUnique({
      where: { id: fromMetadata },
      select: { id: true },
    });
    if (exists) return exists.id;
  }

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return null;

  const byCustomer = await db.organization.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return byCustomer?.id ?? null;
}
