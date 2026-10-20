"use client";

import { useActionState } from "react";
import { primaryButtonClass } from "@/components/ui";
import { changePlanAction, type BillingActionState } from "@/lib/actions/billing-actions";

// The button that moves an existing subscription to another plan. Like
// PlanButton, a failure comes back here and is shown under it.

export function ChangePlanButton({ tier, label }: { tier: string; label: string }) {
  const [state, formAction, pending] = useActionState<BillingActionState, FormData>(changePlanAction, undefined);
  return (
    <form action={formAction} className="mt-5">
      <input type="hidden" name="tier" value={tier} />
      <button type="submit" disabled={pending} className={`${primaryButtonClass} w-full sm:w-auto`}>
        {pending ? "One moment…" : label}
      </button>
      {state?.error && <p role="alert" className="mt-3 text-xs leading-relaxed text-red-300">{state.error}</p>}
    </form>
  );
}
