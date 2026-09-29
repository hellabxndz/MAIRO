"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { approveDecisionsAction } from "@/lib/actions/decision-actions";
import { approveReportAction, revokeShareAction } from "@/lib/actions/report-actions";
import type { PlanItem } from "@/lib/reports/weekly-logic";

// The Weekly Report's moving parts: sections that fold away on a phone, the
// plan's Approve button, and an agency's share panel.

/**
 * One section of the report. Open on a wide screen; on a phone the headline
 * sections start open and the detail sections start folded, so the most
 * important numbers come first.
 */
export function ReportSection({ title, eyebrow, children, detail = false, id }: { title: string; eyebrow?: string; children: React.ReactNode; detail?: boolean; id?: string }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (detail && window.matchMedia("(max-width: 767px)").matches) {
      const t = setTimeout(() => setOpen(false), 0);
      return () => clearTimeout(t);
    }
  }, [detail]);
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-white/[0.07] bg-[#0b1122]/80">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span>
          {eyebrow && <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-bright">{eyebrow}</span>}
          <span className="block text-[17px] font-semibold text-white">{title}</span>
        </span>
        <span aria-hidden className={`text-faint transition ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && <div className="border-t border-white/[0.06] px-5 pb-5 pt-4">{children}</div>}
    </section>
  );
}

export function PlanActions({ plan, pending }: { plan: PlanItem[]; pending: string[] }) {
  const approvable = plan.filter((p) => p.decisionId && pending.includes(p.decisionId));
  const [confirming, setConfirming] = useState(false);
  const [busy, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const approve = () =>
    start(async () => {
      const r = await approveDecisionsAction({ decisionIds: approvable.map((p) => p.decisionId!) });
      setConfirming(false);
      setResult(r.ok ? `Done — ${r.applied.length} change${r.applied.length === 1 ? "" : "s"} made${r.partial ? ", some couldn't be" : ""}. Each is in Mairo Activity with its reason.` : r.error);
    });

  return (
    <div className="mt-4">
      {result ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[13.5px] text-white/85">{result}</p>
      ) : confirming ? (
        <div className="rounded-xl border border-violet/30 bg-violet/[0.07] p-4">
          <p className="text-[14px] font-medium text-white">Approve {approvable.length} change{approvable.length === 1 ? "" : "s"}?</p>
          <ul className="mt-2 space-y-1 text-[13px] text-white/85">
            {approvable.map((p) => (
              <li key={p.decisionId}>• {p.action}</li>
            ))}
          </ul>
          <p className="mt-2 text-[12.5px] text-muted">Your limits still apply. The other items are things to look at — nothing changes for them.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={approve} className="min-h-[42px] rounded-lg bg-[#7c5cff] px-4 text-[13.5px] font-medium text-white hover:brightness-110 disabled:opacity-60">
              {busy ? "Approving…" : "Yes, approve"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="min-h-[42px] rounded-lg px-4 text-[13.5px] text-muted hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {approvable.length > 0 && (
            <button type="button" onClick={() => setConfirming(true)} className="min-h-[42px] rounded-lg bg-[#7c5cff] px-4 text-[13.5px] font-medium text-white hover:brightness-110">
              Approve plan
            </button>
          )}
          <Link href="/dashboard/decisions" className="inline-flex min-h-[42px] items-center rounded-lg border border-white/12 px-4 text-[13.5px] text-white/85 hover:border-white/30">
            Review each action
          </Link>
          <Link
            href={`/dashboard/agents?ask=${encodeURIComponent("Walk me through your plan for next week and why.")}`}
            className="inline-flex min-h-[42px] items-center rounded-lg px-3 text-[13.5px] text-violet-bright hover:text-white"
          >
            Ask Mairo
          </Link>
        </div>
      )}
    </div>
  );
}

export function SharePanel({ reportId, token, origin }: { reportId: string; token: string | null; origin: string }) {
  const [current, setCurrent] = useState(token);
  const [busy, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const link = current ? `${origin}/r/${current}` : null;
  return (
    <div className="rounded-2xl border border-violet/25 bg-violet/[0.06] p-4">
      <p className="text-[13.5px] font-semibold text-white">Client report</p>
      {link ? (
        <>
          <p className="mt-1 text-[13px] text-muted">Approved. Anyone with this link can view the client-facing version — nothing has been sent.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={link} className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0c1326] px-3 text-[12.5px] text-white/85" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))} className="h-10 rounded-lg bg-[#7c5cff] px-4 text-[13px] font-medium text-white">
              {copied ? "Copied" : "Copy link"}
            </button>
            <button type="button" disabled={busy} onClick={() => start(async () => { if ((await revokeShareAction(reportId)).ok) setCurrent(null); })} className="h-10 rounded-lg px-3 text-[13px] text-muted hover:text-white">
              Turn off link
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-muted">Review it, then approve to get a link you can send your client. Mairo never sends client reports on its own.</p>
          <button type="button" disabled={busy} onClick={() => start(async () => { const r = await approveReportAction(reportId); if (r.ok && r.token) setCurrent(r.token); })} className="mt-3 min-h-[40px] rounded-lg bg-[#7c5cff] px-4 text-[13px] font-medium text-white disabled:opacity-60">
            {busy ? "Approving…" : "Approve for client"}
          </button>
        </>
      )}
    </div>
  );
}
