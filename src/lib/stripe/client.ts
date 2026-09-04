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
  if (!cached) cached = new Stripe(key);
  return cached;
}

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

// The Stripe price for each paid tier. These are ids, not secrets — they name a
// price object in the Stripe dashboard and are safe in logs or error messages.
const PRICE_ENV: Record<Exclude<SubscriptionTier, "NONE">, string> = {
  STARTER: "STRIPE_PRICE_STARTER",
  GROWTH: "STRIPE_PRICE_GROWTH",
  SCALE: "STRIPE_PRICE_SCALE",
};

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

/** Which tiers can actually be purchased on this deployment. */
export function purchasableTiers(): Exclude<SubscriptionTier, "NONE">[] {
  return (Object.keys(PRICE_ENV) as Exclude<SubscriptionTier, "NONE">[]).filter(
    (tier) => Boolean(process.env[PRICE_ENV[tier]]?.trim())
  );
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
