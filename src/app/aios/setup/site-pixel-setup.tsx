"use client";

import { useActionState } from "react";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { setUpSitePixelAction, turnOffSitePixelAction, type SitePixelState } from "@/lib/actions/aios-actions";

// The two presses behind MAIRO's own pixel on AIOS → Setup. One state, so
// the message is always about the last press.

export function SitePixelSetup({ on, canSetUp }: { on: boolean; canSetUp: boolean }) {
  const [result, action, pending] = useActionState<SitePixelState, FormData>(
    (_prev, form) => (form.get("mode") === "off" ? turnOffSitePixelAction() : setUpSitePixelAction()),
    undefined
  );
  return (
    <form action={action} className="mt-4">
      <div className="flex flex-wrap gap-3">
        <button type="submit" name="mode" value="on" disabled={pending || !canSetUp} aria-busy={pending} className={primaryButtonClass}>
          {pending ? "Working…" : on ? "Check and refresh it" : "Set up MAIRO's pixel"}
        </button>
        {on && (
          <button type="submit" name="mode" value="off" disabled={pending} className={secondaryButtonClass}>
            Turn off
          </button>
        )}
      </div>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`mt-3 text-sm leading-relaxed ${result.ok ? "text-emerald-300" : "text-red-300"}`}>
          {result.message}
        </p>
      )}
    </form>
  );
}
