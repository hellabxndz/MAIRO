"use client";

import { useState, useTransition } from "react";
import { FIELD_KINDS, type LeadField } from "@/lib/leads/fields";
import { submitLeadAction } from "@/lib/actions/lead-actions";

// The form itself.
//
// Written for one situation: somebody on a phone who tapped an ad thirty
// seconds ago and has no relationship with this business yet. So every choice
// here is about not losing them — one column, large targets, the keyboard that
// matches the question, errors under the field that caused them rather than in
// a summary at the top, and no branding of MAIRO's anywhere, because they did
// not come here to meet MAIRO.

const field =
  "w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900";

export function LeadFormView({
  slug,
  businessName,
  headline,
  description,
  fields,
}: {
  slug: string;
  businessName: string;
  headline: string;
  description: string;
  fields: LeadField[];
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <svg viewBox="0 0 20 20" className="h-6 w-6 fill-emerald-600" aria-hidden="true">
            <path d="M8.1 13.4 4.7 10l-1.2 1.2 4.6 4.6 9-9-1.2-1.2z" />
          </svg>
        </div>
        <p className="mt-4 text-lg text-neutral-900">{done}</p>
        <p className="mt-1 text-sm text-neutral-500">You can close this page.</p>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        start(async () => {
          setErrors({});
          // The click id Meta puts on the landing URL. Passed through so the
          // lead can be matched to the ad that produced it.
          const url = new URL(window.location.href);
          const result = await submitLeadAction({
            slug,
            values: Object.fromEntries(
              fields.map((f) => [f.key, String(formData.get(f.key) ?? "")])
            ),
            clickId: url.searchParams.get("fbclid"),
          });
          if (result.ok) setDone(result.thankYou);
          else setErrors(result.errors);
        });
      }}
      className="rounded-2xl bg-white p-6 shadow-sm sm:p-8"
    >
      <p className="text-xs uppercase tracking-[0.14em] text-neutral-400">{businessName}</p>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-900">{headline}</h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{description}</p>

      <div className="mt-7 space-y-5">
        {fields.map((f) => {
          const kind = FIELD_KINDS[f.type];
          const error = errors[f.key];
          const described = error ? `${f.key}-error` : undefined;

          return (
            <div key={f.key}>
              <label htmlFor={f.key} className="block text-sm font-medium text-neutral-800">
                {f.label}
                {!f.required && <span className="ml-1.5 text-neutral-400">(optional)</span>}
              </label>

              <div className="mt-1.5">
                {kind.input === "textarea" ? (
                  <textarea
                    id={f.key}
                    name={f.key}
                    rows={4}
                    placeholder={f.placeholder}
                    aria-invalid={Boolean(error)}
                    aria-describedby={described}
                    className={field}
                  />
                ) : kind.input === "select" ? (
                  <select
                    id={f.key}
                    name={f.key}
                    defaultValue=""
                    aria-invalid={Boolean(error)}
                    aria-describedby={described}
                    className={field}
                  >
                    <option value="" disabled>
                      Choose one
                    </option>
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : kind.input === "radio" ? (
                  <div className="flex gap-3" role="radiogroup" aria-describedby={described}>
                    {["Yes", "No"].map((o) => (
                      <label
                        key={o}
                        className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 text-base text-neutral-800 has-[:checked]:border-neutral-900 has-[:checked]:bg-neutral-900 has-[:checked]:text-white"
                      >
                        <input type="radio" name={f.key} value={o} className="sr-only" />
                        {o}
                      </label>
                    ))}
                  </div>
                ) : (
                  <input
                    id={f.key}
                    name={f.key}
                    type={kind.input}
                    inputMode={
                      kind.input === "tel" ? "tel" : kind.input === "number" ? "numeric" : undefined
                    }
                    autoComplete={kind.autoComplete}
                    placeholder={f.placeholder}
                    aria-invalid={Boolean(error)}
                    aria-describedby={described}
                    className={field}
                  />
                )}
              </div>

              {error && (
                <p id={`${f.key}-error`} className="mt-1.5 text-sm text-red-600">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {errors._form && <p className="mt-5 text-sm text-red-600">{errors._form}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-7 w-full rounded-xl bg-neutral-900 px-6 py-3.5 text-base font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send"}
      </button>

      <p className="mt-4 text-center text-xs text-neutral-400">
        Your details go to {businessName}.
      </p>
    </form>
  );
}
