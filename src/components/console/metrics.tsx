"use client";

import { Go } from "./kit";

// The four numbers at the top of the Overview — money spent, what came back,
// the results the goal counts, and what each cost. A figure is shown only
// when a connected source reported it: anything else is an empty state that
// says why it's empty and what would fill it, never a zero.

export type MetricData = {
  key: string;
  label: string;
  /** The figure, formatted; null when there's nothing reported. */
  value: string | null;
  /** Where the figure comes from: "Meta reports", "You marked", … */
  source: string | null;
  /** Change against the previous period, when both periods were reported. */
  change: { text: string; good: boolean | null } | null;
  /** Why it's empty, when it is. */
  empty: string | null;
  /** What fills it, when the owner can do something about it. */
  fix?: { href?: string | null; label: string } | null;
};

const ICON: Record<string, string> = {
  spend: "M4 7h16v10H4zM4 11h16M8 15h3",
  value: "M5 19 10 12l3 3 6-9M15 6h4v4",
  results: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  cost: "M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1-5 3 2.2 2.8 5 3.4 5 1.6 5 3.6-2.2 3-5 3-5-1.1-5-3",
};

export function MetricTile({ m }: { m: MetricData }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[20px] border p-4 sm:p-5" style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)", boxShadow: "var(--mairo-glow-soft)" }}>
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(47,107,255,0.16),transparent_70%)]" />
      <div className="flex items-center gap-2">
        <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/[0.12] text-violet-bright">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICON[m.key] ?? ICON.results} />
          </svg>
        </span>
        <p className="truncate text-[12.5px] font-medium text-muted">{m.label}</p>
      </div>
      {m.value !== null ? (
        <>
          <p className="mt-3 text-[clamp(24px,2.4vw,32px)] font-semibold leading-none tracking-[-0.03em] text-white tabular-nums">{m.value}</p>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
            {m.change && (
              <span className={m.change.good === null ? "text-muted" : m.change.good ? "text-emerald-300" : "text-amber-300"}>{m.change.text}</span>
            )}
            {m.source && <span className="text-faint">{m.source}</span>}
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-[clamp(24px,2.4vw,32px)] font-semibold leading-none tracking-[-0.03em] text-white/25" aria-hidden>
            —
          </p>
          <p className="mt-2.5 text-[12px] leading-snug text-muted">
            <span className="sr-only">No figure yet: </span>
            {m.empty}
            {m.fix && (
              <>
                {" "}
                <Go href={m.fix.href} className="text-violet-bright hover:text-white">
                  {m.fix.label}
                </Go>
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}

export function MetricStrip({ metrics, period }: { metrics: MetricData[]; period: string }) {
  return (
    <section aria-label={`Results, ${period}`} className="@container">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright">Results</h2>
        <p className="text-[12px] text-faint">{period}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        {metrics.map((m) => (
          <MetricTile key={m.key} m={m} />
        ))}
      </div>
    </section>
  );
}
