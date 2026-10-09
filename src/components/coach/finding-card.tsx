"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AgentRole } from "@/generated/prisma/enums";
import { AGENT } from "@/lib/team/agents";
import { AgentIcon } from "@/components/team/agent-ui";
import { FixThisForMe } from "@/components/decisions/fix-this-for-me";
import { anotherRecommendationAction, approveFindingAction, dismissFindingAction, findingFeedbackAction, setStepStatusAction } from "@/lib/actions/coach-actions";
import type { PlanStep } from "@/lib/coach/types";

// One Performance Coach insight: what MAIRO noticed, the possible
// explanations (marked as seen in the records or only a possibility), the
// recommended improvement and why, how sure MAIRO is and what it can't see,
// the improvement plan, who on the AI team worked on it — and the business's
// choices: approve the plan, investigate, dismiss, or ask for another idea.

export type FindingCardData = {
  id: string;
  severity: string;
  confidence: "STRONG" | "SOME" | "EARLY";
  status: string;
  campaignName: string | null;
  title: string;
  plain: string;
  noticed: string;
  explanations: { text: string; basis: "evidence" | "possibility" }[];
  shownRecommendation: string;
  hasAnother: boolean;
  evidence: { label: string; value: string }[];
  limitations: string;
  missing: string[];
  steps: PlanStep[];
  agents: string[];
  decisionId: string | null;
  decisionStatus: string | null;
  feedback: string | null;
  verdictNote: string | null;
  checkAfter: string | null;
  lastSeenAt: string;
};

const CONFIDENCE: Record<FindingCardData["confidence"], { label: string; text: string }> = {
  STRONG: { label: "Strong evidence", text: "Direct records, or enough data on both sides of the comparison." },
  SOME: { label: "Some evidence", text: "Enough to act on, not enough to be sure." },
  EARLY: { label: "An early sign", text: "Worth watching; too little data to act on yet." },
};
const SEVERITY: Record<string, { label: string; cls: string }> = {
  ATTENTION: { label: "Needs attention", cls: "bg-warn/15 text-warn" },
  OPPORTUNITY: { label: "Opportunity", cls: "bg-live/15 text-live" },
  WATCH: { label: "Worth watching", cls: "bg-white/[0.07] text-muted" },
};
const RISK: Record<string, string> = { LOW: "Low risk", MEDIUM: "Some risk", HIGH: "Higher risk" };

const h = "text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-bright";

export function FindingCard({ f }: { f: FindingCardData }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Couldn't do that.");
      router.refresh();
    });
  const sev = SEVERITY[f.severity] ?? SEVERITY.WATCH;
  const pendingChange = f.decisionId && f.decisionStatus === "PENDING";
  const ask = `Why does my Performance Coach say "${f.title}"? What should I do first?`;

  return (
    <article id={f.id} className="scroll-mt-24 rounded-[24px] p-5 sm:p-6" style={{ background: "linear-gradient(180deg, rgba(var(--mairo-fg-rgb),0.035), rgba(var(--mairo-fg-rgb),0.012))", boxShadow: "inset 0 0 0 1px rgba(var(--mairo-fg-rgb),0.06)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${sev.cls}`}>{sev.label}</span>
        {f.campaignName && <span className="text-[12px] text-muted">&ldquo;{f.campaignName}&rdquo;</span>}
        {f.status === "APPROVED" && <span className="rounded-full bg-violet/10 px-2.5 py-0.5 text-[11.5px] text-violet-bright">Plan approved</span>}
        <span className="ml-auto flex -space-x-1.5" aria-label={`Worked on by ${f.agents.map((a) => AGENT[a as AgentRole]?.name ?? a).join(", ")}`}>
          {f.agents.map((a) => (
            <span key={a} title={AGENT[a as AgentRole]?.name ?? a}>
              <AgentIcon role={a as AgentRole} size={26} />
            </span>
          ))}
        </span>
      </div>

      <h3 className="mt-3 text-[18px] font-semibold tracking-[-0.01em] text-white">{f.title}</h3>
      <p className="mt-1.5 max-w-[760px] text-[14.5px] leading-relaxed text-white/85">{f.plain}</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section>
          <h4 className={h}>What MAIRO noticed</h4>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/90">{f.noticed}</p>
        </section>
        <section>
          <h4 className={h}>Possible explanation{f.explanations.length === 1 ? "" : "s"}</h4>
          <ul className="mt-1.5 space-y-1.5">
            {f.explanations.map((e) => (
              <li key={e.text} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-white/90">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10.5px] ${e.basis === "evidence" ? "bg-violet/10 text-violet-bright" : "bg-white/[0.06] text-muted"}`}>{e.basis === "evidence" ? "In your records" : "Possibility"}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h4 className={h}>Recommended improvement</h4>
          <p className="mt-1.5 text-[14px] font-medium leading-relaxed text-white">{f.shownRecommendation}</p>
          {f.hasAnother && f.status !== "DISMISSED" && (
            <button type="button" disabled={pending} onClick={() => act(() => anotherRecommendationAction(f.id))} className="mt-1.5 text-[12.5px] text-violet-bright hover:underline disabled:opacity-60">
              Show another recommendation
            </button>
          )}
        </section>
        <section>
          <h4 className={h}>Confidence and limitations</h4>
          <p className="mt-1.5 text-[13.5px] text-white/90">
            <span className="font-medium text-white">{CONFIDENCE[f.confidence].label}.</span> {CONFIDENCE[f.confidence].text}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{f.limitations}</p>
          {f.missing.length > 0 && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">What MAIRO can&rsquo;t see: {f.missing.join(" ")}</p>}
        </section>
      </div>

      <details className="mt-4 rounded-2xl bg-white/[0.025] px-4 py-3">
        <summary className="cursor-pointer text-[13px] text-white">Why we recommend this — the numbers</summary>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {f.evidence.map((e) => (
            <div key={e.label} className="flex justify-between gap-3 border-b border-[color:var(--mairo-line)] pb-1.5 text-[13px]">
              <dt className="text-muted">{e.label}</dt>
              <dd className="tabular-nums text-white">{e.value}</dd>
            </div>
          ))}
        </dl>
      </details>

      <details className="mt-3 rounded-2xl bg-white/[0.025] px-4 py-3" open={f.status === "APPROVED"}>
        <summary className="cursor-pointer text-[13px] text-white">Your improvement plan · {f.steps.filter((s) => s.status === "done").length} of {f.steps.length} done</summary>
        <ol className="mt-3 space-y-3">
          {f.steps.map((s) => (
            <li key={s.id} className="rounded-xl border border-[color:var(--mairo-line)] px-3.5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className={`text-[13.5px] font-medium ${s.status === "done" ? "text-muted line-through" : "text-white"}`}>
                  {s.priority}. {s.href ? <Link href={s.href} className="hover:underline">{s.title}</Link> : s.title}
                </p>
                <span className="text-[11.5px] text-faint">{RISK[s.risk]}</span>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{s.detail}</p>
              <dl className="mt-2 grid gap-1 text-[12px] sm:grid-cols-3">
                <div><dt className="inline text-faint">Approval: </dt><dd className="inline text-white/80">{s.approval}</dd></div>
                <div><dt className="inline text-faint">May help: </dt><dd className="inline text-white/80">{s.benefit}</dd></div>
                <div><dt className="inline text-faint">How we&rsquo;ll know: </dt><dd className="inline text-white/80">{s.verify}</dd></div>
              </dl>
              {f.status !== "DISMISSED" && s.kind !== "meta-change" && (
                <div className="mt-2 flex gap-2">
                  {(["done", "skipped", "todo"] as const)
                    .filter((st) => st !== s.status)
                    .map((st) => (
                      <button key={st} type="button" disabled={pending} onClick={() => act(() => setStepStatusAction(f.id, s.id, st))} className="rounded-full border border-[color:var(--mairo-line)] px-2.5 py-1 text-[11.5px] text-white/80 hover:text-white disabled:opacity-60">
                        {st === "done" ? "Mark done" : st === "skipped" ? "Skip" : "Back to to-do"}
                      </button>
                    ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      </details>

      {f.verdictNote && <p className="mt-3 rounded-xl bg-white/[0.03] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted">{f.verdictNote}</p>}
      {f.status === "APPROVED" && f.checkAfter && !f.verdictNote && <p className="mt-3 text-[12.5px] text-muted">MAIRO looks at the figure again on {new Date(f.checkAfter).toLocaleDateString("en-US", { month: "long", day: "numeric" })} and tells you what changed.</p>}

      {f.status !== "DISMISSED" && f.status !== "RESOLVED" && (
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {pendingChange && <FixThisForMe decisionIds={[f.decisionId!]} label="Review and approve the change" />}
          {f.status === "OPEN" && (
            <button type="button" disabled={pending} onClick={() => act(() => approveFindingAction(f.id))} className="rounded-full bg-[image:var(--mairo-ramp)] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60">
              Approve the plan
            </button>
          )}
          <Link href={`/dashboard/agents?ask=${encodeURIComponent(ask)}`} className="rounded-full border border-[color:var(--mairo-line)] px-4 py-2 text-[13px] text-white hover:border-[color:var(--mairo-line-lit)]">
            Investigate with your AI team
          </Link>
          <button type="button" disabled={pending} onClick={() => act(() => dismissFindingAction(f.id))} className="rounded-full px-3 py-2 text-[13px] text-muted hover:text-white disabled:opacity-60">
            Dismiss
          </button>
          <span className="ml-auto flex items-center gap-1.5 text-[12px] text-faint">
            Helpful?
            {(["HELPFUL", "NOT_HELPFUL"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={f.feedback === v} disabled={pending} onClick={() => act(() => findingFeedbackAction(f.id, v))} className={`rounded-full border px-2 py-0.5 ${f.feedback === v ? "border-transparent bg-violet/15 text-violet-bright" : "border-[color:var(--mairo-line)] text-muted hover:text-white"}`}>
                {v === "HELPFUL" ? "Yes" : "No"}
              </button>
            ))}
          </span>
        </div>
      )}
      {f.status === "OPEN" && <p className="mt-2 text-[11.5px] text-faint">Approving the plan changes nothing on Meta. Any change to a campaign shows you exactly what will change and waits for its own approval.</p>}
      {error && <p className="mt-2 text-[12.5px] text-red-300" aria-live="polite">{error}</p>}
    </article>
  );
}
