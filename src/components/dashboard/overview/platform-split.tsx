"use client";

import { useState } from "react";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { FacebookMark, InstagramMark, MetaMark } from "@/components/mairo/marks";
import { count, money, PUBLISHER_NAME } from "./format";

// Where the money went: Facebook, Instagram, and any other place Meta showed
// the ads. Every campaign runs on Meta, so this is the split that means
// something — which of Meta's apps the budget actually landed in.

const METRICS = {
  spend: { label: "Amount spent", pick: (m: PlatformMetrics) => m.spendCents, show: (v: number) => money(v), of: "spend" },
  purchases: { label: "Purchases", pick: (m: PlatformMetrics) => m.purchases, show: (v: number) => count(v), of: "purchases" },
  impressions: { label: "Impressions", pick: (m: PlatformMetrics) => m.impressions, show: (v: number) => count(v), of: "impressions" },
  clicks: { label: "Clicks", pick: (m: PlatformMetrics) => m.clicks, show: (v: number) => count(v), of: "clicks" },
} as const;

type MetricKey = keyof typeof METRICS;

function Mark({ publisher }: { publisher: string }) {
  if (publisher === "facebook")
    return (
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1877f2]/15 text-[#4b95ff]">
        <span className="h-6 w-6">
          <FacebookMark />
        </span>
      </span>
    );
  if (publisher === "instagram")
    return (
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#f58529]/25 via-[#dd2a7b]/25 to-[#8134af]/25 text-[#f472b6]">
        <span className="h-6 w-6">
          <InstagramMark />
        </span>
      </span>
    );
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] text-muted">
      <span className="h-6 w-6">
        <MetaMark />
      </span>
    </span>
  );
}

export function PlatformSplit({
  publishers,
  selectable = false,
}: {
  publishers: { publisher: string; metrics: PlatformMetrics }[] | null;
  /** Advanced lets you switch what's being split; Simple always shows spend. */
  selectable?: boolean;
}) {
  const [key, setKey] = useState<MetricKey>("spend");
  const metric = METRICS[key];
  const rows = (publishers ?? []).map((p) => ({ publisher: p.publisher, value: metric.pick(p.metrics) ?? 0 }));
  const total = rows.reduce((n, r) => n + r.value, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-white">{selectable ? "Platform breakdown" : "Platform spend"}</h2>
        {selectable && (
          <select
            value={key}
            onChange={(e) => setKey(e.target.value as MetricKey)}
            aria-label="What to split"
            className="h-8 rounded-lg border border-white/10 bg-[#0c1326] px-2 text-[12px] text-white/85 outline-none focus:border-violet/60"
          >
            {Object.entries(METRICS).map(([k, m]) => (
              <option key={k} value={k}>
                {m.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {publishers === null ? (
        <p className="mt-5 text-[13px] leading-relaxed text-muted">Meta couldn&rsquo;t split this period by app just now. It&rsquo;ll show on the next refresh.</p>
      ) : rows.length === 0 || total === 0 ? (
        <p className="mt-5 text-[13px] leading-relaxed text-muted">Nothing delivered in this period yet, so there&rsquo;s nothing to split.</p>
      ) : (
        <ul className="mt-5 space-y-5">
          {rows.map((r) => {
            const share = r.value / total;
            return (
              <li key={r.publisher} className="flex items-center gap-4">
                <Mark publisher={r.publisher} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] text-muted">{PUBLISHER_NAME[r.publisher] ?? r.publisher}</p>
                    <p className="text-[13px] font-semibold tabular-nums text-white">{Math.round(share * 100)}%</p>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[19px] font-semibold tabular-nums text-white">{metric.show(r.value)}</p>
                    <p className="text-[11.5px] text-faint">of total {metric.of}</p>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] to-[#a78bfa]" style={{ width: `${Math.max(2, share * 100)}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
