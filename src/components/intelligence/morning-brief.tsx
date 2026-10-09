"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setBriefFrequencyAction } from "@/lib/actions/intelligence-actions";
import type { BriefFigures, BriefReport } from "@/lib/intelligence/types";
import type { InsightView } from "@/lib/intelligence/run";
import { FixWithMairo } from "./explain";

// Your Morning Brief: the first thing on the dashboard. Four numbers for
// yesterday (or last week), the ad that did most with least, the actions for
// today, and what Mairo is keeping an eye on — readable in half a minute.

function money(cents: number | null): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents >= 100_000 ? 0 : 2 });
}

function move(now: number | null, before: number | null | undefined): string | null {
  if (now === null || before === null || before === undefined || before === 0) return null;
  const c = now / before - 1;
  if (Math.abs(c) < 0.005) return "same as before";
  return `${c > 0 ? "↑" : "↓"} ${Math.abs(Math.round(c * 100))}%`;
}

function Figure({ label, value, change }: { label: string; value: string; change: string | null }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="mt-0.5 text-[24px] font-semibold tabular-nums tracking-tight text-white">{value}</p>
      {change && <p className="text-[11.5px] tabular-nums text-faint">{change}</p>}
    </div>
  );
}

export function MorningBrief({
  greeting,
  brief,
  frequency,
  actions,
  pendingDecisions,
}: {
  greeting: string;
  brief: BriefReport | null;
  frequency: "DAILY" | "WEEKLY";
  actions: InsightView[];
  pendingDecisions: number;
}) {
  const [pending, start] = useTransition();
  const f: BriefFigures | null = brief?.figures ?? null;
  const b = brief?.before ?? null;
  const when = frequency === "WEEKLY" ? "over the last 7 days" : "yesterday";
  const count = actions.length;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-violet/30 bg-[radial-gradient(120%_120%_at_100%_0%,rgba(124,92,255,0.18),transparent_55%),linear-gradient(180deg,var(--color-field),var(--color-field-2))] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Your morning brief</p>
          <h2 className="mt-1.5 text-[22px] font-semibold tracking-tight text-white">{greeting}</h2>
          <p className="mt-0.5 text-[14px] text-muted">Here&rsquo;s what happened with your advertising {when}.</p>
        </div>
        <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5 text-[12px]" role="group" aria-label="Brief covers">
          {(["DAILY", "WEEKLY"] as const).map((x) => (
            <button
              key={x}
              type="button"
              aria-pressed={frequency === x}
              disabled={pending}
              onClick={() => start(() => void setBriefFrequencyAction(x))}
              className={`min-h-[32px] rounded-md px-3 transition ${frequency === x ? "bg-violet/25 text-white" : "text-muted hover:text-white"} disabled:opacity-60`}
            >
              {x === "DAILY" ? "Daily" : "Weekly"}
            </button>
          ))}
        </div>
      </div>

      {f ? (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure label="Ad spend" value={money(f.spendCents)} change={move(f.spendCents, b?.spendCents)} />
          <Figure label="Tracked revenue" value={money(f.revenueCents)} change={move(f.revenueCents, b?.revenueCents)} />
          <Figure label={`${f.resultWord[0].toUpperCase()}${f.resultWord.slice(1)}s`} value={f.results === null ? "—" : String(f.results)} change={move(f.results, b?.results)} />
          <Figure label="ROAS" value={f.roas === null ? "—" : `${f.roas.toFixed(1)}x`} change={move(f.roas, b?.roas)} />
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-[13.5px] text-muted">
          {brief === null ? "Your first brief arrives the morning after a campaign starts delivering." : `Nothing delivered ${when}.`}
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          {brief?.winner && (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-emerald-300">Your winner {frequency === "WEEKLY" ? "this week" : "yesterday"}</p>
              <p className="mt-1 text-[15px] font-semibold text-white">
                {brief.winner.label} <span className="font-normal text-muted">in {brief.winner.campaignName}</span>
              </p>
              <p className="mt-0.5 text-[13.5px] text-white/80">
                It brought {Math.round(brief.winner.resultShare * 100)}% of the {f?.resultWord ?? "result"}s while using only {Math.round(brief.winner.spendShare * 100)}% of your budget.
              </p>
            </div>
          )}

          <div>
            <p className="text-[14px] font-semibold text-white">
              {count === 0 ? "Nothing needs doing today." : `Mairo found ${count} action${count === 1 ? "" : "s"} for today.`}
            </p>
            <ul className="mt-2.5 space-y-2.5">
              {actions.map((a, i) => (
                <li key={a.id} className="flex flex-col gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Action {i + 1}</p>
                    <p className="text-[14px] font-medium text-white">{a.title}</p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      <span className="text-violet-bright">Recommendation:</span> {a.recommendation}
                    </p>
                  </div>
                  <FixWithMairo insight={a} label="Review" className="shrink-0 self-start sm:self-center" />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-[13px] font-semibold text-white">What Mairo is watching today</p>
          {brief && brief.watching.length > 0 ? (
            <ul className="mt-2.5 space-y-2">
              {brief.watching.map((w) => (
                <li key={w.label} className="flex items-start gap-2.5 text-[13px]">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-bright" />
                  <span>
                    <span className="text-white">{w.label}</span> <span className="text-muted">— {w.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-muted">Creative performance, cost per purchase, budget efficiency, audience fatigue and website conversions — once a campaign has run a few days.</p>
          )}
          <Link href={pendingDecisions > 0 ? "/dashboard/decisions" : "/dashboard/reports"} className="mt-4 inline-block text-[13px] text-violet-bright hover:text-white">
            View full report →
          </Link>
        </div>
      </div>
    </section>
  );
}
