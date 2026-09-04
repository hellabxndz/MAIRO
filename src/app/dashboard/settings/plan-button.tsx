"use client";

import { useActionState } from "react";
import { primaryButtonClass } from "@/components/ui";
import { startCheckoutAction, type BillingActionState } from "@/lib/actions/billing-actions";

// The subscribe button, with somewhere for a failure to be seen.
//
// This used to be a plain form posting straight to the server action, which
// meant a Stripe misconfiguration threw and the client got Next's generic
// "this page couldn't load" screen — no message, nothing to act on, and a
// failed sale. Now the reason comes back and sits under the button.

export function PlanButton({ tier, label }: { tier: string; label: string }) {
  const [state, formAction, pending] = useActionState<BillingActionState, FormData>(
    startCheckoutAction,
    undefined
  );

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="tier" value={tier} />
      <button type="submit" disabled={pending} className={`${primaryButtonClass} w-full`}>
        {pending ? "Opening Stripe…" : label}
      </button>
      {state?.error && (
        <p className="mt-3 text-xs leading-relaxed text-red-300">{state.error}</p>
      )}
    </form>
  );
}
