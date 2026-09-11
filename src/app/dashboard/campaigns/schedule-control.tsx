"use client";

import { useState, useTransition } from "react";
import { inputClass } from "@/components/ui";
import { rescheduleCampaignAction } from "@/lib/actions/campaign-actions";

// Changing when a campaign starts, after it has been booked.
//
// This exists because the gap between creating a campaign and it going live is
// days, not minutes — Meta has to approve the ad, and the customer may still
// be adding a card. Plenty will change their mind in that window, and the
// alternative to this control is archiving the campaign and building a second
// one, which loses the review it has already been through.
//
// Collapsed by default. It is a line of text until somebody wants to change
// it, because most people set a start time once and never look at it again.

export function ScheduleControl({
  campaignId,
  /** The booked start, already written out in the zone they picked. */
  describedStart,
  /** Their original wall-clock choice, to prefill the field. */
  startLocal,
  running,
}: {
  campaignId: string;
  describedStart: string | null;
  startLocal: string | null;
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(startLocal ?? "");
  const [result, setResult] = useState<{ error?: string; warning?: string; saved?: boolean }>({});
  const [pending, start] = useTransition();

  function save(nextLocal: string | null) {
    setResult({});
    start(async () => {
      let zone = "UTC";
      try {
        zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {
        // Keep UTC. A named zone is better, but refusing to save because the
        // browser wouldn't say where it is would be worse.
      }
      const r = await rescheduleCampaignAction(campaignId, nextLocal, nextLocal ? zone : null);
      setResult(r);
      if (r.saved && !r.warning) setOpen(false);
    });
  }

  // Once it is delivering, when it started is history rather than a setting.
  if (running) {
    return describedStart ? (
      <p className="mt-3 text-xs text-neutral-500">Started {describedStart}.</p>
    ) : null;
  }

  return (
    <div className="mt-3">
      <p className="text-xs text-neutral-400">
        {describedStart ? (
          <>
            Starts no earlier than <span className="text-neutral-200">{describedStart}</span>.
          </>
        ) : (
          <>Starts as soon as it&rsquo;s approved.</>
        )}{" "}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-white"
        >
          {open ? "Cancel" : "Change"}
        </button>
      </p>

      {open && (
        <div className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <label className="text-xs font-medium text-neutral-400" htmlFor={`start-${campaignId}`}>
            Start no earlier than
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <input
              id={`start-${campaignId}`}
              type="datetime-local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              className={`${inputClass} max-w-xs [color-scheme:dark]`}
            />
            <button
              type="button"
              disabled={pending || !local}
              onClick={() => save(local)}
              className="rounded-full bg-white px-4 py-2 text-[11px] font-medium text-black transition hover:bg-neutral-200 disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {describedStart && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setLocal("");
                  save(null);
                }}
                className="text-[11px] text-neutral-400 underline underline-offset-4 hover:text-white"
              >
                Start as soon as it&rsquo;s approved instead
              </button>
            )}
          </div>
          {result.error && <p className="mt-2 text-xs text-red-400">{result.error}</p>}
          {result.warning && <p className="mt-2 text-xs text-amber-200/90">{result.warning}</p>}
        </div>
      )}
    </div>
  );
}
