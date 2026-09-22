"use client";

import type { CampaignReview } from "@/lib/campaigns/review";
import type { Finding, ReviewStep } from "@/lib/campaigns/review-rules";
import { Question } from "./wizard-parts";

const STATUS_COPY = {
  READY: { title: "Ready to launch", body: "Your campaign passed Mairo's preparation checks.", color: "var(--color-live, #34d399)" },
  IMPROVEMENTS: { title: "Improvements recommended", body: "We found a few opportunities to improve your advertisement before spending money.", color: "#fbbf24" },
  SETUP_REQUIRED: { title: "Setup required", body: "Some important campaign settings need attention before this advertisement can launch.", color: "#f87171" },
} as const;

/** Step 6 — Mairo's checks before any money is spent. */
export function StepReview({
  review,
  error,
  checking,
  onRecheck,
  onFix,
}: {
  review: CampaignReview | null;
  error: string | null;
  checking: boolean;
  onRecheck: () => void;
  onFix: (step: ReviewStep) => void;
}) {
  const blocking = review?.findings.filter((f) => f.severity === "blocking") ?? [];
  const suggestions = review?.findings.filter((f) => f.severity === "recommendation") ?? [];

  return (
    <Question
      title="Your Campaign Review"
      sub="Checked against your account, your page and Meta's rules — not a score. Passing doesn't guarantee results; it means nothing avoidable is in the way."
    >
      {checking && <p className="text-[13px] text-muted"><span className="mairo-think">Checking your campaign…</span></p>}
      {error && <p className="text-[13px] text-amber-200/90">{error}</p>}

      {review && !checking && (
        <>
          <div className="rounded-xl border p-5" style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.5)" }}>
            <p className="flex items-center gap-2 text-[17px] font-medium text-white">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COPY[review.status].color }} aria-hidden />
              {STATUS_COPY[review.status].title}
            </p>
            <p className="mt-1 text-[13px] text-muted">{STATUS_COPY[review.status].body}</p>
          </div>

          {blocking.length > 0 && <FindingList title="Must fix before launching" findings={blocking} onFix={onFix} />}
          {suggestions.length > 0 && <FindingList title="Recommendations" findings={suggestions} onFix={onFix} />}
        </>
      )}

      <button type="button" onClick={onRecheck} disabled={checking}
        className="mt-6 text-[12.5px] text-muted underline underline-offset-4 hover:text-white disabled:opacity-40">
        Check again
      </button>
      <style>{`.mairo-think{animation:mairo-think 1.6s ease-in-out infinite}@keyframes mairo-think{0%,100%{opacity:.45}50%{opacity:1}}@media (prefers-reduced-motion:reduce){.mairo-think{animation:none}}`}</style>
    </Question>
  );
}

function FindingList({ title, findings, onFix }: { title: string; findings: Finding[]; onFix: (step: ReviewStep) => void }) {
  return (
    <div className="mt-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{title}</p>
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
