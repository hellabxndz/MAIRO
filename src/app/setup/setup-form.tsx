"use client";

import { useActionState } from "react";
import { createOwnerAction } from "@/lib/actions/auth-actions";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-white/30";

export function SetupForm({ token }: { token?: string }) {
  const [state, formAction, pending] = useActionState(createOwnerAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {/* Carried through so the action can re-verify it. The page already
          checked the token to decide whether to render at all, but a server
          action is its own entry point and has to check for itself. */}
      {token && <input type="hidden" name="token" value={token} />}
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400">Your name</label>
        <input name="name" required className={inputClass} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400">Email</label>
        <input name="email" type="email" required className={inputClass} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400">Password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className={inputClass}
          placeholder="At least 8 characters"
        />
      </div>

      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
      >
        {pending ? "Saving..." : token ? "Reset owner access" : "Create owner account"}
      </button>
    </form>
  );
}
