"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";

// The campaign board: every campaign in the column its records put it in,
// with the numbers that matter on the card. Moving a campaign happens on its
// own page, with an explicit confirmation and Meta's answer — dragging a card
// never switches anything on, off or spends money. Filtering by goal is the
// only thing done here. On a phone the columns scroll sideways one at a time.

export type BoardCard = {
  id: string;
  name: string;
  goal: string;
  goalKey: string;
  status: { dot: string; text: string; tone: "green" | "yellow" | "neutral" | "blue" };
  budget: string;
  spent: string | null;
  result: { label: string; value: string } | null;
  attention: boolean;
  decisions: number;
};
export type BoardColumnView = { key: string; label: string; cards: BoardCard[]; budget: string | null };

const TONE: Record<BoardCard["status"]["tone"], string> = {
  green: "text-emerald-300",
  yellow: "text-amber-200",
  neutral: "text-neutral-400",
  blue: "text-signal",
};

export function CampaignBoard({ columns, goals }: { columns: BoardColumnView[]; goals: { key: string; label: string }[] }) {
  const [goal, setGoal] = useState<string | null>(null);
  const still = useReducedMotion();
  const shown = useMemo(() => columns.map((c) => ({ ...c, cards: goal ? c.cards.filter((k) => k.goalKey === goal) : c.cards })), [columns, goal]);
  const total = shown.reduce((n, c) => n + c.cards.length, 0);

  return (
    <div>
      {goals.length > 1 && (
        <div role="group" aria-label="Filter by goal" className="mb-4 flex flex-wrap gap-2">
          {[{ key: null as string | null, label: "All goals" }, ...goals].map((g) => (
            <button
              key={g.key ?? "all"}
              type="button"
              aria-pressed={goal === g.key}
              onClick={() => setGoal(g.key)}
              className={`min-h-9 rounded-full border px-3.5 text-[12.5px] transition-colors ${goal === g.key ? "border-signal/60 bg-signal/10 text-white" : "border-[color:var(--mairo-line)] text-neutral-400 hover:text-white"}`}
            >
              {g.key && <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-signal align-middle" />}
              {g.label}
            </button>
          ))}
        </div>
      )}
      <p className="sr-only" role="status">{total} campaigns shown</p>
      <LayoutGroup>
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] lg:mx-0 lg:px-0 min-[1800px]:grid min-[1800px]:snap-none min-[1800px]:grid-cols-6 min-[1800px]:overflow-visible">
          {shown.map((col, i) => (
            <section key={col.key} aria-labelledby={`col-${col.key}`} className="w-[82vw] max-w-[300px] shrink-0 snap-start rounded-2xl border border-[color:var(--mairo-line)] bg-[rgba(var(--mairo-fg-rgb),0.02)] p-2.5 sm:w-[272px] min-[1800px]:w-auto min-[1800px]:max-w-none">
              <header className="px-1.5 pb-2.5 pt-1">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="grid h-5 w-5 place-items-center rounded-md bg-[rgba(var(--mairo-fg-rgb),0.06)] font-mono text-[10.5px] text-neutral-400">{i + 1}</span>
                  <h2 id={`col-${col.key}`} className="text-[13px] font-medium text-white">{col.label}</h2>
                  <span className="ml-auto rounded-full bg-[rgba(var(--mairo-fg-rgb),0.06)] px-2 text-[11px] tabular-nums text-neutral-400">{col.cards.length}</span>
                </div>
                <p className="mt-1 pl-7 text-[11px] tabular-nums text-neutral-500">{col.budget ? `${col.budget} a day` : "\u00a0"}</p>
              </header>
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {col.cards.map((c) => (
                    <motion.li key={c.id} layout={!still} initial={still ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={still ? undefined : { opacity: 0, scale: 0.98 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                      <Link
                        href={`/dashboard/campaigns/${c.id}`}
                        className="block rounded-xl border border-[color:var(--mairo-line)] bg-[color:var(--color-surface)] p-3 transition hover:-translate-y-px hover:border-[color:var(--mairo-line-lit)] hover:shadow-[var(--mairo-glow-soft)]"
                      >
                        <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-signal" />
                          {c.goal}
                        </span>
                        <span className="mt-1 block truncate text-[13.5px] font-medium text-white">{c.name}</span>
                        <span className={`mt-1 block text-[12px] ${TONE[c.status.tone]}`}>{c.status.text}</span>
                        <span className="mt-2.5 flex items-end justify-between gap-2">
                          <span>
                            <span className="block text-[15px] font-medium tabular-nums text-white">{c.spent ?? "—"}</span>
                            <span className="block text-[10.5px] text-neutral-500">spent · {c.budget}/day</span>
                          </span>
                          {c.result && (
                            <span className="text-right">
                              <span className="block text-[15px] font-medium tabular-nums text-white">{c.result.value}</span>
                              <span className="block text-[10.5px] text-neutral-500">{c.result.label}</span>
                            </span>
                          )}
                        </span>
                        {(c.attention || c.decisions > 0) && (
                          <span className="mt-2.5 flex flex-wrap gap-1.5">
                            {c.attention && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10.5px] text-amber-200">Needs attention</span>}
                            {c.decisions > 0 && (
                              <span className="rounded-full bg-signal/10 px-2 py-0.5 text-[10.5px] text-signal">
                                {c.decisions} recommendation{c.decisions === 1 ? "" : "s"} to review
                              </span>
                            )}
                          </span>
                        )}
                      </Link>
                    </motion.li>
                  ))}
                </AnimatePresence>
                {col.cards.length === 0 && <li className="rounded-xl border border-dashed border-[color:var(--mairo-line)] px-3 py-6 text-center text-[12px] text-neutral-500">Nothing here</li>}
              </ul>
            </section>
          ))}
        </div>
      </LayoutGroup>
      <p className="mt-2 text-[11.5px] text-neutral-500">Open a campaign to approve, pause or change it — every change that spends money asks first.</p>
    </div>
  );
}
