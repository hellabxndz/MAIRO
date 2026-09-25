"use client";

import { Power, PowerOff } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { installChatWidget, removeChatWidget } from "@/lib/widget/actions";
import type { FormState } from "@/lib/validation/form";

export function WidgetControls({ installed, canInstall }: { installed: boolean; canInstall: boolean }) {
  const [addState, add] = useActionState(installChatWidget, {} as FormState);
  const [removeState, remove] = useActionState(removeChatWidget, {} as FormState);
  const state = addState.message ? addState : removeState;
  return (
    <div className="space-y-3">
      {installed ? (
        <form action={remove}>
          <SubmitButton variant="secondary" pendingText="Removing…"><PowerOff aria-hidden /> Remove from my store</SubmitButton>
        </form>
      ) : (
        <form action={add}>
          <SubmitButton size="lg" disabled={!canInstall} pendingText="Adding to your store…"><Power aria-hidden /> Turn on chat widget</SubmitButton>
        </form>
      )}
      {state.message && <Alert tone={state.ok ? "success" : "warning"}>{state.message}</Alert>}
    </div>
  );
}
