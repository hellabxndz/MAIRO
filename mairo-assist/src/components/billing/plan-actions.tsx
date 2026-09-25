"use client";

import { ExternalLink } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { choosePlan, openBillingPortal } from "@/lib/billing/actions";
import type { FormState } from "@/lib/validation/form";

export function ChoosePlanButton({ plan, label, primary }: { plan: string; label: string; primary?: boolean }) {
  const [state, action] = useActionState(choosePlan, {} as FormState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="plan" value={plan} />
      <SubmitButton className="w-full" variant={primary ? "primary" : "secondary"} pendingText="Working…">
        {label}
      </SubmitButton>
      {state.message && <Alert tone={state.ok ? "success" : "warning"}>{state.message}</Alert>}
    </form>
  );
}

export function ManageBillingButton() {
  const [state, action] = useActionState(openBillingPortal, {} as FormState);
  return (
    <form action={action} className="space-y-2">
      <SubmitButton size="sm" variant="secondary" pendingText="Opening…">
        <ExternalLink aria-hidden /> Manage billing
      </SubmitButton>
      {state.message && <p className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}
