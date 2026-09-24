"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveBusinessProfile, saveSupportSettings } from "@/lib/business/actions";
import { INDUSTRIES } from "@/lib/validation/business";
import { type FormState, withNonce } from "@/lib/validation/form";

const initial: FormState = {};

export function BusinessProfileForm({ defaults }: { defaults: { name: string; websiteUrl: string; industry: string; description: string } }) {
  const [state, action] = useActionState(withNonce(saveBusinessProfile), initial);
  const v = state.values ?? defaults;
  return (
    <form key={state.nonce ?? 0} action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" htmlFor="name" errors={state.errors?.name}>
          <Input id="name" name="name" defaultValue={v.name} />
        </Field>
        <Field label="Website" htmlFor="websiteUrl" errors={state.errors?.websiteUrl}>
          <Input id="websiteUrl" name="websiteUrl" defaultValue={v.websiteUrl} />
        </Field>
      </div>
      <Field label="Industry" htmlFor="industry" errors={state.errors?.industry}>
        <Select id="industry" name="industry" defaultValue={v.industry}>
          <option value="" disabled>Choose an industry</option>
          {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
        </Select>
      </Field>
      <Field label="Description" htmlFor="description" errors={state.errors?.description}>
        <Textarea id="description" name="description" defaultValue={v.description} />
      </Field>
      <SubmitButton pendingText="Saving…">Save details</SubmitButton>
    </form>
  );
}

export function SupportSettingsForm({
  defaults,
  timezones,
}: {
  defaults: { supportEmail: string; escalationEmail: string; timezone: string; retentionDays: string };
  timezones: string[];
}) {
  const [state, action] = useActionState(withNonce(saveSupportSettings), initial);
  const v = state.values ?? defaults;
  return (
    <form key={state.nonce ?? 0} action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer support email" htmlFor="supportEmail" errors={state.errors?.supportEmail} hint="Shared with customers when they ask how to reach you.">
          <Input id="supportEmail" name="supportEmail" type="email" defaultValue={v.supportEmail} />
        </Field>
        <Field label="Escalation email" htmlFor="escalationEmail" errors={state.errors?.escalationEmail} hint="Where we notify your team when a customer needs a person.">
          <Input id="escalationEmail" name="escalationEmail" type="email" defaultValue={v.escalationEmail} />
        </Field>
        <Field label="Time zone" htmlFor="timezone" errors={state.errors?.timezone}>
          <Select id="timezone" name="timezone" defaultValue={v.timezone}>
            {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </Select>
        </Field>
        <Field label="Keep conversations for (days)" htmlFor="retentionDays" errors={state.errors?.retentionDays} hint="How long customer conversation content is kept.">
          <Input id="retentionDays" name="retentionDays" type="number" min={30} max={3650} defaultValue={v.retentionDays} />
        </Field>
      </div>
      <SubmitButton pendingText="Saving…">Save support settings</SubmitButton>
    </form>
  );
}
