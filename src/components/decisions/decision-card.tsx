"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { DecisionView } from "@/lib/decisions/store";
import { ignoreDecisionAction, markDecisionDoneAction, rejectDecisionAction } from "@/lib/actions/decision-actions";
import { ApprovalModal } from "./approval-modal";
import {
  CATEGORY_LABEL,
  CATEGORY_TONE,
  CONFIDENCE_HELP,
  CONFIDENCE_LABEL,
  RISK_LABEL,
  termHelp,
  whenText,
} from "./labels";

// One Mairo Decision: what MAIRO noticed, why it matters, what it would do,
// the figures behind it, the risk, how sure it is — and the buttons.
//
// Simple mode says it in plain words; Advanced mode swaps in the advertising
// terms, each with an ⓘ that explains it. Same decision either way.

export function MairoDecisionCard({ decision, advanced }: { decision: DecisionView; advanced: boolean }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState(false);
  const [pending, start] = useTransition();
  const [gone, setGone] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guideOnly = decision.changes.every((c) => c.type === "guide");
  const guide = decision.changes.find((c) => c.type === "guide");
  const creative = decision.kind === "creative-fatigue" && !guideOnly;
  const tone = CATEGORY_TONE[decision.category];
  const askHref = `/dashboard/agents?ask=${encodeURIComponent(`Why are you recommending this: "${decision.title}"?`)}${
    decision.mairoCampaignId ? `&about=${decision.mairoCampaignId}` : ""
  }`;

  function act(fn: (id: string) => Promise<{ ok: boolean; error?: string }>, label: string) {
    start(async () => {
      const res = await fn(decision.id);
      if (res.ok) setGone(label);
      else setError(res.error ?? "Something went wrong.");
    });
  }

  if (gone) {
    return (
      <div className="rounded-2xl border px-5 py-4 text-[13px] text-muted" style={{ borderColor: "var(--mairo-line)" }}>
        {gone} — “{decision.title}”
      </div>
    );
  }

  return (
    <article
      className="rounded-2xl border p-5 sm:p-6"
      style={{ borderColor: decision.urgent ? "rgba(248,113,113,0.35)" : "var(--mairo-line)", background: "rgba(10,16,32,0.5)" }}
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full px-2.5 py-0.5 font-medium" style={{ color: tone, border: `1px solid ${tone}55` }}>
          {decision.urgent ? "Urgent · " : ""}
          {CATEGORY_LABEL[decision.category]}
        </span>
        <span className="text-faint" title={CONFIDENCE_HELP[decision.confidence]}>
          {CONFIDENCE_LABEL[decision.confidence]}
        </span>
        <span className="text-faint">·</span>
        <span className="text-faint">{RISK_LABEL[decision.risk]}</span>
        <span className="ml-auto text-faint">{whenText(decision.createdAt)}</span>
      </div>

      <h3 className="mt-3 text-[16px] font-medium leading-snug text-white">{decision.title}</h3>

      <dl className="mt-4 space-y-3 text-[13px] leading-relaxed">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">What Mairo noticed</dt>
          <dd className="mt-1 text-white/90">{advanced ? decision.noticedAdvanced : decision.noticed}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Recommended action</dt>
          <dd className="mt-1 text-white/90">{decision.recommendation}</dd>
        </div>
        {why && (
          <>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Why it matters</dt>
              <dd className="mt-1 text-muted">{decision.whyItMatters}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Potential impact</dt>
              <dd className="mt-1 text-muted">{decision.impact}</dd>
            </div>
          </>
        )}
      </dl>

      {decision.evidence.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {decision.evidence.map((e) => {
            const label = advanced && e.advancedLabel ? e.advancedLabel : e.label;
            const help = advanced ? termHelp(label) : null;
            return (
              <div key={label} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--mairo-line)" }}>
                <p className="flex items-center gap-1 text-[11px] text-faint">
                  {label}
                  {help && (
                    <span title={help} aria-label={help} className="cursor-help text-faint/80">
                      ⓘ
                    </span>
                  )}
                </p>
                <p className="mt-0.5 break-words text-[13px] tabular-nums text-white">{e.value}</p>
              </div>
            );
          })}
        </div>
      )}

      {decision.status === "FAILED" && decision.result?.some((r) => !r.ok) && (
        <p className="mt-3 text-[12.5px] text-amber-200/90">
          The last attempt didn&rsquo;t go through: {decision.result.find((r) => !r.ok)?.error}. Nothing was left half-changed —
          you can try again or reject it.
        </p>
      )}
      {error && <p className="mt-3 text-[12.5px] text-amber-200/90">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        {guideOnly && guide?.type === "guide" ? (
          <>
            <Link
              href={guide.href}
              className="rounded-full px-4 py-2 text-[12.5px] font-medium text-white"
              style={{ backgroundImage: "var(--mairo-ramp)" }}
            >
              {guide.label}
            </Link>
            <button type="button" disabled={pending} onClick={() => act(markDecisionDoneAction, "Marked as done")}
              className="rounded-full border px-4 py-2 text-[12.5px] text-white/85 hover:text-white" style={{ borderColor: "var(--mairo-line)" }}>
              I dealt with it
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setOpen(true)}
            className="rounded-full px-4 py-2 text-[12.5px] font-medium text-white"
            style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
          >
            {creative ? "Create replacement" : "Approve"}
          </button>
        )}
        {creative || guideOnly ? (
          <button type="button" disabled={pending} onClick={() => act(ignoreDecisionAction, "Ignored")}
            className="rounded-full border px-4 py-2 text-[12.5px] text-white/85 hover:text-white" style={{ borderColor: "var(--mairo-line)" }}>
            Ignore
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => act(rejectDecisionAction, "Rejected")}
            className="rounded-full border px-4 py-2 text-[12.5px] text-white/85 hover:text-white" style={{ borderColor: "var(--mairo-line)" }}>
            Reject
          </button>
        )}
        <Link href={askHref} className="px-2 py-2 text-[12.5px] text-blue-bright hover:text-white">
          Ask Mairo why
        </Link>
        <button type="button" onClick={() => setWhy((v) => !v)} className="ml-auto px-1 py-2 text-[12px] text-muted hover:text-white">
          {why ? "Less" : "Why it matters"}
        </button>
      </div>

      {open && (
        <ApprovalModal
          decisions={[decision]}
          onDone={(anyApplied) => setApproved(anyApplied)}
          onClose={() => {
            setOpen(false);
            if (approved) setGone("Handled — see Mairo Activity for what changed");
          }}
        />
      )}
    </article>
  );
}
