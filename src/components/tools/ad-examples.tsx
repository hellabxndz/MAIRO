"use client";

import { useState } from "react";
import { AD_EXAMPLES, EXAMPLE_BUSINESSES, EXAMPLE_FORMATS, EXAMPLE_GOALS } from "@/lib/tools/ad-examples";
import { CopyButton, NextStep, SelectField } from "./ui";

export function AdExamplesTool() {
  const [goal, setGoal] = useState("all");
  const [format, setFormat] = useState("all");
  const [business, setBusiness] = useState("all");
  const list = AD_EXAMPLES.filter((e) => (goal === "all" || e.goal === goal) && (format === "all" || e.format === format) && (business === "all" || e.business === business));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField label="Goal" value={goal} onChange={setGoal} options={[{ value: "all", label: "Any goal" }, ...EXAMPLE_GOALS.map((g) => ({ value: g, label: g }))]} />
        <SelectField label="Format" value={format} onChange={setFormat} options={[{ value: "all", label: "Any format" }, ...EXAMPLE_FORMATS.map((g) => ({ value: g, label: g }))]} />
        <SelectField label="Business" value={business} onChange={setBusiness} options={[{ value: "all", label: "Any business" }, ...EXAMPLE_BUSINESSES.map((g) => ({ value: g, label: g }))]} />
      </div>
      <p className="text-[12.5px] text-white/55" aria-live="polite">{list.length} example{list.length === 1 ? "" : "s"}. Written by MAIRO for invented businesses — not real ads. Prices, offers and proof in them belong to the invented business.</p>
      <ul className="grid gap-4 md:grid-cols-2">
        {list.map((e) => (
          <li key={e.id} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
              <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-amber-200">Example</span>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-white/70">{e.goal}</span>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-white/70">{e.format}</span>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-white/70">{e.business}</span>
            </div>
            <p className="mt-3 text-[12px] text-white/50">{e.name} · angle: {e.angle}</p>
            <div className="mt-2 rounded-xl border border-white/10 bg-paper/70 p-4">
              <p className="text-[13.5px] leading-relaxed text-white/90">{e.primaryText}</p>
              <div className="mt-3 rounded-lg bg-white/[0.05] px-3 py-6 text-center text-[12.5px] italic text-white/55">Visual: {e.visual}</div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-[13.5px] font-semibold text-white">{e.headline}</p>
                <span className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-[12px] text-white/85">{e.cta}</span>
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-white/75"><span className="text-white/50">Why it works: </span>{e.why}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/75"><span className="text-white/50">Test it against: </span>{e.test}</p>
            <div className="mt-3"><CopyButton text={`${e.hook}\n\n${e.primaryText}\n\nHeadline: ${e.headline}\nButton: ${e.cta}`} label="Copy the structure" /></div>
          </li>
        ))}
      </ul>
      <NextStep title="Write ones for your business" body="The hook generator builds openings like these from your own details, and your free MAIRO plan picks the directions to test first." action="Open the hook generator" href="/tools/hook-generator" />
    </div>
  );
}
