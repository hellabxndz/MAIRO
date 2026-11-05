"use client";

import { useState, useTransition } from "react";
import { setAutopilotPausedAction } from "@/lib/actions/autopilot-actions";

// Pause or resume Autopilot from Home. The server decides who may, and
// records it (lib/actions/autopilot-actions.ts); this only asks and says
// what happened.
export function AutopilotToggle({ paused }: { paused: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setAutopilotPausedAction(!paused);
            setMessage(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
          })
        }
        className="inline-flex min-h-10 items-center rounded-full border px-4 text-[13.5px] font-medium text-white transition hover:bg-white/[0.05] disabled:opacity-50"
        style={{ borderColor: "var(--v3-line-strong)" }}
      >
        {pending ? (paused ? "Resuming…" : "Pausing…") : paused ? "Resume Autopilot" : "Pause Autopilot"}
      </button>
      {message && (
        <p role="status" className={`text-[12.5px] ${message.ok ? "text-white/70" : "text-amber-200"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
