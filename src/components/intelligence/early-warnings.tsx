"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { dismissInsightAction } from "@/lib/actions/intelligence-actions";
import type { InsightView } from "@/lib/intelligence/run";
import { askMairoHref, FixWithMairo, InsightExplanation, SeverityChip } from "./explain";

// MAIRO FOUND THIS BEFORE YOU DID: problems caught while they're still small.
// Each card says what Mairo noticed, what it means and what to do, with the
// full reasoning one tap away. Severity is honest — most things are "needs
// attention", not "urgent".

const CATEGORY_LABEL: Record<string, string> = {
  PERFORMANCE: "Performance",
  CREATIVE: "Creative",
  AUDIENCE: "Audience",
  BUDGET: "Budget",
  WEBSITE: "Website",
  TRACKING: "Tracking",
  PLATFORM: "Platform",
};

export function EarlyWarningCard({ insight, advanced }: { insight: InsightView; advanced: boolean }) {
  const [why, setWhy] = useState(false);
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  if (gone) return null;
  return (
    <article className="flex flex-col rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityChip severity={insight.severity} />
        <span className="text-[11.5px] text-faint">{CATEGORY_LABEL[insight.category]}</span>
        {insight.campaignName && <span className="truncate text-[11.5px] text-faint">· {insight.campaignName}</span>}
      </div>
      <h3 className="mt-2 text-[15px] font-semibold leading-snug text-white">{insight.title}</h3>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-bright">Mairo noticed</p>
      <p className="mt-0.5 text-[13.5px] leading-relaxed text-white/85">{advanced ? insight.happenedAdvanced : insight.happened}</p>
      {insight.metric && insight.currentValue && (
        <dl className="mt-2.5 grid grid-cols-2 gap-2 text-[12.5px]">
          {insight.previousValue && (
            <div className="rounded-lg bg-white/[0.03] px-3 py-2">
              <dt className="text-faint">Before</dt>
              <dd className="font-medium tabular-nums text-white">{insight.previousValue}</dd>
            </div>
          )}
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <dt className="text-faint">{insight.previousValue ? "Now" : insight.metric}</dt>
            <dd className="font-medium tabular-nums text-white">{insight.currentValue}</dd>
          </div>
        </dl>
      )}
      <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-bright">What this means</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{insight.whyItMatters}</p>
      <p className="mt-2.5 text-[13px] text-white/85">
        <span className="font-medium text-white">Recommended action:</span> {insight.recommendation}
      </p>
      {why && (
        <div className="mt-3 rounded-lg border border-violet/25 bg-violet/[0.06] p-3.5">
          <InsightExplanation insight={insight} advanced={advanced} />
          <Link href={askMairoHref(insight)} className="mt-3 inline-block text-[12.5px] text-violet-bright hover:text-white">
            Ask Mairo about it →
          </Link>
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-3.5">
        <FixWithMairo insight={insight} />
        <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} className="min-h-[40px] rounded-lg border border-white/12 px-3.5 text-[13px] text-white/85 hover:border-white/30">
          {why ? "Hide why" : "Show me why"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { const r = await dismissInsightAction(insight.id); if (r.ok) setGone(true); })}
          className="min-h-[40px] rounded-lg px-3 text-[13px] text-faint hover:text-white disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </article>
  );
}

export function EarlyWarnings({ insights, advanced }: { insights: InsightView[]; advanced: boolean }) {
  const early = insights.filter((i) => i.earlyWarning);
  const categories = [...new Set(early.map((i) => i.category))];
  const [filter, setFilter] = useState<string>("all");
  const shown = early.filter((i) => filter === "all" || i.category === filter);
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Mairo found this before you did</h2>
      <p className="mt-1 text-[14px] text-muted">Small problems become expensive when nobody notices them.</p>
      {early.length === 0 ? (
        <p className="mt-4 text-[13.5px] text-muted">Nothing caught early right now. Mairo checks every day for rising costs, tired ads, audience fatigue, website and tracking problems.</p>
      ) : (
        <>
          {categories.length > 1 && (
            <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
              {["all", ...categories].map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={filter === c}
                  onClick={() => setFilter(c)}
                  className={`min-h-[34px] shrink-0 rounded-full border px-3 text-[12.5px] transition ${filter === c ? "border-violet/50 bg-violet/15 text-white" : "border-white/10 text-muted hover:text-white"}`}
                >
                  {c === "all" ? "All" : CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {shown.map((i) => (
              <EarlyWarningCard key={i.id} insight={i} advanced={advanced} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
