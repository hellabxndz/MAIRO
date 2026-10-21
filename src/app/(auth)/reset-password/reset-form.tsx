"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/lib/actions/auth-actions";
import { AuthField, PasswordField } from "@/components/auth-field";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, undefined);
  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="token" value={token} />
      <PasswordField label="New password" autoComplete="new-password" isNew error={state?.field === "password" ? state.error : null} />
      <AuthField name="confirm" label="Type it again" type="password" autoComplete="new-password" error={state?.field === "confirm" ? state.error : null} />
      {state?.error && !state.field && (
        <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/[0.06] px-3 py-2 text-[13.5px] text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-[46px] w-full rounded-lg bg-[image:var(--mairo-ramp)] px-3 py-2.5 text-[15px] font-semibold text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save my new password"}
      </button>
    </form>
  );
}
