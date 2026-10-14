"use client";

import { useState } from "react";
import { BUSINESS_TYPES } from "@/lib/onboarding/business-types";

// "Build My Free Ad Plan": how a visitor starts. Three ways in, and none of
// them needs a website:
//
//   Tell us about your business (the default) — the name, what it sells, the
//     industry and the main goal. Seconds to fill in.
//   Analyze my Instagram — a username. MAIRO reads only what Instagram shows
//     anyone without signing in (lib/website/instagram.ts); when that's
//     nothing, the visitor describes the business instead.
//   Use my website — MAIRO's server reads its public pages.
//
// Everything else is asked on the next screen if it's needed, never guessed.
// One component for the homepage hero and the /preview page. Without an
// onStart handler it's a plain GET form to /preview, so it works before
// JavaScript loads. The product walkthrough draws this same form, driven by
// its clock through `demo` (and inert there).

export type FreePlanMode = "describe" | "instagram" | "website";

export type FreePlanStart = {
  website: string | null;
  describe: string | null;
  name: string | null;
  instagram: string | null;
  goal: "sales" | "leads" | "bookings" | "";
  type: string;
  budget: number | null;
};

const GOALS = [
  { value: "", label: "Choose your main goal" },
  { value: "sales", label: "Get more online sales" },
  { value: "leads", label: "Get more enquiries & leads" },
  { value: "bookings", label: "Get more bookings" },
] as const;

const MODES: { id: FreePlanMode; label: string; short: string }[] = [
  { id: "describe", label: "Tell us about your business", short: "Your business" },
  { id: "instagram", label: "Analyze my Instagram", short: "Instagram" },
  { id: "website", label: "Use my website", short: "Website" },
];

/** The walkthrough's control: what's typed and chosen at this moment of the demo. */
export type FreePlanDemo = { website: string; goal: FreePlanStart["goal"]; focus: "website" | "goal" | null; pressed: boolean };

const field =
  "block min-h-[48px] w-full rounded-xl border border-white/12 bg-[#0e1122]/80 px-3.5 text-[15px] text-white placeholder:text-white/35 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-400/25";
const label = "mb-1 block text-[12px] font-medium text-white/65";

export function FreePlanForm({
  onStart,
  initial,
  compact = false,
  idPrefix = "fp",
  demo,
}: {
  onStart?: (s: FreePlanStart) => void;
  initial?: Partial<FreePlanStart>;
  compact?: boolean;
  idPrefix?: string;
  demo?: FreePlanDemo;
}) {
  const [mode, setMode] = useState<FreePlanMode>(initial?.website ? "website" : initial?.instagram ? "instagram" : "describe");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [instagram, setInstagram] = useState(initial?.instagram ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [describe, setDescribe] = useState(initial?.describe ?? "");
  const [goal, setGoal] = useState<FreePlanStart["goal"]>(initial?.goal ?? "");
  const [type, setType] = useState(initial?.type ?? "");
  const [budget, setBudget] = useState(initial?.budget ? String(initial.budget) : "");
  const [more, setMore] = useState(!compact || Boolean(initial?.budget));
  const [problem, setProblem] = useState<string | null>(null);
  const id = (k: string) => `${idPrefix}-${k}`;
  // The walkthrough shows the website route, typed by its clock.
  const shownMode: FreePlanMode = demo ? "website" : mode;
  const shownWebsite = demo ? demo.website : website;
  const shownGoal = demo ? demo.goal : goal;
  const lit = (k: "website" | "goal") => (demo?.focus === k ? " border-violet-400/70 ring-2 ring-violet-400/25" : "");

  const goalField = (
    <div>
      <label htmlFor={id("goal")} className={label}>
        Your primary advertising goal
      </label>
      <select id={id("goal")} name="goal" value={shownGoal} onChange={(e) => setGoal(e.target.value as FreePlanStart["goal"])} className={`${field} text-[14.5px]${lit("goal")}`}>
        {GOALS.map((g) => (
          <option key={g.value} value={g.value} className="bg-[#111426]">
            {g.label}
          </option>
        ))}
      </select>
    </div>
  );
  const typeField = (
    <div>
      <label htmlFor={id("type")} className={label}>
        Industry or category
      </label>
      <select id={id("type")} name="type" value={type} onChange={(e) => setType(e.target.value)} className={`${field} text-[14.5px]`}>
        <option value="" className="bg-[#111426]">
          Choose one
        </option>
        {BUSINESS_TYPES.map((t) => (
          <option key={t.id} value={t.id} className="bg-[#111426]">
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <form
      action="/preview"
      method="get"
      inert={demo ? true : undefined}
      onSubmit={(e) => {
        const w = mode === "website" ? website.trim() : "";
        const ig = mode === "instagram" ? instagram.trim() : "";
        const d = mode === "describe" ? describe.trim() : "";
        const n = mode === "describe" ? name.trim() : "";
        const missing = mode === "website" ? !w && "Enter your website — or tell MAIRO about your business instead." : mode === "instagram" ? !ig && "Enter your Instagram username, like @yourbusiness." : !n ? "What's your business called?" : !d && "Tell MAIRO what your business sells or offers.";
        if (missing) {
          e.preventDefault();
          setProblem(missing);
          return;
        }
        if (!onStart) return; // A plain GET to /preview.
        e.preventDefault();
        const b = Number(budget.replace(/[^0-9.]/g, ""));
        onStart({ website: w || null, instagram: ig || null, describe: d || null, name: n || null, goal, type, budget: Number.isFinite(b) && b > 0 ? Math.round(b) : null });
      }}
      className="rounded-[26px] border border-white/10 p-2.5 text-left sm:p-3.5"
      style={{ background: "linear-gradient(170deg, rgba(25,31,62,0.82), rgba(14,17,33,0.86))", boxShadow: "0 0 0 1px rgba(121,82,255,0.14), 0 40px 100px -45px rgba(121,82,255,0.65)" }}
    >
      <div role="tablist" aria-label="How to start" className="grid grid-cols-3 gap-1 rounded-full bg-black/30 p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            id={id(`tab-${m.id}`)}
            aria-selected={shownMode === m.id}
            aria-label={m.label}
            onClick={() => {
              setMode(m.id);
              setProblem(null);
            }}
            className={`min-h-[40px] truncate rounded-full px-2 py-2 text-[12.5px] font-medium transition sm:text-[13px] ${shownMode === m.id ? "bg-white/[0.1] text-white shadow-[0_0_0_1px_rgba(168,145,255,0.25)]" : "text-white/55 hover:text-white"}`}
          >
            <span className="sm:hidden">{m.short}</span>
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        ))}
      </div>
      {/* The chosen route, for a form sent before JavaScript runs. */}
      <input type="hidden" name="start" value={shownMode} />

      <div role="tabpanel" aria-labelledby={id(`tab-${shownMode}`)} className="px-1.5 pb-1.5 pt-3.5">
        {shownMode === "describe" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={id("name")} className={label}>
                Business name
              </label>
              <input id={id("name")} name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" maxLength={80} placeholder="e.g. Nova Clothing" className={field} />
            </div>
            {typeField}
            <div className="sm:col-span-2">
              <label htmlFor={id("describe")} className={label}>
                What your business sells or offers
              </label>
              <textarea id={id("describe")} name="describe" value={describe} onChange={(e) => setDescribe(e.target.value)} maxLength={400} rows={2} placeholder="e.g. We sell premium streetwear clothing for young adults." className={`${field} py-3 leading-relaxed`} />
            </div>
            <div className="sm:col-span-2">{goalField}</div>
          </div>
        )}

        {shownMode === "instagram" && (
          <div className="grid gap-3">
            <div>
              <label htmlFor={id("instagram")} className={label}>
                Your Instagram username or profile link
              </label>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-white/45">
                  @
                </span>
                <input id={id("instagram")} name="instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={120} placeholder="novaclothing" className={`${field} pl-8`} />
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-white/50">MAIRO reads only what Instagram shows anyone without signing in — your profile&rsquo;s name, bio and link. No private insights, and nothing about how your ads perform.</p>
            </div>
            {goalField}
          </div>
        )}

        {shownMode === "website" && (
          <div className="grid gap-3">
            <div>
              <label htmlFor={id("website")} className={label}>
                Your website
              </label>
              <input id={id("website")} name="website" value={shownWebsite} onChange={(e) => setWebsite(e.target.value)} inputMode="url" autoComplete="url" maxLength={300} placeholder="yourbusiness.com" className={field + lit("website")} />
              <p className="mt-1.5 text-[12px] text-white/50">MAIRO&rsquo;s server reads its public pages — never pages behind a login.</p>
            </div>
            {goalField}
          </div>
        )}

        {more ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {shownMode !== "describe" && typeField}
            <div>
              <label htmlFor={id("budget")} className={label}>
                Monthly ad budget (optional)
              </label>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-white/45">
                  $
                </span>
                <input id={id("budget")} name="budget" value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" maxLength={9} placeholder="Leave empty for an example" className={`${field} pl-7 text-[14px]`} />
              </div>
            </div>
          </div>
        ) : (
          !demo && (
            <button type="button" onClick={() => setMore(true)} className="mt-2.5 text-[12.5px] text-violet-200 underline-offset-4 hover:text-white hover:underline">
              {shownMode === "describe" ? "Add a monthly budget (optional)" : "Add your industry and budget (optional)"}
            </button>
          )
        )}

        {problem && (
          <p role="alert" className="mt-2.5 text-[13px] text-amber-200">
            {problem}
          </p>
        )}

        <button
          type="submit"
          className="mt-3.5 inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-6 text-[16.5px] font-semibold text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110 focus-visible:outline-offset-4"
          style={demo?.pressed ? { transform: "scale(0.97)", filter: "brightness(1.15)" } : undefined}
        >
          Build My Free Ad Plan <span aria-hidden>→</span>
        </button>
        <p className="mt-2 text-center text-[12px] text-white/50">Completely free to explore · no credit card · nothing runs until you approve it</p>
      </div>
    </form>
  );
}
