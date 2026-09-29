"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { approveDecisionsAction } from "@/lib/actions/decision-actions";
import { describeChange } from "@/lib/decisions/guardrails";
import type { DecisionChange } from "@/lib/decisions/types";
import type { DecisionView } from "@/lib/decisions/store";
import type { AppliedChange } from "@/lib/decisions/apply";

// The confirmation panel every change goes through.
//
// "Mairo wants to make these changes" — each one with what it is now and what
// it would become — then Approve, Edit or Cancel. Nothing is sent until
// Approve, and after it the panel says exactly what happened, including a
// change the network refused. One-Click Fix opens the same panel with several
// decisions at once (see OneClickFixModal).

type Edits = Record<string, DecisionChange[]>;

function dollars(cents: number): string {
  return (cents / 100).toFixed(0);
}

export function ApprovalModal({
  decisions,
  title = "Mairo wants to make these changes",
  onClose,
  onDone,
}: {
  decisions: DecisionView[];
  title?: string;
  onClose: () => void;
  /** Called once the changes were sent; true when at least one went through. */
  onDone?: (anyApplied: boolean) => void;
}) {
  const actionable = decisions.filter((d) => d.changes.some((c) => c.type !== "guide"));
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Edits>(() =>
    Object.fromEntries(actionable.map((d) => [d.id, d.changes])),
  );
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ applied: AppliedChange[]; error: string | null; partial: boolean } | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !pending && onClose();
    window.addEventListener("keydown", onKey);
    dialog.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  function setChange(decisionId: string, index: number, next: DecisionChange) {
    setEdits((prev) => ({ ...prev, [decisionId]: prev[decisionId].map((c, i) => (i === index ? next : c)) }));
  }

  function approve() {
    start(async () => {
      const changed = Object.fromEntries(
        Object.entries(edits).filter(([id, list]) => {
          const original = actionable.find((d) => d.id === id)?.changes;
          return JSON.stringify(original) !== JSON.stringify(list);
        }),
      );
      const res = await approveDecisionsAction({ decisionIds: actionable.map((d) => d.id), edits: changed });
      setResult({ applied: res.applied ?? [], error: res.ok ? null : res.error, partial: res.ok ? res.partial : false });
      onDone?.((res.applied ?? []).some((a) => a.ok));
    });
  }

  const madeCount = result?.applied.filter((a) => a.ok).length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={() => !pending && onClose()}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border p-6 outline-none sm:rounded-2xl"
        style={{ borderColor: "var(--mairo-line-lit)", background: "rgba(8,12,26,0.97)", boxShadow: "var(--mairo-glow-lift)" }}
      >
        {!result ? (
          <>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-blue-bright">Your approval</p>
            <h2 className="mt-1.5 text-[18px] font-medium text-white">{title}</h2>
            <p className="mt-1 text-[12.5px] text-muted">Nothing changes until you approve. You can undo any of it later from the campaign.</p>

            <ul className="mt-5 space-y-4">
              {actionable.map((d) => (
                <li key={d.id} className="rounded-xl border p-4" style={{ borderColor: "var(--mairo-line)" }}>
                  <p className="text-[13px] text-white">{d.title}</p>
                  <ul className="mt-3 space-y-2.5">
                    {edits[d.id].map((c, i) => {
                      const text = describeChange(c);
                      return (
                        <li key={i} className="text-[12.5px]">
                          <p className="text-faint">{text.label}</p>
                          {editing && c.type === "set-budget" ? (
                            <label className="mt-1 flex items-center gap-2 text-muted">
                              <span>{text.before} →</span>
                              <span className="text-white">$</span>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={dollars(c.toCents)}
                                onChange={(e) => {
                                  const v = Math.max(1, Math.round(Number(e.target.value) || 0));
                                  setChange(d.id, i, { ...c, toCents: v * 100 });
                                }}
                                className="w-24 rounded-lg border bg-transparent px-2 py-1 text-white"
                                style={{ borderColor: "var(--mairo-line)" }}
                                aria-label={`New daily budget for ${c.campaignName}`}
                              />
                              <span>/day</span>
                            </label>
                          ) : editing && c.type === "widen-audience" && c.to.geoRadius !== null ? (
                            <label className="mt-1 flex items-center gap-2 text-muted">
                              <span>{c.from.geoRadius} miles →</span>
                              <input
                                type="number"
                                min={1}
                                max={50}
                                value={c.to.geoRadius}
                                onChange={(e) => {
                                  const v = Math.min(50, Math.max(1, Math.round(Number(e.target.value) || 1)));
                                  setChange(d.id, i, { ...c, to: { ...c.to, geoRadius: v } });
                                }}
                                className="w-20 rounded-lg border bg-transparent px-2 py-1 text-white"
                                style={{ borderColor: "var(--mairo-line)" }}
                                aria-label="New radius in miles"
                              />
                              <span>miles</span>
                            </label>
                          ) : (
                            <p className="mt-0.5 text-white">
                              {text.before && <span className="text-muted">{text.before} → </span>}
                              {text.after}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={approve}
                disabled={pending || actionable.length === 0}
                className="rounded-full px-5 py-2.5 text-[13px] font-medium text-white disabled:opacity-50"
                style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
              >
                {pending ? "Making the changes…" : "Approve changes"}
              </button>
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                disabled={pending}
                className="rounded-full border px-5 py-2.5 text-[13px] text-white/85 hover:text-white"
                style={{ borderColor: "var(--mairo-line)" }}
              >
                {editing ? "Done editing" : "Edit changes"}
              </button>
              <button type="button" onClick={onClose} disabled={pending} className="px-2 py-2.5 text-[13px] text-muted hover:text-white">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={`font-mono text-[10px] uppercase tracking-[0.18em] ${madeCount === 0 ? "text-amber-200" : "text-live"}`}>
              {madeCount === 0 ? "Nothing changed" : "Done"}
            </p>
            <h2 className="mt-1.5 text-[18px] font-medium text-white">
              {madeCount === 0 ? "Mairo couldn't make the changes" : `Mairo made ${madeCount} change${madeCount === 1 ? "" : "s"}.`}
            </h2>
            {result.error && <p className="mt-2 text-[13px] text-amber-200/90">{result.error}</p>}
            {result.partial && !result.error && (
              <p className="mt-2 text-[13px] text-amber-200/90">Not everything went through — what didn&rsquo;t is marked below, and nothing was left half-changed.</p>
            )}
            <ul className="mt-5 space-y-3">
              {result.applied.map((a, i) => (
                <li key={i} className="rounded-xl border p-3.5 text-[12.5px]" style={{ borderColor: a.ok ? "var(--mairo-line)" : "rgba(248,113,113,0.35)" }}>
                  <p className="text-faint">{a.label}</p>
                  <p className="mt-0.5 text-white">
                    {a.ok ? (
                      <>
                        {a.before && <span className="text-muted">{a.before} → </span>}
                        {a.after ?? "Done"}
                      </>
                    ) : (
                      <span className="text-amber-200/90">Not changed: {a.error}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] text-muted">Every change, with the reason, is in Mairo Activity.</p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-5 py-2.5 text-[13px] font-medium text-white"
                style={{ backgroundImage: "var(--mairo-ramp)" }}
              >
                Close
              </button>
              <a href="/dashboard/activity" className="rounded-full border px-5 py-2.5 text-[13px] text-white/85" style={{ borderColor: "var(--mairo-line)" }}>
                See Mairo Activity
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** One-Click Fix: the same panel, for everything the assistant proposed at once. */
export function OneClickFixModal(props: { decisions: DecisionView[]; onClose: () => void; onDone?: (anyApplied: boolean) => void }) {
  return <ApprovalModal {...props} title="Mairo wants to make these changes" />;
}
