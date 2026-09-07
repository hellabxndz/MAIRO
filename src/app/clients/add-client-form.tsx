"use client";

import { useActionState } from "react";
import { addClientAction, type ClientActionState } from "@/lib/actions/client-actions";

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
      <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.02] p-6 text-sm text-neutral-400">
        Choose a freelancer plan to start adding client businesses.
      </div>
    );
  }

  return (
    <form action={action} className="mt-10 rounded-xl border border-white/10 bg-white/[0.02] p-6">
      <p className="text-sm font-medium">Add a client</p>
      <p className="mt-1 text-xs text-neutral-500">
        {room > 0
          ? `Room for ${room} more on your plan.`
          : "You've used every client on your plan — upgrade to add another."}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <input
          name="name"
          required
          disabled={room === 0 || pending}
          placeholder="Business name"
          className="rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-600 focus:border-white/30 disabled:opacity-40"
        />
        <input
          name="industry"
          disabled={room === 0 || pending}
          placeholder="Industry (optional)"
          className="rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-600 focus:border-white/30 disabled:opacity-40"
        />
      </div>

      {state?.error && <p className="mt-4 text-sm text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={room === 0 || pending}
        className="mt-5 rounded-full bg-white px-5 py-2.5 text-xs font-medium text-black transition hover:bg-neutral-200 disabled:opacity-40"
      >
        {pending ? "Adding…" : "Add client"}
      </button>
    </form>
  );
}
