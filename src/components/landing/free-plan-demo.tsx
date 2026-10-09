"use client";

import Link from "next/link";
import { useState } from "react";

// The free plan, as a small demo you can click through: see the plan, ask
// Mairo to change it, approve it. Example content, marked as such.

const BASE = [
  ["Goal", "More online sales"],
  ["Platform", "Facebook + Instagram"],
  ["Budget", "$50/day"],
  ["Audience", "18–34 interested in streetwear"],
  ["Creative Strategy", "Product video first, then customer-style clips"],
  ["Retargeting", "20% for reminder ads to recent visitors"],
  ["Website Recommendations", "Add one clear Buy button above the fold"],
] as const;

type Stage = "plan" | "edited" | "approved";

export function FreePlanDemo() {
  const [stage, setStage] = useState<Stage>("plan");
  const edited = stage !== "plan";
  const value = (k: string, v: string) => (edited && k === "Budget" ? "$30/day" : edited && k === "Platform" ? "Instagram focused" : v);
  const changed = (k: string) => edited && (k === "Budget" || k === "Platform");

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-semibold text-white">Your Mairo Advertising Plan</p>
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/55">Demo</span>
        </div>
        <dl className="mt-4 divide-y divide-white/[0.06]">
          {BASE.map(([k, v]) => (
            <div key={k} className={`flex flex-col gap-0.5 py-2.5 transition-colors duration-700 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${changed(k) ? "rounded-lg bg-violet-500/10 px-2" : ""}`}>
              <dt className="text-[12.5px] text-white/50">{k}</dt>
              <dd className="text-[13.5px] text-white sm:text-right">{value(k, v)}</dd>
            </div>
          ))}
        </dl>
        {stage === "approved" ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4">
            <p className="text-[15px] font-semibold text-emerald-300">Plan Approved ✓</p>
            <p className="mt-1 text-[13px] text-white/70">Next: connect your ad account, then choose a Mairo plan to activate it.</p>
            <Link href="/sign-up" className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#4f7dff] to-[#8b4dfb] px-5 py-2.5 text-[14px] font-medium text-white hover:brightness-110">
              Get Started With Mairo <span aria-hidden>→</span>
            </Link>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => setStage("edited")} disabled={edited} className="rounded-full border border-white/15 px-5 py-2.5 text-[14px] text-white/85 transition hover:border-white/35 disabled:opacity-50">
              Edit With Mairo
            </button>
            <button type="button" onClick={() => setStage("approved")} className="rounded-full bg-gradient-to-r from-[#4f7dff] to-[#8b4dfb] px-5 py-2.5 text-[14px] font-medium text-white hover:brightness-110">
              Approve My Plan
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col rounded-3xl border border-white/10 bg-field-2/80 p-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-300">Ask Mairo</p>
        {edited ? (
          <div className="mt-4 space-y-3">
            <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-r from-[#4f7dff] to-[#7c5cff] px-4 py-2.5 text-[13.5px] text-white">
              I want to spend $30/day and focus more on Instagram.
            </p>
            <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] px-4 py-3 text-[13.5px] text-white/90">
              <p className="font-semibold">Got it. I updated your plan.</p>
              <p className="mt-2 text-[12.5px] text-white/60">Budget: <span className="line-through">$50/day</span> → <span className="text-white">$30/day</span></p>
              <p className="text-[12.5px] text-white/60">Platform: <span className="line-through">Facebook + Instagram</span> → <span className="text-white">Instagram focused</span></p>
              <p className="mt-2 text-[12px] text-white/45">Reason: you asked for a smaller budget and more Instagram.</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center text-[13.5px] text-white/50">
            Press <span className="text-white/80">Edit With Mairo</span> to see Mairo change the plan.
          </p>
        )}
        <p className="mt-auto pt-6 text-[12.5px] leading-relaxed text-white/55">
          Your free plan is strategy only. A Mairo subscription is required before a real campaign is created or launched.
        </p>
      </div>
    </div>
  );
}
