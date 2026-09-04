"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, priceIdFor } from "@/lib/stripe/client";
import type { SubscriptionTier } from "@/generated/prisma/enums";

// Starting a checkout and opening the billing portal. Both hand off to a page
// Stripe hosts, so no card details ever reach this application.


/**
 * Turns a Stripe failure into something the person clicking the button can act
 * on, and — more often — something the person who configured the deployment can.
 *
 * The generic Next.js error page tells nobody anything, and a failed checkout is
 * a failed sale. Every case here is a real configuration mistake seen in
 * practice rather than a guess at what Stripe might say.
 */
function explainStripeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  // The most common one by far, and the least obvious: Stripe keeps test and
  // live data completely separate, so a live key genuinely cannot see a price
  // created in test mode. The ids look identical, which is what makes it
  // confusing.
  if (/No such price|resource_missing/i.test(raw)) {
    return (
      "Stripe doesn't recognise this plan's price. That usually means the API key " +
      "and the products are in different modes — a test key can't see live prices, " +
      "or the other way round. Check that STRIPE_SECRET_KEY and the STRIPE_PRICE_* " +
      "ids all come from the same mode."
    );
  }
  if (/Invalid API Key|No API key|Expired API Key/i.test(raw)) {
    return "Stripe rejected the API key. Check STRIPE_SECRET_KEY on this deployment.";
  }
  if (/testmode|test mode|live mode/i.test(raw)) {
    return (
      "Stripe reported a test/live mode mismatch. The API key and the price ids " +
      "have to come from the same mode."
    );
  }
  if (/rate limit/i.test(raw)) {
    return "Stripe is rate limiting us. Try again in a moment.";
  }
  return `Stripe couldn't start the checkout: ${raw}`;
}

/** The site's own origin, so Stripe knows where to send someone back to. */
async function originUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (domain) return `https://${domain}`;

  // Local development, and a last resort in production: the host the request
  // actually arrived on.
  const host = (await headers()).get("host");
  if (host) return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;

  throw new Error("Can't work out this site's URL to return from Stripe.");
}

/**
 * Finds or creates the Stripe customer for an organization.
 *
 * The id is written back immediately so a second checkout never creates a
 * duplicate customer — which is how one business ends up with two
 * subscriptions and two invoices for the same month.
 */
async function customerIdFor(organizationId: string, email: string): Promise<string> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { stripeCustomerId: true, name: true },
  });
  if (!organization) throw new Error("Organization not found");
  if (organization.stripeCustomerId) return organization.stripeCustomerId;

  const customer = await stripe().customers.create({
    email,
    name: organization.name,
    // Lets a Stripe-side event be traced back to an organization even if the
    // local row is somehow missing.
    metadata: { organizationId },
  });

  await db.organization.update({
    where: { id: organizationId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/**
 * Sends the client to Stripe to subscribe.
 *
 * Redirects, so it never returns on success. A failure throws and is caught by
 * the error boundary rather than silently leaving the button dead.
 */
export type BillingActionState = { error?: string } | undefined;

export async function startCheckoutAction(
  _prevState: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.email) {
    redirect("/sign-in");
  }

  const tier = formData.get("tier");
  if (tier !== "STARTER" && tier !== "GROWTH" && tier !== "SCALE") {
    return { error: "That isn't a plan we sell." };
  }

  const organizationId = session.user.organizationId;
  const email = session.user.email;

  // The redirect has to happen outside the try: Next signals a redirect by
  // throwing, so catching around it would swallow the navigation and report a
  // successful checkout as a failure.
  let checkoutUrl: string;
  try {
    checkoutUrl = await createCheckoutUrl({ organizationId, email, tier });
  } catch (error) {
    console.error("Stripe checkout failed:", error);
    return { error: explainStripeError(error) };
  }
  redirect(checkoutUrl);
}

async function createCheckoutUrl(input: {
  organizationId: string;
  email: string;
  tier: "STARTER" | "GROWTH" | "SCALE";
}): Promise<string> {
  const { organizationId, email, tier } = input;
  const customerId = await customerIdFor(organizationId, email);
  const origin = await originUrl();

  const checkout = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdFor(tier as Exclude<SubscriptionTier, "NONE">), quantity: 1 }],
    success_url: `${origin}/dashboard/settings?subscribed=1`,
    cancel_url: `${origin}/dashboard/settings?checkout=cancelled`,
    // Carried onto the subscription so the webhook can identify the
    // organization without a lookup, and without trusting anything the client
    // sent us.
    subscription_data: { metadata: { organizationId } },
    // Lets Stripe collect the address it needs for tax where that applies.
    billing_address_collection: "auto",
    allow_promotion_codes: true,
  });

  if (!checkout.url) throw new Error("Stripe didn't return a checkout page.");
  return checkout.url;
}

/**
 * Opens Stripe's billing portal, where the client changes plan, updates a card
 * or cancels. All of that is Stripe's hosted UI — building our own would mean
 * reimplementing proration, invoices and dunning for no benefit.
 */
export async function openBillingPortalAction(): Promise<void> {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organization = await db.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { stripeCustomerId: true },
  });
  if (!organization?.stripeCustomerId) {
    throw new Error("There's no billing account to manage yet.");
  }

  const portal = await stripe().billingPortal.sessions.create({
    customer: organization.stripeCustomerId,
    return_url: `${await originUrl()}/dashboard/settings`,
  });
  redirect(portal.url);
}
