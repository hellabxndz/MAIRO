"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CampaignReview } from "@/lib/campaigns/review";
import type { CampaignPlan } from "@/lib/campaigns/plan";
import { contextOf, hasOwnWords } from "@/lib/campaigns/plan";
import type { ReviewStep } from "@/lib/campaigns/review-rules";
import type { AdScore, FixKind, GroupKey, ScoreRecommendation } from "@/lib/score/rules";
import { scoreBand } from "@/lib/score/rules";
import type { FixResult, OptionsResult, PlanEdit } from "@/lib/score/edits";
import { areaDetail, creativeAdvice, launchChecklist, reviewOverview, type AreaDetail, type Comparison } from "@/lib/score/review";
import { campaignAnswerEdit, type ReviewQuestion } from "@/lib/score/questions";
import { answerBusinessQuestionAction, fixWithAiAction, improveOptionsAction } from "@/lib/actions/campaign-wizard-actions";
import { Drawer } from "@/components/mairo/overlay";

// The Campaign Review: a score that explains itself.
//
//   PRE-LAUNCH SCORE  77 / 100            Good Preparation
//   Good campaign — but MAIRO found a few ways to make it stronger.
//   Up to +9 points available (estimated) · [Improve My Score]
//   Creative 78 · Hook 65 · Offer 70 · …    ← each opens its own panel
//   Improve Your Campaign                   ← the questions and fixes, right here
//   MAIRO recommends improving these first  ← the lowest three, never everything
//   Looking strong
//   Help MAIRO learn your business          ← 1/3, why MAIRO is asking
//   Before you launch                       ← ✓/⚠, Improve Campaign / Launch Anyway
//
// Nothing changes the campaign without the customer choosing it, nothing
// raises the score except checking the campaign again, and the score never
// blocks a launch — only a real setup problem does.

const tone = (score: number) => (score >= 85 ? "#34d399" : score >= 70 ? "#6c9eff" : score >= 55 ? "#fbbf24" : "#f87171");
const ramp = { backgroundImage: "var(--mairo-ramp)" } as const;
const line = { borderColor: "var(--mairo-line)" } as const;
const primaryBtn = "rounded-full px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-50";
const quietBtn = "rounded-full border px-4 py-2 text-[12.5px] text-white/85 hover:text-white disabled:opacity-50";
const eyebrow = "font-mono text-[10px] uppercase tracking-[0.18em]";
const OPTION_KINDS: FixKind[] = ["hook", "headline", "primaryText", "offer"];

export type ReviewHandlers = {
  plan: CampaignPlan;
  advanced: boolean;
  /** Apply approved edits (or a campaign answer) and check the campaign again. */
  onApply: (edits: PlanEdit[]) => void;
  /** Remember areas the customer chose to keep as they are. Doesn't re-check. */
  onKeep: (kept: string[]) => void;
  onFix: (step: ReviewStep) => void;
  onLaunchAnyway: () => void;
  onRecheck: () => void;
  /** A question was answered (business or campaign), by id. */
  onAnswered: (id: string, business: boolean) => void;
  /** Questions answered this session, so none is asked twice on the page. */
  answered: string[];
};

export function CampaignReviewPanel({
  review,
  comparison,
  animateFrom,
  learned,
  ...h
}: ReviewHandlers & { review: CampaignReview; comparison: Comparison | null; animateFrom: number | null; learned: number }) {
  const { plan } = h;
  const score = review.score;
  const kept = contextOf(plan).kept;
  const opts = useMemo(() => ({ kept, category: review.category, hasOwnWords: hasOwnWords(plan) }), [kept, review.category, plan]);
  const overview = useMemo(() => reviewOverview(score, opts), [score, opts]);
  const checklist = useMemo(() => launchChecklist(score, { ...opts, website: review.website }), [score, opts, review.website]);
  const [open, setOpen] = useState<GroupKey | null>(null);
  const learnRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<HTMLDivElement>(null);
  const band = scoreBand(score.overall);
  const shown = useCountUp(animateFrom, score.overall);

  const improve = () => {
    const first = overview.priorities[0];
    if (first) setOpen(first.key);
    else learnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const count = overview.areasToImprove;

  return (
    <div className="space-y-5">
      {/* --- the score ------------------------------------------------------------ */}
      <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--mairo-line-lit)", background: "rgba(var(--mairo-bg-rgb),0.6)", boxShadow: "var(--mairo-glow-soft)" }}>
        {comparison && <ComparisonBanner c={comparison} learned={learned} />}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`${eyebrow} text-blue-bright`}>Pre-launch score</p>
            <p className="mt-1 flex items-baseline gap-1.5" aria-live="polite">
              <span className="text-[52px] font-semibold leading-none tabular-nums" style={{ color: tone(score.overall) }}>{shown}</span>
              <span className="text-[17px] text-muted">/ 100</span>
            </p>
          </div>
          <span className="rounded-full border px-3 py-1 text-[12px] text-white/90" style={line}>
            {score.blocking > 0 ? "Setup required" : band.title}
          </span>
        </div>
        <p className="mt-3 text-[15px] text-white">{score.summary}</p>
        {score.blocking === 0 && count > 0 && (
          <p className="mt-2 text-[13px] text-muted">
            {overview.potential > 0 ? (
              <>
                <span className="text-white">Up to +{overview.potential} points available</span> (estimated) · MAIRO identified {count} area{count === 1 ? "" : "s"} that could be improved.
              </>
            ) : (
              <>MAIRO identified {count} area{count === 1 ? "" : "s"} that could be improved.</>
            )}
          </p>
        )}
        {score.blocking === 0 && (count > 0 || review.questions.learn.length > 0) && (
          <button type="button" onClick={improve} className={`${primaryBtn} mt-4 px-5 py-2.5 text-[13.5px]`} style={{ ...ramp, boxShadow: "var(--mairo-glow-key)" }}>
            Improve My Score
          </button>
        )}

        <Breakdown score={score} onOpen={setOpen} />

        {!score.aiUsed && (
          <p className="mt-3 text-[11.5px] text-faint">The words were scored on length and structure only — the AI read isn&rsquo;t available right now.</p>
        )}
        <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
          A higher MAIRO score means we&rsquo;ve reduced more avoidable weaknesses before launch. It does not guarantee performance.
          <br />
          <span className="text-white/70">100 is not required to launch.</span> MAIRO&rsquo;s goal is to make sure your campaign is well prepared, not to artificially maximize a number.
        </p>
        {h.advanced && <AllChecks score={score} />}
      </section>

      {/* --- improve your campaign ----------------------------------------------- */}
      {score.blocking === 0 && (count > 0 || review.questions.learn.length > 0) && (
        <section className="rounded-2xl border p-5" style={{ borderColor: "rgba(124,92,255,0.45)", background: "linear-gradient(180deg, rgba(124,92,255,0.12), rgba(var(--mairo-bg-rgb),0.5))" }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[16px] font-medium text-white">Improve Your Campaign</p>
              <p className="mt-0.5 text-[13px] text-white/85">Help MAIRO build a stronger campaign.</p>
            </div>
            <span className="rounded-full px-3 py-1 text-[12px] text-white" style={ramp}>
              {count > 0 ? `${count} Thing${count === 1 ? "" : "s"} MAIRO Can Improve` : `${review.questions.learn.length} Question${review.questions.learn.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            {review.questions.learn.length > 0
              ? "We're missing a few details about your business. Answering these questions can help MAIRO improve your targeting, creative, offer and messaging."
              : "MAIRO found a few changes that could strengthen this campaign. You choose which ones to make."}
          </p>
          <button type="button" onClick={improve} className={`${primaryBtn} mt-4`} style={ramp}>Improve My Score</button>
        </section>
      )}

      {/* --- recommends ------------------------------------------------------------ */}
      {overview.priorities.length > 0 && (
        <section ref={recRef}>
          <p className={`${eyebrow} text-faint`}>MAIRO recommends improving these first</p>
          <ol className="mt-3 space-y-2.5">
            {overview.priorities.map((d, i) => (
              <li key={d.key} className="rounded-xl border p-4" style={line}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[14.5px] text-white">
                    <span className="mr-1.5 text-faint">{i + 1}.</span>
                    {d.action}
                  </p>
                  <span className="shrink-0 text-[14px] font-medium tabular-nums" style={{ color: tone(d.score) }}>{d.score}/100</span>
                </div>
                {d.improve[0] && <p className="mt-1 pl-5 text-[12.5px] leading-relaxed text-muted">{d.improve[0]}</p>}
                {d.estimate !== null && (
                  <p className="mt-1 pl-5 text-[12px] text-faint">
                    Estimated MAIRO score after change: {d.score} → ~{d.estimate}
                  </p>
                )}
                <button type="button" onClick={() => setOpen(d.key)} className={`${primaryBtn} ml-5 mt-3 py-1.5`} style={ramp}>Improve</button>
              </li>
            ))}
          </ol>
          {overview.areasToImprove > overview.priorities.length && (
            <p className="mt-2 text-[12px] text-faint">MAIRO shows the most useful {overview.priorities.length} first, so you don&rsquo;t have to change everything at once.</p>
          )}
        </section>
      )}

      {overview.more.length > 0 && (
        <details className="rounded-xl border px-4 py-3" style={line}>
          <summary className="cursor-pointer text-[13px] text-white/85 hover:text-white">
            {overview.more.length} more area{overview.more.length === 1 ? "" : "s"} MAIRO can improve later
          </summary>
          <ul className="mt-3 space-y-2">
            {overview.more.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[13px] text-white">{d.action}</span>
                  {d.improve[0] && <span className="block truncate text-[12px] text-muted">{d.improve[0]}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-[13px] tabular-nums" style={{ color: tone(d.score) }}>{d.score}/100</span>
                  <button type="button" onClick={() => setOpen(d.key)} className="rounded-full border px-3 py-1 text-[12px] text-white/90 hover:text-white" style={line}>Improve</button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* --- looking strong / kept ----------------------------------------------------- */}
      {[
        { title: overview.priorities.length ? "Looking strong" : "Every area", items: overview.strong.filter((d) => !d.kept) },
        { title: "Kept as they are", items: overview.strong.filter((d) => d.kept) },
      ]
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section key={g.title}>
            <p className={`${eyebrow} text-faint`}>{g.title}</p>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {g.items.map((d) => (
                <li key={d.key}>
                  <button type="button" onClick={() => setOpen(d.key)} className="flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition hover:bg-white/[0.03]" style={line}>
                    <span className="min-w-0">
                      <span className="block text-[13px] text-white">{d.label}</span>
                      <span className="block truncate text-[11.5px] text-faint">{d.kept ? "Your choice — tap to change" : d.score >= 80 ? "Looks strong" : "No specific issue found"}</span>
                    </span>
                    <span className="text-[16px] font-medium tabular-nums" style={{ color: tone(d.score) }}>{d.score}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

      {/* --- learn the business ------------------------------------------------------- */}
      <div ref={learnRef} className="scroll-mt-24">
        {review.questions.learn.length > 0 && <LearnPanel questions={review.questions.learn} h={h} />}
      </div>

      {/* --- before you launch ------------------------------------------------------- */}
      <section className="rounded-2xl border p-5" style={{ ...line, background: "rgba(var(--mairo-bg-rgb),0.5)" }}>
        <p className={`${eyebrow} text-faint`}>Before you launch</p>
        <ul className="mt-3 space-y-1.5">
          {checklist.items.map((i) => (
            <li key={i.key} className="flex items-center gap-2.5 text-[13.5px]">
              <span aria-hidden className="w-4 text-center" style={{ color: i.ok ? "var(--color-emerald-400)" : i.blocking ? "var(--color-red-400)" : "var(--color-amber-400)" }}>{i.ok ? "✓" : i.blocking ? "✕" : "⚠"}</span>
              <span className={i.ok ? "text-white/85" : "text-white"}>{i.text}</span>
            </li>
          ))}
        </ul>
        {checklist.remaining > 0 && score.blocking === 0 && (
          <p className="mt-3 text-[12.5px] text-muted">{checklist.remaining} recommendation{checklist.remaining === 1 ? "" : "s"} remaining — you can still launch.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {checklist.remaining > 0 && score.blocking === 0 && (
            <button type="button" onClick={improve} className={primaryBtn} style={ramp}>Improve Campaign</button>
          )}
          <button
            type="button"
            onClick={h.onLaunchAnyway}
            disabled={score.blocking > 0}
            className={checklist.remaining > 0 ? `${quietBtn}` : primaryBtn}
            style={checklist.remaining > 0 ? line : ramp}
          >
            {checklist.remaining > 0 ? "Launch Anyway" : "Continue to launch"}
          </button>
          <button type="button" onClick={h.onRecheck} className={quietBtn} style={line}>Recheck Campaign</button>
        </div>
        {score.blocking > 0 && <p className="mt-2 text-[12px] text-amber-200/90">Fix what&rsquo;s listed under &ldquo;Must fix before launching&rdquo; first — that&rsquo;s a setup problem, not the score.</p>}
      </section>

      {open && (
        <AreaPanel
          detail={areaDetail(score, open, opts)}
          review={review}
          h={h}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** 77 → 86, counted up, unless the person prefers less motion. */
function useCountUp(from: number | null, to: number): number {
  // Only the animation frames set state; outside an animation it's just `to`.
  const [frame, setFrame] = useState<{ to: number; value: number } | null>(null);
  useEffect(() => {
    if (from === null || from === to || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    let id = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      setFrame(k < 1 ? { to, value: Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))) } : null);
      if (k < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [from, to]);
  return frame && frame.to === to ? frame.value : to;
}

function ComparisonBanner({ c, learned }: { c: Comparison; learned: number }) {
  const up = c.delta > 0;
  return (
    <div className="mb-5 rounded-xl border p-4" style={{ borderColor: up ? "rgba(52,211,153,0.35)" : "var(--mairo-line)", background: up ? "rgba(52,211,153,0.06)" : "rgba(var(--mairo-fg-rgb),0.02)" }}>
      <p className="text-[14.5px] font-medium text-white">{c.headline}</p>
      <p className="mt-0.5 text-[13px] text-white/85">
        {c.from} → {c.to}
        {c.delta !== 0 && <span className={up ? "text-emerald-300" : "text-amber-200"}> · {up ? "+" : ""}{c.delta} MAIRO preparation point{Math.abs(c.delta) === 1 ? "" : "s"}</span>}
      </p>
      {(c.improved.length > 0 || learned > 0) && (
        <>
          <p className="mt-2 text-[12px] text-faint">Changes</p>
          <ul className="mt-1 space-y-0.5 text-[13px] text-white/90">
            {c.improved.map((x) => <li key={x}>✓ {x}</li>)}
            {learned > 0 && <li>✓ Better business context — you told MAIRO {learned} thing{learned === 1 ? "" : "s"} about your business</li>}
          </ul>
        </>
      )}
      {c.delta === 0 && c.improved.length === 0 && <p className="mt-1.5 text-[12.5px] text-muted">The score only moves when the campaign itself changes. Answers help MAIRO write a stronger version when you ask it to.</p>}
      {c.delta === 0 && c.improved.length > 0 && <p className="mt-1.5 text-[12.5px] text-muted">The overall rounds to the same number, but the areas below went up.</p>}
      {c.lower.length > 0 && <p className="mt-1.5 text-[12.5px] text-amber-200/90">Went down: {c.lower.join(", ")}.</p>}
      {c.still && <p className="mt-2 text-[12.5px] text-muted">Still recommended: <span className="text-white">{c.still}</span></p>}
    </div>
  );
}

function Breakdown({ score, onOpen }: { score: AdScore; onOpen: (k: GroupKey) => void }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {score.groups.map((g) => (
        <button key={g.key} type="button" onClick={() => onOpen(g.key)} aria-label={`${g.label}: ${g.score} out of 100. Show details`}
          className="rounded-xl border px-3.5 py-2.5 text-left transition hover:bg-white/[0.04]" style={line}>
          <span className="flex items-center justify-between text-[11.5px] text-faint">
            {g.label}
            <span aria-hidden className="text-white/40">›</span>
          </span>
          <span className="mt-0.5 block text-[17px] font-medium tabular-nums" style={{ color: tone(g.score) }}>
            {g.score}
            <span className="text-[11px] text-faint">/100</span>
          </span>
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <span className="block h-full rounded-full" style={{ width: `${g.score}%`, background: tone(g.score) }} />
          </span>
        </button>
      ))}
    </div>
  );
}

function AllChecks({ score }: { score: AdScore }) {
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-[12px] text-muted hover:text-white">All {score.factors.length} checks</summary>
      <ul className="mt-3 space-y-1.5 text-[12.5px]">
        {score.factors.map((f) => (
          <li key={f.key} className="grid grid-cols-[1fr_auto] gap-x-3 sm:grid-cols-[180px_48px_1fr]">
            <span className="text-white/90">{f.label}</span>
            <span className="text-right tabular-nums sm:text-left" style={{ color: f.score === null ? undefined : tone(f.score) }}>{f.score === null ? "—" : f.score}</span>
            <span className="col-span-2 text-muted sm:col-span-1">{f.note}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ------------------------------------------------------------------ area panel */

function List({ title, items, mark, color }: { title: string; items: string[]; mark: string; color: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="text-[13px] font-medium text-white">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((x) => (
          <li key={x} className="flex gap-2 text-[13px] leading-relaxed text-white/85">
            <span aria-hidden style={{ color }}>{mark}</span>
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AreaPanel({ detail: d, review, h, onClose }: { detail: AreaDetail; review: CampaignReview; h: ReviewHandlers; onClose: () => void }) {
  const [options, setOptions] = useState<OptionsResult | null>(null);
  const [single, setSingle] = useState<FixResult | null>(null);
  const [pending, start] = useTransition();
  // Answered elsewhere on the page this session: not asked again here.
  const [here] = useState(() => (review.questions.byArea[d.key] ?? []).filter((q) => !h.answered.includes(q.id)));
  const questions = here;
  const kept = contextOf(h.plan).kept;
  const apply = (edits: PlanEdit[]) => {
    onClose();
    h.onApply(edits);
  };
  const improveWith = (fix: FixKind) =>
    start(async () => {
      setOptions(null);
      setSingle(null);
      if (OPTION_KINDS.includes(fix)) setOptions(await improveOptionsAction(h.plan, fix));
      else setSingle(await fixWithAiAction(h.plan, fix));
    });
  const extraFixes = d.recommendations.filter((r) => r.fix && r.fix !== "landing" && r.fix !== d.fix);

  return (
    <Drawer open onClose={onClose} title={`${d.label} Score`}>
      <p className="flex items-baseline gap-1.5">
        <span className="text-[40px] font-semibold leading-none tabular-nums" style={{ color: tone(d.score) }}>{d.score}</span>
        <span className="text-[15px] text-muted">/ 100</span>
        {d.kept && <span className="ml-2 rounded-full border px-2.5 py-0.5 text-[11.5px] text-white/80" style={line}>Kept as it is</span>}
      </p>

      {d.whyLower && (
        <div className="mt-5">
          <p className="text-[13px] font-medium text-white">Why this score is lower</p>
          <p className="mt-1 text-[13px] leading-relaxed text-white/85">{d.whyLower}</p>
        </div>
      )}
      {!d.actionable && d.score < 100 && (
        <p className="mt-5 rounded-xl bg-white/[0.03] px-4 py-3 text-[12.5px] leading-relaxed text-muted">
          MAIRO didn&rsquo;t find a specific problem here. The difference reflects what MAIRO couldn&rsquo;t check or limited data, not something wrong.
        </p>
      )}

      <List title="What's working" items={d.working} mark="✓" color="#34d399" />
      {d.key === "landing" ? (
        <>
          <List title="Detected issues" items={d.detected} mark="⚠" color="#fbbf24" />
          <List title="Suggested things to check" items={d.toCheck} mark="·" color="#94a3b8" />
          {d.detected.length === 0 && d.toCheck.length > 0 && <p className="mt-2 text-[11.5px] text-faint">These are suggestions — MAIRO hasn&rsquo;t detected a problem with them.</p>}
        </>
      ) : (
        <>
          <List title="What could improve" items={d.improve} mark="•" color="#fbbf24" />
          <List title="Suggested things to check" items={d.toCheck} mark="·" color="#94a3b8" />
        </>
      )}

      {d.recommendation && (
        <div className="mt-5 rounded-xl px-4 py-3" style={{ background: "rgba(124,92,255,0.1)" }}>
          <p className="text-[12px] text-violet-bright">MAIRO recommendation</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-white">&ldquo;{d.recommendation}&rdquo;</p>
          {d.estimate !== null && (
            <p className="mt-2 text-[12.5px] text-white/85">
              {d.label}: {d.score} → <span className="font-medium text-white">~{d.estimate}</span>
              <span className="block text-[11.5px] text-faint">Estimated MAIRO score after change — an estimate of campaign preparation, not of ad results.</span>
            </p>
          )}
        </div>
      )}

      {d.key === "creative" && <CreativeHelp review={review} plan={h.plan} onFix={(s) => { onClose(); h.onFix(s); }} />}

      {d.recommendations.filter((r) => r.link).map((r) => (
        <div key={r.id} className="mt-4">
          <Link href={r.link!.href} className={`${primaryBtn} inline-block`} style={ramp}>{r.link!.label}</Link>
          {h.advanced && r.technical && <p className="mt-2 text-[11.5px] leading-relaxed text-faint">Technical: {r.technical}</p>}
        </div>
      ))}

      {/* Actions */}
      {!options && !single && (d.actionable || d.fix) && (
        <div className="mt-6 flex flex-wrap gap-2">
          {d.fix && d.fix !== "landing" && (
            <button type="button" disabled={pending} onClick={() => improveWith(d.fix!)} className={primaryBtn} style={ramp}>
              {pending ? "MAIRO is working…" : "Let MAIRO Improve It"}
            </button>
          )}
          <button type="button" onClick={() => { onClose(); h.onFix(d.step); }} className={quietBtn} style={line}>I&rsquo;ll Edit It</button>
          {!d.kept ? (
            <button type="button" onClick={() => { h.onKeep([...new Set([...kept, d.key])]); onClose(); }} className="px-2 py-2 text-[12.5px] text-muted hover:text-white">
              Keep Current Version
            </button>
          ) : (
            <button type="button" onClick={() => h.onKeep(kept.filter((k) => k !== d.key))} className="px-2 py-2 text-[12.5px] text-muted hover:text-white">
              Undo &ldquo;keep&rdquo;
            </button>
          )}
        </div>
      )}
      {extraFixes.length > 0 && !options && !single && (
        <ul className="mt-4 space-y-2">
          {extraFixes.map((r) => <ExtraFix key={r.id} rec={r} pending={pending} onRun={() => improveWith(r.fix!)} />)}
        </ul>
      )}

      {options && <OptionsPicker result={options} onApply={apply} onCancel={() => setOptions(null)} />}
      {single && <SingleFix result={single} onApply={apply} onCancel={() => setSingle(null)} />}

      {questions.length > 0 && (
        <div className="mt-7 border-t pt-5" style={line}>
          <p className="text-[13.5px] font-medium text-white">Help MAIRO improve your {d.label.toLowerCase()}</p>
          <div className="mt-3 space-y-3">
            {questions.map((q) => <QuestionCard key={q.id} q={q} h={h} />)}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function ExtraFix({ rec, pending, onRun }: { rec: ScoreRecommendation; pending: boolean; onRun: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5" style={line}>
      <span className="text-[12.5px] text-white/85">{rec.title}</span>
      <button type="button" disabled={pending} onClick={onRun} className="rounded-full border px-3 py-1 text-[12px] text-white/90 hover:text-white" style={line}>
        {rec.fixLabel ?? "Improve"}
      </button>
    </li>
  );
}

function CreativeHelp({ review, plan, onFix }: { review: CampaignReview; plan: CampaignPlan; onFix: (s: ReviewStep) => void }) {
  return (
    <div className="mt-5">
      <p className="text-[13px] font-medium text-white">Best creative for your goal</p>
      <p className="mt-1 text-[13px] leading-relaxed text-white/85">{creativeAdvice({ goal: plan.goal, category: review.category, assets: review.assets })}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {["Upload Photos", "Upload Video", "Use a Facebook or Instagram post", "Generate With MAIRO"].map((label) => (
          <button key={label} type="button" onClick={() => onFix("ad")} className="rounded-full border px-3 py-1.5 text-[12px] text-white/90 hover:text-white" style={line}>
            {label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11.5px] text-faint">These open the Advertisement step, where your choice is saved with this campaign.</p>
    </div>
  );
}

/** Three alternatives, one recommended; the customer picks. Nothing changes until they do. */
function OptionsPicker({ result, onApply, onCancel }: { result: OptionsResult; onApply: (edits: PlanEdit[]) => void; onCancel: () => void }) {
  const [picked, setPicked] = useState(() => (result.ok ? Math.max(0, result.options.findIndex((o) => o.recommended)) : 0));
  if (!result.ok) {
    return (
      <div className="mt-5 rounded-xl border p-4 text-[12.5px]" style={line}>
        <p className="text-amber-200/90">{result.error}</p>
        {result.suggestions && <ul className="mt-2 space-y-1 text-white/90">{result.suggestions.map((s) => <li key={s}>· {s}</li>)}</ul>}
        <button type="button" onClick={onCancel} className="mt-3 text-muted hover:text-white">Dismiss</button>
      </div>
    );
  }
  return (
    <div className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--mairo-line-lit)" }}>
      <p className="text-[12px] text-faint">{result.label} — current</p>
      {result.before && <p className="mt-1 text-[13px] text-muted">&ldquo;{result.before}&rdquo;</p>}
      <fieldset className="mt-4 space-y-2">
        <legend className="text-[12px] text-faint">Choose one</legend>
        {result.options.map((o, i) => (
          <label key={i} className="flex cursor-pointer gap-3 rounded-xl border p-3 text-[13px]" style={{ borderColor: picked === i ? "var(--mairo-line-lit)" : "var(--mairo-line)" }}>
            <input type="radio" name="improve-option" checked={picked === i} onChange={() => setPicked(i)} className="mt-1" />
            <span>
              <span className="text-[11px] text-faint">Option {String.fromCharCode(65 + i)}{o.recommended && <span className="ml-1.5 rounded-full px-2 py-0.5 text-[10.5px] text-white" style={ramp}>Recommended</span>}</span>
              <span className="mt-0.5 block text-white">&ldquo;{o.text}&rdquo;</span>
              <span className="mt-0.5 block text-[12px] text-muted">{o.why}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => onApply(result.options[picked].edits)} className={primaryBtn} style={ramp}>Use this and recheck</button>
        <button type="button" onClick={onCancel} className="px-2 py-2 text-[12.5px] text-muted hover:text-white">Keep current version</button>
      </div>
    </div>
  );
}

function SingleFix({ result, onApply, onCancel }: { result: FixResult; onApply: (edits: PlanEdit[]) => void; onCancel: () => void }) {
  if (!result.ok) {
    return (
      <div className="mt-5 rounded-xl border p-4 text-[12.5px]" style={line}>
        <p className="text-amber-200/90">{result.error}</p>
        {result.suggestions && <ul className="mt-2 space-y-1 text-white/90">{result.suggestions.map((s) => <li key={s}>· {s}</li>)}</ul>}
        <button type="button" onClick={onCancel} className="mt-3 text-muted hover:text-white">Dismiss</button>
      </div>
    );
  }
  return (
    <div className="mt-5 rounded-xl border p-4 text-[12.5px]" style={{ borderColor: "var(--mairo-line-lit)" }}>
      <p className="text-faint">{result.label}</p>
      {result.before && <p className="mt-1 text-muted line-through decoration-white/20">{result.before}</p>}
      <p className="mt-1 text-white">{result.after}</p>
      <p className="mt-1.5 text-muted">{result.explanation}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => onApply(result.edits)} className={primaryBtn} style={ramp}>Use this and recheck</button>
        <button type="button" onClick={onCancel} className="px-2 py-2 text-[12.5px] text-muted hover:text-white">Keep current version</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ questions */

function LearnPanel({ questions, h }: { questions: ReviewQuestion[]; h: ReviewHandlers }) {
  const [skipped, setSkipped] = useState<string[]>([]);
  // The card just answered stays a moment to show its ✓ before the next one.
  const [showing, setShowing] = useState<string | null>(null);
  const open = questions.filter((q) => q.id === showing || (!h.answered.includes(q.id) && !skipped.includes(q.id)));
  const q = open[0];
  const position = questions.length - open.length + 1;
  return (
    <section className="rounded-2xl border p-5" style={{ ...line, background: "rgba(var(--mairo-bg-rgb),0.5)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${eyebrow} text-faint`}>Help MAIRO learn your business</p>
          <p className="mt-1.5 text-[13px] text-muted">Answer {questions.length} quick question{questions.length === 1 ? "" : "s"} so MAIRO can make better recommendations.</p>
        </div>
        {q && <span className="shrink-0 text-[12px] tabular-nums text-faint">{position}/{questions.length}</span>}
      </div>
      {!q ? (
        <p className="mt-4 text-[13.5px] text-white">✓ Thanks — that&rsquo;s everything for now. Press Recheck Campaign to see whether anything changed.</p>
      ) : (
        <div className="mt-4">
          <QuestionCard key={q.id} q={q} h={h} onSaved={() => setShowing(q.id)} onDone={() => setShowing(null)} />
          {showing !== q.id && (
            <button type="button" onClick={() => setSkipped((x) => [...x, q.id])} className="mt-2 text-[12px] text-muted hover:text-white">Skip this one</button>
          )}
        </div>
      )}
    </section>
  );
}

function QuestionCard({ q, h, onSaved, onDone }: { q: ReviewQuestion; h: ReviewHandlers; onSaved?: () => void; onDone?: () => void }) {
  const [answer, setAnswer] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const area = q.area === "landing" ? "landing page" : q.area === "setup" ? "campaign setup" : q.area;

  const finish = (text: string, ok = true) => {
    setState({ ok, text });
    if (!ok) return;
    onSaved?.();
    h.onAnswered(q.id, q.scope === "business");
    if (onDone) setTimeout(onDone, 1400);
  };
  const submit = (raw: string, replace = false) => {
    const value = raw.trim();
    if (!value) return;
    if (q.scope === "campaign") {
      finish(`✓ Saved to this campaign only. Checking the campaign again…`);
      // Campaign answers change the campaign, so it's checked again.
      setTimeout(() => h.onApply([campaignAnswerEdit(q, value)]), 600);
      return;
    }
    start(async () => {
      const r = await answerBusinessQuestionAction({ id: q.id, answer: value, replace }).catch(() => ({ ok: false as const, error: "Couldn't save that just now." }));
      if (!r.ok) return finish(r.error, false);
      finish(r.saved === "declined" ? "✓ Noted — MAIRO won't ask again." : `✓ MAIRO learned this — added to your Business Brain. MAIRO will use it to improve your ${area}.`);
    });
  };

  if (state) {
    return (
      <div className="rounded-xl border p-4" style={line}>
        <p className="text-[13.5px] text-white">{q.text}</p>
        <p className={`mt-2 text-[13px] ${state.ok ? "text-emerald-300" : "text-amber-200/90"}`}>{state.text}</p>
        {state.ok && q.scope === "business" && <p className="mt-1 text-[11.5px] text-faint">The score only changes if the campaign changes — use Recheck Campaign after MAIRO improves it.</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4" style={line}>
      <p className="text-[14px] text-white">{q.text}</p>
      <p className="mt-1.5 text-[12px] text-faint">
        <span className="text-white/70">Why MAIRO is asking: </span>
        {q.why}
        {q.scope === "campaign" && " (Saved to this campaign only.)"}
      </p>

      {q.mode === "confirm" && !updating ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => finish("✓ Thanks — MAIRO will keep using it.")} className={primaryBtn} style={ramp}>Yes, still correct</button>
          <button type="button" onClick={() => setUpdating(true)} className={quietBtn} style={line}>Update it</button>
        </div>
      ) : q.choices ? (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            {q.choices.map((c) => {
              const on = chosen.includes(c);
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => setChosen((x) => (on ? x.filter((y) => y !== c) : [...x, c]))}
                  className="rounded-full border px-3 py-1.5 text-[12px]" style={{ borderColor: on ? "var(--mairo-line-lit)" : "var(--mairo-line)", background: on ? "rgba(124,92,255,0.18)" : undefined, color: on ? "var(--color-white)" : "rgba(var(--mairo-fg-rgb),0.8)" }}>
                  {on ? "✓ " : ""}{c}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={pending || chosen.length === 0} onClick={() => submit(chosen.join("; "))} className={primaryBtn} style={ramp}>{pending ? "Saving…" : "Save"}</button>
            <button type="button" disabled={pending} onClick={() => submit("none")} className="px-2 py-2 text-[12.5px] text-muted hover:text-white">None of these</button>
          </div>
        </div>
      ) : q.yesNo ? (
        <div className="mt-3">
          <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Add detail (optional), e.g. what's included"
            className="w-full rounded-xl border bg-[rgba(var(--mairo-bg-rgb),0.6)] px-3.5 py-2.5 text-[13.5px] text-white placeholder-faint outline-none focus:border-[color:var(--mairo-line-lit)]" style={line} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => submit(`yes ${answer}`)} className={primaryBtn} style={ramp}>{pending ? "Saving…" : "Yes"}</button>
            <button type="button" disabled={pending} onClick={() => submit("no")} className={quietBtn} style={line}>No</button>
          </div>
        </div>
      ) : (
        <form className="mt-3" onSubmit={(e) => { e.preventDefault(); submit(answer, updating); }}>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} maxLength={300} aria-label={q.text}
            placeholder={updating ? `What should MAIRO use instead?` : (q.placeholder ?? "In your own words")}
            className="w-full resize-none rounded-xl border bg-[rgba(var(--mairo-bg-rgb),0.6)] px-3.5 py-2.5 text-[13.5px] text-white placeholder-faint outline-none focus:border-[color:var(--mairo-line-lit)]" style={line} />
          <button type="submit" disabled={pending || !answer.trim()} className={`${primaryBtn} mt-2`} style={ramp}>{pending ? "Saving…" : "Save answer"}</button>
        </form>
      )}
    </div>
  );
}
