"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInviteAction, joinWithInviteAction, type JoinState } from "@/lib/actions/team-actions";
import { AuthField, PasswordField } from "@/components/auth-field";

const primary = "min-h-[46px] w-full rounded-lg bg-[image:var(--mairo-ramp)] px-3 py-2.5 text-[15px] font-semibold text-black shadow-[var(--mairo-glow-key)] transition hover:brightness-110 disabled:opacity-60";

/** Signed in with the invited address: one button, and only the server's answer counts. */
export function AcceptInvite({ token, business }: { token: string; business: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-6 space-y-3">
      <button
        type="button"
        disabled={pending}
        className={primary}
        onClick={() =>
          start(async () => {
            const r = await acceptInviteAction(token);
            if (!r.ok) return setError(r.error);
            router.push("/dashboard");
            router.refresh();
          })
        }
      >
        {pending ? "Joining…" : `Join ${business}`}
      </button>
      {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/[0.06] px-3 py-2 text-[13.5px] text-red-400">{error}</p>}
      <p className="text-[12.5px] leading-relaxed text-neutral-500">Your own business, if you have one, stays as it is. You can switch between them from the menu.</p>
    </div>
  );
}

/** No login yet: name and password; the address is the invitation's. */
export function JoinForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinWithInviteAction.bind(null, token), undefined);
  const fieldError = (name: string) => (state?.field === name ? state.error : null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <p className="text-[13px] font-medium text-neutral-300">Email</p>
        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[14px] text-neutral-300">{email}</p>
      </div>
      <AuthField name="name" label="Your name" autoComplete="name" defaultValue={state?.name} error={fieldError("name")} />
      <PasswordField autoComplete="new-password" isNew error={fieldError("password")} />
      {state?.error && !state.field && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/[0.06] px-3 py-2 text-[13.5px] text-red-400">{state.error}</p>}
      {state?.field && <p role="alert" className="sr-only">{state.error}</p>}
      <button type="submit" disabled={pending} className={primary}>{pending ? "Joining…" : "Create login and join"}</button>
      <p className="text-center text-[12.5px] leading-relaxed text-neutral-500">
        By joining you agree to the <a href="/terms" className="underline underline-offset-4 hover:text-white">Terms</a> and <a href="/privacy" className="underline underline-offset-4 hover:text-white">Privacy Policy</a>.
      </p>
    </form>
  );
}
