"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { AdScore, FixKind, ScoreRecommendation } from "@/lib/score/rules";
import type { FixResult, PlanEdit } from "@/lib/score/edits";
import type { CampaignPlan } from "@/lib/campaigns/plan";
import { fixEverythingAction, fixWithAiAction } from "@/lib/actions/campaign-wizard-actions";

// The Pre-Launch Ad Score, as the Create wizard's review step shows it.
//
//   PRE-LAUNCH SCORE  82 / 100
//   Strong campaign — Mairo found 3 improvements before launch.
//   Creative 91 · Hook 74 · Offer 68 · Audience 88 · Landing Page 79 · Campaign Setup 93
//
// then each improvement with Fix with AI / Show me why / Ignore, and Fix
// Everything With Mairo at the end. Every fix is shown as a before and after
// and waits for the customer's approval; the review runs again once it's in.

function tone(score: number): string {
  return score >= 85 ? "#34d399" : score >= 70 ? "#6c9eff" : score >= 55 ? "#fbbf24" : "#f87171";
}

export function AdScoreCard({
  score,
  plan,
  advanced,
  onApply,
}: {
  score: AdScore;
  plan: CampaignPlan;
  advanced: boolean;
  /** Apply approved edits to the plan and run the review again. */
  onApply: (edits: PlanEdit[]) => void;
}) {
  const [ignored, setIgnored] = useState<string[]>([]);
  const [everything, setEverything] = useState<FixResult[] | null>(null);
  const [pending, start] = useTransition();
  const shown = score.recommendations.filter((r) => !ignored.includes(r.id));
  const fixable = shown.filter((r) => r.fix && r.fix !== "landing");

  return (
    <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--mairo-line-lit)", background: "rgba(10,16,32,0.6)", boxShadow: "var(--mairo-glow-soft)" }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-bright">Pre-launch score</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[44px] font-semibold leading-none tabular-nums" style={{ color: tone(score.overall) }}>
              {score.overall}
            </span>
            <span className="text-[16px] text-muted">/ 100</span>
          </p>
          <p className="mt-2 text-[14px] text-white">{score.summary}</p>
        </div>
      </div>

      <ScoreBreakdown score={score} advanced={advanced} />

      {!score.aiUsed && (
        <p className="mt-3 text-[11.5px] text-faint">
          The words were scored on length and structure only — the AI read isn&rsquo;t available right now.
        </p>
      )}

      {shown.length > 0 && (
        <div className="mt-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">What to improve before launch</p>
          <ul className="mt-3 space-y-2.5">
            {shown.map((r) => (
              <AIRecommendation key={r.id} rec={r} plan={plan} onApply={onApply} onIgnore={() => setIgnored((x) => [...x, r.id])} />
            ))}
          </ul>
        </div>
      )}

      {fixable.length > 1 && !everything && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setEverything(await fixEverythingAction(plan, fixable.map((r) => r.fix as FixKind))))}
          className="mt-5 w-full rounded-full px-5 py-3 text-[13.5px] font-medium text-white disabled:opacity-60 sm:w-auto"
          style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
        >
          {pending ? "Mairo is working on every fix…" : "Fix Everything With Mairo"}
        </button>
      )}

      {everything && (
        <FixEverything
          results={everything}
          onCancel={() => setEverything(null)}
          onApply={(edits) => {
            setEverything(null);
            onApply(edits);
          }}
        />
      )}

      <p className="mt-5 text-[11.5px] leading-relaxed text-faint">
        The score measures how ready this campaign is, not how it will perform. A high score means nothing avoidable is in the way —
        it isn&rsquo;t a promise of results.
      </p>
    </section>
  );
}

export function ScoreBreakdown({ score, advanced }: { score: AdScore; advanced: boolean }) {
  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {score.groups.map((g) => (
          <div key={g.key} className="rounded-xl border px-3.5 py-2.5" style={{ borderColor: "var(--mairo-line)" }}>
            <p className="text-[11.5px] text-faint">{g.label}</p>
            <p className="mt-0.5 text-[17px] font-medium tabular-nums" style={{ color: tone(g.score) }}>
              {g.score}
              <span className="text-[11px] text-faint">/100</span>
            </p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${g.score}%`, background: tone(g.score) }} />
            </div>
          </div>
        ))}
      </div>
      {advanced && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[12px] text-muted hover:text-white">All 15 checks</summary>
          <ul className="mt-3 space-y-1.5 text-[12.5px]">
            {score.factors.map((f) => (
              <li key={f.key} className="grid grid-cols-[1fr_auto] gap-x-3 sm:grid-cols-[180px_48px_1fr]">
                <span className="text-white/90">{f.label}</span>
                <span className="text-right tabular-nums sm:text-left" style={{ color: f.score === null ? undefined : tone(f.score) }}>
                  {f.score === null ? "—" : f.score}
                </span>
                <span className="col-span-2 text-muted sm:col-span-1">{f.note}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export function AIRecommendation({
  rec,
  plan,
  onApply,
  onIgnore,
}: {
  rec: ScoreRecommendation;
  plan: CampaignPlan;
  onApply: (edits: PlanEdit[]) => void;
  onIgnore: () => void;
}) {
  const [why, setWhy] = useState(false);
  const [result, setResult] = useState<FixResult | null>(null);
  const [pending, start] = useTransition();
  const dot = rec.severity === "high" ? "#f87171" : rec.severity === "medium" ? "#fbbf24" : "#94a3b8";

  return (
    <li className="rounded-xl border p-4" style={{ borderColor: "var(--mairo-line)" }}>
      <p className="flex items-start gap-2.5 text-[13.5px] text-white">
        <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
        {rec.title}
      </p>
      {why && <p className="mt-2 pl-4 text-[12.5px] leading-relaxed text-muted">{rec.why}</p>}

      {result && <FixWithAI result={result} onApply={(edits) => { setResult(null); onApply(edits); }} onCancel={() => setResult(null)} />}

      {!result && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-4">
          {rec.fix === "landing" ? (
            <Link href="/dashboard/business" className="rounded-full px-3.5 py-1.5 text-[12px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)" }}>
              {rec.fixLabel ?? "Check my website"}
            </Link>
          ) : rec.fix ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => setResult(await fixWithAiAction(plan, rec.fix as FixKind)))}
              className="rounded-full px-3.5 py-1.5 text-[12px] font-medium text-white disabled:opacity-60"
              style={{ backgroundImage: "var(--mairo-ramp)" }}
            >
              {pending ? "Working on it…" : `Fix with AI${rec.fixLabel ? ` · ${rec.fixLabel}` : ""}`}
            </button>
          ) : null}
          <button type="button" onClick={() => setWhy((v) => !v)} className="rounded-full border px-3.5 py-1.5 text-[12px] text-white/85 hover:text-white" style={{ borderColor: "var(--mairo-line)" }}>
            {why ? "Hide why" : "Show me why"}
          </button>
          <button type="button" onClick={onIgnore} className="px-2 py-1.5 text-[12px] text-muted hover:text-white">
            Ignore
          </button>
        </div>
      )}
    </li>
  );
}

/** A fix, shown as before and after, waiting for approval. */
export function FixWithAI({ result, onApply, onCancel }: { result: FixResult; onApply: (edits: PlanEdit[]) => void; onCancel: () => void }) {
  if (!result.ok) {
    return (
      <div className="mt-3 rounded-lg border p-3 text-[12.5px]" style={{ borderColor: "var(--mairo-line)" }}>
        <p className="text-amber-200/90">{result.error}</p>
        {result.suggestions && (
          <ul className="mt-2 space-y-1 text-white/90">
            {result.suggestions.map((s) => (
              <li key={s}>· {s}</li>
            ))}
          </ul>
        )}
        {result.suggestions && (
          <Link href="/dashboard/settings/business-brain" className="mt-2 inline-block text-blue-bright hover:text-white">
            Add an offer to Business Brain →
          </Link>
        )}
        <button type="button" onClick={onCancel} className="ml-3 mt-2 text-muted hover:text-white">
          Close
        </button>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-lg border p-3.5 text-[12.5px]" style={{ borderColor: "var(--mairo-line-lit)" }}>
      <p className="text-faint">{result.label}</p>
      {result.before && (
        <p className="mt-1 text-muted line-through decoration-white/20">{result.before}</p>
      )}
      <p className="mt-1 text-white">{result.after}</p>
      <p className="mt-1.5 text-muted">{result.explanation}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => onApply(result.edits)} className="rounded-full px-3.5 py-1.5 text-[12px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)" }}>
          Use this
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-1.5 text-[12px] text-muted hover:text-white">
          Keep mine
        </button>
      </div>
    </div>
  );
}

/** Every fix at once, each with a tick, applied together on approval. */
function FixEverything({ results, onApply, onCancel }: { results: FixResult[]; onApply: (edits: PlanEdit[]) => void; onCancel: () => void }) {
  const good = results.filter((r): r is Extract<FixResult, { ok: true }> => r.ok);
  const [picked, setPicked] = useState<boolean[]>(() => good.map(() => true));
  const failed = results.filter((r) => !r.ok);
  return (
    <div className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--mairo-line-lit)" }}>
      <p className="text-[14px] text-white">Mairo prepared {good.length} fix{good.length === 1 ? "" : "es"}. Review them before they&rsquo;re applied.</p>
      <ul className="mt-3 space-y-3">
        {good.map((r, i) => (
          <li key={i}>
            <label className="flex items-start gap-3 text-[12.5px]">
              <input type="checkbox" checked={picked[i]} onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-1" />
              <span>
                <span className="text-faint">{r.label}</span>
                {r.before && <span className="block text-muted line-through decoration-white/20">{r.before}</span>}
                <span className="block text-white">{r.after}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {failed.length > 0 && (
        <ul className="mt-3 space-y-1 text-[12px] text-amber-200/90">
          {failed.map((r, i) => (
            <li key={i}>{!r.ok && r.error}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!picked.some(Boolean)}
          onClick={() => onApply(good.filter((_, i) => picked[i]).flatMap((r) => r.edits))}
          className="rounded-full px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-50"
          style={{ backgroundImage: "var(--mairo-ramp)" }}
        >
          Apply the ticked fixes
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-2 text-[12.5px] text-muted hover:text-white">
          Cancel
        </button>
      </div>
    </div>
  );
}
