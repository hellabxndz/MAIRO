"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { pauseEverythingAction } from "@/lib/actions/protection-actions";
import type { PauseEverythingResult } from "@/lib/protection/run";

// The emergency stop on Campaigns: one button that pauses every campaign
// that's running or waiting on Meta, with the consequence said before it
// happens and each campaign's outcome — confirmed by Meta, or refused —
// after.

export function PauseEverything({ count }: { count: number }) {
  const [step, setStep] = useState<"idle" | "confirm" | "done">("idle");
  const [results, setResults] = useState<PauseEverythingResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setError(null);
      const r = await pauseEverythingAction();
      if (r.error) {
        setError(r.error);
        return;
      }
      setResults(r.results ?? []);
      setStep("done");
    });

  if (step === "idle") {
    return (
      <button type="button" onClick={() => setStep("confirm")} className="inline-flex min-h-[38px] items-center gap-2 rounded-full border border-amber-300/40 px-4 text-[13px] text-amber-100 transition hover:border-amber-300/70 hover:text-white">
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px] bg-amber-300" />
        Pause everything
      </button>
    );
  }

  const paused = results.filter((r) => r.ok);
  const refused = results.filter((r) => !r.ok);

  return (
    <div role="region" aria-label="Pause everything" className="w-full rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-4 sm:max-w-[520px]">
      {step === "confirm" ? (
        <>
          <p className="text-[14px] font-semibold text-white">
            Pause {count === 1 ? "your running campaign" : `all ${count} running campaigns`}?
          </p>
          <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-white/75">
            <li>Each one stops spending once Meta confirms the pause. Campaigns waiting for Meta&rsquo;s review are paused too.</li>
            <li>New campaigns won&rsquo;t switch on by themselves until you approve them again.</li>
            <li>Switch each back on from its own page when you&rsquo;re ready.</li>
          </ul>
          {error && <p className="mt-2 text-[13px] text-amber-200">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={run} disabled={pending} className="inline-flex min-h-[38px] items-center rounded-full bg-amber-300 px-4 text-[13px] font-semibold text-[#1a1203] transition hover:brightness-105 disabled:opacity-60">
              {pending ? "Pausing…" : "Pause everything"}
            </button>
            <button type="button" onClick={() => setStep("idle")} disabled={pending} className="inline-flex min-h-[38px] items-center rounded-full border border-white/15 px-4 text-[13px] text-white/85 hover:text-white">
              Keep running
            </button>
          </div>
        </>
      ) : (
        <div aria-live="polite">
          <p className="text-[14px] font-semibold text-white">
            {results.length === 0 ? "Nothing was running." : refused.length === 0 ? `Paused ${paused.length === 1 ? "your campaign" : `all ${paused.length} campaigns`} — confirmed by Meta.` : `Paused ${paused.length} of ${results.length}. ${refused.length === 1 ? "One is" : `${refused.length} are`} still running.`}
          </p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {results.map((r) => (
              <li key={r.id} className="flex gap-2">
                <span aria-hidden className={r.ok ? "text-emerald-300" : "text-amber-300"}>
                  {r.ok ? "✓" : "!"}
                </span>
                <span className="min-w-0 text-white/80">
                  <Link href={`/dashboard/campaigns/${r.id}`} className="font-medium text-white underline-offset-4 hover:underline">
                    {r.name}
                  </Link>{" "}
                  {r.ok ? "· paused, confirmed by Meta" : `· Meta didn't pause it: ${(r.error ?? "").replace(/^Meta: /, "")} Pause it in Meta Ads Manager, or try again from its page.`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12.5px] text-white/55">New campaigns now wait for your approval before they switch on.</p>
        </div>
      )}
    </div>
  );
}
