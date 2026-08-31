"use client";

import { useActionState } from "react";
import { completeOnboardingAction } from "@/lib/actions/onboarding-actions";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-white/30";

const GOALS = [
  { value: "LEADS", label: "Get leads (calls, forms, sign-ups)" },
  { value: "SALES", label: "Drive online sales" },
  { value: "AWARENESS", label: "Build brand awareness" },
  { value: "TRAFFIC", label: "Send traffic to my website" },
  { value: "APP_PROMOTION", label: "Promote my app" },
];

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(completeOnboardingAction, undefined);

  return (
    <form action={formAction} className="space-y-8">
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
              defaultChecked={goal.value === "LEADS"}
              className="accent-white"
            />
            {goal.label}
          </label>
        ))}
      </fieldset>

      <div className="space-y-1">
        <label className="text-sm font-medium">Monthly ad budget (USD)</label>
        <input
          name="monthlyBudget"
          type="number"
          min={100}
          step={50}
          required
          defaultValue={1000}
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Industry</label>
          <input name="industry" className={inputClass} placeholder="e.g. Dental practice" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Website</label>
          <input name="website" className={inputClass} placeholder="https://yourbusiness.com" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Who are you trying to reach?</label>
        <textarea
          name="targetAudience"
          rows={2}
          className={inputClass}
          placeholder="e.g. Homeowners aged 30-55 within 20 miles of Austin, TX"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Brand voice (optional)</label>
        <textarea
          name="brandVoice"
          rows={2}
          className={inputClass}
          placeholder="e.g. Friendly and casual, no corporate jargon"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Competitors (optional)</label>
        <input name="competitors" className={inputClass} placeholder="Comma-separated" />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Anything else we should know?</label>
        <textarea name="notes" rows={3} className={inputClass} />
      </div>

      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-white px-4 py-3 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-60"
      >
        {pending ? "Building your plan..." : "Build my plan"}
      </button>
    </form>
  );
}
