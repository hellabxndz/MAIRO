"use client";

import { Laptop, Loader2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { changeEmail, changePassword, revokeSession, signOutEverywhere, signOutOtherDevices, updateProfile } from "@/lib/account/actions";
import type { FormState } from "@/lib/validation/form";

const initial: FormState = {};

function Result({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>;
}

export function ProfileForm({ fullName }: { fullName: string }) {
  const [state, action] = useActionState(updateProfile, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Result state={state} />
      <Field label="Name" htmlFor="fullName" errors={state.errors?.fullName}>
        <Input id="fullName" name="fullName" defaultValue={fullName} autoComplete="name" />
      </Field>
      <SubmitButton pendingText="Saving…">Save name</SubmitButton>
    </form>
  );
}

export function EmailForm({ email }: { email: string }) {
  const [state, action] = useActionState(changeEmail, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Result state={state} />
      <Field label="Email" htmlFor="email" errors={state.errors?.email} hint="We'll email a confirmation link before anything changes.">
        <Input id="email" name="email" type="email" defaultValue={email} autoComplete="email" />
      </Field>
      <SubmitButton variant="secondary" pendingText="Sending…">Change email</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, initial);
  return (
    <form action={action} className="space-y-4" key={state.ok ? "done" : "form"}>
      <Result state={state} />
      <Field label="Current password" htmlFor="current" errors={state.errors?.current}>
        <Input id="current" name="current" type="password" autoComplete="current-password" />
      </Field>
      <Field label="New password" htmlFor="password" errors={state.errors?.password} hint="At least 10 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" errors={state.errors?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" />
      </Field>
      <SubmitButton variant="secondary" pendingText="Changing…">Change password</SubmitButton>
    </form>
  );
}

export type SessionRow = { id: string; label: string; lastActive: string; current: boolean };

export function SessionsList({ sessions, listed }: { sessions: SessionRow[]; listed: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMessage({ ok: r.ok, text: r.message });
    });

  return (
    <div className="space-y-4">
      {message && <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert>}
      {listed ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Laptop className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{s.label}</p>
                <p className="text-xs text-fg-subtle">Last active {s.lastActive}</p>
              </div>
              {s.current ? (
                <Badge tone="success">This device</Badge>
              ) : (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revokeSession(s.id))}>Sign out</Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">Your device list isn&apos;t available on this deployment, but you can still end every other session.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => run(signOutOtherDevices)}>
          {pending && <Loader2 className="animate-spin" />} Sign out other devices
        </Button>
        <form action={signOutEverywhere}>
          <Button variant="danger" type="submit">Sign out everywhere</Button>
        </form>
      </div>
    </div>
  );
}
