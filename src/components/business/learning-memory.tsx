"use client";

import { useState, useTransition } from "react";
import { toggleLearningAction } from "@/lib/actions/report-actions";

// Mairo Learning Memory: what Mairo has learned from this business's own
// results. Only lessons with enough data behind them are kept, and any of
// them can be switched off — Mairo stops using it at once.

export type LearningRow = { id: string; statement: string; detail: string; confidence: "HIGH" | "MEDIUM" | "EARLY"; timesSeen: number; lastSeen: string; active: boolean };

function Row({ l }: { l: LearningRow }) {
  const [active, setActive] = useState(l.active);
  const [pending, start] = useTransition();
  return (
    <li className={`rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 ${active ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-white">{l.statement}</p>
          <p className="mt-1 text-[12.5px] text-muted">{l.detail}</p>
          <p className="mt-1.5 text-[11.5px] text-faint">
            {l.confidence === "HIGH" ? "High confidence" : "Medium confidence"} · seen {l.timesSeen} week{l.timesSeen === 1 ? "" : "s"} · last {l.lastSeen}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const next = !active;
              if ((await toggleLearningAction(l.id, next)).ok) setActive(next);
            })
          }
          className="shrink-0 rounded-lg border border-white/12 px-3 py-1.5 text-[12px] text-white/85 hover:border-white/30 disabled:opacity-50"
        >
          {active ? "Stop using" : "Use again"}
        </button>
      </div>
    </li>
  );
}

export function LearningMemory({ items }: { items: LearningRow[] }) {
  return (
    <section className="mt-8 rounded-2xl border border-white/[0.07] bg-field/80 p-5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Mairo Learning Memory</p>
      <p className="mt-1 text-[13.5px] text-muted">What Mairo has learned from your own results. Mairo&rsquo;s assistant and new ad versions use these; weak signals are never saved.</p>
      {items.length === 0 ? (
        <p className="mt-4 text-[13.5px] text-muted">Nothing yet — lessons are added from your Weekly Report once the numbers clearly support them.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {items.map((l) => (
            <Row key={l.id} l={l} />
          ))}
        </ul>
      )}
    </section>
  );
}
