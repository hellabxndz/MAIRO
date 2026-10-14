"use client";

import type { DailyPoint } from "@/lib/dashboard/overview";
import { PerformanceChart } from "@/components/dashboard/overview/performance-chart";
import { Go, Panel } from "./kit";

// Results over time: money spent against what came back, from the same
// day-by-day figures Meta reports, with the one or two things worth knowing
// about them written underneath. An empty chart says why it's empty.

export type ResultsInsight = { key: string; text: string; href?: string | null };

export function ResultsPanel({
  points,
  empty,
  insights,
  allHref,
  period,
  count,
}: {
  points: DailyPoint[] | null;
  /** For a goal that isn't sales: draw spend against this count (e.g. leads) instead of sales. */
  count?: { key: "purchases" | "leads"; label: string } | null;
  /** Shown instead of the chart when there's nothing to draw. */
  empty: string | null;
  insights: ResultsInsight[];
  allHref?: string | null;
  period: string;
}) {
  return (
    <Panel id="results-panel" title="Performance" action={{ href: allHref, label: "Full performance" }}>
      <p className="-mt-2 mb-3 text-[12px] text-faint">Money spent and {count ? count.label.toLowerCase() : "sales"}, {period}</p>
      {empty || !points ? (
        <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed px-6 text-center" style={{ borderColor: "var(--mairo-line)" }}>
          <p className="max-w-[360px] text-[13.5px] leading-relaxed text-muted">{empty}</p>
        </div>
      ) : (
        <PerformanceChart points={points} variant={count ? "spend-purchases" : "spend-sales"} countKey={count?.key} countLabel={count?.label} />
      )}
      {insights.length > 0 && (
        <ul className="mt-4 space-y-2">
          {insights.slice(0, 3).map((i) => (
            <li key={i.key} className="flex gap-2.5 text-[13px] leading-relaxed text-white/80">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-bright" />
              <Go href={i.href} className="hover:text-white">
                {i.text}
              </Go>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
