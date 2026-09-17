"use client";

import { useActionState, useState } from "react";
import { completeOnboardingAction } from "@/lib/actions/onboarding-actions";
import {
  needsSiteTracking,
  requiredDetailFor,
  MESSAGE_CHANNELS,
  DEFAULT_MESSAGE_CHANNEL,
} from "@/lib/campaigns/destination";
import type { AdDestination, MessageChannel } from "@/generated/prisma/enums";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-white/30";

const GOALS = [
  { value: "LEADS", label: "Get leads (calls, forms, sign-ups)" },
  { value: "SALES", label: "Drive online sales" },
  { value: "AWARENESS", label: "Build brand awareness" },
  { value: "TRAFFIC", label: "Send traffic to my website" },
  { value: "APP_PROMOTION", label: "Promote my app" },
];

// How a business wants leads to reach it.
//
// Only shown when the goal is leads, and it is the question that decides
// whether MAIRO can measure the results on its own. Three of these four finish
// somewhere MAIRO or Meta can already see — a call and a message inside Meta, a
// form on a page MAIRO hosts — so nothing has to be installed on the business's
// website. The fourth is the one that does, which is why it says so.
const LEAD_DESTINATIONS = [
  {
    key: "PHONE_CALL" as const,
    label: "They call me",
    sub: "A tap-to-call button on the ad",
  },
  {
    key: "LEAD_FORM" as const,
    label: "They fill in a form",
    sub: "MAIRO writes the questions and hosts it for you",
  },
  {
    key: "DIRECT_MESSAGE" as const,
    label: "They message me",
    sub: "The ad opens a chat with your Facebook Page",
  },
  {
    key: "WEBSITE" as const,
    label: "They enquire on my website",
    sub: "Your own contact or booking page",
  },
];

// Everything else: the ad is pointing at a shop or a page, or at a phone.
const GENERAL_DESTINATIONS = [
  {
    key: "WEBSITE" as const,
    label: "They go to my website",
    sub: "A shop, a booking page, anything online",
  },
  {
    key: "PHONE_CALL" as const,
    label: "They call me",
    sub: "A tap-to-call button on the ad",
  },
];

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(completeOnboardingAction, undefined);
  // What a tap on their ads should do. Asked at signup so no campaign has to
  // guess, and so the campaign form has something to pre-fill.
  const [primaryGoal, setPrimaryGoal] = useState("LEADS");
  const [destination, setDestination] = useState<AdDestination>("WEBSITE");
  const [channel, setChannel] = useState<MessageChannel>(DEFAULT_MESSAGE_CHANNEL);

  const gettingLeads = primaryGoal === "LEADS";
  const options = gettingLeads ? LEAD_DESTINATIONS : GENERAL_DESTINATIONS;

  // Switching the goal can strand a choice the new list does not offer — a
  // business that picked "they fill in a form" and then changed to online
  // sales would submit LEAD_FORM while looking at nothing selected.
  const chosen = options.some((o) => o.key === destination) ? destination : options[0].key;
  const needs = requiredDetailFor(chosen);

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
              checked={goal.value === primaryGoal}
              onChange={() => setPrimaryGoal(goal.value)}
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
          {gettingLeads
            ? "How do you want those leads to reach you?"
            : "When someone taps your ad, what should happen?"}
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((d) => (
            <button
              key={d.key}
              type="button"
              aria-pressed={chosen === d.key}
              onClick={() => setDestination(d.key)}
              className={`rounded-lg border p-4 text-left transition ${
                chosen === d.key
                  ? "border-white/40 bg-white/[0.06]"
                  : "border-white/10 bg-white/5 hover:border-white/25"
              }`}
            >
              <p className="text-sm text-white">{d.label}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{d.sub}</p>
            </button>
          ))}
        </div>
        <input type="hidden" name="destinationType" value={chosen} />

        {/* What the choice means for measuring results, said before they
            commit to it rather than discovered on the tracking screen weeks
            later. This is the whole reason the question is asked. */}
        <p
          className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
            needsSiteTracking(chosen)
              ? "border-amber-400/20 bg-amber-400/[0.04] text-amber-200/80"
              : "border-emerald-400/20 bg-emerald-400/[0.04] text-emerald-200/80"
          }`}
        >
          {needsSiteTracking(chosen)
            ? "MAIRO will need a small piece of tracking code on your website to count these. It walks you through that after setup — or does it for you if you use Google Tag Manager."
            : "Nothing to install. MAIRO can count these on its own, so your ads learn who to find more of without you touching your website."}
        </p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Industry</label>
          <input name="industry" className={inputClass} placeholder="e.g. Dental practice" />
        </div>
        {needs === "phone" ? (
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
        ) : needs === "website" ? (
          <div className="space-y-1">
            <label className="text-sm font-medium">Website</label>
            <input name="website" className={inputClass} placeholder="yourbusiness.com" />
            <p className="text-xs text-neutral-500">
              Where people land when they tap your ad. You can point a single campaign somewhere
              else later.
            </p>
          </div>
        ) : needs === "channel" ? (
          // "They message me" used to be the end of the conversation, and every
          // campaign then assumed Messenger. Messenger, Instagram and WhatsApp
          // are three different ads with three different things to set up on
          // Meta's side, so the requirement is said here rather than discovered
          // at launch.
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium">Which inbox should it open?</label>
            <input type="hidden" name="messageChannel" value={channel} />
            <div className="mt-1 grid gap-3 sm:grid-cols-3">
              {MESSAGE_CHANNELS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={channel === c.key}
                  onClick={() => setChannel(c.key)}
                  className={`rounded-lg border p-3 text-left transition ${
                    channel === c.key
                      ? "border-white/40 bg-white/[0.06]"
                      : "border-white/10 bg-white/5 hover:border-white/25"
                  }`}
                >
                  <p className="text-sm text-white">{c.label}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{c.sub}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}
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
        className="w-full rounded-lg bg-[image:var(--mairo-ramp)] shadow-[var(--mairo-glow-key)] px-4 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Building your plan..." : "Build my plan"}
      </button>
    </form>
  );
}
