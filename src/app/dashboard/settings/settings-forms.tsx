"use client";

import { useActionState } from "react";
import { inputClass, primaryButtonClass } from "@/components/ui";
import {
  updateBusinessAction,
  updateBriefAction,
  type SettingsActionState,
} from "@/lib/actions/settings-actions";

const GOALS = [
  { value: "LEADS", label: "Get leads (calls, forms, sign-ups)" },
  { value: "SALES", label: "Drive online sales" },
  { value: "AWARENESS", label: "Build brand awareness" },
  { value: "TRAFFIC", label: "Send traffic to my website" },
  { value: "APP_PROMOTION", label: "Promote my app" },
];

function Status({ state, pending }: { state: SettingsActionState; pending: boolean }) {
  if (pending) return null;
  if (state?.error) return <p className="text-sm text-red-300">{state.error}</p>;
  if (state?.saved) return <p className="text-sm text-emerald-300">Saved.</p>;
  return null;
}

export function BusinessForm({
  name,
  industry,
  website,
}: {
  name: string;
  industry: string;
  website: string;
}) {
  const [state, formAction, pending] = useActionState(updateBusinessAction, undefined);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1">
        <label htmlFor="set-name" className="text-sm font-medium">
          Business name
        </label>
        <input
          id="set-name"
          name="name"
          required
          maxLength={120}
          defaultValue={name}
          className={inputClass}
        />
        <p className="text-xs text-neutral-500">
          This is the name the AI uses when it writes your ads, so make it the one your
          customers know you by.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="set-industry" className="text-sm font-medium">
            Industry
          </label>
          <input
            id="set-industry"
            name="industry"
            maxLength={120}
            defaultValue={industry}
            placeholder="e.g. Dental practice"
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="set-website" className="text-sm font-medium">
            Website
          </label>
          <input
            id="set-website"
            name="website"
            maxLength={300}
            defaultValue={website}
            placeholder="https://"
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Saving…" : "Save business details"}
        </button>
        <Status state={state} pending={pending} />
      </div>
    </form>
  );
}

export function BriefForm({
  primaryGoal,
  monthlyBudget,
  targetAudience,
  brandVoice,
  competitors,
  notes,
}: {
  primaryGoal: string;
  monthlyBudget: number;
  targetAudience: string;
  brandVoice: string;
  competitors: string;
  notes: string;
}) {
  const [state, formAction, pending] = useActionState(updateBriefAction, undefined);

  return (
    <form action={formAction} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-medium">What&apos;s your main goal?</legend>
        {GOALS.map((goal) => (
          <label
            key={goal.value}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm has-[:checked]:border-white/40"
          >
            <input
              type="radio"
              name="primaryGoal"
              value={goal.value}
              required
              defaultChecked={goal.value === primaryGoal}
              className="accent-white"
            />
            {goal.label}
          </label>
        ))}
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="set-budget" className="text-sm font-medium">
          Monthly ad budget (USD)
        </label>
        <input
          id="set-budget"
          name="monthlyBudget"
          type="number"
          min={100}
          step={50}
          required
          defaultValue={monthlyBudget}
          className={inputClass}
        />
        <p className="text-xs text-neutral-500">
          Changing this doesn&apos;t move money. It&apos;s what the AI plans around — your
          next monthly plan will be built to this number.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="set-audience" className="text-sm font-medium">
          Who are you trying to reach?
        </label>
        <textarea
          id="set-audience"
          name="targetAudience"
          rows={3}
          maxLength={2000}
          defaultValue={targetAudience}
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="set-voice" className="text-sm font-medium">
            Brand voice
          </label>
          <textarea
            id="set-voice"
            name="brandVoice"
            rows={3}
            maxLength={2000}
            defaultValue={brandVoice}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="set-competitors" className="text-sm font-medium">
            Competitors
          </label>
          <textarea
            id="set-competitors"
            name="competitors"
            rows={3}
            maxLength={2000}
            defaultValue={competitors}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="set-notes" className="text-sm font-medium">
          Anything else the AI should know?
        </label>
        <textarea
          id="set-notes"
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={notes}
          className={inputClass}
        />
      </div>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Saving…" : "Save brief"}
        </button>
        <Status state={state} pending={pending} />
      </div>
    </form>
  );
}
