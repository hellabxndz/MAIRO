"use client";

import { useActionState } from "react";
import { primaryButtonClass } from "@/components/ui";
import { startCheckoutAction, type BillingActionState } from "@/lib/actions/billing-actions";

// The subscribe button, with somewhere for a failure to be seen.
//
// A successful press leaves for Stripe's checkout page. A failed one stays
// here and says why, in words for the customer (the operator's detail is in
// the server logs and error tracking), and the button becomes "Retry
// checkout". It is disabled while a request is in flight, and the server
// reuses one open checkout per plan, so repeated presses never open two.

export function PlanButton({ tier, label }: { tier: string; label: string }) {
  const [state, formAction, pending] = useActionState<BillingActionState, FormData>(
    startCheckoutAction,
    undefined
  );

  return (
    <form action={formAction} className="mt-4" data-checkout-tier={tier}>
      <input type="hidden" name="tier" value={tier} />
      <button type="submit" disabled={pending} aria-busy={pending} className={`${primaryButtonClass} w-full`}>
        {pending ? "Opening Stripe…" : state?.error ? "Retry checkout" : label}
      </button>
      {state?.error && (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-red-300">
          {state.error}
          {state.code && <span className="mt-1 block text-[11px] text-faint">Reference: {state.code}</span>}
        </p>
      )}
    </form>
  );
}
