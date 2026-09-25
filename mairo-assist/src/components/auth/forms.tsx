"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  forgotPasswordAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "@/app/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/validation/form";

const initial: FormState = {};

function invalid(state: FormState, key: string) {
  return state.errors?.[key]?.length ? true : undefined;
}

export function SignUpForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signUpAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Full name" htmlFor="fullName" errors={state.errors?.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required defaultValue={state.values?.fullName} aria-invalid={invalid(state, "fullName")} />
      </Field>
      <Field label="Business email" htmlFor="email" errors={state.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} aria-invalid={invalid(state, "email")} />
      </Field>
      <Field label="Password" htmlFor="password" errors={state.errors?.password} hint="At least 10 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required aria-invalid={invalid(state, "password")} />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" errors={state.errors?.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required aria-invalid={invalid(state, "confirmPassword")} />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Creating your account…">
        Create Free Account
      </SubmitButton>
      <p className="text-center text-sm text-fg-muted">
        No credit card required.
        <br />
        Your Free plan never expires.
      </p>
      <p className="text-center text-xs text-fg-subtle">
        By creating an account you agree to our <Link href="/terms" className="underline hover:text-fg">Terms</Link> and{" "}
        <Link href="/privacy" className="underline hover:text-fg">Privacy Policy</Link>.
      </p>
    </form>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && (
        <Alert tone={state.values?.unverified ? "warning" : "danger"}>
          {state.message}{" "}
          {state.values?.unverified && (
            <Link className="font-medium text-fg underline" href={`/verify-email?email=${encodeURIComponent(state.values.email ?? "")}`}>
              Resend link
            </Link>
          )}
        </Alert>
      )}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email" errors={state.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} aria-invalid={invalid(state, "email")} />
      </Field>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium">Password</label>
          <Link href="/forgot-password" className="text-xs text-fg-muted hover:text-fg">Forgot password?</Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={invalid(state, "password")} />
        {state.errors?.password && <p className="text-xs text-danger">{state.errors.password[0]}</p>}
      </div>
      <SubmitButton className="w-full" size="lg" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initial);
  if (state.ok) return <Alert tone="success" title="Check your inbox">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Field label="Email" htmlFor="email" errors={state.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Field label="New password" htmlFor="password" errors={state.errors?.password} hint="At least 10 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" errors={state.errors?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Saving…">
        Set new password
      </SubmitButton>
    </form>
  );
}

export function ResendVerificationForm({ email }: { email?: string }) {
  const [state, action] = useActionState(resendVerificationAction, initial);
  return (
    <form action={action} className="space-y-3" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Email" htmlFor="email" errors={state.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} />
      </Field>
      <SubmitButton variant="secondary" className="w-full" pendingText="Sending…">
        Resend verification email
      </SubmitButton>
    </form>
  );
}
