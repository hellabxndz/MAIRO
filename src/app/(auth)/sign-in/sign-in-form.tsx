"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signInAction } from "@/lib/actions/auth-actions";
import { signInErrorMessage } from "@/lib/google-sign-in-rules";
import { GoogleButton, OrDivider } from "@/components/google-button";
import { AuthField, PasswordField } from "@/components/auth-field";

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, formAction, pending] = useActionState(signInAction, undefined);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  // A failed or cancelled Google login comes back here as ?error=. The form's
  // own error, from the last password attempt, takes over once there is one.
  const redirectError = signInErrorMessage(searchParams.get("error"));
  const error = state?.error ?? redirectError;
  // Back from "choose a new password": say it worked and fill in the address.
  const resetDone = searchParams.get("reset") === "1";
  const resetEmail = resetDone ? (searchParams.get("email") ?? undefined) : undefined;

  return (
    <div>
      <h1 className="mb-1 text-[22px] font-bold tracking-[-0.02em] text-white">Welcome back</h1>
      <p className="mb-6 text-sm text-neutral-400">Sign in to your MAIRO dashboard.</p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <AuthField
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@business.com"
          defaultValue={state?.values?.email ?? resetEmail}
        />
        <PasswordField autoComplete="current-password" />
        <p className="-mt-2 text-right text-[13px]">
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center sm:pointer-fine:min-h-0 text-neutral-400 underline-offset-4 hover:text-white hover:underline">
            Forgot your password?
          </Link>
        </p>

        {resetDone && !error && (
          <p role="status" className="rounded-lg border border-emerald-400/30 bg-emerald-500/[0.06] px-3 py-2 text-[13.5px] text-emerald-300">
            Your password has been changed. Sign in with the new one.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/[0.06] px-3 py-2 text-[13.5px] text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="min-h-[46px] w-full rounded-lg bg-[image:var(--mairo-ramp)] px-3 py-2.5 text-[15px] font-semibold text-black shadow-[var(--mairo-glow-key)] transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>

        {googleEnabled && (
          <>
            <OrDivider />
            <GoogleButton mode="signin" />
          </>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-neutral-400">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="text-white underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
