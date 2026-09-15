"use client";

import { useActionState, useState } from "react";
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
  // What a tap on their ads should do. Asked at signup so no campaign has to
  // guess, and so the campaign form has something to pre-fill.
  const [destination, setDestination] = useState<"WEBSITE" | "PHONE_CALL">("WEBSITE");

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

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-medium">
          When someone taps your ad, what should happen?
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { key: "WEBSITE" as const, label: "They go to my website", sub: "A shop, a booking page, anything online" },
              { key: "PHONE_CALL" as const, label: "They call me", sub: "A tap-to-call button on the ad" },
            ]
          ).map((d) => (
            <button
              key={d.key}
              type="button"
              aria-pressed={destination === d.key}
              onClick={() => setDestination(d.key)}
              className={`rounded-lg border p-4 text-left transition ${
                destination === d.key
                  ? "border-white/40 bg-white/[0.06]"
                  : "border-white/10 bg-white/5 hover:border-white/25"
              }`}
            >
              <p className="text-sm text-white">{d.label}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{d.sub}</p>
            </button>
          ))}
        </div>
        <input type="hidden" name="destinationType" value={destination} />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Industry</label>
          <input name="industry" className={inputClass} placeholder="e.g. Dental practice" />
        </div>
        {destination === "PHONE_CALL" ? (
          <div className="space-y-1">
            <label className="text-sm font-medium">Phone number</label>
            <input
              name="phone"
              inputMode="tel"
              className={inputClass}
              placeholder="(555) 123-4567"
            />
            <p className="text-xs text-neutral-500">
              The number your ads will ring. Nobody sees it until they tap the button.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-sm font-medium">Website</label>
            <input name="website" className={inputClass} placeholder="yourbusiness.com" />
            <p className="text-xs text-neutral-500">
              Where people land when they tap your ad. You can point a single campaign somewhere
              else later.
            </p>
          </div>
        )}
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
