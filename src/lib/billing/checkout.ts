import Stripe from "stripe";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { stripe, priceEnvFor, priceIdFor, purchasableTiers, stripeMode } from "@/lib/stripe/client";
import { reportError } from "@/lib/monitoring/report";
import type { SubscriptionTier } from "@/generated/prisma/enums";
import { isFreelancerTier, isSoldTier, planFor, trialDaysFor } from "@/lib/plans";
import { trialEligible } from "@/lib/billing/trial-claims";
import { checkoutGuard } from "@/lib/billing/checkout-guard";
import { payingBusinessOf } from "@/lib/brands";
import { adClickIds } from "@/lib/site-tracking";

// Starting a Stripe Checkout for MAIRO Pro or MAIRO Scale.
//
// Everything here runs on the server with the secret key; the browser only
// ever names the plan it wants, and that name is checked against the plans
// MAIRO sells. Each plan buys its own price — nothing is ever substituted —
// and a plan whose price isn't configured says so, to the customer and to the
// operator, instead of quietly sending them back to the page they came from.
//
// The server action (lib/actions/billing-actions.ts) does the session and
// role checks and the redirect; this is the part that can be tested without
// a request.

export type CheckoutTier = Exclude<SubscriptionTier, "NONE">;

export type CheckoutErrorCode =
  | "not_sold"
  | "plan_unavailable"
  | "paid_elsewhere"
  | "already_subscribed"
  | "stripe_config"
  | "stripe_unavailable"
  | "checkout_failed";

export type CheckoutResult =
  | { kind: "redirect"; url: string; reused: boolean }
  | { kind: "error"; code: CheckoutErrorCode; message: string };

/** Where a finished checkout lands, kept on the session so the return page needn't guess. */
export type ReturnTo = "plan" | "/clients" | "/dashboard/sales-setup" | "/dashboard/billing";
export const RETURN_TO: readonly ReturnTo[] = ["plan", "/clients", "/dashboard/sales-setup", "/dashboard/billing"];

const NOTHING_CHARGED = "Nothing was charged.";

/** What the customer reads. The operator's detail goes to the logs and error tracking, never here. */
function customerMessage(code: CheckoutErrorCode, tier: CheckoutTier | null): string {
  const name = tier ? planFor(tier).name : "This plan";
  switch (code) {
    case "plan_unavailable":
      return `${name} can't be bought right now because its payment setup isn't finished on our side. ${NOTHING_CHARGED} We've been alerted — please try again later, or contact support.`;
    case "stripe_config":
      return `We couldn't open Stripe Checkout because of a setup problem on our side. ${NOTHING_CHARGED} We've been alerted — please try again shortly.`;
    case "stripe_unavailable":
      return `Stripe didn't respond in time. ${NOTHING_CHARGED} Please try again.`;
    default:
      return `We couldn't open Stripe Checkout. ${NOTHING_CHARGED} Please try again.`;
  }
}

/**
 * The operator's explanation of a Stripe failure: which setting to look at.
 * Logged and sent to error tracking only. Names the key's mode, never the key.
 */
export function explainStripeError(error: unknown): { code: CheckoutErrorCode; operator: string } {
  const raw = error instanceof Error ? error.message : String(error);
  if (/STRIPE_PRICE_\w+ is not set|STRIPE_SECRET_KEY is not set/.test(raw)) return { code: "plan_unavailable", operator: raw };
  if (/No such customer/i.test(raw)) {
    return { code: "checkout_failed", operator: "The saved Stripe customer belongs to another Stripe account or mode; a fresh one is made on the next attempt." };
  }
  if (/No such price|resource_missing/i.test(raw)) {
    const mode = stripeMode();
    return {
      code: "stripe_config",
      operator:
        mode === "unknown"
          ? "Stripe doesn't recognise this plan's price. Check that STRIPE_SECRET_KEY and the STRIPE_PRICE_* ids all come from the same mode."
          : `Stripe doesn't recognise this plan's price. This deployment's STRIPE_SECRET_KEY is a ${mode.toUpperCase()} mode key, so every STRIPE_PRICE_* id has to be a price created in ${mode} mode.`,
    };
  }
  if (/Invalid API Key|No API key|Expired API Key/i.test(raw)) return { code: "stripe_config", operator: "Stripe rejected the API key. Check STRIPE_SECRET_KEY on this deployment." };
  if (/testmode|test mode|live mode/i.test(raw)) return { code: "stripe_config", operator: "Stripe reported a test/live mode mismatch: the API key and the price ids have to come from the same mode." };
  if (/recurring|one-time price|mode `subscription`/i.test(raw)) return { code: "stripe_config", operator: `The price for this plan isn't a recurring price, so it can't be used for a subscription: ${raw}` };
  if (/rate limit/i.test(raw) || error instanceof Stripe.errors.StripeConnectionError || error instanceof Stripe.errors.StripeAPIError) {
    return { code: "stripe_unavailable", operator: `Stripe was unavailable: ${raw}` };
  }
  return { code: "checkout_failed", operator: `Stripe couldn't start the checkout: ${raw}` };
}

/** Records why a checkout couldn't start, for whoever runs the deployment. */
async function logCheckoutFailure(code: CheckoutErrorCode, operator: string, context: { organizationId: string; tier: string }, error?: unknown) {
  const stripeError = error instanceof Stripe.errors.StripeError ? { type: error.type, code: error.code, requestId: error.requestId } : undefined;
  console.error(`Checkout could not start (${code}) for organization ${context.organizationId}, plan ${context.tier}: ${operator}`, stripeError ?? "");
  await reportError(error instanceof Error ? error : new Error(operator), {
    where: "stripe checkout",
    level: code === "stripe_unavailable" ? "warning" : "error",
    tags: { code, tier: context.tier, mode: stripeMode() },
  });
}

/** The site's own origin, so Stripe knows where to send someone back to. */
export async function originUrl(): Promise<string> {
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
export async function customerStillExists(customerId: string): Promise<boolean> {
  try {
    const customer = await stripe().customers.retrieve(customerId);
    return !("deleted" in customer && customer.deleted);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.code === "resource_missing") return false;
    throw error;
  }
}

/** Ten-second windows: two clicks that close together are one request to Stripe. */
function window10s(): number {
  return Math.floor(Date.now() / 10_000);
}

/**
 * Finds or creates the Stripe customer for an organization.
 *
 * The id is written back immediately so a second checkout never creates a
 * duplicate customer — which is how one business ends up with two
 * subscriptions and two invoices for the same month. A saved id that this
 * Stripe account doesn't recognise is replaced rather than reused.
 */
export async function customerIdFor(organizationId: string, email: string): Promise<string> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { stripeCustomerId: true, name: true },
  });
  if (!organization) throw new Error("Organization not found");
  if (organization.stripeCustomerId && (await customerStillExists(organization.stripeCustomerId))) {
    return organization.stripeCustomerId;
  }

  const customer = await stripe().customers.create(
    {
      email,
      name: organization.name,
      // Lets a Stripe-side event be traced back to an organization even if the
      // local row is somehow missing.
      metadata: { organizationId },
    },
    // Two clicks arriving together make one customer, not two.
    { idempotencyKey: `customer-${organizationId}-${window10s()}` }
  );

  await db.organization.update({
    where: { id: organizationId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/**
 * Where a checkout for this business comes back to.
 *
 * A freelancer goes to their clients; a business coming from its approved
 * free plan goes back to the step that turns that plan into its first
 * campaign; a business selling online goes to the one set of questions MAIRO
 * holds back until there is a subscription; everyone else to billing. Read
 * when checkout opens, because the return URL is fixed then.
 */
export async function returnDestination(organizationId: string, tier: CheckoutTier): Promise<ReturnTo> {
  if (isFreelancerTier(tier)) return "/clients";
  const [journey, intake] = await Promise.all([
    db.strategyPlan.findUnique({ where: { organizationId }, select: { status: true, activatedAt: true } }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { primaryGoal: true } }),
  ]);
  if (journey?.status === "APPROVED" && !journey.activatedAt) return "plan";
  return intake?.primaryGoal === "SALES" ? "/dashboard/sales-setup" : "/dashboard/billing";
}

/** Where someone who cancels on Stripe's page lands: the plans again, never a screen that starts over. */
export function cancelPath(returnTo: ReturnTo): string {
  // skip=1 keeps the plans on screen for a business that hasn't connected Meta yet.
  return returnTo === "plan" ? "/plan/activate?skip=1&checkout=cancelled#plans" : `${returnTo}?checkout=cancelled`;
}

/**
 * An open checkout for the same business and plan, if there is one; every
 * other open checkout for this customer is expired. So repeated clicks reuse
 * one session, and a Pro checkout in one tab and a Scale checkout in another
 * can't both be paid — only the latest choice stays payable.
 */
async function reuseOrExpireOpenSessions(customerId: string, want: { organizationId: string; tier: CheckoutTier; successUrl: string; cancelUrl: string }): Promise<string | null> {
  const open = await stripe().checkout.sessions.list({ customer: customerId, status: "open", limit: 10 });
  // At least ten minutes left, so nobody is sent to a page about to expire.
  const soonest = Math.floor(Date.now() / 1000) + 600;
  let reuse: string | null = null;
  for (const s of open.data) {
    const same =
      s.mode === "subscription" &&
      s.metadata?.organizationId === want.organizationId &&
      s.metadata?.tier === want.tier &&
      s.success_url === want.successUrl &&
      s.cancel_url === want.cancelUrl;
    if (!reuse && same && s.url && s.expires_at > soonest) {
      reuse = s.url;
      continue;
    }
    await stripe()
      .checkout.sessions.expire(s.id)
      .catch((error) => console.error(`Couldn't expire an older open checkout ${s.id}:`, error instanceof Error ? error.message : error));
  }
  return reuse;
}

/**
 * Starts (or reuses) a subscription-mode Checkout Session for this business
 * and plan. Every refusal comes back as a message for the customer; every
 * failure that is ours to fix is also logged and reported.
 */
export async function beginCheckout(input: { organizationId: string; email: string; tier: string }): Promise<CheckoutResult> {
  const { organizationId, email } = input;
  const fail = (code: CheckoutErrorCode, tier: CheckoutTier | null, message?: string): CheckoutResult => ({ kind: "error", code, message: message ?? customerMessage(code, tier) });

  if (!isSoldTier(input.tier as SubscriptionTier)) return fail("not_sold", null, "That isn't a plan we sell.");
  const tier = input.tier as CheckoutTier;

  // The plan's own price, or an explicit "can't be bought" — never another plan's price.
  if (!purchasableTiers().includes(tier)) {
    const missing = !process.env.STRIPE_SECRET_KEY?.trim() ? "STRIPE_SECRET_KEY" : priceEnvFor(tier);
    await logCheckoutFailure("plan_unavailable", `${missing} is not set on this deployment, so ${planFor(tier).name} can't be bought.`, { organizationId, tier });
    return fail("plan_unavailable", tier);
  }
  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    await logCheckoutFailure("plan_unavailable", "STRIPE_SECRET_KEY is not set on this deployment.", { organizationId, tier });
    return fail("plan_unavailable", tier);
  }

  // A business added under a MAIRO Scale plan is paid for by that plan.
  const payer = await payingBusinessOf(organizationId);
  if (payer) return fail("paid_elsewhere", tier, `${payer.name}'s MAIRO Scale plan pays for this business. Billing is managed there.`);

  // Never a second subscription for one business (see checkoutGuard).
  const onFile = await db.organization.findUnique({ where: { id: organizationId }, select: { stripeSubscriptionId: true, subscriptionStatus: true } });
  const guard = checkoutGuard({ stripeSubscriptionId: onFile?.stripeSubscriptionId ?? null, subscriptionStatus: onFile?.subscriptionStatus ?? null });
  if (guard.kind === "refuse") return fail("already_subscribed", tier, guard.message);

  try {
    if (guard.kind === "replace-incomplete") {
      await stripe()
        .subscriptions.cancel(guard.subscriptionId)
        .catch((error) => console.error(`Couldn't cancel incomplete subscription ${guard.subscriptionId}:`, error instanceof Error ? error.message : error));
    }

    const customerId = await customerIdFor(organizationId, email);
    const origin = await originUrl();
    const returnTo = await returnDestination(organizationId, tier);
    // Stripe fills in {CHECKOUT_SESSION_ID}; the return page reads that
    // session back from Stripe before anything is unlocked.
    const successUrl = `${origin}/billing/return?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}${cancelPath(returnTo)}`;

    const reused = await reuseOrExpireOpenSessions(customerId, { organizationId, tier, successUrl, cancelUrl });
    if (reused) return { kind: "redirect", url: reused, reused: true };

    // One trial per business and per Meta ad account (lib/billing/trial-claims.ts).
    const trialDays = trialDaysFor(tier) > 0 && (await trialEligible(organizationId)) ? trialDaysFor(tier) : 0;
    const metadata = { organizationId, tier, returnTo };
    // Meta's cookies from this browser, for MAIRO's own ad measurement when
    // the subscription starts (lib/site-tracking.ts). Empty unless that's on.
    const clickIds = await adClickIds();
    const checkout = await stripe().checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        client_reference_id: organizationId,
        line_items: [{ price: priceIdFor(tier), quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        // On the session, for the return page; and carried onto the
        // subscription so the webhook can identify the organization without
        // a lookup, and without trusting anything the client sent us.
        metadata,
        subscription_data: {
          metadata: { organizationId, ...clickIds },
          // The trial. Stripe still collects a card, which is deliberate: it
          // is what lets the subscription continue without a second
          // conversation, and a trial that ends by silently locking somebody
          // out of campaigns that are live and spending would be worse for
          // them than a charge.
          //
          // MAIRO Pro only: read from the plan, so the checkout and the copy
          // cannot disagree about which plans have one or how long it is.
          // Every other plan has none, nor does a business that already had
          // its trial; the field is omitted entirely rather than sent as 0,
          // which Stripe rejects.
          ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        },
        // Lets Stripe collect the address it needs for tax where that applies.
        billing_address_collection: "auto",
        allow_promotion_codes: true,
      },
      // A double click, or two tabs clicking together, gets the same session.
      { idempotencyKey: `checkout-${organizationId}-${tier}-${window10s()}` }
    );

    if (!checkout.url) throw new Error("Stripe didn't return a checkout page.");
    return { kind: "redirect", url: checkout.url, reused: false };
  } catch (error) {
    const { code, operator } = explainStripeError(error);
    // A customer from another Stripe account is forgotten, so the retry makes a fresh one.
    if (/No such customer/i.test(error instanceof Error ? error.message : "")) {
      await db.organization.update({ where: { id: organizationId }, data: { stripeCustomerId: null } }).catch(() => undefined);
    }
    await logCheckoutFailure(code, operator, { organizationId, tier }, error);
    return fail(code, tier);
  }
}
