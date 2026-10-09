import Link from "next/link";
import type { JourneyStage, Metric, Missing, Source } from "@/lib/results/model";
import type { WorkItem } from "@/lib/results/work";

// The Results page's figures: the journey from ad to customer, the figures
// themselves, and the AI team's work. Every number shows where it came from;
// every gap shows why, and where to fill it.

export const SOURCE_CLASS: Record<Source, string> = {
  Meta: "bg-blue/10 text-blue-bright",
  "MAIRO counted": "bg-white/[0.06] text-muted",
  "You marked": "bg-violet/10 text-violet-bright",
  "You entered": "bg-violet/10 text-violet-bright",
  "Your store": "bg-live/10 text-live",
};

export function SourceChip({ source }: { source: Source }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium ${SOURCE_CLASS[source]}`}>{source}</span>;
}

function Gap({ missing, compact = false }: { missing: Missing; compact?: boolean }) {
  return (
    <p className={`${compact ? "mt-1 text-[11.5px]" : "mt-1.5 text-[12px]"} leading-snug text-muted`}>
      {missing.why}
      {missing.href && missing.action && (
        <>
          {" "}
          <Link href={missing.href} className="whitespace-nowrap text-violet-bright hover:underline">
            {missing.action} →
          </Link>
        </>
      )}
    </p>
  );
}

/** Advertising → … → Revenue, each step with its count and source. */
export function Journey({ stages }: { stages: JourneyStage[] }) {
  return (
    <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:flex lg:items-stretch lg:gap-0" aria-label="From ad to customer">
      {stages.map((s, i) => (
        <li key={s.key} className="flex min-w-0 items-stretch lg:flex-1">
          <div className={`min-w-0 flex-1 rounded-2xl border px-3.5 py-3 ${s.value === null ? "border-dashed border-[color:var(--mairo-line)]" : "border-[color:var(--mairo-line)] bg-white/[0.02]"}`}>
            <p className="text-[11.5px] font-medium text-muted">{s.label}</p>
            <p className={`mt-1 text-[22px] font-semibold tabular-nums tracking-[-0.02em] ${s.value === null ? "text-faint" : "text-white"}`}>{s.value ?? "—"}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <SourceChip source={s.source} />
              {s.rate && <span className="text-[11px] text-faint">{s.rate}</span>}
            </div>
            {s.value === null && s.missing && <Gap missing={s.missing} compact />}
          </div>
          {i < stages.length - 1 && (
            <span aria-hidden className="hidden w-5 shrink-0 items-center justify-center text-violet-bright/50 lg:flex">
              <svg viewBox="0 0 16 10" className="h-2.5 w-3.5">
                <path d="M0 5h13m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 lg:grid-cols-3">
      {metrics.map((m) => (
        <div key={`${m.key}-${m.label}`} className="rounded-2xl bg-white/[0.03] p-4">
          <dt className="flex items-start justify-between gap-2">
            <span className="text-[12.5px] text-muted">{m.label}</span>
            <SourceChip source={m.source} />
          </dt>
          <dd className={`mt-1 text-[24px] font-semibold tabular-nums tracking-[-0.02em] ${m.value === null ? "text-faint" : "text-white"}`}>{m.value ?? "—"}</dd>
          <dd>{m.value === null && m.missing ? <Gap missing={m.missing} /> : <p className="mt-1.5 text-[11.5px] leading-snug text-faint">{m.hint}</p>}</dd>
        </div>
      ))}
    </dl>
  );
}

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** What the AI team did, from its records: the period, and since the start. */
export function TeamWork({ items, sinceStart, periodLabel }: { items: WorkItem[]; sinceStart: WorkItem[]; periodLabel: string }) {
  const total = new Map(sinceStart.map((w) => [w.key, w.count]));
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((w) => (
        <li key={w.key} className="flex flex-col rounded-2xl border border-[color:var(--mairo-line)] p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-medium text-white">{w.label}</p>
            <p className="text-[24px] font-semibold tabular-nums leading-none tracking-[-0.02em] text-white">{w.count.toLocaleString("en-US")}</p>
          </div>
          <p className="mt-2 flex-1 text-[12px] leading-relaxed text-muted">{w.count ? w.detail : `None ${periodLabel}.`}</p>
          <p className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-faint">
            <span>
              {(total.get(w.key) ?? 0).toLocaleString("en-US")} since you started{w.latestAt ? ` · latest ${day(w.latestAt)}` : ""}
            </span>
            <Link href={w.href} className="text-violet-bright hover:underline">
              See them →
            </Link>
          </p>
        </li>
      ))}
    </ul>
  );
}
