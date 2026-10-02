"use client";

import { useState } from "react";
import type { CampaignReview } from "@/lib/campaigns/review";
import type { Finding, ReviewStep } from "@/lib/campaigns/review-rules";
import { Question } from "./wizard-parts";
import type { CampaignPlan } from "@/lib/campaigns/plan";
import { contextOf, hasOwnWords } from "@/lib/campaigns/plan";
import type { PlanEdit } from "@/lib/score/edits";
import type { AdScore } from "@/lib/score/rules";
import { compareScores, type Comparison } from "@/lib/score/review";
import { CampaignReviewPanel } from "@/components/score/campaign-review";

/** Step 6 — Mairo's checks before any money is spent, as a review that explains itself. */
export function StepReview({
  review,
  error,
  checking,
  onRecheck,
  onFix,
  plan,
  advanced,
  onApply,
  onKeep,
  onLaunchAnyway,
}: {
  review: CampaignReview | null;
  error: string | null;
  checking: boolean;
  onRecheck: () => void;
  onFix: (step: ReviewStep) => void;
  plan: CampaignPlan;
  advanced: boolean;
  onApply: (edits: PlanEdit[]) => void;
  onKeep: (kept: string[]) => void;
  onLaunchAnyway: () => void;
}) {
  const blocking = review?.findings.filter((f) => f.severity === "blocking") ?? [];
  const others = review?.findings.filter((f) => f.severity === "recommendation") ?? [];

  // The score before a recheck, so the new one can be shown as a change:
  // 77 → Analyzing… → 86, with what improved. Worked out as the props change
  // (React's "adjust state while rendering" pattern), not in an effect.
  const [seen, setSeen] = useState<{ checking: boolean; review: CampaignReview | null }>({ checking, review });
  const [last, setLast] = useState<AdScore | null>(review?.score ?? null);
  const [before, setBefore] = useState<AdScore | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [learned, setLearned] = useState(0);
  const [answered, setAnswered] = useState<string[]>([]);
  if (seen.checking !== checking || seen.review !== review) {
    setSeen({ checking, review });
    if (checking && !seen.checking && last) setBefore(last);
    if (!checking && review && review !== seen.review) {
      if (before && before !== review.score) {
        setComparison(compareScores(before, review.score, { kept: contextOf(plan).kept, category: review.category, hasOwnWords: hasOwnWords(plan) }));
      }
      setLast(review.score);
    }
  }

  return (
    <Question
      title="Your Campaign Review"
      sub="MAIRO checks the whole campaign against your account, your page and Meta's rules before any money is spent — and tells you exactly what would make it stronger."
    >
      {checking && (
        <div className="rounded-2xl border p-6 text-center" style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.5)" }}>
          {before && <p className="text-[40px] font-semibold tabular-nums text-white/60">{before.overall}</p>}
          {before && <p aria-hidden className="text-white/30">↓</p>}
          <p className="text-[14px] text-muted"><span className="mairo-think">{before ? "Analyzing…" : "Checking your campaign…"}</span></p>
          <p className="mt-1 text-[12px] text-faint">Creative · Hook · Offer · Audience · Landing Page · Campaign Setup</p>
        </div>
      )}
      {error && <p className="text-[13px] text-amber-200/90">{error}</p>}

      {review && !checking && (
        <>
          {blocking.length > 0 && <FindingList title="Must fix before launching" findings={blocking} onFix={onFix} />}
          <div className={blocking.length > 0 ? "mt-6" : ""}>
            <CampaignReviewPanel
              review={review}
              comparison={comparison}
              animateFrom={comparison ? comparison.from : null}
              learned={learned}
              plan={plan}
              advanced={advanced}
              onApply={onApply}
              onKeep={onKeep}
              onFix={onFix}
              onLaunchAnyway={onLaunchAnyway}
              onRecheck={onRecheck}
              answered={answered}
              onAnswered={(id, business) => {
                setAnswered((x) => [...new Set([...x, id])]);
                if (business) setLearned((n) => n + 1);
              }}
            />
          </div>
          {others.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-[12.5px] text-muted hover:text-white">Other checks MAIRO ran ({others.length})</summary>
              <FindingList title="" findings={others} onFix={onFix} />
            </details>
          )}
        </>
      )}

      {!review && !checking && (
        <button type="button" onClick={onRecheck} className="mt-6 text-[12.5px] text-muted underline underline-offset-4 hover:text-white">
          Check again
        </button>
      )}
      <style>{`.mairo-think{animation:mairo-think 1.6s ease-in-out infinite}@keyframes mairo-think{0%,100%{opacity:.45}50%{opacity:1}}@media (prefers-reduced-motion:reduce){.mairo-think{animation:none}}`}</style>
    </Question>
  );
}

function FindingList({ title, findings, onFix }: { title: string; findings: Finding[]; onFix: (step: ReviewStep) => void }) {
  return (
    <div className={title ? "" : "mt-3"}>
      {title && <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{title}</p>}
      <ul className="mt-3 space-y-2.5">
        {findings.map((f) => (
          <li key={f.id} className="rounded-xl border p-4" style={{ borderColor: f.severity === "blocking" ? "rgba(248,113,113,0.3)" : "var(--mairo-line)" }}>
            <p className="text-[11px] text-faint">{f.area}</p>
            <p className="mt-0.5 text-[14px] text-white">{f.title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{f.detail}</p>
            {f.fix && (
              <button type="button" onClick={() => onFix(f.fix!)}
                className="mt-3 rounded-full px-4 py-1.5 text-[12px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)" }}>
                Fix With Mairo
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
