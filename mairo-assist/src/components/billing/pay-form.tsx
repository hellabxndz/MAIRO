"use client";

import { Lock } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { payForChosenPlan } from "@/lib/onboarding/actions";
import type { FormState } from "@/lib/validation/form";

export function PayForPlanForm({ plan, next, label }: { plan: string; next: string; label: string }) {
  const [state, action] = useActionState(payForChosenPlan, {} as FormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="next" value={next} />
      <SubmitButton size="lg" className="w-full" pendingText="Opening secure checkout…">
        <Lock aria-hidden /> {label}
      </SubmitButton>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
    </form>
  );
}
