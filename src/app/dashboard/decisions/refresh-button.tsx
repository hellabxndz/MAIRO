"use client";

import { useState, useTransition } from "react";
import { refreshDecisionsAction } from "@/lib/actions/decision-actions";

/** "Check again now": asks the ad networks again rather than waiting for the next daily look. */
export function RefreshDecisionsButton() {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {note && <span className="text-[12px] text-muted">{note}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await refreshDecisionsAction();
            setNote(r.ok ? (r.pending === 0 ? "Checked — nothing to decide." : `Checked — ${r.pending} to review.`) : "Couldn't check just now.");
          })
        }
        className="rounded-full border px-4 py-2 text-[12.5px] text-white/85 hover:text-white disabled:opacity-50"
        style={{ borderColor: "var(--mairo-line)" }}
      >
        {pending ? "Checking your campaigns…" : "Check again now"}
      </button>
    </div>
  );
}
