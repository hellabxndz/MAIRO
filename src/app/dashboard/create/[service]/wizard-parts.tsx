"use client";

import { inputClass } from "@/components/ui";

// Small pieces every screen of the Create wizard is built from, in Mairo's
// own look: dark glass cards, blue-purple selection glow, plain words.

export function Question({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-white sm:text-[28px]">{title}</h1>
      {sub && <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">{sub}</p>}
      <div className="mt-7">{children}</div>
    </div>
  );
}

export function SubQuestion({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="mt-9">
      <h2 className="text-[16px] font-medium text-white">{title}</h2>
      {sub && <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">{sub}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function Choice({
  selected,
  onClick,
  label,
  sub,
  badge,
  disabled,
  note,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sub?: string;
  /** e.g. "AI Recommended". */
  badge?: string | null;
  disabled?: boolean;
  /** Small print under the description, e.g. the Meta objective in Advanced view. */
  note?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className="rounded-xl border p-4 text-left transition-all duration-300 [transition-timing-function:var(--ease-mairo)] disabled:cursor-not-allowed disabled:opacity-45"
      style={{
        borderColor: selected ? "rgba(108,158,255,0.5)" : "var(--mairo-line)",
        background: selected ? "rgba(61,125,255,0.08)" : "rgba(255,255,255,0.015)",
        boxShadow: selected ? "0 0 24px rgba(61,125,255,0.18)" : "none",
      }}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-[14px] text-white">{label}</span>
        {badge && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium text-white"
            style={{ backgroundImage: "var(--mairo-ramp)" }}
          >
            {badge}
          </span>
        )}
      </span>
      {sub && <span className="mt-0.5 block text-[12px] text-muted">{sub}</span>}
      {note && <span className="mt-1.5 block font-mono text-[10.5px] text-faint">{note}</span>}
    </button>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  hint,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
  type?: "text" | "url" | "tel";
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] text-white/85">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={placeholder}
          className={`${inputClass} mt-1.5`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${inputClass} mt-1.5`}
        />
      )}
      {hint && <span className="mt-1 block text-[11.5px] text-faint">{hint}</span>}
    </label>
  );
}

/** A default answer, or a date picked instead. */
export function DateChoice({
  label,
  defaultLabel,
  pickLabel,
  picking,
  onPicking,
  value,
  onChange,
}: {
  label: string;
  defaultLabel: string;
  pickLabel: string;
  picking: boolean;
  onPicking: (picking: boolean) => void;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-[13px] text-white">{label}</p>
      <div className="mt-2 inline-flex rounded-full border p-0.5" style={{ borderColor: "var(--mairo-line)" }}>
        {[
          { on: false, text: defaultLabel },
          { on: true, text: pickLabel },
        ].map((o) => (
          <button
            key={o.text}
            type="button"
            aria-pressed={picking === o.on}
            onClick={() => onPicking(o.on)}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-all duration-300 ${
              picking === o.on ? "text-white" : "text-faint hover:text-muted"
            }`}
            style={picking === o.on ? { backgroundImage: "var(--mairo-ramp)" } : undefined}
          >
            {o.text}
          </button>
        ))}
      </div>
      {picking && (
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className={`${inputClass} mt-3`}
        />
      )}
    </div>
  );
}

export function Note({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <div
      className={`rounded-xl border p-4 text-[12.5px] leading-relaxed ${tone === "warn" ? "text-amber-200/90" : "text-muted"}`}
      style={{
        borderColor: tone === "warn" ? "rgba(251,191,36,0.25)" : "var(--mairo-line)",
        background: tone === "warn" ? "rgba(251,191,36,0.04)" : "rgba(10,16,32,0.5)",
      }}
    >
      {children}
    </div>
  );
}
