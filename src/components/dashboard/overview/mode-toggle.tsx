"use client";

import { useTransition } from "react";
import { setViewMode } from "@/lib/actions/view-mode-actions";
import { setDashboardLensAction } from "@/lib/actions/intelligence-actions";
import type { DashboardMode } from "@/lib/view-mode";

// Simple · Advanced · Profit First. The first two are the app-wide switch;
// Profit First is the dashboard's own third view, and picking either of the
// others leaves it.

const MODES: { key: DashboardMode; label: string }[] = [
  { key: "simple", label: "Simple" },
  { key: "advanced", label: "Advanced" },
  { key: "profit", label: "Profit First" },
];

export function DashboardModeToggle({ mode }: { mode: DashboardMode }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1" role="group" aria-label="Dashboard view">
      {MODES.map((m) => {
        const on = mode === m.key;
        return (
          <button
            key={m.key}
            type="button"
            aria-pressed={on}
            disabled={pending}
            onClick={() => start(() => void (m.key === "profit" ? setDashboardLensAction("profit") : setViewMode(m.key)))}
            className={`min-h-[34px] rounded-lg px-3.5 text-[13px] font-medium transition disabled:opacity-60 ${on ? "bg-gradient-to-r from-[#7c5cff] to-[#6d4dff] text-white" : "text-muted hover:text-white"}`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
