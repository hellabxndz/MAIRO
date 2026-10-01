"use client";

import { useState, useTransition } from "react";
import { loadDecisionsAction } from "@/lib/actions/decision-actions";
import type { DecisionView } from "@/lib/decisions/store";
import { OneClickFixModal } from "./approval-modal";

/**
 * The button the assistant puts under its answer (One-Click Fix). Opens the
 * confirmation panel with exactly what Mairo wants to change.
 */
export function FixThisForMe({ decisionIds, label = "Fix This For Me" }: { decisionIds: string[]; label?: string }) {
  const [decisions, setDecisions] = useState<DecisionView[] | null>(null);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  if (decisionIds.length === 0) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const loaded = await loadDecisionsAction(decisionIds);
            if (loaded.length === 0) setNote("These changes have already been dealt with — see Mairo Decisions.");
            else setDecisions(loaded);
          })
        }
        className="rounded-full px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
        style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
      >
        {pending ? "Opening…" : label}
      </button>
      {note && <p className="mt-2 text-[12px] text-muted">{note}</p>}
      {decisions && <OneClickFixModal decisions={decisions} onClose={() => setDecisions(null)} />}
    </div>
  );
}

/** The decision ids from a message's propose_fix tool result, if any. */
export function proposedFixIds(parts: { type: string }[]): string[] {
  for (const p of parts) {
    if (p.type !== "tool-propose_fix") continue;
    const part = p as { state?: string; output?: { decisionIds?: unknown } };
    if (part.state === "output-available" && Array.isArray(part.output?.decisionIds)) {
      return part.output.decisionIds.filter((x): x is string => typeof x === "string");
    }
  }
  return [];
}
