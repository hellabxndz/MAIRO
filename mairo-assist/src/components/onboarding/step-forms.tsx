"use client";

import { Check } from "lucide-react";
import { useActionState, useState } from "react";
import { saveAiName, saveBusinessInfo, saveGoals, savePolicies, saveSells } from "@/lib/onboarding/actions";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { AI_GOALS, AI_NAME_SUGGESTIONS, INDUSTRIES, SELLS } from "@/lib/validation/business";
import { type FormState, withNonce } from "@/lib/validation/form";
import { cn } from "@/lib/utils";

const initial: FormState = {};

function FormError({ state }: { state: FormState }) {
  return state.message ? <Alert tone="danger">{state.message}</Alert> : null;
}

function Continue({ label = "Continue" }: { label?: string }) {
  return (
    <div className="flex justify-end pt-2">
      <SubmitButton size="lg" pendingText="Saving…">{label}</SubmitButton>
    </div>
  );
}

export function BusinessInfoForm({
  businessId,
  defaults,
}: {
  businessId?: string;
  defaults?: { name?: string; websiteUrl?: string; industry?: string; description?: string };
}) {
  const [state, action] = useActionState(withNonce(saveBusinessInfo), initial);
  const v = state.values ?? defaults ?? {};
  return (
    <form key={state.nonce ?? 0} action={action} className="space-y-5" noValidate>
      <FormError state={state} />
      {businessId && <input type="hidden" name="businessId" value={businessId} />}
      <Field label="Business name" htmlFor="name" errors={state.errors?.name}>
        <Input id="name" name="name" required autoFocus defaultValue={v.name} placeholder="e.g. Northside Denim Co." />
      </Field>
      <Field label="Website" htmlFor="websiteUrl" errors={state.errors?.websiteUrl} hint="Optional — your store's address.">
        <Input id="websiteUrl" name="websiteUrl" inputMode="url" defaultValue={v.websiteUrl} placeholder="yourstore.com" />
      </Field>
      <Field label="Industry" htmlFor="industry" errors={state.errors?.industry}>
        <Select id="industry" name="industry" required defaultValue={v.industry ?? ""}>
          <option value="" disabled>Choose an industry</option>
          {INDUSTRIES.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </Select>
      </Field>
      <Field label="Describe your business" htmlFor="description" errors={state.errors?.description} hint="A sentence or two your AI employee can use to introduce your brand.">
        <Textarea id="description" name="description" maxLength={2000} defaultValue={v.description} placeholder="We sell vintage-inspired streetwear, designed in Chicago." />
      </Field>
      <Continue />
    </form>
  );
}

function ChoiceCard({
  name,
  value,
  label,
  hint,
  defaultChecked,
  type = "checkbox",
}: {
  name: string;
  value: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  type?: "checkbox" | "radio";
}) {
  return (
    <label className="group relative flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white/[0.02] p-4 transition-colors hover:border-line-strong has-[:checked]:border-violet/60 has-[:checked]:bg-violet/10">
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-line-strong transition-colors peer-checked:border-violet peer-checked:bg-violet peer-focus-visible:ring-2 peer-focus-visible:ring-electric">
        <Check className="size-3.5 text-white opacity-0 group-has-[:checked]:opacity-100" aria-hidden />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-fg-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function SellsForm({ defaults }: { defaults: string[] }) {
  const [state, action] = useActionState(withNonce(saveSells), initial);
  return (
    <form key={state.nonce ?? 0} action={action} className="space-y-5">
      <FormError state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        {SELLS.map((s) => (
          <ChoiceCard key={s.value} name="sells" value={s.value} label={s.label} hint={s.hint} defaultChecked={defaults.includes(s.value)} />
        ))}
      </div>
      {state.errors?.sells && <p className="text-xs text-danger">{state.errors.sells[0]}</p>}
      <Alert tone="info">The first full integration is built for Shopify stores selling physical products. Other types can still use the website assistant.</Alert>
      <Continue />
    </form>
  );
}

export function GoalsForm({ defaults }: { defaults: string[] }) {
  const [state, action] = useActionState(withNonce(saveGoals), initial);
  return (
    <form key={state.nonce ?? 0} action={action} className="space-y-5">
      <FormError state={state} />
      <p className="text-sm text-fg-muted">Choose as many as you like — you can change these later.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {AI_GOALS.map((g) => (
          <ChoiceCard key={g.value} name="goals" value={g.value} label={g.label} hint={g.hint} defaultChecked={defaults.includes(g.value)} />
        ))}
      </div>
      {state.errors?.goals && <p className="text-xs text-danger">{state.errors.goals[0]}</p>}
      <Continue />
    </form>
  );
}

export function AiNameForm({ current }: { current?: string }) {
  const [state, action] = useActionState(withNonce(saveAiName), initial);
  const isSuggested = current ? (AI_NAME_SUGGESTIONS as readonly string[]).includes(current) : true;
  const [choice, setChoice] = useState(state.values?.choice ?? (current && !isSuggested ? "custom" : current ?? "Nova"));
  return (
    <form key={state.nonce ?? 0} action={action} className="space-y-5">
      <FormError state={state} />
      <div className="grid gap-3 sm:grid-cols-4">
        {[...AI_NAME_SUGGESTIONS, "custom"].map((name) => (
          <label
            key={name}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors",
              choice === name ? "border-violet/60 bg-violet/10" : "border-line hover:border-line-strong",
            )}
          >
            <input type="radio" name="choice" value={name} checked={choice === name} onChange={() => setChoice(name)} className="sr-only" />
            <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-violet to-electric text-sm font-semibold">
              {name === "custom" ? "✦" : name[0]}
            </span>
            <span className="text-sm font-medium">{name === "custom" ? "Custom name" : name}</span>
          </label>
        ))}
      </div>
      {choice === "custom" && (
        <Field label="Custom name" htmlFor="customName" errors={state.errors?.name}>
          <Input id="customName" name="customName" autoFocus maxLength={40} defaultValue={state.values?.customName ?? (isSuggested ? "" : current)} placeholder="e.g. Maya" />
        </Field>
      )}
      {choice !== "custom" && state.errors?.name && <p className="text-xs text-danger">{state.errors.name[0]}</p>}
      <p className="text-xs text-fg-subtle">Whatever the name, your AI employee always tells customers it&apos;s an AI assistant.</p>
      <Continue />
    </form>
  );
}

export function PoliciesForm({ defaults }: { defaults: { shipping: string; returns: string; refunds: string; instructions: string } }) {
  const [state, action] = useActionState(withNonce(savePolicies), initial);
  const v = state.values ?? defaults;
  return (
    <form key={state.nonce ?? 0} action={action} className="space-y-5">
      <FormError state={state} />
      <Field label="Shipping policy" htmlFor="shipping" errors={state.errors?.shipping} hint="Where you ship, how long it takes, what it costs.">
        <Textarea id="shipping" name="shipping" defaultValue={v.shipping} placeholder="We ship within the US in 3–5 business days. Free shipping over $75." />
      </Field>
      <Field label="Return policy" htmlFor="returns" errors={state.errors?.returns}>
        <Textarea id="returns" name="returns" defaultValue={v.returns} placeholder="Unworn items can be returned within 30 days of delivery." />
      </Field>
      <Field label="Refund policy" htmlFor="refunds" errors={state.errors?.refunds}>
        <Textarea id="refunds" name="refunds" defaultValue={v.refunds} placeholder="Refunds go back to the original payment method within 5–10 days of us receiving the return." />
      </Field>
      <Field
        label="Instructions for your AI employee"
        htmlFor="instructions"
        errors={state.errors?.instructions}
        hint="How it should talk and what it should never do. These can't override Mairo Assist's safety rules."
      >
        <Textarea
          id="instructions"
          name="instructions"
          className="min-h-36"
          defaultValue={v.instructions}
          placeholder={"Speak casually and confidently.\nOur brand sells vintage-inspired streetwear.\nHelp customers find products without being overly pushy.\nDo not invent shipping dates.\nIf a customer becomes upset, offer human assistance."}
        />
      </Field>
      <p className="text-xs text-fg-subtle">All fields are optional now — you can add documents and FAQs in the Knowledge Base later.</p>
      <Continue />
    </form>
  );
}
