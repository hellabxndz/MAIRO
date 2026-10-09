"use server";

import { checkoutGuard } from "@/lib/billing/checkout-guard";
import Stripe from "stripe";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, priceIdFor, stripeMode } from "@/lib/stripe/client";
import type { SubscriptionTier } from "@/generated/prisma/enums";
import { ALL_PLANS, isFreelancerTier, trialDaysFor } from "@/lib/plans";

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
  if (/No such customer/i.test(raw)) {
    return "Your billing record belongs to a Stripe account this site no longer uses. Try again — a fresh one is made automatically.";
  }
  if (/No such price|resource_missing/i.test(raw)) {
    const mode = stripeMode();
    // Naming the mode the key is in turns this from a thing to go and check
    // into a thing to go and fix. The prices have to have been created in the
    // same mode, and the mode is not visible anywhere in a price id.
    const which =
      mode === "unknown"
        ? "Check that STRIPE_SECRET_KEY and the STRIPE_PRICE_* ids all come from the same mode."
        : `This deployment's STRIPE_SECRET_KEY is a ${mode.toUpperCase()} mode key, so every ` +
          `STRIPE_PRICE_* id has to be a price created in ${mode} mode. Prices from the other ` +
          `mode are invisible to it, even though the ids look the same.`;
    return `Stripe doesn't recognise this plan's price. ${which}`;
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
 * Whether a saved customer id still names a live customer in the Stripe
 * account this deployment's key belongs to.
 *
 * It stops doing so when the site moves to a different Stripe account (a new
 * key), when the key switches between test and live mode, or when the
 * customer is deleted in the dashboard. In every case the id is dead weight,
 * and handing it to Stripe fails the checkout with "No such customer".
 * Anything other than "that customer doesn't exist" is re-thrown: a network
 * blip must not make MAIRO forget a customer who is real.
 */
async function customerStillExists(customerId: string): Promise<boolean> {
  try {
    const customer = await stripe().customers.retrieve(customerId);
    return !("deleted" in customer && customer.deleted);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.code === "resource_missing") return false;
    throw error;
  }
}

/**
 * Finds or creates the Stripe customer for an organization.
 *
 * The id is written back immediately so a second checkout never creates a
 * duplicate customer — which is how one business ends up with two
 * subscriptions and two invoices for the same month. A saved id that this
 * Stripe account doesn't recognise is replaced rather than reused.
 */
async function customerIdFor(organizationId: string, email: string): Promise<string> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { stripeCustomerId: true, name: true },
  });
  if (!organization) throw new Error("Organization not found");
  if (organization.stripeCustomerId && (await customerStillExists(organization.stripeCustomerId))) {
    return organization.stripeCustomerId;
  }

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

  // Derived from the plans themselves rather than spelled out here. The
  // hand-written list did not know the freelancer tiers existed, so Studio and
  // Agency came back as "not a plan we sell" — a list of literals in one file
  // that has to be kept in step with another file will eventually not be.
  const tier = formData.get("tier");
  const sellable = ALL_PLANS.map((p) => p.tier);
  if (typeof tier !== "string" || !sellable.includes(tier as SubscriptionTier)) {
    return { error: "That isn't a plan we sell." };
  }
  const chosen = tier as Exclude<SubscriptionTier, "NONE">;

  const organizationId = session.user.organizationId;
  const email = session.user.email;

  // Never a second subscription for one business (see checkoutGuard).
  const onFile = await db.organization.findUnique({ where: { id: organizationId }, select: { stripeSubscriptionId: true, subscriptionStatus: true } });
  const guard = checkoutGuard({ stripeSubscriptionId: onFile?.stripeSubscriptionId ?? null, subscriptionStatus: onFile?.subscriptionStatus ?? null });
  if (guard.kind === "refuse") return { error: guard.message };
  if (guard.kind === "replace-incomplete") {
    await stripe()
      .subscriptions.cancel(guard.subscriptionId)
      .catch((error) => console.error(`Couldn't cancel incomplete subscription ${guard.subscriptionId}:`, error));
  }

  // The redirect has to happen outside the try: Next signals a redirect by
  // throwing, so catching around it would swallow the navigation and report a
  // successful checkout as a failure.
  let checkoutUrl: string;
  try {
    checkoutUrl = await createCheckoutUrl({ organizationId, email, tier: chosen });
  } catch (error) {
    console.error("Stripe checkout failed:", error);
    return { error: explainStripeError(error) };
  }
  redirect(checkoutUrl);
}

async function createCheckoutUrl(input: {
  organizationId: string;
  email: string;
  tier: Exclude<SubscriptionTier, "NONE">;
}): Promise<string> {
  const { organizationId, email, tier } = input;
  const customerId = await customerIdFor(organizationId, email);
  const origin = await originUrl();

  // Come back to the screen that is actually yours. A freelancer who paid and
  // landed on a business's dashboard page would either be bounced back to /clients
  // (no client open) or shown some client's business settings — neither of
  // which is the account that just bought anything.
  //
  // A business selling online goes somewhere else again: the one set of
  // questions MAIRO holds back until there is a subscription to act on. The
  // goal is read here rather than on the way back, because the return URL is
  // fixed when checkout opens and Stripe will not decide this for us.
  const sellingOnline = isFreelancerTier(tier)
    ? false
    : (
        await db.onboardingIntake.findUnique({
          where: { organizationId },
          select: { primaryGoal: true },
        })
      )?.primaryGoal === "SALES";

  const home = isFreelancerTier(tier)
    ? "/clients"
    : sellingOnline
      ? "/dashboard/sales-setup"
      : "/dashboard/billing";

  // A business coming from its approved free plan returns to the step that
  // turns that plan into its first campaign, or back to its plan if it
  // cancels — never to a screen that starts over.
  const journey = isFreelancerTier(tier)
    ? null
    : await db.strategyPlan.findUnique({ where: { organizationId }, select: { status: true, activatedAt: true } });
  const fromPlan = journey?.status === "APPROVED" && !journey.activatedAt;

  const checkout = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdFor(tier), quantity: 1 }],
    success_url: fromPlan ? `${origin}/plan/activate?subscribed=1` : `${origin}${home}?subscribed=1`,
    cancel_url: fromPlan ? `${origin}/plan/activate?checkout=cancelled` : `${origin}${home}?checkout=cancelled`,
    // Carried onto the subscription so the webhook can identify the
    // organization without a lookup, and without trusting anything the client
    // sent us.
    subscription_data: {
      metadata: { organizationId },
      // The trial. Stripe still collects a card, which is deliberate: it is
      // what lets the subscription continue without a second conversation,
      // and a trial that ends by silently locking somebody out of campaigns
      // that are live and spending would be worse for them than a charge.
      //
      // Starter only: read from the plan, so the checkout and the copy cannot
      // disagree about which plans have one or how long it is. Every other
      // plan has none, and the field is omitted entirely rather than sent as
      // 0, which Stripe rejects.
      ...(trialDaysFor(tier) > 0 ? { trial_period_days: trialDaysFor(tier) } : {}),
    },
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
