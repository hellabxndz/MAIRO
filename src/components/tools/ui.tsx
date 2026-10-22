"use client";

import Link from "next/link";
import { useCallback, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { saveHandoff, type HandoffInput } from "@/lib/tools/handoff";

// The building blocks every free tool uses, so twenty tools look and behave
// like one product: labelled fields with their own errors, a result panel,
// copy and download, an example that says it's an example, and inputs kept
// on this device between visits (never sent anywhere).

export const inputCls =
  "w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[14.5px] text-white placeholder:text-white/35 outline-none transition focus:border-violet/70 focus:ring-2 focus:ring-violet/25";
export const primaryBtn =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#dfdfdf] to-[#cfcfcf] px-5 py-2.5 text-[14px] font-semibold text-black shadow-[0_8px_26px_-10px_rgba(255,255,255,0.9)] transition hover:brightness-110 disabled:opacity-50";
export const secondaryBtn =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-[13.5px] text-white/85 transition hover:border-white/35 hover:text-white disabled:opacity-50";

// Reading storage through useSyncExternalStore: the server renders the empty
// form, the browser then shows what was saved — no effect that sets state.
const noSubscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** State saved to this browser only, so a visitor coming back finds their numbers. */
export function useLocalState<T extends object>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const storageKey = `mairo:tool:${key}`;
  const raw = useSyncExternalStore(noSubscribe, () => readStored(storageKey), () => null);
  const stored = useMemo<T | null>(() => {
    if (!raw) return null;
    try {
      return { ...initial, ...(JSON.parse(raw) as T) };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);
  const [edited, setEdited] = useState<T | null>(null);
  const value = edited ?? stored ?? initial;
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setEdited((prev) => {
        const base = prev ?? stored ?? initial;
        const next = typeof v === "function" ? (v as (p: T) => T)(base) : v;
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Private mode or blocked storage: the tool still works, it just won't remember.
        }
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey, stored],
  );
  return [value, set];
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[13.5px] font-medium text-white">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{hint}</p>}
      <div className="mt-1.5">{children}</div>
      {error && (
        <p id={`${htmlFor}-error`} className="mt-1 text-[12.5px] text-alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** A number input that keeps an empty field empty (null), rather than turning it into 0. */
export function NumberField({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
  error,
  step = "any",
  min = 0,
  max,
  placeholder,
}: {
  label: string;
  hint?: ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  error?: string;
  step?: string;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative flex items-center">
        {prefix && <span className="pointer-events-none absolute left-3 text-[14px] text-white/50">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={value ?? ""}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className={`${inputCls} ${prefix ? "pl-8" : ""} ${suffix ? "pr-12" : ""}`}
        />
        {suffix && <span className="pointer-events-none absolute right-3 text-[13px] text-white/50">{suffix}</span>}
      </div>
    </Field>
  );
}

export function TextField({ label, hint, value, onChange, placeholder, error, multiline, maxLength = 200 }: { label: string; hint?: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; error?: string; multiline?: boolean; maxLength?: number }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      {multiline ? (
        <textarea id={id} rows={3} maxLength={maxLength} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} aria-invalid={Boolean(error)} />
      ) : (
        <input id={id} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} aria-invalid={Boolean(error)} />
      )}
    </Field>
  );
}

export function SelectField<T extends string>({ label, hint, value, onChange, options }: { label: string; hint?: ReactNode; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className={inputCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** A choice of two to four, as buttons that keyboard and screen readers treat as a radio group. */
export function Choice<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <fieldset>
      <legend className="text-[13.5px] font-medium text-white">{label}</legend>
      <div role="radiogroup" className="mt-1.5 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-[40px] rounded-full border px-3.5 text-[13px] transition ${value === o.value ? "border-violet/60 bg-violet/[0.12] text-white" : "border-white/12 bg-white/[0.03] text-white/75 hover:border-white/30"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 ${className}`}>{children}</div>;
}

export function ResultPanel({ title = "Your result", children, live = true }: { title?: string; children: ReactNode; live?: boolean }) {
  return (
    <section aria-label={title} aria-live={live ? "polite" : undefined} className="rounded-2xl border border-violet/35 bg-violet/[0.06] p-5 sm:p-6">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-bright">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: ReactNode; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-paper/60 px-4 py-3">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={`mt-0.5 font-semibold tracking-[-0.01em] text-white ${strong ? "text-[26px]" : "text-[19px]"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[12px] leading-relaxed text-faint">{sub}</p>}
    </div>
  );
}

export function Notes({ notes, tone = "neutral" }: { notes: string[]; tone?: "neutral" | "warn" }) {
  if (!notes.length) return null;
  return (
    <ul className="mt-4 space-y-1.5">
      {notes.map((n) => (
        <li key={n} className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed ${tone === "warn" ? "bg-amber-400/10 text-amber-200" : "bg-white/[0.04] text-white/80"}`}>
          {n}
        </li>
      ))}
    </ul>
  );
}

export function Problems({ problems }: { problems: { field: string; message: string }[] }) {
  if (!problems.length) return null;
  return (
    <div role="status" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13.5px] text-white/80">
      <p className="font-medium text-white">To see a result:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {problems.map((p) => (
          <li key={p.field + p.message}>{p.message}</li>
        ))}
      </ul>
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={secondaryBtn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          setDone(false);
        }
      }}
    >
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}

export function DownloadButton({ text, filename, label = "Download" }: { text: string; filename: string; label?: string }) {
  return (
    <button
      type="button"
      className={secondaryBtn}
      onClick={() => {
        const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      {label}
    </button>
  );
}

/** Fills the form with a clearly labelled example — never the visitor's own numbers. */
export function ExampleButton({ onClick, label = "Fill in an example" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="text-[13px] text-violet-bright underline underline-offset-4 hover:text-white">
      {label}
    </button>
  );
}

export function ExampleBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="ml-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">Example numbers</span>;
}

/**
 * The continuation into the free plan. Nothing is sent: the result is kept on
 * this device, and setup offers to use it — the owner chooses there.
 */
export function NextStep({ title, body, action, handoff, href = "/sign-up?from=tools" }: { title: string; body: string; action: string; handoff?: HandoffInput | null; href?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#dfdfdf]/[0.08] to-[#cfcfcf]/[0.1] p-5 sm:p-6">
      <p className="text-[16px] font-semibold text-white">{title}</p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-white/75">{body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={href} onClick={() => handoff && saveHandoff(handoff)} className={primaryBtn}>
          {action} <span aria-hidden>→</span>
        </Link>
        {handoff && <span className="text-[12px] text-white/55">Kept on this device; you choose whether to use it during setup.</span>}
      </div>
    </div>
  );
}
