"use client";

import { createRef } from "react";
import { PlanReportView } from "@/components/plan-generator/plan-report";
import type { ClipLayout } from "@/lib/demo/clip";
import { SHOP_REPORT } from "@/lib/demo/shop-sample";
import type { Clip } from "./stage";

// "Build your advertising plan." — the free plan's strategy for the sample
// shop, as the generator's own report shows it: the objective, the audience
// and placements, what the ads should say, how the campaign is structured,
// then the monthly budget divided for the goal. One business, one plan, the
// same report a visitor gets — no figure here is a result.

const HEADING = createRef<HTMLHeadingElement>();

export const PLAN_T = { messaging: 4200, budget: 8600, end: 16500 } as const;

export const PLAN_CLIP: Clip = {
  id: "plan",
  title: "MAIRO's free plan for a fictional shop: strategy, structure and budget",
  duration: PLAN_T.end,
  posterAt: 2200,
  captions: [
    { start: 0, end: PLAN_T.messaging, text: "From what it understood, MAIRO plans your first Meta campaign: the objective, who to reach, and where." },
    { start: PLAN_T.messaging, end: PLAN_T.budget, text: "It says what the ads should say and how the campaign is structured — each with its reason." },
    { start: PLAN_T.budget, end: 12800, text: "Your monthly budget, divided for your goal — paid to Meta from your own ad account." },
    { start: 12800, end: PLAN_T.end, text: "A recommendation, not a forecast. Nothing is spent until you approve a campaign." },
  ],
  scenes: [
    {
      id: "plan",
      label: "Your plan",
      start: 0,
      end: PLAN_T.end,
      worldWidth: { wide: 860 },
      world: (_t: number, layout: ClipLayout) => (
        <div className={layout === "narrow" ? "px-3 pb-12 pt-6" : "px-8 pb-12 pt-8"}>
          <PlanReportView report={SHOP_REPORT} actions={null} headingRef={HEADING} />
        </div>
      ),
      cursor: [
        { at: 1600, cue: "#plan-strategy >> text:Campaign objective" },
        { at: 3000, cue: "#plan-strategy >> text:Audience" },
        { at: 6200, cue: "#plan-strategy >> text:Campaign structure" },
        { at: 11000, cue: "#plan-budget >> text:Prospecting" },
        { at: 13800, cue: "#plan-budget >> text:Retargeting" },
      ],
      camera: [
        { at: 0, cue: "#plan-strategy", zoom: 1, narrowZoom: 1, align: "top", dur: 1 },
        { at: PLAN_T.messaging + 400, cue: "#plan-strategy >> text:What the ads should say", zoom: 1, narrowZoom: 1, align: "top", dur: 1200 },
        { at: PLAN_T.budget + 300, cue: "#plan-budget", zoom: 1, narrowZoom: 1, align: "top", dur: 1200 },
        { at: 12600, cue: "#plan-budget ul", zoom: 1, narrowZoom: 1, align: "center", dur: 1200 },
      ],
    },
  ],
};
