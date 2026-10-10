"use client";

import { AGENT, agentForDecision } from "@/lib/team/agents";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import type { DecisionView } from "@/lib/decisions/store";
import { budgetImpact, type ApprovalFacts } from "@/lib/decisions/approval";
import { describeChange } from "@/lib/decisions/guardrails";
import { AgentIcon } from "@/components/team/agent-ui";
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

// One proposed change, as the Approval Center shows it: the specialist
// responsible, what it noticed, the change itself (before → after), the
// reason, the figures behind it, what it does to spending, the risk, what has
// to authorize it, how the team got here — and Approve, Reject or ask for an
// explanation.
//
// Simple mode says it in plain words; Advanced mode swaps in the advertising
// terms, each with an ⓘ that explains it. Same decision either way.

export function MairoDecisionCard({ decision, advanced, facts, trail, timeZone }: { decision: DecisionView; advanced: boolean; facts?: ApprovalFacts; trail?: ReactNode; timeZone?: string }) {
  const [open, setOpen] = useState<false | "approve" | "modify">(false);
  const [pending, start] = useTransition();
  const [gone, setGone] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guideOnly = decision.changes.every((c) => c.type === "guide");
  const guide = decision.changes.find((c) => c.type === "guide");
  const creative = decision.kind === "creative-fatigue" && !guideOnly;
  // Meta Intelligence: a new Meta capability — Approve / Learn more / Not now.
  const metaTry = decision.changes.find((c) => c.type === "try-meta-feature");
  // Amounts the owner can change before approving: a budget, a radius.
  const modifiable = !creative && decision.changes.some((c) => c.type === "set-budget" || (c.type === "widen-audience" && c.to.geoRadius !== null));
  const tone = CATEGORY_TONE[decision.category];
  const owner = facts?.owner ?? agentForDecision(decision.kind, decision.category);
  const budget = facts?.budget ?? budgetImpact(decision.changes);
  const changeRows = decision.changes.filter((c) => c.type !== "guide").map(describeChange);
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
      id={`d-${decision.id}`}
      className="scroll-mt-24 rounded-2xl border p-5 sm:p-6"
      style={{ borderColor: decision.urgent ? "rgba(248,113,113,0.35)" : "var(--mairo-line)", background: "rgba(var(--mairo-bg-rgb),0.5)" }}
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
        <span className="ml-auto text-faint">{whenText(decision.createdAt, undefined, timeZone)}</span>
      </div>

      <div className="mt-3 flex items-center gap-2.5">
        <AgentIcon role={owner} size={28} />
        <p className="text-[12.5px] text-muted">
          Responsible: <span className="font-medium text-white">{AGENT[owner].name}</span>
        </p>
      </div>
      <h3 className="mt-2.5 text-[16px] font-medium leading-snug text-white">{decision.title}</h3>

      <dl className="mt-4 space-y-3 text-[13px] leading-relaxed">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">What it noticed</dt>
          <dd className="mt-1 text-white/90">{advanced ? decision.noticedAdvanced : decision.noticed}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Proposed change</dt>
          <dd className="mt-1 text-white/90">{decision.recommendation}</dd>
          {changeRows.length > 0 && (
            <dd className="mt-2 space-y-1">
              {changeRows.map((c, i) => (
                <p key={i} className="text-[12.5px]">
                  <span className="text-faint">{c.label}: </span>
                  {c.before && <span className="text-muted">{c.before} → </span>}
                  <span className="text-white">{c.after}</span>
                </p>
              ))}
            </dd>
          )}
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Reason</dt>
          <dd className="mt-1 text-white/85">{decision.whyItMatters}</dd>
          {decision.impact && <dd className="mt-1 text-[12.5px] text-muted">What it&rsquo;s for: {decision.impact}</dd>}
        </div>
      </dl>

      {decision.evidence.length > 0 && (
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Supporting evidence</p>
      )}
      {decision.evidence.length > 0 && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
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

      <dl className="mt-4 grid gap-2 text-[12.5px] sm:grid-cols-3">
        <div className={`rounded-lg px-3 py-2 ${budget.direction === "up" ? "bg-warn/10" : "bg-white/[0.03]"}`}>
          <dt className="text-[11px] text-faint">Budget impact</dt>
          <dd className={`mt-0.5 ${budget.direction === "up" ? "text-warn" : "text-white/85"}`}>{budget.text}</dd>
        </div>
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          <dt className="text-[11px] text-faint">Risk level</dt>
          <dd className="mt-0.5 text-white/85">{RISK_LABEL[decision.risk]}</dd>
        </div>
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          <dt className="text-[11px] text-faint">Required authorization</dt>
          <dd className="mt-0.5 text-white/85">{facts?.authorization.text ?? "Your approval."}</dd>
        </div>
      </dl>

      {trail && (
        <details className="mt-3 rounded-xl bg-white/[0.025] px-3.5 py-2.5">
          <summary className="cursor-pointer text-[12.5px] text-white/85">How your team got here</summary>
          <div className="mt-3">{trail}</div>
        </details>
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
            onClick={() => setOpen("approve")}
            className="rounded-full px-4 py-2 text-[12.5px] font-medium text-white"
            style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
          >
            {creative ? "Create replacement" : "Approve"}
          </button>
        )}
        {metaTry?.type === "try-meta-feature" && (
          <Link href={metaTry.learnMoreHref} className="rounded-full border px-4 py-2 text-[12.5px] text-white/85 hover:text-white" style={{ borderColor: "var(--mairo-line)" }}>
            Learn more
          </Link>
        )}
        {modifiable && (
          <button type="button" disabled={pending} onClick={() => setOpen("modify")}
            className="rounded-full border px-4 py-2 text-[12.5px] text-white/85 hover:text-white" style={{ borderColor: "var(--mairo-line)" }}>
            Modify
          </button>
        )}
        {metaTry ? (
          <button type="button" disabled={pending} onClick={() => act(ignoreDecisionAction, "Not now")}
            className="rounded-full border px-4 py-2 text-[12.5px] text-white/85 hover:text-white" style={{ borderColor: "var(--mairo-line)" }}>
            Not now
          </button>
        ) : creative || guideOnly ? (
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
          Ask for an explanation
        </Link>
      </div>

      {open && (
        <ApprovalModal
          decisions={[decision]}
          startEditing={open === "modify"}
          onDone={(anyApplied) => setApproved(anyApplied)}
          onClose={() => {
            setOpen(false);
            if (approved) setGone("Handled — see MAIRO Activity for what changed");
          }}
        />
      )}
    </article>
  );
}
