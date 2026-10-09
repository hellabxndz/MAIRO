"use client";

import Link from "next/link";
import { useState } from "react";
import type { HealthArea, HealthReport } from "@/lib/intelligence/types";

// BUSINESS HEALTH: one score for how the advertising operation looks, and the
// five areas under it. Each area opens to show exactly what moved its score
// and what would help most. No data, no number — the area says what it needs.

const STATUS = {
  healthy: { label: "Healthy", tone: "text-emerald-300", ring: "#34d399" },
  attention: { label: "Needs attention", tone: "text-amber-300", ring: "#fbbf24" },
  risk: { label: "At risk", tone: "text-alert", ring: "#f87171" },
} as const;

function toneFor(score: number | null): string {
  if (score === null) return "bg-white/10";
  if (score >= 80) return "bg-gradient-to-r from-[#7c5cff] to-[#a78bfa]";
  if (score >= 60) return "bg-amber-400/80";
  return "bg-alert/80";
}

export function HealthRing({ score, status, size = 132 }: { score: number | null; status: HealthReport["status"]; size?: number }) {
  const r = size / 2 - 9;
  const len = 2 * Math.PI * r;
  const color = status ? STATUS[status].ring : "rgba(148,166,204,0.3)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,166,204,0.14)" strokeWidth="9" />
        {score !== null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(score / 100) * len} ${len}`} />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {score === null ? (
          <span className="px-3 text-center text-[12px] leading-tight text-muted">Not enough data yet</span>
        ) : (
          <>
            <span className="text-[34px] font-semibold leading-none tabular-nums text-white">{score}</span>
            <span className="text-[12px] text-faint">/ 100</span>
          </>
        )}
      </div>
    </div>
  );
}

export function HealthCategory({ area, open, onToggle }: { area: HealthArea; open: boolean; onToggle: () => void }) {
  return (
    <li className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-4 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-medium text-white">{area.label}</span>
            <span className="text-[13px] tabular-nums text-white/85">{area.score === null ? <span className="text-faint">Not enough data yet</span> : `${area.score} / 100`}</span>
          </span>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <span className={`block h-full rounded-full ${toneFor(area.score)}`} style={{ width: `${area.score ?? 0}%` }} />
          </span>
        </span>
        <span aria-hidden className={`text-faint transition ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && (
        <div className="border-t border-white/[0.06] px-4 pb-4 pt-3">
          {area.score === null ? (
            <p className="text-[13px] text-muted">{area.needs}</p>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-bright">Mairo noticed</p>
              <ul className="mt-1.5 space-y-1.5">
                {area.reasons.length === 0 && <li className="text-[13px] text-muted">Nothing is pulling this score down.</li>}
                {area.reasons.map((r) => (
                  <li key={r.text} className="flex gap-2 text-[13px] leading-snug">
                    <span aria-hidden className={`mt-[3px] shrink-0 ${r.good ? "text-emerald-300" : "text-amber-300"}`}>{r.good ? "✓" : "•"}</span>
                    <span className={r.good ? "text-white/75" : "text-white/90"}>{r.text}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {area.recommendation && (
            <div className="mt-3 rounded-lg bg-violet/10 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-bright">Recommended action</p>
              <p className="mt-0.5 text-[13px] text-white/90">{area.recommendation.text}</p>
              <Link href={area.recommendation.href} className="mt-2.5 inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#7c5cff] px-3.5 text-[12.5px] font-medium text-white hover:brightness-110">
                {area.recommendation.actionLabel} <span aria-hidden>→</span>
              </Link>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function BusinessHealthScore({ health, showReportLink = true, defaultOpen = null }: { health: HealthReport | null; showReportLink?: boolean; defaultOpen?: string | null }) {
  const [open, setOpen] = useState<string | null>(defaultOpen);
  const status = health?.status ? STATUS[health.status] : null;
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Business health</h2>
        {showReportLink && (
          <Link href="/dashboard/health" className="text-[12.5px] text-violet-bright hover:text-white">
            View full health report →
          </Link>
        )}
      </div>
      {!health ? (
        <p className="mt-4 text-[13.5px] text-muted">Mairo scores your business after its first look at a running campaign.</p>
      ) : (
        <div className="mt-4 grid gap-5 md:grid-cols-[auto_1fr] md:items-start">
          <div className="flex items-center gap-4 md:flex-col md:items-center">
            <HealthRing score={health.score} status={health.status} />
            <div className="md:text-center">
              <p className="text-[13px] text-muted">Business Health</p>
              <p className={`text-[16px] font-semibold ${status?.tone ?? "text-muted"}`}>{status?.label ?? "Not enough data yet"}</p>
            </div>
          </div>
          <ul className="space-y-2">
            {health.areas.map((a) => (
              <HealthCategory key={a.key} area={a} open={open === a.key} onToggle={() => setOpen((v) => (v === a.key ? null : a.key))} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
