"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { longDate } from "./format";

// The period the dashboard covers. Kept in the address (?range=30) so a
// refresh, a bookmark or the back button all land on the same numbers.

const OPTIONS = [7, 14, 30, 90];

export function RangePicker({ days, since, until }: { days: number; since: string; until: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (n: number) => {
    setOpen(false);
    const next = new URLSearchParams(params.toString());
    next.set("range", String(n));
    start(() => router.push(`?${next.toString()}`, { scroll: false }));
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex h-10 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-[13px] text-white/90 transition hover:border-white/25 ${pending ? "opacity-60" : ""}`}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 text-muted" aria-hidden>
          <rect x="3" y="4.5" width="14" height="12" rx="2" />
          <path d="M3 8.5h14M7 3v3M13 3v3" />
        </svg>
        <span className="tabular-nums">
          {longDate(since)} – {longDate(until)}
        </span>
        <svg viewBox="0 0 12 12" className="h-3 w-3 fill-none stroke-current text-muted" strokeWidth="1.6" aria-hidden>
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </button>
      {open && (
        <ul className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-white/10 bg-field-2 p-1.5 shadow-2xl">
          {OPTIONS.map((n) => (
            <li key={n}>
              <button
                type="button"
                onClick={() => pick(n)}
                className={`w-full rounded-lg px-3 py-2 text-left text-[13px] transition hover:bg-white/[0.06] ${n === days ? "text-white" : "text-muted"}`}
              >
                Last {n} days {n === days && <span className="float-right text-violet-bright">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Where the figures come from. Meta is the only network, so this is a label, not a filter. */
export function SourceChip() {
  return (
    <span className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-[13px] text-white/90">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 text-muted" aria-hidden>
        <path d="M10 3 3 6.5 10 10l7-3.5zM3 10l7 3.5 7-3.5M3 13.5 10 17l7-3.5" />
      </svg>
      Facebook &amp; Instagram
    </span>
  );
}
