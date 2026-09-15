"use client";

import { useState, useTransition } from "react";
import {
  FIELD_TYPE_LABELS,
  MAX_FIELDS,
  type LeadField,
  type LeadFieldType,
} from "@/lib/leads/fields";
import { saveLeadFieldsAction } from "@/lib/actions/lead-actions";
import { inputClass, primaryButtonClass } from "@/components/ui";

// Building your own form, for the businesses that want to.
//
// MAIRO's own questions are still the default and still the recommendation —
// they are written per trade and kept short on purpose. This is for the
// business that knows something about its customers MAIRO does not: the one
// that has to ask which vehicle, or whether there is parking, or what size.
//
// What it deliberately does not do is let somebody build a form that cannot
// work. The rules live in validateFields on the server, and the two that get
// enforced hardest are the ones whose failure is invisible: a form with no way
// to contact the person, and a form where nothing is required. Both collect
// enquiries that look fine and are worth nothing.

const TYPES = Object.keys(FIELD_TYPE_LABELS) as LeadFieldType[];

type Draft = LeadField & { optionsText?: string };

export function FormBuilder({
  leadFormId,
  initial,
}: {
  leadFormId: string;
  initial: LeadField[];
}) {
  const [fields, setFields] = useState<Draft[]>(() =>
    initial.map((f) => ({ ...f, optionsText: f.options?.join("\n") ?? "" }))
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function update(index: number, patch: Partial<Draft>) {
    setSaved(false);
    setError(null);
    setFields((current) => current.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function move(index: number, by: number) {
    const next = index + by;
    if (next < 0 || next >= fields.length) return;
    setSaved(false);
    setFields((current) => {
      const copy = [...current];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }

  function remove(index: number) {
    setSaved(false);
    setFields((current) => current.filter((_, i) => i !== index));
  }

  function add() {
    setSaved(false);
    setFields((current) => [
      ...current,
      // An empty key means "work one out from the wording" on the server. A key
      // is never regenerated for an existing question, because answers are
      // stored against it and a rename would orphan every one collected so far.
      { key: "", type: "SHORT_TEXT", label: "", required: false, optionsText: "" },
    ]);
  }

  function save() {
    start(async () => {
      setError(null);
      const result = await saveLeadFieldsAction(
        leadFormId,
        fields.map(({ optionsText, ...f }) => ({
          ...f,
          options:
            f.type === "CHOICE"
              ? (optionsText ?? "").split("\n").map((o) => o.trim()).filter(Boolean)
              : undefined,
        }))
      );
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      {fields.map((f, i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-start gap-3">
            <span className="mt-2.5 w-5 shrink-0 text-sm text-neutral-600">{i + 1}.</span>

            <div className="min-w-0 flex-1 space-y-3">
              <input
                value={f.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="What do you want to ask?"
                aria-label={`Question ${i + 1}`}
                className={inputClass}
              />

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={f.type}
                  onChange={(e) => update(i, { type: e.target.value as LeadFieldType })}
                  aria-label={`Answer type for question ${i + 1}`}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {FIELD_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                  />
                  Must answer
                </label>

                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move question ${i + 1} up`}
                    className="rounded px-2 py-1 text-xs text-neutral-500 transition hover:text-white disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === fields.length - 1}
                    aria-label={`Move question ${i + 1} down`}
                    className="rounded px-2 py-1 text-xs text-neutral-500 transition hover:text-white disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label={`Remove question ${i + 1}`}
                    className="rounded px-2 py-1 text-xs text-red-400/70 transition hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {f.type === "CHOICE" && (
                <div>
                  <label className="text-xs text-neutral-500">
                    The options, one per line
                  </label>
                  <textarea
                    value={f.optionsText ?? ""}
                    onChange={(e) => update(i, { optionsText: e.target.value })}
                    rows={3}
                    placeholder={"This week\nThis month\nJust looking"}
                    className={`${inputClass} mt-1.5`}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={fields.length >= MAX_FIELDS}
          className="rounded-lg border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.1em] text-neutral-300 transition hover:border-white/30 hover:text-white disabled:opacity-40"
        >
          Add a question
        </button>
        <button type="button" onClick={save} disabled={pending} className={primaryButtonClass}>
          {pending ? "Saving…" : "Save the form"}
        </button>
        {saved && <span className="text-sm text-emerald-300">Saved.</span>}
        {fields.length >= MAX_FIELDS && (
          <span className="text-xs text-neutral-500">
            {MAX_FIELDS} is the most. Long forms get abandoned.
          </span>
        )}
      </div>

      {error && <p className="max-w-2xl text-sm text-red-400">{error}</p>}
    </div>
  );
}
