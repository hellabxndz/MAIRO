"use client";

import Link from "next/link";
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";

// The MAIRO console kit: the panels, labels and pills every signed-in screen
// is built from — and the same pieces the website's product demonstrations
// render with labelled sample data. One set of components for both, so a
// picture of MAIRO on the website is a picture of MAIRO.
//
// Everything here is presentational: props in, markup out. A link without an
// href renders as plain text, which is how a demonstration stays inert.

export function Go({ href, className, children, external = false, label }: { href?: string | null; className?: string; children: ReactNode; external?: boolean; label?: string }) {
  if (!href) return <span className={className}>{children}</span>;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} aria-label={label}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} aria-label={label}>
      {children}
    </Link>
  );
}

/**
 * True inside a product demonstration. A demonstration can sit on a page more
 * than once (and beside the real thing), so its panels drop their ids and keep
 * them only as data-panel — what the walkthrough's camera aims at.
 */
export const DemoContext = createContext(false);

export const eyebrowClass = "text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright";

/** The console's one surface: deep navy, a hairline, light falling from the top edge. */
export function Panel({
  id,
  title,
  action,
  children,
  className = "",
  tone = "plain",
  pad = true,
  style,
}: {
  id?: string;
  title?: string;
  action?: { href?: string | null; label: string } | null;
  children: ReactNode;
  className?: string;
  tone?: "plain" | "lit" | "warn";
  pad?: boolean;
  style?: CSSProperties;
}) {
  const demo = useContext(DemoContext);
  const bg =
    tone === "lit"
      ? "linear-gradient(165deg, rgba(121,82,255,0.16) 0%, rgba(21,27,54,0.9) 42%, rgba(17,20,38,0.9) 100%)"
      : tone === "warn"
        ? "linear-gradient(165deg, rgba(251,191,36,0.10) 0%, rgba(17,20,38,0.9) 50%)"
        : "var(--mairo-glass)";
  return (
    <section
      id={demo ? undefined : id}
      data-panel={id}
      aria-labelledby={title && id && !demo ? `${id}-title` : undefined}
      className={`relative overflow-hidden rounded-[22px] border ${pad ? "p-5 sm:p-6" : ""} ${className}`}
      style={{ borderColor: tone === "warn" ? "rgba(251,191,36,0.28)" : tone === "lit" ? "rgba(121,82,255,0.34)" : "var(--mairo-line)", backgroundImage: bg, boxShadow: "var(--mairo-glow-soft)", ...style }}
    >
      {/* A hairline of light along the top edge: depth without a drop shadow. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(248,249,255,0.14),transparent)]" />
      {(title || action) && (
        <div className={`flex flex-wrap items-baseline justify-between gap-3 ${pad ? "" : "px-5 pt-5 sm:px-6 sm:pt-6"}`}>
          {title && (
            <h2 id={id && !demo ? `${id}-title` : undefined} className={eyebrowClass}>
              {title}
            </h2>
          )}
          {action && (
            <Go href={action.href} className="text-[12.5px] text-muted transition hover:text-white">
              {action.label} <span aria-hidden>→</span>
            </Go>
          )}
        </div>
      )}
      {/* Panels size their contents to themselves (container queries), so a panel reads the same in a narrow column, a phone, or a product demo. */}
      <div className={`@container ${title || action ? "mt-4" : ""}`}>{children}</div>
    </section>
  );
}

const PILL_TONE = {
  live: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300",
  warn: "border-amber-400/35 bg-amber-400/[0.08] text-amber-300",
  alert: "border-red-400/35 bg-red-400/[0.08] text-red-300",
  violet: "border-violet-400/35 bg-violet-500/[0.10] text-violet-200",
  blue: "border-[#356cff]/35 bg-[#356cff]/[0.10] text-sky-200",
  muted: "border-white/10 bg-white/[0.04] text-muted",
} as const;
export type PillTone = keyof typeof PILL_TONE;

// A still dot, always: an animation would suggest continuous processing the
// records can't back up (the rule the AI Team's states follow too).
export function Pill({ tone = "muted", dot = false, children, className = "" }: { tone?: PillTone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[11.5px] font-medium ${PILL_TONE[tone]} ${className}`}>
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** The label every demonstration carries, so sample figures are never mistaken for a customer's. */
export function SampleLabel({ children = "Product demo · sample data" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-[#07080d]/85 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-amber-200">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-300" />
      {children}
    </span>
  );
}

/** A primary action: the violet-blue ramp, the one glow on the screen. */
export const primaryAction =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-4 text-[13px] font-semibold text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110 disabled:opacity-60";
export const quietAction =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-4 text-[13px] font-medium text-white/90 transition hover:border-[color:var(--mairo-line-lit)] hover:text-white disabled:opacity-60";
