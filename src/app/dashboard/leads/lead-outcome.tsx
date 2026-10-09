"use client";

import { useState, useTransition } from "react";
import type { LeadStatus } from "@/generated/prisma/enums";
import { setLeadOutcomeAction } from "@/lib/actions/lead-actions";
import { LEAD_OUTCOMES } from "@/lib/leads/outcomes";

// What became of one enquiry, marked by the business. One tap; a customer can
// also carry what the job was worth, which is optional and never guessed.

export function LeadOutcome({ leadId, status, valueCents }: { leadId: string; status: LeadStatus; valueCents: number | null }) {
  const [current, setCurrent] = useState<LeadStatus>(status);
  const [value, setValue] = useState(valueCents ? String(valueCents / 100) : "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const save = (next: LeadStatus, dollars: string) => {
    setError(null);
    setSaved(false);
    start(async () => {
      const amount = dollars.trim() === "" ? null : Number(dollars.replace(/[$,\s]/g, ""));
      const r = await setLeadOutcomeAction(leadId, next, amount);
      if (!r.ok) {
        setError(r.error ?? "Couldn't save that.");
        return;
      }
      setCurrent(next);
      setSaved(true);
    });
  };

  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      <p className="mb-2 text-[12px] text-faint">What happened with this enquiry?</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lead outcome">
        {LEAD_OUTCOMES.filter((o) => o.status !== "NEW").map((o) => {
          const on = current === o.status;
          return (
            <button
              key={o.status}
              type="button"
              title={o.hint}
              aria-pressed={on}
              disabled={pending}
              onClick={() => save(on ? "NEW" : o.status, o.status === "WON" ? value : "")}
              className={`min-h-[34px] rounded-full border px-3.5 text-[12.5px] transition disabled:opacity-60 ${
                on
                  ? "border-transparent bg-[image:var(--mairo-ramp)] text-white"
                  : "border-[color:var(--mairo-line)] text-white/80 hover:border-[color:var(--mairo-line-lit)] hover:text-white"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {current === "WON" && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save("WON", value);
          }}
        >
          <label htmlFor={`value-${leadId}`} className="text-[12.5px] text-muted">
            What was the job worth? <span className="text-faint">(optional)</span>
          </label>
          <span className="flex items-center rounded-lg border border-[color:var(--mairo-line)] px-2">
            <span className="text-[13px] text-muted">$</span>
            <input
              id={`value-${leadId}`}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className="w-24 bg-transparent px-1.5 py-1.5 text-[13px] text-white outline-none"
            />
          </span>
          <button type="submit" disabled={pending} className="rounded-full border border-[color:var(--mairo-line)] px-3 py-1.5 text-[12.5px] text-white/85 hover:text-white disabled:opacity-60">
            Save
          </button>
        </form>
      )}
      <p className="mt-2 min-h-[16px] text-[12px]" aria-live="polite">
        {error ? <span className="text-red-300">{error}</span> : saved ? <span className="text-emerald-300/80">✓ Saved</span> : null}
      </p>
    </div>
  );
}
