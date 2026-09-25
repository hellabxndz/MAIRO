"use client";

import { Play } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { activateFromOnboarding } from "@/lib/onboarding/actions";
import type { FormState } from "@/lib/validation/form";

export function ActivateForm({ canActivate, aiName }: { canActivate: boolean; aiName: string }) {
  const [state, action] = useActionState(activateFromOnboarding, {} as FormState);
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-violet/30 bg-violet/[0.06] p-5">
      <p className="text-sm">
        {canActivate
          ? `${aiName} is tested and ready. Activating publishes this setup and switches ${aiName} on.`
          : `Test ${aiName} in the previous step first — we only switch on an AI employee you've tried.`}
      </p>
      <SubmitButton size="lg" disabled={!canActivate} pendingText="Activating…">
        <Play aria-hidden /> Activate your AI employee
      </SubmitButton>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
    </form>
  );
}
