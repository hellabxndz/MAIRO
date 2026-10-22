"use client";

import { createRef } from "react";
import { PlanReportView } from "@/components/plan-generator/plan-report";
import { AgentIcon } from "@/components/team/agent-ui";
import { AGENTS } from "@/lib/team/agents";
import { ease, type ClipLayout } from "@/lib/demo/clip";
import { SHOP_REPORT } from "@/lib/demo/shop-sample";
import { UNDERSTAND_CLIP } from "./understand";
import { CREATIVE_CLIP } from "./creative";
import { CAMPAIGN_SCENES } from "./campaign";
import { DASHBOARD_CLIP } from "./dashboard";
import { OPTIMIZE_CLIP } from "./optimize";
import type { Clip, ClipScene } from "./stage";

// "Meet your AI advertising team." — the 74-second product film: one
// fictional shop from its website to its first recommendation. It's made of
// the clips' own scenes (the same components, the same sample business),
// cut together on one clock, between a title card and the end card. Every
// frame carries the sample-data label; the narration is the captions until a
// licensed voice records it.

const HEADING = createRef<HTMLHeadingElement>();

/** A stretch of a clip's scene, [from, to) on its own clock, placed at `at` on the film's. */
function cut(scene: ClipScene, from: number, to: number, at: number, label: string): ClipScene {
  const d = at - from;
  const keys = scene.camera ?? [];
  const before = keys.filter((k) => k.at <= from);
  const opening = before.length ? before[before.length - 1] : keys[0];
  return {
    ...scene,
    id: `${scene.id}@${at}`,
    label,
    start: at,
    end: at + (to - from),
    world: (t, l) => scene.world(t - d, l),
    layoutKey: scene.layoutKey ? (t) => scene.layoutKey!(t - d) : undefined,
    cursor: (scene.cursor ?? []).filter((k) => k.at >= from + 300 && k.at < to - 200).map((k) => ({ ...k, at: k.at + d })),
    camera: [...(opening ? [{ ...opening, at, dur: 1 }] : []), ...keys.filter((k) => k.at > from && k.at < to).map((k) => ({ ...k, at: k.at + d }))],
  };
}

const scene = (c: Clip, id: string) => c.scenes.find((s) => s.id === id)!;
const campaign = (id: string) => CAMPAIGN_SCENES.find((s) => s.id === id)!;

export const FILM_T = { titleOut: 4500, end: 74000, endIn: 66000 } as const;

const strategy: ClipScene = {
  id: "strategy",
  label: "Strategy",
  start: 15500,
  end: 24000,
  worldWidth: { wide: 860 },
  world: (_t: number, layout: ClipLayout) => (
    <div className={layout === "narrow" ? "px-3 pb-12 pt-6" : "px-8 pb-12 pt-8"}>
      <PlanReportView report={SHOP_REPORT} actions={null} headingRef={HEADING} />
    </div>
  ),
  cursor: [{ at: 21200, cue: "#plan-budget >> text:Prospecting" }],
  camera: [
    { at: 15500, cue: "#plan-strategy", zoom: 1, narrowZoom: 1, align: "top", dur: 1 },
    { at: 19300, cue: "#plan-budget", zoom: 1, narrowZoom: 1, align: "top", dur: 1200 },
  ],
};

const SCENES: ClipScene[] = [
  { id: "intro", label: "Intro", start: 0, end: FILM_T.titleOut, chip: false, world: () => <div className="h-[700px]" /> },
  cut(scene(UNDERSTAND_CLIP, "reading"), 0, 6800, 4500, "Discovery"),
  cut(scene(UNDERSTAND_CLIP, "report"), 8000, 12200, 11300, "Discovery"),
  strategy,
  cut(scene(CREATIVE_CLIP, "studio"), 3000, 14600, 24000, "Creative"),
  cut(campaign("connect"), 0, 3600, 35600, "Campaign"),
  cut(campaign("goal"), 3800, 7900, 39200, "Campaign"),
  cut(campaign("launch"), 19400, 23000, 43300, "Approval"),
  cut(campaign("launch"), 23000, 26300, 46900, "Approval"),
  cut(scene(DASHBOARD_CLIP, "dashboard"), 0, 3100, 50200, "Dashboard"),
  cut(scene(DASHBOARD_CLIP, "dashboard"), 8800, 11600, 53300, "Dashboard"),
  cut(scene(OPTIMIZE_CLIP, "decision"), 5600, 15600, 56100, "Recommendations"),
  { id: "ready", label: "Ready", start: 66100, end: FILM_T.end, chip: false, world: () => <div className="h-[700px]" /> },
];

// ── Title and end cards ────────────────────────────────────────────────────

function Backdrop({ t }: { t: number }) {
  const drift = Math.sin(t / 2400) * 5;
  return <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(ellipse 60% 45% at ${50 + drift}% 34%, rgba(255,255,255,0.30), transparent 70%), radial-gradient(ellipse 45% 35% at ${78 - drift}% 88%, rgba(255,255,255,0.10), transparent 70%), #090909` }} />;
}

function Wordmark({ size }: { size: number }) {
  return (
    <span className="font-light text-white" style={{ fontSize: size, letterSpacing: "0.42em", paddingLeft: "0.42em" }}>
      MAIRO
    </span>
  );
}

function TitleCard({ t, narrow }: { t: number; narrow: boolean }) {
  const o = 1 - ease(t, FILM_T.titleOut - 500, FILM_T.titleOut);
  if (o <= 0.001) return null;
  const mark = ease(t, 200, 900);
  const head = ease(t, 800, 1800);
  const sub = ease(t, 1600, 2400);
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center" style={{ opacity: o }}>
      <Backdrop t={t} />
      <div className="relative" style={{ opacity: mark }}>
        <Wordmark size={narrow ? 14 : 16} />
      </div>
      <p className="relative mt-5 max-w-[760px] font-semibold leading-[1.02] tracking-[-0.04em] text-white [text-wrap:balance]" style={{ fontSize: narrow ? 36 : 60, opacity: head, transform: `translateY(${(1 - head) * 12}px)` }}>
        Meet your AI advertising team.
      </p>
      <p className="relative mt-4 max-w-[560px] text-white/70" style={{ fontSize: narrow ? 15 : 19, opacity: sub }}>
        From your first idea to your next campaign, see how MAIRO makes advertising simpler.
      </p>
    </div>
  );
}

function EndCard({ t, narrow }: { t: number; narrow: boolean }) {
  const o = ease(t, FILM_T.endIn, FILM_T.endIn + 700);
  if (o <= 0.001) return null;
  const title = ease(t, 66700, 67600);
  const cta = ease(t, 69000, 69800);
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center" style={{ opacity: o }}>
      <Backdrop t={t} />
      <div className="relative">
        <Wordmark size={narrow ? 13 : 15} />
      </div>
      <p className="relative mt-5 max-w-[760px] font-semibold leading-[1.02] tracking-[-0.04em] text-white [text-wrap:balance]" style={{ fontSize: narrow ? 34 : 54, opacity: title, transform: `translateY(${(1 - title) * 12}px)` }}>
        Your AI advertising team is ready.
      </p>
      <ul className={`relative mt-7 grid gap-x-4 gap-y-3 ${narrow ? "grid-cols-4" : "grid-cols-8"}`}>
        {AGENTS.map((a, i) => {
          const r = ease(t, 67600 + i * 130, 68100 + i * 130);
          return (
            <li key={a.role} className="flex w-[72px] flex-col items-center gap-1.5" style={{ opacity: r, transform: `translateY(${(1 - r) * 8}px)` }}>
              <AgentIcon role={a.role} size={narrow ? 30 : 34} />
              <span className="text-[10px] leading-tight text-white/65">{a.name.replace(/ Agent$/, "")}</span>
            </li>
          );
        })}
      </ul>
      <div className="relative mt-8 flex flex-col items-center" style={{ opacity: cta, transform: `scale(${0.96 + 0.04 * cta})` }}>
        <span className="inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-7 text-[17px] font-semibold text-black shadow-[0_18px_44px_-16px_rgba(255,255,255,0.8)]">
          Build Your Free Ad Plan <span aria-hidden>→</span>
        </span>
        <span className="mt-3 text-[12px] text-white/60">Free · No credit card · Nothing runs until you approve it</span>
      </div>
    </div>
  );
}

export const FILM_CLIP: Clip = {
  id: "film",
  title: "MAIRO product film: a fictional shop from its website to its first recommendation",
  duration: FILM_T.end,
  posterAt: 2600,
  chapters: true,
  captions: [
    { start: 0, end: 4500, text: "Advertising your business shouldn't mean learning a complicated ad manager." },
    { start: 4500, end: 11300, text: "Start with your website. MAIRO reads your public pages, and ticks each step only when it's done." },
    { start: 11300, end: 15500, text: "It shows what it understood — facts kept apart from its suggestions." },
    { start: 15500, end: 24000, text: "Your free plan: more online sales, with $1,000 a month divided across your campaign. A plan, not a forecast." },
    { start: 24000, end: 29400, text: "Ad concepts are free, and every word is yours to change." },
    { start: 29400, end: 35600, text: "With a subscription, MAIRO makes the finished picture — one credit, used only if it's made." },
    { start: 35600, end: 39200, text: "Subscribe, and connect your own Meta ad account. Ad spend goes to Meta, separately." },
    { start: 39200, end: 43300, text: "MAIRO builds the campaign as a draft, starting from your plan." },
    { start: 43300, end: 50200, text: "Nothing runs until you approve it — and it's shown live only once Meta confirms." },
    { start: 50200, end: 56100, text: "Your results in one place. Sample data shown." },
    { start: 56100, end: 66100, text: "Your AI team recommends what's next, with the evidence — and waits for your yes." },
    { start: 66100, end: 74000, text: "Your AI advertising team is ready. Build your free ad plan." },
  ],
  scenes: SCENES,
  overlay: (t, layout) => (
    <>
      <TitleCard t={t} narrow={layout === "narrow"} />
      <EndCard t={t} narrow={layout === "narrow"} />
    </>
  ),
};
