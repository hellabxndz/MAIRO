import Stripe from "stripe";
import type { SubscriptionTier } from "@/generated/prisma/enums";

// Stripe wiring. Everything about money goes through here.
//
// Two ideas shape it. Stripe is the source of truth for what someone is paying
// for — the columns on Organization are a cache the webhook keeps in step, so
// a page load never has to call Stripe to know a client's plan. And nothing in
// this app ever touches a card number: subscribing and cancelling both happen
// on Stripe's own hosted pages, which keeps card data off our servers entirely
// and means PCI compliance is Stripe's problem rather than ours.

let cached: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set on this deployment, so payments can't be taken yet."
    );
  }
  // Reused across requests: the client holds a connection pool, and building a
  // new one per call is wasted work on every checkout.
  if (!cached) cached = new Stripe(key, fakeStripeHost(key));
  return cached;
}

/**
 * Browser tests point the client at a local fake Stripe
 * (scripts/e2e/fake-stripe.mjs) with STRIPE_FAKE_API. Honoured only with a
 * test-mode key, so it can never redirect a live deployment's payments.
 */
function fakeStripeHost(key: string): Stripe.StripeConfig | undefined {
  const fake = process.env.STRIPE_FAKE_API?.trim();
  if (!fake || !key.startsWith("sk_test_")) return undefined;
  const url = new URL(fake);
  return { host: url.hostname, port: Number(url.port), protocol: url.protocol === "http:" ? "http" : "https" };
}

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/**
 * Which Stripe mode this deployment's key is for, read straight off the key's
 * prefix.
 *
 * Worth having because test and live are completely separate worlds in Stripe —
 * separate products, separate prices, separate customers — and price ids look
 * identical across them. A live key genuinely cannot see a price created in
 * test mode, and the only symptom is "No such price", which sounds like the
 * price is missing rather than like it is in the other mode.
 *
 * Returning it lets an error say which mode the key is actually in instead of
 * asking someone to go and check.
 */
export function stripeMode(): "test" | "live" | "unknown" {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  return "unknown";
}

// The Stripe price for each paid tier. These are ids, not secrets — they name a
// price object in the Stripe dashboard and are safe in logs or error messages.
// Every plan's Stripe price, sold or not. PRO and SCALE_V2 are the two plans
// MAIRO sells; the rest are earlier plans whose subscribers keep their prices,
// so their variables stay set for as long as anyone pays on them — the
// webhook matches a subscription to its plan through this table, and a price
// that matches nothing leaves the plan as it was rather than guessing.
const PRICE_ENV: Record<Exclude<SubscriptionTier, "NONE">, string> = {
  PRO: "STRIPE_PRICE_PRO",
  SCALE_V2: "STRIPE_PRICE_SCALE_V2",
  STARTER: "STRIPE_PRICE_STARTER",
  GROWTH: "STRIPE_PRICE_GROWTH",
  SCALE: "STRIPE_PRICE_SCALE",
  // Freelancer tiers. purchasableTiers() filters on whether the variable is
  // set, so until these prices exist in Stripe the freelancer plans simply
  // cannot be bought — which is the right behaviour, not an error.
  STUDIO: "STRIPE_PRICE_STUDIO",
  AGENCY: "STRIPE_PRICE_AGENCY",
};

/**
 * The environment variables that name a Stripe price.
 *
 * Exported for check:env, which cannot see these any other way. They are read
 * through PRICE_ENV rather than written out as process.env.STRIPE_PRICE_SCALE,
 * so a scan for literal process.env access finds none of them — which is how
 * STRIPE_PRICE_STUDIO and STRIPE_PRICE_AGENCY went undocumented long enough
 * for the freelancer plans to be unbuyable without anybody noticing.
 */
export function priceEnvNames(): string[] {
  return Object.values(PRICE_ENV);
}

/**
 * The variable that holds a tier's Stripe price. Checkout, the webhook and the
 * price check all go through this one table, so what the setup page compares
 * against the pricing page is the price checkout actually charges.
 */
export function priceEnvFor(tier: SubscriptionTier): string {
  return tier === "NONE" ? "" : PRICE_ENV[tier];
}

export function priceIdFor(tier: Exclude<SubscriptionTier, "NONE">): string {
  const value = process.env[PRICE_ENV[tier]]?.trim();
  if (!value) {
    throw new Error(
      `${PRICE_ENV[tier]} is not set, so the ${tier} plan can't be bought yet. ` +
        "Create the price in Stripe and add its id to the environment."
    );
  }
  return value;
}

/**
 * Which tiers can actually be bought on this deployment: the plans MAIRO
 * sells (Pro and Scale) whose price is set. An earlier plan's price stays set
 * for its existing subscribers, and that must not make it buyable again.
 */
export function purchasableTiers(): Exclude<SubscriptionTier, "NONE">[] {
  return (["PRO", "SCALE_V2"] as const).filter((tier) => Boolean(process.env[PRICE_ENV[tier]]?.trim()));
}

/** Maps a Stripe price id back to the tier it sells, or null if unrecognised. */
export function tierForPriceId(priceId: string): SubscriptionTier | null {
  for (const [tier, envName] of Object.entries(PRICE_ENV)) {
    if (process.env[envName]?.trim() === priceId) return tier as SubscriptionTier;
  }
  return null;
}

// Statuses Stripe reports for a subscription that is genuinely paid for.
// past_due is deliberately included: a card that failed a retry has not been
// cancelled, and cutting a business off from their live ad campaigns over a
// temporary payment problem is worse for them and for us than waiting for
// Stripe to finish its retry schedule.
const ENTITLING = new Set(["active", "trialing", "past_due"]);

export function statusEntitles(status: string | null | undefined): boolean {
  return Boolean(status && ENTITLING.has(status));
}
