"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyPoint } from "@/lib/dashboard/overview";
import { axisMoney, count, money, shortDate } from "./format";

// The dashboard's one chart, drawn at the size it is actually shown so the
// labels stay crisp.
//
//   "spend-purchases" (Advanced): spend as bars on the left axis, purchases as
//   a line on the right.
//   "spend-sales" (Simple): money spent and sales as two lines on one money
//   axis, groupable by day, week or month.
//
// A day Meta returned nothing for is drawn as zero and says "no delivery" in
// its tooltip, rather than looking like a day that cost nothing by choice.

type Grain = "daily" | "weekly" | "monthly";

type Bucket = { label: string; title: string; spend: number; sales: number; purchases: number; delivered: boolean };

function bucketize(points: DailyPoint[], grain: Grain): Bucket[] {
  if (grain === "daily") {
    return points.map((p) => ({
      label: shortDate(p.date),
      title: shortDate(p.date),
      spend: p.spendCents,
      sales: p.revenueCents,
      purchases: p.purchases,
      delivered: p.delivered,
    }));
  }
  const groups = new Map<string, DailyPoint[]>();
  points.forEach((p, i) => {
    const key = grain === "weekly" ? String(Math.floor(i / 7)) : p.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  });
  return [...groups.values()].map((g) => {
    const first = g[0].date;
    const last = g[g.length - 1].date;
    const month = new Date(`${first}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    return {
      label: grain === "weekly" ? shortDate(first) : month,
      title: grain === "weekly" ? `${shortDate(first)} – ${shortDate(last)}` : month,
      spend: g.reduce((n, p) => n + p.spendCents, 0),
      sales: g.reduce((n, p) => n + p.revenueCents, 0),
      purchases: g.reduce((n, p) => n + p.purchases, 0),
      delivered: g.some((p) => p.delivered),
    };
  });
}

/** A round axis top: 1, 2, 2.5 or 5 times a power of ten, so four ticks read cleanly. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const raw = value / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  return step * 4;
}

export function PerformanceChart({ points, variant }: { points: DailyPoint[]; variant: "spend-purchases" | "spend-sales" }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [grain, setGrain] = useState<Grain>("daily");
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const buckets = useMemo(() => bucketize(points, variant === "spend-sales" ? grain : "daily"), [points, grain, variant]);
  const dual = variant === "spend-purchases";

  const H = 230;
  const pad = { top: 12, right: dual ? 34 : 10, bottom: 26, left: 44 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = H - pad.top - pad.bottom;
  const n = buckets.length;
  const slot = n > 0 ? innerW / n : 0;
  const xAt = (i: number) => pad.left + slot * i + slot / 2;

  const moneyMax = niceMax(Math.max(0, ...buckets.map((b) => (dual ? b.spend : Math.max(b.spend, b.sales)))));
  const countMax = niceMax(Math.max(0, ...buckets.map((b) => b.purchases)));
  const yMoney = (v: number) => pad.top + innerH - (v / moneyMax) * innerH;
  const yCount = (v: number) => pad.top + innerH - (v / countMax) * innerH;

  const line = (ys: number[]) => ys.map((y, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${y.toFixed(1)}`).join(" ");
  const spendLine = line(buckets.map((b) => yMoney(b.spend)));
  const salesLine = line(buckets.map((b) => yMoney(b.sales)));
  const purchaseLine = line(buckets.map((b) => yCount(b.purchases)));
  const salesArea = n > 0 ? `${salesLine} L${xAt(n - 1).toFixed(1)},${pad.top + innerH} L${xAt(0).toFixed(1)},${pad.top + innerH} Z` : "";

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 64))));
  const ticks = [0, 1, 2, 3, 4];
  const h = hover !== null ? buckets[hover] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-5 text-[12.5px] text-muted">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#7c5cff]" /> {dual ? "Amount spent" : "Money spent"}
          </span>
          <span className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${dual ? "bg-[#4b8bff]" : "bg-[#c4b5fd]"}`} /> {dual ? "Purchases" : "Sales / Revenue"}
          </span>
        </div>
        {!dual && (
          <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5 text-[12px]">
            {(["daily", "weekly", "monthly"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrain(g)}
                className={`rounded-md px-3 py-1 capitalize transition ${grain === g ? "bg-violet/25 text-white" : "text-muted hover:text-white"}`}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={box} className="relative mt-3 h-[230px] w-full" onMouseLeave={() => setHover(null)}>
        {width > 0 && n > 0 && (
          <svg width={width} height={H} className="block" role="img" aria-label={dual ? "Amount spent and purchases over time" : "Money spent and sales over time"}>
            <defs>
              <linearGradient id="pc-sales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="pc-bar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b6cff" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#6d4dff" stopOpacity="0.35" />
              </linearGradient>
            </defs>

            {ticks.map((t) => {
              const y = pad.top + innerH - (t / 4) * innerH;
              return (
                <g key={t}>
                  <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(148,166,204,0.12)" />
                  <text x={pad.left - 8} y={y + 4} textAnchor="end" className="fill-[#5d6e91] text-[10.5px] tabular-nums">
                    {axisMoney((moneyMax * t) / 4)}
                  </text>
                  {dual && (
                    <text x={width - pad.right + 8} y={y + 4} className="fill-[#5d6e91] text-[10.5px] tabular-nums">
                      {Math.round((countMax * t) / 4)}
                    </text>
                  )}
                </g>
              );
            })}

            {dual ? (
              buckets.map((b, i) => {
                const w = Math.max(2, Math.min(18, slot * 0.62));
                const y = yMoney(b.spend);
                return <rect key={i} x={xAt(i) - w / 2} y={y} width={w} height={pad.top + innerH - y} rx={Math.min(3, w / 3)} fill="url(#pc-bar)" opacity={hover === null || hover === i ? 1 : 0.55} />;
              })
            ) : (
              <>
                <path d={salesArea} fill="url(#pc-sales)" />
                <path d={salesLine} fill="none" stroke="#c4b5fd" strokeWidth="2" strokeLinejoin="round" />
                <path d={spendLine} fill="none" stroke="#7c5cff" strokeWidth="2" strokeLinejoin="round" />
              </>
            )}
            {dual && <path d={purchaseLine} fill="none" stroke="#4b8bff" strokeWidth="2" strokeLinejoin="round" />}

            {buckets.map((b, i) => (
              <g key={i}>
                {dual ? (
                  <circle cx={xAt(i)} cy={yCount(b.purchases)} r={hover === i ? 4 : n > 45 ? 0 : 2.6} className="fill-paper" stroke="#4b8bff" strokeWidth="1.8" />
                ) : (
                  <>
                    <circle cx={xAt(i)} cy={yMoney(b.sales)} r={hover === i ? 4 : n > 45 ? 0 : 2.6} className="fill-paper" stroke="#c4b5fd" strokeWidth="1.8" />
                    <circle cx={xAt(i)} cy={yMoney(b.spend)} r={hover === i ? 4 : n > 45 ? 0 : 2.6} className="fill-paper" stroke="#7c5cff" strokeWidth="1.8" />
                  </>
                )}
                {i % labelEvery === 0 && (
                  <text x={xAt(i)} y={H - 6} textAnchor="middle" className="fill-[#5d6e91] text-[10.5px]">
                    {b.label}
                  </text>
                )}
                <rect x={pad.left + slot * i} y={pad.top} width={slot} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            ))}
            {hover !== null && <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={pad.top + innerH} stroke="rgba(167,139,250,0.35)" strokeDasharray="3 3" pointerEvents="none" />}
          </svg>
        )}

        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-44 rounded-xl border border-white/10 bg-field-2/95 p-3 text-[12px] shadow-2xl"
            style={{ left: Math.min(Math.max(xAt(hover) - 88, 0), Math.max(0, width - 176)) }}
          >
            <p className="font-medium text-white">{h.title}</p>
            {h.delivered ? (
              <dl className="mt-1.5 space-y-1 text-muted">
                <div className="flex justify-between">
                  <dt>Spent</dt>
                  <dd className="tabular-nums text-white">{money(h.spend)}</dd>
                </div>
                {dual ? (
                  <div className="flex justify-between">
                    <dt>Purchases</dt>
                    <dd className="tabular-nums text-white">{count(h.purchases)}</dd>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <dt>Sales</dt>
                    <dd className="tabular-nums text-white">{money(h.sales)}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-1 text-faint">No delivery</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
