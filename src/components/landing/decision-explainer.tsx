"use client";

import { useState } from "react";

// "Mairo doesn't just tell you what to do. It shows you why." One worked
// example of a Mairo Decision, with the data behind it and the three buttons
// a customer sees. The buttons respond here, but nothing is sent anywhere —
// it's a demonstration, and says so.

const CREATIVES = [
  { name: "Creative #2", cpp: 46.21, ctr: 1.2, roas: 1.8, tone: "from-[#3b0764] to-[#86198f]", weak: true },
  { name: "Creative #4", cpp: 24.3, ctr: 3.4, roas: 4.7, tone: "from-[#0c4a6e] to-[#6d28d9]", weak: false },
];

const MAX = { cpp: 50, ctr: 4, roas: 5 };

function Bar({ value, max, good }: { value: number; max: number; good: boolean }) {
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
      <div className={`h-full rounded-full ${good ? "bg-gradient-to-r from-[#7c5cff] to-[#a78bfa]" : "bg-white/30"}`} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  );
}

export function DecisionExplainer() {
  const [why, setWhy] = useState(false);
  const [outcome, setOutcome] = useState<"approved" | "ignored" | null>(null);

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.012] p-5 shadow-[0_40px_120px_-60px_rgba(124,92,255,0.6)] sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-violet-500/15 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-violet-200">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden>
            <path d="M8 0c.4 3.8 2.2 5.6 6 6-3.8.4-5.6 2.2-6 6-.4-3.8-2.2-5.6-6-6 3.8-.4 5.6-2.2 6-6z" transform="translate(0 2)" />
          </svg>
          Mairo decision
        </span>
        <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/55">Example</span>
      </div>
      <h3 className="mt-4 text-[clamp(22px,3vw,30px)] font-bold tracking-[-0.02em]">Move $20/day from Creative #2 to Creative #4.</h3>

      <p className="mt-7 text-[13px] font-semibold uppercase tracking-[0.12em] text-violet-300">Why Mairo recommends this</p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {CREATIVES.map((c) => (
          <div key={c.name} className={`rounded-2xl border p-5 ${c.weak ? "border-white/[0.08] bg-black/20" : "border-violet-400/35 bg-violet-500/[0.07]"}`}>
            <div className="flex items-center gap-3">
              <span className={`h-11 w-11 rounded-xl bg-gradient-to-br ${c.tone}`} aria-hidden />
              <div>
                <p className="text-[15px] font-semibold">{c.name}</p>
                <p className={`text-[12px] ${c.weak ? "text-white/50" : "text-violet-200"}`}>{c.weak ? "Getting weaker" : "Stronger performer"}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-3 text-[13px]">
              <div>
                <div className="flex justify-between">
                  <dt className="text-white/55">Cost per purchase</dt>
                  <dd className="font-semibold tabular-nums">${c.cpp.toFixed(2)}</dd>
                </div>
                {/* Lower is better, so the bar shows how much room is left under $50. */}
                <Bar value={MAX.cpp - c.cpp} max={MAX.cpp} good={!c.weak} />
              </div>
              <div>
                <div className="flex justify-between">
                  <dt className="text-white/55">CTR</dt>
                  <dd className="font-semibold tabular-nums">{c.ctr}%</dd>
                </div>
                <Bar value={c.ctr} max={MAX.ctr} good={!c.weak} />
              </div>
              <div>
                <div className="flex justify-between">
                  <dt className="text-white/55">ROAS</dt>
                  <dd className="font-semibold tabular-nums">{c.roas}x</dd>
                </div>
                <Bar value={c.roas} max={MAX.roas} good={!c.weak} />
              </div>
            </dl>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-violet-300">Mairo&rsquo;s reasoning</p>
          <ul className="mt-3 space-y-2.5 text-[14.5px] leading-relaxed text-white/80">
            <li className="flex gap-2.5"><span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />Creative #4 has generated purchases at 47% lower cost over the last 5 days.</li>
            <li className="flex gap-2.5"><span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />Creative #2&rsquo;s CTR has fallen while its frequency has increased.</li>
            <li className="flex gap-2.5"><span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />Moving part of the budget lets Mairo scale the stronger creative without increasing total daily spend.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
          <span className="inline-flex rounded-md bg-emerald-400/12 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-300">High confidence</span>
          <p className="mt-3 text-[12.5px] text-white/50">Based on</p>
          <ul className="mt-1.5 space-y-1 text-[14px] tabular-nums text-white/85">
            <li>5 days of performance</li>
            <li>2,840 clicks</li>
            <li>64 purchases</li>
          </ul>
        </div>
      </div>

      {why && (
        <div className="de-in mt-6 rounded-2xl border border-violet-400/25 bg-violet-500/[0.06] p-5">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-violet-200">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#8b4dfb] to-[#5f2dfd] text-[11px] text-white">M</span>
            Mairo explains
          </p>
          <p className="mt-2.5 text-[14.5px] leading-relaxed text-white/85">
            &ldquo;Creative #4 is currently converting people more efficiently. Instead of increasing your overall advertising budget, Mairo recommends
            moving existing spend toward the creative producing stronger results. If Creative #4 stops performing, Mairo will tell you and suggest
            moving it back.&rdquo;
          </p>
          <p className="mt-3 text-[12px] text-white/45">Past performance is the evidence, not a promise — results can change after any change.</p>
        </div>
      )}

      {outcome ? (
        <div className="de-in mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[14px]">
          <p className="text-white/85">
            {outcome === "approved"
              ? "Approved. In your account, Mairo would send this change to Meta and log it in Mairo Activity with the reason."
              : "Ignored. Mairo would leave the budget as it is and keep watching."}{" "}
            <span className="text-white/45">(Demo — nothing was changed.)</span>
          </p>
          <button type="button" onClick={() => setOutcome(null)} className="text-[13px] text-violet-300 hover:text-white">
            Reset
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => setOutcome("approved")} className="min-h-[48px] rounded-full bg-gradient-to-r from-[#8b4dfb] to-[#5f2dfd] px-6 text-[14.5px] font-semibold shadow-[0_12px_36px_-12px_rgba(124,77,255,0.9)] transition hover:brightness-110">
            Approve change
          </button>
          <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} className="min-h-[48px] rounded-full border border-violet-400/40 bg-violet-500/10 px-6 text-[14.5px] font-medium text-violet-100 transition hover:border-violet-300">
            {why ? "Hide explanation" : "Ask Mairo why"}
          </button>
          <button type="button" onClick={() => setOutcome("ignored")} className="min-h-[48px] rounded-full border border-white/15 px-6 text-[14.5px] text-white/70 transition hover:border-white/30 hover:text-white">
            Ignore
          </button>
        </div>
      )}

      <style>{`
        .de-in { animation: de-in .4s cubic-bezier(.22,1,.36,1) both; }
        @keyframes de-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .de-in { animation: none; } }
      `}</style>
    </div>
  );
}
