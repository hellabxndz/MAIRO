"use client";

import { useState, useTransition } from "react";
import { pauseCampaignAction, resumeCampaignAction } from "@/lib/actions/protection-actions";

// Pause and resume, by hand. Resuming starts spending again, so it says how
// much and asks first.
export function RunControl({
  campaignId,
  status,
  dailyBudgetLabel,
}: {
  campaignId: string;
  status: "ACTIVE" | "PAUSED";
  dailyBudgetLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string } | undefined>) =>
    start(async () => {
      setError(null);
      const result = await fn();
      if (result?.error) setError(result.error);
      setConfirming(false);
    });

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {status === "ACTIVE" ? (
        <button type="button" disabled={pending} onClick={() => run(() => pauseCampaignAction(campaignId))}
          className="rounded-full border border-white/15 px-4 py-2 text-[12.5px] text-white/90 transition hover:text-white disabled:opacity-50">
          {pending ? "Pausing…" : "Pause campaign"}
        </button>
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted">Starts spending again — about {dailyBudgetLabel} a day.</span>
          <button type="button" disabled={pending} onClick={() => run(() => resumeCampaignAction(campaignId))}
            className="rounded-full px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-50" style={{ backgroundImage: "var(--mairo-ramp)" }}>
            {pending ? "Resuming…" : "Yes, resume"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-[12px] text-muted underline underline-offset-4">Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}
          className="rounded-full px-4 py-2 text-[12.5px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)" }}>
          Resume campaign
        </button>
      )}
      {error && <p className="max-w-sm text-[12px] text-amber-200/90">{error}</p>}
    </div>
  );
}
