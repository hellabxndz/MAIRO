"use client";

import { useActionState } from "react";
import Link from "next/link";
import { freelancerSignUpAction } from "@/lib/actions/auth-actions";
import { GoogleButton, OrDivider } from "@/components/google-button";
import { AuthField, PasswordField } from "@/components/auth-field";

export function FreelancerSignUpForm({
  googleEnabled,
  initialError,
}: {
  googleEnabled: boolean;
  /** Sent back from a Google login that needs this page, e.g. no account yet. */
  initialError: string | null;
}) {
  const [state, formAction, pending] = useActionState(freelancerSignUpAction, undefined);
  const fieldError = (name: string) => (state?.field === name ? state.error : null);
  const formError = state?.error && !state.field ? state.error : !state ? initialError : null;

  return (
    <div>
      <h1 className="text-[22px] font-bold tracking-[-0.02em] text-white">Set up your studio</h1>
      <p className="mt-1 text-[14px] leading-relaxed text-neutral-400">
        For people who run ads for other businesses. One login, every client you
        work with, each with their own ad account and campaigns.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <AuthField name="name" label="Your name" autoComplete="name" placeholder="Jane Diaz" defaultValue={state?.values?.name} error={fieldError("name")} />
        <AuthField
          name="studioName"
          label="Studio name"
          autoComplete="organization"
          placeholder="Diaz Media"
          defaultValue={state?.values?.studioName}
          error={fieldError("studioName")}
          hint="What your clients know you as. Only you see this."
        />
        <AuthField
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@yourstudio.com"
          defaultValue={state?.values?.email}
          error={fieldError("email")}
        />
        <PasswordField autoComplete="new-password" isNew error={fieldError("password")} />

        {formError && (
          <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/[0.06] px-3 py-2 text-[13.5px] text-red-400">
            {formError}
          </p>
        )}
        {state?.field && (
          <p role="alert" className="sr-only">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="min-h-[46px] w-full rounded-lg bg-[image:var(--mairo-ramp)] px-3 py-2.5 text-[15px] font-semibold text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Creating your studio…" : "Create studio"}
        </button>

        <p className="text-center text-[12.5px] leading-relaxed text-neutral-500">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="text-neutral-300 underline underline-offset-2 hover:text-white">Terms</Link> and the{" "}
          <Link href="/privacy" className="text-neutral-300 underline underline-offset-2 hover:text-white">Privacy policy</Link>.
        </p>

        {googleEnabled && (
          <>
            <OrDivider />
            <GoogleButton mode="freelancer" nameField="studioName" nameLabel="studio name" />
          </>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-neutral-400">
        Running ads for your own business?{" "}
        <Link href="/sign-up" className="text-white underline">
          Sign up here
        </Link>
      </p>
    </div>
  );
}
