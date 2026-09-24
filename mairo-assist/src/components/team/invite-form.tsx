"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { inviteMember } from "@/lib/team/actions";
import { type FormState, withNonce } from "@/lib/validation/form";

export function InviteForm() {
  const [state, action] = useActionState(withNonce(inviteMember), {} as FormState);
  const [copied, setCopied] = useState(false);
  const inviteUrl = state.ok ? state.values?.inviteUrl : undefined;

  return (
    <div className="space-y-4">
      <form key={state.nonce ?? 0} action={action} className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end" noValidate>
        <Field label="Email" htmlFor="invite-email" errors={state.errors?.email}>
          <Input id="invite-email" name="email" type="email" required placeholder="teammate@yourstore.com" defaultValue={state.ok ? "" : state.values?.email} />
        </Field>
        <Field label="Role" htmlFor="invite-role" errors={state.errors?.role}>
          <Select id="invite-role" name="role" defaultValue={state.values?.role ?? "support_agent"}>
            <option value="support_agent">Support Agent</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <SubmitButton pendingText="Inviting…">Send invite</SubmitButton>
      </form>
      {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      {inviteUrl && (
        <Alert tone="success" title="Invitation ready">
          <p className="mb-2">{state.message}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-2 py-1.5 text-xs text-fg">{inviteUrl}</code>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </Alert>
      )}
    </div>
  );
}
