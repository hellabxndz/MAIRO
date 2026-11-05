"use client";

import { useActionState } from "react";
import { requestPasswordResetAction } from "@/lib/actions/auth-actions";
import { RESET_SENT_MESSAGE } from "@/lib/password-reset-messages";
import { AuthField } from "@/components/auth-field";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, undefined);
  if (state?.sent) {
    return (
      <p role="status" className="mt-3 rounded-lg border border-[color:var(--v3-line)] bg-white/[0.04] px-3 py-2.5 text-[13.5px] leading-relaxed text-white/90">
        {RESET_SENT_MESSAGE}
      </p>
    );
  }
  return (
    <>
      <p className="mb-6 text-sm text-neutral-400">Enter the email you sign in with and we&apos;ll send you a link to choose a new one.</p>
      <form action={formAction} className="space-y-4">
        <AuthField
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@business.com"
          defaultValue={state?.values?.email}
          error={state?.field === "email" ? state.error : null}
        />
        {state?.error && state.field !== "email" && (
          <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/[0.06] px-3 py-2 text-[13.5px] text-red-400">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="min-h-[46px] w-full rounded-lg bg-white px-3 py-2.5 text-[15px] font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send me a reset link"}
        </button>
      </form>
    </>
  );
}
