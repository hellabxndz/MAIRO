import Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe/client";
import { applySubscription } from "@/lib/stripe/apply-subscription";
import { hasActivePlan } from "@/lib/readiness";
import { reportError } from "@/lib/monitoring/report";
import { RETURN_TO, type ReturnTo } from "@/lib/billing/checkout";

// The return from Stripe Checkout.
//
// The success URL proves nothing: anyone can type /billing/return?session_id=…
// So the session is read back from Stripe with the secret key, checked to
// belong to the signed-in business, and its subscription is recorded exactly
// as the webhook would record it. Only a subscription Stripe itself reports
// as active or trialing unlocks anything. The webhook still runs and lands on
// the same state; whichever arrives first does the work.

export type ConfirmResult =
  | { kind: "active"; returnTo: ReturnTo; status: "active" | "trialing" }
  /** Paid, but on a price this deployment doesn't map to a plan. Ours to fix; the customer is told so. */
  | { kind: "unrecognised"; returnTo: ReturnTo }
  /** Stripe hasn't finished: payment processing, or a step the bank asked for. */
  | { kind: "pending"; returnTo: ReturnTo }
  | { kind: "failed"; returnTo: ReturnTo; reason: "expired" | "unfinished" | "declined" | "ended" }
  | { kind: "not-yours" }
  | { kind: "invalid" }
  | { kind: "unreachable"; returnTo: ReturnTo | null };

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

function returnToOf(session: Stripe.Checkout.Session): ReturnTo {
  const saved = session.metadata?.returnTo as ReturnTo | undefined;
  // Sessions opened before the destination was saved on them came from the plan's activation step or billing.
  return saved && RETURN_TO.includes(saved) ? saved : session.success_url?.includes("/plan/activate") ? "plan" : "/dashboard/billing";
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function confirmCheckout(sessionId: string, organizationId: string): Promise<ConfirmResult> {
  if (!SESSION_ID.test(sessionId)) return { kind: "invalid" };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.code === "resource_missing") return { kind: "invalid" };
    console.error(`Couldn't read checkout session ${sessionId} from Stripe:`, error instanceof Error ? error.message : error);
    await reportError(error, { where: "stripe checkout return", level: "warning" });
    return { kind: "unreachable", returnTo: null };
  }

  const subscription = session.subscription && typeof session.subscription === "object" ? (session.subscription as Stripe.Subscription) : null;
  const returnTo = returnToOf(session);

  // Whose checkout is this? Stripe's answer, not the URL's: the organization
  // recorded on the session (or, for older sessions, on its subscription),
  // and the Stripe customer on file for this business.
  const owner = session.metadata?.organizationId ?? session.client_reference_id ?? subscription?.metadata?.organizationId ?? null;
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { stripeCustomerId: true } });
  const customer = idOf(session.customer);
  if (session.mode !== "subscription" || owner !== organizationId || !org?.stripeCustomerId || customer !== org.stripeCustomerId) {
    console.warn(`Checkout return: session ${sessionId} does not belong to organization ${organizationId}.`);
    await reportError(new Error("Checkout return for a session that belongs to someone else"), { where: "stripe checkout return", level: "warning" });
    return { kind: "not-yours" };
  }

  if (session.status === "expired") return { kind: "failed", returnTo, reason: "expired" };
  if (session.status === "open") return { kind: "failed", returnTo, reason: "unfinished" };
  if (!subscription) return { kind: "pending", returnTo };

  // Recorded whatever its state, exactly as the webhook would, so this page
  // and the webhook can never disagree.
  try {
    await applySubscription(subscription);
  } catch (error) {
    console.error(`Couldn't record subscription ${subscription.id} on return from checkout:`, error instanceof Error ? error.message : error);
    await reportError(error, { where: "stripe checkout return" });
    return { kind: "unreachable", returnTo };
  }

  if (subscription.status === "active" || subscription.status === "trialing") {
    const after = await db.organization.findUnique({ where: { id: organizationId }, select: { subscriptionTier: true, subscriptionStatus: true, paymentRequired: true } });
    if (after && after.subscriptionTier !== "NONE" && hasActivePlan({ ...after, paymentRequired: true })) {
      return { kind: "active", returnTo, status: subscription.status as "active" | "trialing" };
    }
    // applySubscription has already logged which price didn't match.
    await reportError(new Error("A paid checkout's price matches no plan on this deployment"), { where: "stripe checkout return", tags: { subscriptionStatus: subscription.status } });
    return { kind: "unrecognised", returnTo };
  }
  if (subscription.status === "incomplete") {
    // Checkout completes only once the first payment succeeds or is underway
    // (a bank transfer, a 3-D Secure step); "unpaid" here means underway.
    return session.payment_status === "unpaid" ? { kind: "pending", returnTo } : { kind: "failed", returnTo, reason: "declined" };
  }
  return { kind: "failed", returnTo, reason: subscription.status === "past_due" || subscription.status === "unpaid" ? "declined" : "ended" };
}
