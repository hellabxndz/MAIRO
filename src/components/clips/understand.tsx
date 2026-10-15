"use client";

import { createRef } from "react";
import { Running, STAGES, type Stage } from "@/components/plan-generator/plan-generator";
import { PlanReportView } from "@/components/plan-generator/plan-report";
import type { ClipLayout } from "@/lib/demo/clip";
import { SHOP, SHOP_REPORT } from "@/lib/demo/shop-sample";
import type { Clip } from "./stage";

// "Your business. Understood by AI." — the free plan generator reading the
// sample shop's website (its own six stages, each ticked when its work is
// done), then the plan's first section: the facts, each with where it came
// from, kept apart from what MAIRO suggests.

const HEADING = createRef<HTMLHeadingElement>();
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const R = SHOP_REPORT;

const DETAIL = [
  `Read 3 public pages of ${SHOP.site}`,
  `${R.business.opportunities.length} opportunities from your website and answers`,
  `${R.strategy.objective.split(" — ")[0]} campaign · ${R.strategy.placements.join(", ")}`,
  R.budget.lines.map((l) => `${l.label} ${money(l.monthly)}`).join(" · "),
  "Written by MAIRO's AI, then checked against your facts",
  "Ready",
];

/** When each stage finishes, on the clip's clock (stages 2–4 are worked out at once, as in the product). */
const DONE = [3300, 3500, 3500, 3500, 5600, 6000];
const PROGRESS: [number, string][] = [
  [0, `Opening ${SHOP.site}`],
  [1100, "Reading the home page"],
  [1900, "Reading other pages (2 of 3)"],
  [2700, "Checking links"],
];

export function stagesAt(t: number): { stages: Stage[]; progress: string | null } {
  const stages = STAGES.map((label, i) => {
    const done = t >= DONE[i];
    const started = i === 0 || t >= DONE[i - 1];
    return { label, state: done ? "done" : started ? "working" : "waiting", detail: done ? DETAIL[i] : null } as Stage;
  });
  let progress: string | null = null;
  for (const [at, label] of PROGRESS) if (t >= at) progress = label;
  return { stages, progress: t < DONE[0] ? progress : null };
}

export const UNDERSTAND_T = { report: 7000, end: 17000 } as const;

export const UNDERSTAND_CLIP: Clip = {
  id: "understand",
  title: "MAIRO reading a fictional shop's website and saying what it understood",
  duration: UNDERSTAND_T.end,
  posterAt: 11800,
  captions: [
    { start: 0, end: 3500, text: "MAIRO reads your public website pages — nothing private, nothing posted." },
    { start: 3500, end: 7000, text: "Each step is ticked only when its work is really done." },
    { start: 7000, end: 11600, text: "Then it shows what it understood, and where each fact came from." },
    { start: 11600, end: 17000, text: "Its own ideas are labelled as suggestions — never presented as facts about you." },
  ],
  scenes: [
    {
      id: "reading",
      label: "Reading",
      start: 0,
      end: UNDERSTAND_T.report,
      world: (t: number) => {
        const s = stagesAt(t);
        return (
          <div className="px-6 pb-12 pt-10">
            <Running stages={s.stages} progress={s.progress} headingRef={HEADING} />
          </div>
        );
      },
      layoutKey: (t) => String(stagesAt(t).stages.filter((s) => s.state === "done").length),
      camera: [{ at: 0, zoom: 1, narrowZoom: 1, dur: 1 }],
    },
    {
      id: "report",
      label: "Understood",
      start: UNDERSTAND_T.report,
      end: UNDERSTAND_T.end,
      world: (_t: number, layout: ClipLayout) => (
        <div className={layout === "narrow" ? "px-3 pb-12 pt-6" : "px-8 pb-12 pt-8"}>
          <PlanReportView report={R} actions={null} headingRef={HEADING} />
        </div>
      ),
      worldWidth: { wide: 860 },
      cursor: [
        { at: 10200, cue: "text:From your website" },
        { at: 12600, cue: "text:MAIRO’s suggestion" },
        { at: 14600, cue: "text:Advertising opportunities" },
      ],
      camera: [
        { at: 7000, zoom: 1, narrowZoom: 1, dur: 1 },
        { at: 8300, cue: "#plan-business", zoom: 1, narrowZoom: 1, align: "top", dur: 1200 },
        { at: 11400, cue: "#plan-business dl", zoom: 1.05, narrowZoom: 1, align: "center" },
        { at: 14000, cue: "text:Advertising opportunities", xCue: "#plan-business", zoom: 1.05, narrowZoom: 1, align: "top" },
      ],
    },
  ],
};
