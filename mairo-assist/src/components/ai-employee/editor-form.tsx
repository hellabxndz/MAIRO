"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveAiDraft } from "@/lib/ai-employee/actions";
import type { AiEmployeeConfig } from "@/lib/validation/ai-employee";
import { type FormState, withNonce } from "@/lib/validation/form";

const PERSONALITIES = [
  ["professional", "Professional"],
  ["friendly", "Friendly"],
  ["luxury", "Luxury"],
  ["casual", "Casual"],
  ["energetic", "Energetic"],
  ["minimal", "Minimal"],
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-2xl border border-line p-4 sm:p-5">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

export function EditorForm({ name, avatarUrl, config }: { name: string; avatarUrl: string | null; config: AiEmployeeConfig }) {
  const [state, action] = useActionState(withNonce(saveAiDraft), {} as FormState);
  const v = state.values;
  const e = state.errors ?? {};
  const val = (key: string, fallback: string) => (v ? v[key] ?? "" : fallback);
  const checked = (key: string, fallback: boolean) => (v ? v[key] === "on" : fallback);

  return (
    <form key={state.nonce ?? 0} action={action} className="space-y-5" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}

      <Section title="Identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="AI name" htmlFor="name" errors={e.name}>
            <Input id="name" name="name" defaultValue={val("name", name)} maxLength={40} />
          </Field>
          <Field label="Avatar image (https)" htmlFor="avatarUrl" errors={e.avatarUrl} hint="Optional. Leave empty to use the initial.">
            <Input id="avatarUrl" name="avatarUrl" defaultValue={val("avatarUrl", avatarUrl ?? "")} placeholder="https://…" />
          </Field>
        </div>
        <Field label="Welcome message" htmlFor="welcomeMessage" errors={e.welcomeMessage}>
          <Textarea id="welcomeMessage" name="welcomeMessage" className="min-h-20" maxLength={300} defaultValue={val("welcomeMessage", config.welcomeMessage)} />
        </Field>
      </Section>

      <Section title="Personality and approach">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand personality" htmlFor="personality" errors={e.personality}>
            <Select id="personality" name="personality" defaultValue={val("personality", config.personality)}>
              {PERSONALITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Formality" htmlFor="formality" errors={e.formality}>
            <Select id="formality" name="formality" defaultValue={val("formality", config.formality)}>
              <option value="casual">Casual</option>
              <option value="balanced">Balanced</option>
              <option value="formal">Formal</option>
            </Select>
          </Field>
          <Field label="Sales approach" htmlFor="salesApproach" errors={e.salesApproach}>
            <Select id="salesApproach" name="salesApproach" defaultValue={val("salesApproach", config.salesApproach)}>
              <option value="helpful_only">Only suggest products when asked</option>
              <option value="gentle">Gentle suggestions</option>
              <option value="proactive">Proactive (never pushy)</option>
            </Select>
          </Field>
          <Field label="Customer service approach" htmlFor="serviceApproach" errors={e.serviceApproach}>
            <Select id="serviceApproach" name="serviceApproach" defaultValue={val("serviceApproach", config.serviceApproach)}>
              <option value="concise">Concise</option>
              <option value="warm">Warm and reassuring</option>
              <option value="thorough">Thorough</option>
            </Select>
          </Field>
        </div>
        <Field label="Communication style" htmlFor="communicationStyle" errors={e.communicationStyle} hint="Optional, e.g. “Uses light humor, signs off with ‘Stay fresh!’”.">
          <Input id="communicationStyle" name="communicationStyle" maxLength={300} defaultValue={val("communicationStyle", config.communicationStyle)} />
        </Field>
      </Section>

      <Section title="Escalation">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="escalateOnRequest" defaultChecked={checked("escalateOnRequest", config.escalation.escalateOnRequest)} className="size-4 accent-violet" />
          Hand over to a person when a customer asks for one
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="offerHumanWhenUpset" defaultChecked={checked("offerHumanWhenUpset", config.escalation.offerHumanWhenUpset)} className="size-4 accent-violet" />
          Offer a person when a customer seems upset
        </label>
        <Field label="Escalation notes" htmlFor="escalationNotes" errors={e["escalation.notes"]} hint="Optional, e.g. “Always escalate wholesale enquiries.”">
          <Input id="escalationNotes" name="escalationNotes" maxLength={500} defaultValue={val("escalationNotes", config.escalation.notes)} />
        </Field>
      </Section>

      <Section title="Business instructions">
        <Field label="Instructions" htmlFor="instructions" errors={e.instructions} hint="Your AI follows these unless they conflict with Mairo Assist's safety rules. Customers never see them.">
          <Textarea id="instructions" name="instructions" className="min-h-40" maxLength={4000} defaultValue={val("instructions", config.instructions)} />
        </Field>
      </Section>

      <Section title="Chat widget">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Brand color" htmlFor="brandColor" errors={e.brandColor}>
            <Input id="brandColor" name="brandColor" type="color" className="h-11 p-1" defaultValue={val("brandColor", config.brandColor)} />
          </Field>
          <Field label="Bubble position" htmlFor="bubblePosition" errors={e.bubblePosition}>
            <Select id="bubblePosition" name="bubblePosition" defaultValue={val("bubblePosition", config.bubblePosition)}>
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
            </Select>
          </Field>
          <Field label="Logo (https)" htmlFor="logoUrl" errors={e.logoUrl} hint="Optional.">
            <Input id="logoUrl" name="logoUrl" defaultValue={val("logoUrl", config.logoUrl ?? "")} placeholder="https://…" />
          </Field>
        </div>
      </Section>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <SubmitButton size="lg" pendingText="Saving…" className="shadow-2xl">Save Changes</SubmitButton>
      </div>
    </form>
  );
}
