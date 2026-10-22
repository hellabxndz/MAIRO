import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { confirmCheckout, type ConfirmResult } from "@/lib/billing/confirm-checkout";
import type { ReturnTo } from "@/lib/billing/checkout";
import { JourneyFrame } from "@/components/strategy/journey";
import { LEGAL } from "@/lib/legal";

// Back from Stripe Checkout.
//
// The URL only names a Checkout Session; what it is worth is decided by
// reading that session back from Stripe (lib/billing/confirm-checkout.ts).
// A confirmed subscription goes straight on — to building the approved plan,
// or wherever the checkout was started from. Anything else says plainly what
// happened, with a way to retry, and never sends a paying customer back to
// choose a plan again.
//
// Outside /dashboard on purpose: the dashboard sends unpaid businesses to
// their plan, and this page has to be reachable before payment is recorded.

export const metadata = { title: "Confirming your subscription" };
export const dynamic = "force-dynamic";

/** About 40 seconds of looking again before saying it's taking longer than usual. */
const MAX_TRIES = 10;

function destination(returnTo: ReturnTo): string {
  // /plan/activate turns a paid, approved plan into its first campaign and moves on by itself.
  return returnTo === "plan" ? "/plan/activate" : `${returnTo}?subscribed=1`;
}

function retryHref(returnTo: ReturnTo | null): string {
  return returnTo === "plan" || returnTo === null ? "/plan/activate?skip=1#plans" : returnTo;
}

function Card({ title, children, tone = "plain" }: { title: string; children: React.ReactNode; tone?: "plain" | "warn" | "alert" }) {
  const border = tone === "alert" ? "border-red-400/40" : tone === "warn" ? "border-amber-400/30" : "border-white/[0.07]";
  return (
    <div className={`mx-auto mt-6 max-w-[560px] rounded-2xl border ${border} bg-field/80 p-8 text-center`} data-checkout-return>
      <p className="text-[18px] font-semibold text-white">{title}</p>
      {children}
    </div>
  );
}

const primary = "mt-5 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#ffffff] px-6 text-[14px] font-medium text-black hover:brightness-110";
const quiet = "mt-3 block text-[12.5px] text-faint hover:text-white";

export default async function CheckoutReturnPage({ searchParams }: { searchParams: Promise<{ session_id?: string; try?: string }> }) {
  const { session_id: sessionId = "", try: tryParam } = await searchParams;
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/billing/return?session_id=${sessionId}`)}`);
  }

  const result: ConfirmResult = await confirmCheckout(sessionId, session.user.organizationId);
  const tries = Math.max(0, Math.min(MAX_TRIES, Number.parseInt(tryParam ?? "0", 10) || 0));

  if (result.kind === "active") redirect(destination(result.returnTo));

  const support = (
    <p className="mt-4 text-[12px] text-faint">
      Need a hand? <a href={`mailto:${LEGAL.contactEmail}`} className="underline underline-offset-2 hover:text-white">{LEGAL.contactEmail}</a>
    </p>
  );

  if (result.kind === "pending" || result.kind === "unreachable") {
    const waiting = tries < MAX_TRIES;
    const again = `/billing/return?session_id=${encodeURIComponent(sessionId)}&try=${tries + 1}`;
    return (
      <JourneyFrame steps={null} here="subscribe">
        <Card title={waiting ? "Confirming your subscription with Stripe…" : "Stripe is taking longer than usual"} tone={waiting ? "plain" : "warn"}>
          {waiting && <meta httpEquiv="refresh" content={`4;url=${again}`} />}
          <p className="mt-2 text-[14px] text-muted">
            {waiting
              ? "This usually takes a few seconds. The page checks again on its own, then MAIRO carries on."
              : "We haven't had Stripe's confirmation yet. If your payment went through, nothing more is needed — it will show up shortly. You won't be charged twice for checking again."}
          </p>
          {!waiting && (
            <>
              <Link href={again} className={primary}>Check again</Link>
              {support}
            </>
          )}
        </Card>
      </JourneyFrame>
    );
  }

  if (result.kind === "unrecognised") {
    return (
      <JourneyFrame steps={null} here="subscribe">
        <Card title="Your payment went through — we're finishing your setup" tone="warn">
          <p className="mt-2 text-[14px] text-muted">
            Stripe confirmed your subscription, but your plan didn&rsquo;t switch on automatically. That&rsquo;s a setup problem on our side, and we&rsquo;ve been alerted. Please don&rsquo;t pay again — we&rsquo;ll switch it on and let you know.
          </p>
          {support}
        </Card>
      </JourneyFrame>
    );
  }

  if (result.kind === "failed") {
    const copy = {
      expired: ["That checkout expired", "Checkout pages last a limited time, and this one ran out before payment. Nothing was charged."],
      unfinished: ["Checkout wasn't finished", "Stripe hasn't taken a payment for this checkout. Nothing was charged."],
      declined: ["Your payment didn't go through", "Stripe couldn't take the first payment, so nothing was charged. Try another card, or check with your bank and try again."],
      ended: ["That subscription has ended", "This checkout's subscription is no longer active. Nothing more will be charged for it."],
    }[result.reason];
    return (
      <JourneyFrame steps={null} here="subscribe">
        <Card title={copy[0]} tone="alert">
          <p className="mt-2 text-[14px] text-muted">{copy[1]} Your plan, business details and connected accounts are all saved.</p>
          <Link href={retryHref(result.returnTo)} className={primary}>Retry checkout</Link>
          {support}
        </Card>
      </JourneyFrame>
    );
  }

  // invalid, or a session that isn't this business's.
  return (
    <JourneyFrame steps={null} here="subscribe">
      <Card title="We couldn't find that checkout" tone="alert">
        <p className="mt-2 text-[14px] text-muted">This link doesn&rsquo;t match a checkout for your account, so nothing has changed. If you&rsquo;ve just paid, your plan will show up once Stripe confirms it.</p>
        <Link href="/plan/activate?skip=1#plans" className={primary}>Back to plans</Link>
        <Link href="/dashboard/billing" className={quiet}>Go to billing</Link>
        {support}
      </Card>
    </JourneyFrame>
  );
}
