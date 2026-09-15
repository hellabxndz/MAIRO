"use client";

import { useState, useTransition } from "react";
import { syncLeadsAction } from "@/lib/actions/lead-actions";
import { secondaryButtonClass } from "@/components/ui";

// Fetches instant-form enquiries from Meta now, rather than at the next sweep.
//
// A form MAIRO hosts posts straight into the database, so an enquiry is on this
// page the moment it is sent. Meta's own form does not work that way: Meta
// holds the submission until the app asks for it, and the app asks once a
// night. That gap is invisible in normal use and brutal the first time anybody
// tests their own ad — they fill the form in, come here, see nothing, and
// conclude the better-converting option is broken.
//
// So the wait is made pressable. The counts are reported honestly: nothing new
// is a real answer and says so, rather than leaving somebody pressing a button
// that appears to do nothing.
export function SyncLeads() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  function check() {
    start(async () => {
      setMessage(null);
      const result = await syncLeadsAction();

      if (result.error) {
        setFailed(true);
        setMessage(result.error);
        return;
      }

      setFailed(false);
      setMessage(
        result.added === 0
          ? "Nothing new yet."
          : `${result.added} new ${result.added === 1 ? "enquiry" : "enquiries"}.`
      );
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <button type="button" onClick={check} disabled={pending} className={secondaryButtonClass}>
        {pending ? "Checking…" : "Check for new enquiries"}
      </button>
      {message && (
        <p
          className={`text-xs leading-relaxed ${failed ? "text-amber-300" : "text-neutral-400"}`}
          role="status"
        >
          {message}
        </p>
      )}
    </div>
  );
}
