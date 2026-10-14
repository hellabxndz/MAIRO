"use client";

import { useState } from "react";
import { BUSINESS_TYPES } from "@/lib/onboarding/business-types";

// "See Your Free Plan": how a visitor starts — their website, or a few words
// about the business if they'd rather — with the objective, industry and
// monthly budget if they know them. Every field but one is optional; MAIRO
// asks about anything it still needs on the next screen, rather than guessing.
//
// One component for the homepage hero and the /preview page. Without an
// onStart handler it's a plain GET form to /preview, so it works before
// JavaScript loads.

export type FreePlanStart = {
  website: string | null;
  describe: string | null;
  goal: "sales" | "leads" | "bookings" | "";
  type: string;
  budget: number | null;
};

const GOALS = [
  { value: "", label: "Not sure yet" },
  { value: "sales", label: "More online sales" },
  { value: "leads", label: "More enquiries & leads" },
  { value: "bookings", label: "More bookings" },
] as const;

const field =
  "block min-h-[46px] w-full rounded-xl border border-white/12 bg-[#0e1122]/80 px-3.5 text-[15px] text-white placeholder:text-white/35 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-400/25";

export function FreePlanForm({
  onStart,
  initial,
  compact = false,
  idPrefix = "fp",
}: {
  onStart?: (s: FreePlanStart) => void;
  initial?: Partial<FreePlanStart>;
  compact?: boolean;
  idPrefix?: string;
}) {
  const [mode, setMode] = useState<"website" | "describe">(initial?.describe && !initial.website ? "describe" : "website");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [describe, setDescribe] = useState(initial?.describe ?? "");
  const [goal, setGoal] = useState<FreePlanStart["goal"]>(initial?.goal ?? "");
  const [type, setType] = useState(initial?.type ?? "");
  const [budget, setBudget] = useState(initial?.budget ? String(initial.budget) : "");
  const [more, setMore] = useState(!compact || Boolean(initial?.goal || initial?.type || initial?.budget));
  const [problem, setProblem] = useState<string | null>(null);
  const id = (k: string) => `${idPrefix}-${k}`;

  return (
    <form
      action="/preview"
      method="get"
      onSubmit={(e) => {
        const w = mode === "website" ? website.trim() : "";
        const d = mode === "describe" ? describe.trim() : "";
        if (!w && !d) {
          e.preventDefault();
          setProblem(mode === "website" ? "Enter your website, or describe your business instead." : "Describe your business in a sentence or two.");
          return;
        }
        if (!onStart) return; // A plain GET to /preview.
        e.preventDefault();
        const n = Number(budget.replace(/[^0-9.]/g, ""));
        onStart({ website: w || null, describe: d || null, goal, type, budget: Number.isFinite(n) && n > 0 ? Math.round(n) : null });
      }}
      className="rounded-[24px] border border-white/10 p-2.5 sm:p-3"
      style={{ background: "linear-gradient(170deg, rgba(25,31,62,0.78), rgba(14,17,33,0.82))", boxShadow: "0 0 0 1px rgba(121,82,255,0.12), 0 30px 80px -40px rgba(121,82,255,0.55)" }}
    >
      <div role="tablist" aria-label="How to start" className="flex gap-1 rounded-full bg-black/30 p-1">
        {(["website", "describe"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setProblem(null);
            }}
            className={`flex-1 rounded-full px-3 py-2 text-[13px] font-medium transition ${mode === m ? "bg-white/[0.09] text-white" : "text-white/55 hover:text-white"}`}
          >
            {m === "website" ? "I have a website" : "Describe my business"}
          </button>
        ))}
      </div>

      <div className="px-1.5 pb-1.5 pt-3">
        {mode === "website" ? (
          <>
            <label htmlFor={id("website")} className="sr-only">
              Your business website
            </label>
            <input id={id("website")} name="website" value={website} onChange={(e) => setWebsite(e.target.value)} inputMode="url" autoComplete="url" maxLength={300} placeholder="yourbusiness.com" className={field} />
          </>
        ) : (
          <>
            <label htmlFor={id("describe")} className="sr-only">
              Describe your business
            </label>
            <textarea
              id={id("describe")}
              name="describe"
              value={describe}
              onChange={(e) => setDescribe(e.target.value)}
              maxLength={400}
              rows={compact ? 2 : 3}
              placeholder="e.g. Family-run plumbing in Eastfield — emergency repairs and new bathrooms"
              className={`${field} py-3 leading-relaxed`}
            />
          </>
        )}

        {more ? (
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
            <div>
              <label htmlFor={id("goal")} className="mb-1 block text-[11.5px] font-medium text-white/60">
                Your objective
              </label>
              <select id={id("goal")} name="goal" value={goal} onChange={(e) => setGoal(e.target.value as FreePlanStart["goal"])} className={`${field} text-[14px]`}>
                {GOALS.map((g) => (
                  <option key={g.value} value={g.value} className="bg-[#111426]">
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={id("type")} className="mb-1 block text-[11.5px] font-medium text-white/60">
                Industry
              </label>
              <select id={id("type")} name="type" value={type} onChange={(e) => setType(e.target.value)} className={`${field} text-[14px]`}>
                <option value="" className="bg-[#111426]">
                  Choose (optional)
                </option>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[#111426]">
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={id("budget")} className="mb-1 block text-[11.5px] font-medium text-white/60">
                Monthly ad budget
              </label>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-white/45">
                  $
                </span>
                <input id={id("budget")} name="budget" value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" maxLength={9} placeholder="Optional" className={`${field} pl-7 text-[14px]`} />
              </div>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setMore(true)} className="mt-2.5 text-[12.5px] text-violet-200 underline-offset-4 hover:text-white hover:underline">
            Add your objective, industry and budget (optional)
          </button>
        )}

        {problem && (
          <p role="alert" className="mt-2 text-[13px] text-amber-200">
            {problem}
          </p>
        )}

        <button
          type="submit"
          className="mt-3 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-6 text-[16px] font-semibold text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110 focus-visible:outline-offset-4"
        >
          See Your Free Plan <span aria-hidden>→</span>
        </button>
        <p className="mt-2 text-center text-[12px] text-white/50">Free · no credit card · nothing runs until you approve it</p>
      </div>
    </form>
  );
}
