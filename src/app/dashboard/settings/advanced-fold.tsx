"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { SummaryLine } from "@/lib/dashboard/settings-summary";

// Settings in Simple mode: the controls for what MAIRO does on its own sit
// behind one "Advanced settings" panel, with a line for each saying what is
// switched on right now — folded, never hidden. Links elsewhere point at
// sections inside it (#automation, #spend-protection), so arriving with one
// of those in the address opens the panel and scrolls to the section.

export function AdvancedFold({ lines, children }: { lines: SummaryLine[]; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const reveal = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id || !ref.current) return;
      const target = ref.current.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
      if (!target) return;
      ref.current.open = true;
      requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);

  return (
    <details ref={ref} className="group mb-8 rounded-[22px]" style={{ background: "rgba(var(--mairo-fg-rgb),0.025)" }}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-[22px] px-5 py-5 transition hover:bg-white/[0.03] sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-[15px] font-medium text-white">Advanced settings</span>
          <span className="mt-0.5 block text-[13px] text-muted">Automatic launching, spending limits, what MAIRO may change without asking, and your brief.</span>
          <span className="mt-4 block space-y-2 group-open:hidden">
            {lines.map((l) => (
              <span key={l.anchor} className="block text-[13px]">
                <span className="text-white/85">{l.label}:</span> <span className="text-muted">{l.value}</span>
              </span>
            ))}
          </span>
        </span>
        <span className="mt-0.5 shrink-0 text-[13px] text-violet-bright">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="px-2 pb-2 sm:px-3 sm:pb-3">{children}</div>
    </details>
  );
}
