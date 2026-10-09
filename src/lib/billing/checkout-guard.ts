// Whether a new checkout may start, given the subscription already on file.
//
// A second checkout while one subscription is live would create a second
// subscription — two charges for one business. Plan changes go through
// Stripe's billing portal instead, which prorates and shows the charge first.
//
// An "incomplete" subscription never took a payment (the first card was
// declined), so the old one is cancelled and a fresh checkout is allowed —
// otherwise a customer whose card failed could never try another.

export type CheckoutGuard = { kind: "ok" } | { kind: "replace-incomplete"; subscriptionId: string } | { kind: "refuse"; message: string };

const LIVE = ["active", "trialing", "past_due", "unpaid"];

export const ALREADY_SUBSCRIBED =
  "You already have a MAIRO subscription. To change plans, use Manage billing — Stripe works out the difference, so you're never charged twice.";

export function checkoutGuard(org: { stripeSubscriptionId: string | null; subscriptionStatus: string | null }): CheckoutGuard {
  if (!org.stripeSubscriptionId) return { kind: "ok" };
  if (LIVE.includes(org.subscriptionStatus ?? "")) return { kind: "refuse", message: ALREADY_SUBSCRIBED };
  if (org.subscriptionStatus === "incomplete") return { kind: "replace-incomplete", subscriptionId: org.stripeSubscriptionId };
  return { kind: "ok" };
}

/**
 * Whether a webhook is news about an older subscription than the one on
 * record — the abandoned checkout cancelled when a fresh one started, say.
 * Its "canceled" event can land after the new subscription is active and must
 * not put a paying client back on no plan. A live subscription is always
 * taken, so one set up by hand in Stripe still counts.
 */
export function supersededSubscription(storedId: string | null | undefined, subscription: { id: string; status: string }): boolean {
  const live = subscription.status === "active" || subscription.status === "trialing";
  return !!storedId && storedId !== subscription.id && !live;
}
