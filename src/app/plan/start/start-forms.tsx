"use client";

import { useActionState, useState } from "react";
import { approveAndChooseAction, startFromPlanAction, writeStrategyAction, type StartState } from "@/lib/actions/start-actions";
import type { StartDestination } from "@/lib/onboarding/quick-start";

const primary = "inline-flex min-h-[50px] w-full items-center justify-center rounded-full bg-[image:var(--mairo-ramp)] px-7 text-[15.5px] font-semibold text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110 disabled:opacity-60 sm:w-auto";
const field = "mt-1.5 min-h-[46px] w-full rounded-xl border border-white/12 bg-white/[0.03] px-4 text-[14.5px] text-white placeholder:text-white/35 focus:border-violet-400/60 focus:outline-none";

/** Step 1: where a tap on an ad goes — the one thing the free plan doesn't know — then MAIRO writes the strategy. */
export function ConfirmSetupForm({ options, suggested, hasWebsite }: { options: { key: StartDestination; label: string; sub: string }[]; suggested: StartDestination; hasWebsite: boolean }) {
  const [state, action, pending] = useActionState<StartState, FormData>(startFromPlanAction, undefined);
  const [choice, setChoice] = useState<StartDestination>(options.some((o) => o.key === suggested) ? suggested : options[0].key);
  return (
    <form action={action} className="mt-6">
      <fieldset>
        <legend className="text-[15px] font-semibold text-white">When someone taps your ad, what should happen?</legend>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {options.map((o) => (
            <label key={o.key} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${choice === o.key ? "border-violet-400/60 bg-violet-500/[0.10]" : "border-white/10 bg-white/[0.02] hover:border-white/25"}`}>
              <input type="radio" name="destinationType" value={o.key} checked={choice === o.key} onChange={() => setChoice(o.key)} className="mt-1 accent-[#7c5cff]" />
              <span>
                <span className="block text-[14.5px] font-medium text-white">{o.label}</span>
                <span className="mt-0.5 block text-[12.5px] text-white/55">{o.sub}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {choice === "PHONE_CALL" && (
        <label className="mt-4 block text-[13.5px] text-white/80">
          The number your ads should ring
          <input name="phone" type="tel" required autoComplete="tel" placeholder="(555) 123-4567" className={field} />
        </label>
      )}
      {choice === "WEBSITE" && !hasWebsite && (
        <label className="mt-4 block text-[13.5px] text-white/80">
          Your website
          <input name="website" type="text" inputMode="url" required placeholder="yourbusiness.com" className={field} />
        </label>
      )}
      {choice === "DIRECT_MESSAGE" && <input type="hidden" name="messageChannel" value="MESSENGER" />}
      {state?.error && <p role="alert" className="mt-4 text-[13.5px] text-red-300">{state.error}</p>}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "MAIRO is writing your strategy…" : "Confirm and write my strategy →"}
        </button>
        {pending && <p role="status" className="text-[12.5px] text-white/55">This usually takes under a minute.</p>}
      </div>
    </form>
  );
}

/** The strategy didn't get written the first time. */
export function WriteStrategyForm() {
  const [state, action, pending] = useActionState<StartState, FormData>(writeStrategyAction, undefined);
  return (
    <form action={action} className="mt-5">
      {state?.error && <p role="alert" className="mb-3 text-[13.5px] text-red-300">{state.error}</p>}
      <button type="submit" disabled={pending} className={primary}>{pending ? "MAIRO is writing your strategy…" : "Write my strategy"}</button>
    </form>
  );
}

/** Step 2: approving the strategy shown above, then on to choosing a plan. */
export function ApproveForm({ version }: { version: number }) {
  const [state, action, pending] = useActionState<StartState, FormData>(approveAndChooseAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="version" value={version} />
      {state?.error && <p role="alert" className="mb-3 text-[13.5px] text-red-300">{state.error}</p>}
      <button type="submit" disabled={pending} className={primary}>{pending ? "Approving…" : "Approve and choose my MAIRO plan →"}</button>
    </form>
  );
}
