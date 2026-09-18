"use client";

import { useActionState, useState } from "react";
import { Card, inputClass, primaryButtonClass } from "@/components/ui";
import {
  confirmPhoneAction,
  renameAssistantAction,
  startPhoneVerificationAction,
  stopSmsAction,
  updateSmsPreferencesAction,
} from "@/lib/actions/assistant-actions";
import { SMS_CONSENT_TEXT } from "@/lib/sms/consent";

// Your assistant's name, and whether it can text you.
//
// Two settings that live together because they are the same thing from the
// customer's side: this is the bit of the product that talks to you, and these
// are the terms. Naming it is cosmetic and instant. Texting is not, so the
// second half is a three-state flow — no number, code sent, verified — and
// each state shows only what that state can do.
//
// Nothing here pretends. If the deployment has no SMS provider the server says
// so in the error rather than accepting a number and silently never texting
// it, which is the failure mode that makes somebody think their ads stopped.

type Phone = {
  /** Masked, never the full number. */
  masked: string | null;
  verified: boolean;
  awaitingCode: boolean;
  prefs: {
    onCampaignLive: boolean;
    onNeedsAttention: boolean;
    onWeeklySummary: boolean;
    onBudgetChange: boolean;
  };
};

const UPDATES: { name: keyof Phone["prefs"]; label: string; detail: string }[] = [
  {
    name: "onCampaignLive",
    label: "A campaign goes live",
    detail: "When the platform finishes its review and your ad starts running.",
  },
  {
    name: "onNeedsAttention",
    label: "Something needs attention",
    detail: "Spending with nothing to show for it, or a connection that has dropped.",
  },
  {
    name: "onBudgetChange",
    label: "Budget is moved",
    detail: "When MAIRO shifts money between campaigns or platforms.",
  },
  {
    name: "onWeeklySummary",
    label: "Weekly summary",
    detail: "One text a week with what your advertising did.",
  },
];

export function AssistantSection({
  assistantName,
  phone,
}: {
  assistantName: string;
  phone: Phone;
}) {
  const [nameState, renameAction, renaming] = useActionState(renameAssistantAction, undefined);
  const [startState, startAction, starting] = useActionState(
    startPhoneVerificationAction,
    undefined,
  );
  const [confirmState, confirmAction, confirming] = useActionState(confirmPhoneAction, undefined);
  const [prefState, prefAction, savingPrefs] = useActionState(
    updateSmsPreferencesAction,
    undefined,
  );
  const [name, setName] = useState(assistantName);

  return (
    <Card id="assistant">
      <h2 className="text-base text-white">Your assistant</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-400">
        One assistant handles everything — your campaigns, your budget, writing your ads,
        and anything else about your account. Call it whatever you like.
      </p>

      <form action={renameAction} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[200px]">
          <span className="mb-1.5 block text-xs text-neutral-400">Name</span>
          <input
            name="assistantName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            className={inputClass}
            aria-label="Assistant name"
          />
        </label>
        <button type="submit" disabled={renaming} className={primaryButtonClass}>
          {renaming ? "Saving…" : "Save name"}
        </button>
      </form>
      {nameState?.error && <p className="mt-2 text-sm text-alert">{nameState.error}</p>}
      {nameState?.saved && <p className="mt-2 text-sm text-live">{nameState.saved}</p>}

      <hr className="my-7 border-white/10" />

      <h3 className="text-sm font-medium text-white">Text me updates</h3>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-400">
        {name || assistantName} can text you when something happens with your ads, so you do
        not have to keep checking. You choose what is worth a text, and you can stop at any
        time.
      </p>

      {/* No number yet, or they opted out and are coming back. */}
      {!phone.verified && !phone.awaitingCode && (
        <form action={startAction} className="mt-5 space-y-4">
          <label className="block max-w-sm">
            <span className="mb-1.5 block text-xs text-neutral-400">Mobile number</span>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+1 555 123 4567"
              className={inputClass}
            />
          </label>
          <label className="flex max-w-2xl items-start gap-3 text-sm leading-relaxed text-neutral-300">
            <input
              type="checkbox"
              name="consent"
              className="mt-1 h-4 w-4 flex-none accent-[color:var(--color-blue-bright,#6c9eff)]"
            />
            <span>{SMS_CONSENT_TEXT}</span>
          </label>
          <button type="submit" disabled={starting} className={primaryButtonClass}>
            {starting ? "Sending…" : "Send me a code"}
          </button>
        </form>
      )}

      {/* Code sent, waiting on it. */}
      {!phone.verified && phone.awaitingCode && (
        <div className="mt-5">
          <p className="text-sm text-neutral-300">
            We texted a six-digit code to {phone.masked}. It is good for ten minutes.
          </p>
          <form action={confirmAction} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[160px]">
              <span className="mb-1.5 block text-xs text-neutral-400">Code</span>
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className={inputClass}
              />
            </label>
            <button type="submit" disabled={confirming} className={primaryButtonClass}>
              {confirming ? "Checking…" : "Confirm"}
            </button>
          </form>
          {/* Its own form, not nested inside the one above — a form inside a
              form is invalid HTML and the browser silently drops the inner
              one, which here would be the way out of a wrong number. */}
          <form action={stopSmsAction} className="mt-3">
            <button
              type="submit"
              className="text-sm text-neutral-400 underline-offset-4 transition hover:text-white hover:underline"
            >
              Use a different number
            </button>
          </form>
        </div>
      )}

      {/* Verified — the switches. */}
      {phone.verified && (
        <div className="mt-5">
          <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-live" />
              Texting {phone.masked}
            </span>
          </p>

          <form action={prefAction} className="mt-5 space-y-3">
            {UPDATES.map((u) => (
              <label
                key={u.name}
                className="flex items-start gap-3 rounded-xl border border-white/10 p-3.5"
              >
                <input
                  type="checkbox"
                  name={u.name}
                  defaultChecked={phone.prefs[u.name]}
                  className="mt-1 h-4 w-4 flex-none accent-[color:var(--color-blue-bright,#6c9eff)]"
                />
                <span>
                  <span className="block text-sm text-white">{u.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-neutral-400">
                    {u.detail}
                  </span>
                </span>
              </label>
            ))}
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button type="submit" disabled={savingPrefs} className={primaryButtonClass}>
                {savingPrefs ? "Saving…" : "Save"}
              </button>
              {prefState?.saved && <span className="text-sm text-live">{prefState.saved}</span>}
              {prefState?.error && <span className="text-sm text-alert">{prefState.error}</span>}
            </div>
          </form>

          <form action={stopSmsAction} className="mt-5">
            <button
              type="submit"
              className="text-sm text-neutral-400 underline-offset-4 transition hover:text-white hover:underline"
            >
              Stop texting me and remove my number
            </button>
          </form>
        </div>
      )}

      {startState?.error && <p className="mt-3 text-sm text-alert">{startState.error}</p>}
      {startState?.saved && <p className="mt-3 text-sm text-live">{startState.saved}</p>}
      {confirmState?.error && <p className="mt-3 text-sm text-alert">{confirmState.error}</p>}
      {confirmState?.saved && <p className="mt-3 text-sm text-live">{confirmState.saved}</p>}

      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-neutral-500">
        Texts are about your advertising only — never marketing. Message and data rates may
        apply. Reply STOP to any text to stop them.
      </p>
    </Card>
  );
}
