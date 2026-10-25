"use client";

import { useActionState } from "react";
import { primaryButtonClass } from "@/components/ui";
import { endTrialNowAction, type BillingActionState } from "@/lib/actions/billing-actions";

// Ends the free trial and charges the plan today. Says the amount on the
// button; a declined card changes nothing.

export function EndTrialButton({ label }: { label: string }) {
  const [state, formAction, pending] = useActionState<BillingActionState, FormData>(endTrialNowAction, undefined);
  return (
    <form action={formAction} className="mt-3">
      <button type="submit" disabled={pending} aria-busy={pending} className={primaryButtonClass}>
        {pending ? "Starting your plan…" : label}
      </button>
      {state?.error && (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-red-300">
          {state.error}
        </p>
      )}
    </form>
  );
}
