import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/monitoring/report";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { applySubscription, currentSubscription } from "@/lib/stripe/apply-subscription";

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
    await reportError(new Error("STRIPE_WEBHOOK_SECRET is not set"), { where: "stripe webhook" });
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
      await applySubscription(await currentSubscription(event.data.object as Stripe.Subscription));
    }
  } catch (error) {
    // A 500 asks Stripe to retry, which is what we want for a transient
    // database problem — the alternative is a paying customer stuck on the
    // free tier because one write failed once.
    console.error(`Stripe webhook ${event.type} failed:`, error);
    await reportError(error, { where: "stripe webhook", tags: { eventType: event.type } });
    return NextResponse.json({ error: "Failed to record subscription." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
