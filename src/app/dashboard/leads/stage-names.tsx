"use client";

import { useState, useTransition } from "react";
import type { LeadStatus } from "@/generated/prisma/enums";
import { saveLeadStagesAction } from "@/lib/actions/lead-actions";

// The business's own names for its lead stages — "Inspection booked" rather
// than "Booked" for a roofer. Only names change; the stages, their order and
// what MAIRO measures stay the same.

export function StageNames({
  stages,
  labels,
  preset,
}: {
  stages: { status: LeadStatus; defaultLabel: string }[];
  labels: Record<string, string>;
  preset: { name: string; labels: Partial<Record<LeadStatus, string>> } | null;
}) {
  const [values, setValues] = useState<Record<string, string>>(labels);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (next: Record<string, string>) => {
    setSaved(false);
    setError(null);
    start(async () => {
      const r = await saveLeadStagesAction(next);
      if (!r.ok) return setError(r.error ?? "Couldn't save those names.");
      setSaved(true);
    });
  };

  return (
    <details className="mb-6 rounded-[var(--radius-panel)] border border-[color:var(--mairo-line)] px-5 py-4">
      <summary className="cursor-pointer text-[13.5px] text-white">Name the stages the way your business does</summary>
      <p className="mt-2 max-w-2xl text-[12.5px] text-muted">
        Only the names change. MAIRO still counts each stage the same way, so your Performance Coach can compare one month with the next.
      </p>
      {preset && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const next = { ...values, ...preset.labels } as Record<string, string>;
            setValues(next);
            save(next);
          }}
          className="mt-3 rounded-full border border-[color:var(--mairo-line)] px-3.5 py-1.5 text-[12.5px] text-white/85 hover:text-white disabled:opacity-60"
        >
          Use the usual names for {preset.name.toLowerCase()}
        </button>
      )}
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save(values);
        }}
      >
        {stages.map((s) => (
          <label key={s.status} className="grid gap-1 text-[12.5px] text-muted">
            {s.defaultLabel}
            <input
              id={`stage-${s.status}`}
              maxLength={40}
              value={values[s.status] ?? ""}
              placeholder={s.defaultLabel}
              onChange={(e) => setValues((v) => ({ ...v, [s.status]: e.target.value }))}
              className="rounded-lg border border-[color:var(--mairo-line)] bg-field px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-[color:var(--mairo-line-lit)]"
            />
          </label>
        ))}
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pending} className="rounded-full bg-[image:var(--mairo-ramp)] px-4 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-60">
            Save names
          </button>
          <span className="text-[12px]" aria-live="polite">
            {error ? <span className="text-red-300">{error}</span> : saved ? <span className="text-emerald-300">✓ Saved</span> : null}
          </span>
        </div>
      </form>
    </details>
  );
}
