"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction } from "@/lib/actions/auth-actions";
import { GoogleButton, OrDivider } from "@/components/google-button";
import { AuthField, PasswordField } from "@/components/auth-field";

export function SignUpForm({
  googleEnabled,
  initialError,
}: {
  googleEnabled: boolean;
  /** Sent back from a Google login that needs this page, e.g. no account yet. */
  initialError: string | null;
}) {
  const [state, formAction, pending] = useActionState(signUpAction, undefined);
  const fieldError = (name: string) => (state?.field === name ? state.error : null);
  // An error about one field shows under that field; anything else (or a
  // Google redirect) shows above the button.
  const formError = state?.error && !state.field ? state.error : !state ? initialError : null;

  return (
    <div>
      <h1 className="text-[22px] font-bold tracking-[-0.02em] text-white">Create your free account</h1>
      <p className="mt-1 text-[14px] text-neutral-400">Get a personalized advertising plan for your business. No credit card needed.</p>

      <form action={formAction} className="mt-6 space-y-4">
        <AuthField name="name" label="Your name" autoComplete="name" placeholder="Jane Diaz" defaultValue={state?.values?.name} error={fieldError("name")} />
        <AuthField
          name="businessName"
          label="Business name"
          autoComplete="organization"
          placeholder="Diaz Dental Co."
          defaultValue={state?.values?.businessName}
          error={fieldError("businessName")}
          hint="The name your customers know you by. MAIRO uses it in your ads; you can change it later in Settings."
        />
        <AuthField
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@business.com"
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
          {pending ? "Creating your account…" : "Create account"}
        </button>

        <p className="text-center text-[12.5px] leading-relaxed text-neutral-500">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="text-neutral-300 underline underline-offset-2 hover:text-white">Terms</Link> and the{" "}
          <Link href="/privacy" className="text-neutral-300 underline underline-offset-2 hover:text-white">Privacy policy</Link>.
        </p>

        {googleEnabled && (
          <>
            <OrDivider />
            <GoogleButton mode="client" nameField="businessName" nameLabel="business name" />
          </>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-neutral-400">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-white underline">
          Sign in
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-neutral-500">
        Run ads for other businesses?{" "}
        <Link href="/for-freelancers" className="text-neutral-300 underline">
          Set up a studio
        </Link>
      </p>
    </div>
  );
}
