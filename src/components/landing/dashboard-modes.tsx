"use client";

import { useState } from "react";

// Simple, Advanced and Profit First — the same account, three ways to read
// it. Sample figures, labelled.

const MODES = {
  Simple: [
    ["Money Spent", "$1,240"],
    ["Revenue", "$4,830"],
    ["Purchases", "38"],
    ["Cost Per Sale", "$32.63"],
    ["ROAS", "3.9x"],
    ["New Customers", "31"],
  ],
  Advanced: [
    ["Spend", "$1,240"],
    ["Impressions", "96,420"],
    ["Reach", "41,380"],
    ["Clicks", "2,840"],
    ["CTR", "2.95%"],
    ["CPC", "$0.44"],
    ["CPM", "$12.86"],
    ["Purchases", "38"],
    ["CPA", "$32.63"],
    ["ROAS", "3.9x"],
  ],
  "Profit First": [
    ["Revenue", "$4,830"],
    ["Estimated Profit", "$1,172"],
    ["Ad Spend", "$1,240"],
    ["Customers", "31"],
    ["Cost Per Customer", "$40.00"],
    ["Break-Even ROAS", "2.1x"],
  ],
} as const;

type Mode = keyof typeof MODES;

const SUB: Record<Mode, string> = {
  Simple: "The numbers that matter, in plain English.",
  Advanced: "Every metric you'd find in Ads Manager, side by side.",
  "Profit First": "What your ads earn after costs — using the margins you enter.",
};

export function DashboardModes() {
  const [mode, setMode] = useState<Mode>("Simple");
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Dashboard mode" className="flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={m === mode}
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-1.5 text-[13px] transition ${m === mode ? "bg-gradient-to-r from-[#4f7dff] to-[#8b4dfb] text-white" : "text-white/60 hover:text-white"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/55">Sample data</span>
      </div>
      <p className="mt-4 text-[14px] text-white/60">{SUB[mode]}</p>
      <div className={`mt-5 grid grid-cols-2 gap-3 ${MODES[mode].length > 6 ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-3"}`}>
        {MODES[mode].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-white/[0.07] bg-field-2/80 p-4 transition hover:-translate-y-0.5 hover:border-violet-400/30">
            <p className="text-[12px] text-white/50">{k}</p>
            <p className="mt-1 text-[22px] font-semibold tabular-nums text-white">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
