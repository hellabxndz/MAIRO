"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui";
import { saveSpendProtectionAction, type ProtectionFormState } from "@/lib/actions/protection-actions";

// The customer's own limits on what their advertising can spend, and a record
// of every time one was hit. Protective only: these can warn or pause, never
// raise a budget or start anything.

type Event = { id: string; at: string; campaignName: string | null; kind: string; action: string; message: string };

const input = "w-28 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-sky-400/50";

export function SpendProtectionSection({
  values,
  events,
}: {
  values: { stopLossCents: number | null; stopLossAction: "NOTIFY" | "PAUSE"; monthlyCapCents: number | null; warnAtPercent: number };
  events: Event[];
}) {
  const [state, action, pending] = useActionState<ProtectionFormState, FormData>(saveSpendProtectionAction, undefined);
  const [stopLossOn, setStopLossOn] = useState(values.stopLossCents !== null);
  const [capOn, setCapOn] = useState(values.monthlyCapCents !== null);

  return (
    <Card>
      <div id="spend-protection" className="scroll-mt-24">
        <h2 className="text-base text-white">Spend Protection</h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-neutral-400">
          Limits MAIRO checks every hour, whatever your automation level. They can only warn you or pause a campaign —
          never raise a budget or start anything.
        </p>
      </div>

      <form action={action} className="mt-6 space-y-6">
        <div>
          <label className="flex items-center gap-2.5 text-sm text-white">
            <input type="checkbox" name="stopLossOn" checked={stopLossOn} onChange={(e) => setStopLossOn(e.target.checked)} className="h-4 w-4 accent-sky-400" />
            Watch for campaigns spending with no results
          </label>
          {stopLossOn && (
            <div className="mt-3 flex flex-wrap items-center gap-2 pl-6 text-sm text-neutral-400">
              <span>If a campaign spends</span>
              <span className="text-neutral-500">$</span>
              <input type="number" name="stopLoss" min={5} step={5} defaultValue={values.stopLossCents ? values.stopLossCents / 100 : 50} className={input} aria-label="No-results limit in dollars" />
              <span>without a single result,</span>
              <select name="stopLossAction" defaultValue={values.stopLossAction} className={`${input} w-auto`}>
                <option value="NOTIFY" className="bg-neutral-900">tell me</option>
                <option value="PAUSE" className="bg-neutral-900">pause it and tell me</option>
              </select>
            </div>
          )}
          <p className="mt-2 pl-6 text-xs text-neutral-500">
            A result is a purchase, lead, install or click, depending on the campaign&rsquo;s goal. Awareness campaigns aren&rsquo;t judged this way.
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2.5 text-sm text-white">
            <input type="checkbox" name="capOn" checked={capOn} onChange={(e) => setCapOn(e.target.checked)} className="h-4 w-4 accent-sky-400" />
            Set a monthly limit on ad spend
          </label>
          {capOn && (
            <div className="mt-3 flex flex-wrap items-center gap-2 pl-6 text-sm text-neutral-400">
              <span>Don&rsquo;t spend more than</span>
              <span className="text-neutral-500">$</span>
              <input type="number" name="monthlyCap" min={10} step={10} defaultValue={values.monthlyCapCents ? values.monthlyCapCents / 100 : 1000} className={input} aria-label="Monthly limit in dollars" />
              <span>a month. Warn me at</span>
              <input type="number" name="warnAtPercent" min={50} max={95} step={5} defaultValue={values.warnAtPercent} className={`${input} w-20`} aria-label="Warn at percent" />
              <span>%.</span>
            </div>
          )}
          <p className="mt-2 pl-6 text-xs text-neutral-500">
            When it&rsquo;s reached, MAIRO pauses every running campaign until next month or until you raise it. It&rsquo;s checked hourly,
            so the networks can spend a little past it before the pause lands.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="rounded-full bg-white px-5 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-50">
            {pending ? "Saving…" : "Save limits"}
          </button>
          {state?.saved && <span className="text-xs text-emerald-300">Saved.</span>}
          {state?.error && <span className="text-xs text-amber-200">{state.error}</span>}
        </div>
      </form>

      <div className="mt-8 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <p className="text-xs font-medium text-neutral-300">What Spend Protection has done</p>
        {events.length === 0 ? (
          <p className="mt-2 text-xs text-neutral-500">Nothing yet — no limit has been reached.</p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {events.map((e) => (
              <li key={e.id} className="text-xs leading-relaxed text-neutral-400">
                <span className="text-neutral-500">{e.at}</span> · {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
