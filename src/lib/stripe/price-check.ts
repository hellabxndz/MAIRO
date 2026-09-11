import Stripe from "stripe";
import { PLANS, FREELANCER_PLANS, type Plan } from "@/lib/plans";
import { billingConfigured, stripe, stripeMode } from "@/lib/stripe/client";

// Does Stripe agree with the pricing page?
//
// This is the one inconsistency in MAIRO that nothing else can catch. What a
// customer is SHOWN comes from priceMonthly in src/lib/plans.ts; what their
// card is CHARGED comes from the Stripe Price behind STRIPE_PRICE_*. The two
// are set in different places by different people at different times, and
// nothing fails when they disagree — the site advertises one number, Stripe
// takes another, and the first anyone knows is a card statement.
//
// So the check is: for each tier, read the price back out of Stripe and
// compare the amount to what the card says. Everything here is read-only.

export type PriceCheck = {
  tier: string;
  planName: string;
  envName: string;
  /** What the pricing page advertises, in cents. */
  advertisedCents: number;
  /** What Stripe would actually charge, in cents. Null when not readable. */
  stripeCents: number | null;
  currency: string | null;
  /** Monthly, yearly, one-off… Anything but month is a misconfiguration. */
  interval: string | null;
  state:
    | "ok"
    | "not_set"
    | "amount_mismatch"
    | "wrong_interval"
    | "not_found"
    | "unreadable";
  /** What to do about it, when there is something to do. */
  detail: string | null;
};

const PRICE_ENV: Record<string, string> = {
  STARTER: "STRIPE_PRICE_STARTER",
  GROWTH: "STRIPE_PRICE_GROWTH",
  SCALE: "STRIPE_PRICE_SCALE",
  STUDIO: "STRIPE_PRICE_STUDIO",
  AGENCY: "STRIPE_PRICE_AGENCY",
};

function money(cents: number, currency = "usd"): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  });
}

/**
 * Compares every configured Stripe price against the plan it sells.
 *
 * Never throws: this runs on a diagnostics page, and a page that dies because
 * Stripe is having a slow minute tells you nothing about your configuration.
 * Anything unreadable comes back as a state rather than an exception.
 */
export async function checkPrices(): Promise<PriceCheck[]> {
  const plans: Plan[] = [...PLANS, ...FREELANCER_PLANS];

  return Promise.all(
    plans.map(async (plan): Promise<PriceCheck> => {
      const envName = PRICE_ENV[plan.tier] ?? `STRIPE_PRICE_${plan.tier}`;
      // Rounded, because priceMonthly is a float: 39.99 * 100 is not reliably
      // 3999 across every value, and an off-by-one-cent false alarm on this
      // page would be worse than no page.
      const advertisedCents = Math.round(plan.priceMonthly * 100);
      const base = { tier: plan.tier, planName: plan.name, envName, advertisedCents };

      const priceId = process.env[envName]?.trim();
      if (!priceId) {
        return {
          ...base,
          stripeCents: null,
          currency: null,
          interval: null,
          state: "not_set",
          detail: `Nobody can buy ${plan.name} until this points at a Stripe price.`,
        };
      }

      if (!billingConfigured()) {
        return {
          ...base,
          stripeCents: null,
          currency: null,
          interval: null,
          state: "unreadable",
          detail: "STRIPE_SECRET_KEY isn't set, so the price can't be read back.",
        };
      }

      try {
        const price = await stripe().prices.retrieve(priceId);
        const stripeCents = price.unit_amount ?? null;
        const interval = price.recurring?.interval ?? null;

        if (interval !== "month") {
          return {
            ...base,
            stripeCents,
            currency: price.currency,
            interval,
            state: "wrong_interval",
            detail: interval
              ? `This price bills every ${interval}, but the page says /mo.`
              : "This is a one-off price, not a subscription.",
          };
        }

        if (stripeCents !== advertisedCents) {
          return {
            ...base,
            stripeCents,
            currency: price.currency,
            interval,
            state: "amount_mismatch",
            detail:
              `The page says ${money(advertisedCents, price.currency)} and Stripe charges ` +
              `${stripeCents === null ? "an unknown amount" : money(stripeCents, price.currency)}. ` +
              `Create a new price in Stripe at ${money(advertisedCents, price.currency)} and point ` +
              `${envName} at it.`,
          };
        }

        return {
          ...base,
          stripeCents,
          currency: price.currency,
          interval,
          state: "ok",
          detail: null,
        };
      } catch (error) {
        // The specific failure worth naming. Test and live are separate worlds
        // in Stripe and price ids look identical across them, so a live key
        // reading a test price says "No such price" — which sounds like the
        // price was deleted rather than like it is in the other mode.
        const notFound =
          error instanceof Stripe.errors.StripeError && error.code === "resource_missing";
        const mode = stripeMode();
        return {
          ...base,
          stripeCents: null,
          currency: null,
          interval: null,
          state: notFound ? "not_found" : "unreadable",
          detail: notFound
            ? `Stripe has no price with this id. Your key is in ${mode} mode — a price created ` +
              `in the other mode is invisible to it, which looks exactly like this.`
            : error instanceof Error
              ? error.message
              : "Couldn't read this price from Stripe.",
        };
      }
    })
  );
}
