"use client";

import { useActionState } from "react";
import { addClientAction, type ClientActionState } from "@/lib/actions/client-actions";
import { GlassPanel } from "@/components/mairo";
import { inputClass, primaryButtonClass } from "@/components/ui";

// Adding a client is two fields and a button on purpose. The rest of the
// business — goal, budget, audience — is asked once you are inside it, by the
// onboarding the client's own owner would have gone through.

export function AddClientForm({ room, allowed }: { room: number; allowed: number }) {
  const [state, action, pending] = useActionState<ClientActionState, FormData>(
    addClientAction,
    undefined
  );

  if (allowed === 0) {
    return (
      <GlassPanel className="mt-8 p-6" as="section">
        <div data-tour="add">
          <p className="text-[15px] font-medium text-white">No client slots on this plan</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Choose a freelancer plan to start adding client businesses.
          </p>
        </div>
      </GlassPanel>
    );
  }

  const full = room === 0;

  return (
    <GlassPanel className="mt-8 p-5 sm:p-6" as="section" lit={!full}>
      <form action={action} data-tour="add">
        <p className="text-[15px] font-medium text-white">Add a client</p>
        <p className="mt-1.5 text-[13px] text-muted">
          {full
            ? "You've used every client on your plan — upgrade to add another."
            : `Room for ${room} more on your plan.`}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <input
            name="name"
            required
            disabled={full || pending}
            placeholder="Business name"
            className={`${inputClass} disabled:opacity-40`}
          />
          <input
            name="industry"
            disabled={full || pending}
            placeholder="Industry (optional)"
            className={`${inputClass} disabled:opacity-40`}
          />
        </div>

        {state?.error && <p className="mt-4 text-sm text-alert">{state.error}</p>}

        <button type="submit" disabled={full || pending} className={`mt-5 ${primaryButtonClass}`}>
          {pending ? "Adding…" : "Add client"}
        </button>
      </form>
    </GlassPanel>
  );
}
