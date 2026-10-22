"use client";

import { createRef, memo, useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { buildPreview, type FactKey, type PreviewFacts } from "@/lib/preview/build";
import { exampleFacts } from "@/lib/preview/example";
import type { ScanProgress } from "@/lib/website/scan";
import { AGENTS } from "@/lib/team/agents";
import {
  WALK_CAMERA,
  WALK_CHAPTERS,
  WALK_CURSOR,
  WALK_NEW_HEADLINE,
  WALK_ONSCREEN,
  WALK_SAFE,
  WALK_SCENES,
  WALK_SITE,
  WALK_STAGE,
  WALK_T,
  WALK_WORLD,
  walkCaptionAt,
  walkEase,
  walkSceneAt,
  walkTyped,
  type WalkCameraKey,
  type WalkChapterId,
  type WalkCue,
  type WalkLayout,
} from "@/lib/demo/walkthrough";
import { FreePlanForm } from "@/components/preview/free-plan-form";
import { Discovered, GoalFieldset, Steps } from "@/components/preview/preview-flow";
import { ConceptCard, PlanView, type ConceptDemo } from "@/components/preview/plan-view";
import { ScanProgressView } from "@/components/tools/website-report";
import { primaryBtn } from "@/components/tools/ui";
import { DemoContext, Panel } from "@/components/console/kit";
import { DemoFrame, DemoScreen } from "@/components/console/demo";
import { AgentIcon } from "@/components/team/agent-ui";

// One frame of the MAIRO demo, a pure function of time. Each scene is one of
// MAIRO's own screens — the free plan form, the website read, what MAIRO
// discovered, the plan, the concept cards, approvals, the overview — laid out
// at a fixed width and driven by the clock (lib/demo/walkthrough.ts). A
// camera frames each part as it matters and a cursor moves between named
// targets found in the rendered screen, so the motion follows the real
// layout. The intro and end screen are drawn over the scenes. Everything
// shown is a sample business with sample figures; nothing here reaches a
// server.

const noop = () => {};

/** The sample business as MAIRO would have read it from its website. */
const FACTS: PreviewFacts = (() => {
  const f = exampleFacts("service");
  f.website = WALK_SITE;
  f.typeFrom = "website";
  f.destinations = { booking: null, form: true, phone: true, checkout: false };
  f.pixelSeen = false;
  for (const k of ["name", "offering", "customer", "location", "offer", "proof"] as FactKey[]) f.sources[k] = { from: "website", url: `https://${WALK_SITE}/`, quote: null };
  return f;
})();
// The sample facts are complete, so the builder always returns a plan.
const PREVIEW = buildPreview(FACTS)!;
const HEADING = createRef<HTMLHeadingElement>();

const SCAN_LABEL: Record<ScanProgress["step"], string> = {
  address: "Checking the address",
  home: "Reading the home page",
  pages: "Reading other pages",
  links: "Checking links",
  speed: "Checking speed",
  audit: "Writing up what MAIRO found",
  done: "Done",
};

// ── What each scene shows at time t ─────────────────────────────────────────

type IntroState = { site: string; goal: "" | "leads"; focus: "website" | "goal" | null; pressed: boolean };
type AnalysisState = { phase: "reading" | "found"; step: ScanProgress["step"]; done: number; shown: number; goal: "" | "leads"; pressed: boolean };
type CreativeState = { demo: ConceptDemo; edited: boolean; saved: boolean };

const within = (t: number, at: number, ms = 260) => t >= at && t < at + ms;

function introState(t: number): IntroState {
  return {
    site: walkTyped(WALK_SITE, t, WALK_T.typeSite[0], WALK_T.typeSite[1]),
    goal: t >= WALK_T.goal + 150 ? "leads" : "",
    focus: t >= 3700 && t < 6000 ? "website" : t >= WALK_T.goal && t < WALK_T.submit - 200 ? "goal" : null,
    pressed: within(t, WALK_T.submit),
  };
}

function analysisState(t: number): AnalysisState {
  let step: ScanProgress["step"] = "address";
  for (const [at, s] of WALK_T.scan) if (t >= at) step = s;
  const done = t < 9000 ? 0 : Math.min(3, 1 + Math.floor((t - 9000) / 300));
  return {
    phase: t < WALK_T.found ? "reading" : "found",
    step,
    done,
    shown: WALK_T.cards.filter((at) => t >= at).length,
    goal: t >= WALK_T.confirmGoal + 120 ? "leads" : "",
    pressed: within(t, WALK_T.build),
  };
}

function creativeState(t: number): CreativeState {
  const d = PREVIEW.directions[0];
  const pressed = within(t, WALK_T.igFeed) ? "ig-feed" : within(t, WALK_T.edit) ? "Edit headline" : within(t, WALK_T.done) ? "Done" : within(t, WALK_T.story) ? "stories" : within(t, WALK_T.save) ? "Save concept" : null;
  return {
    demo: {
      placement: t < WALK_T.igFeed + 120 ? "fb-feed" : t < WALK_T.story + 120 ? "ig-feed" : "stories",
      editing: t >= WALK_T.edit + 150 && t < WALK_T.done + 150,
      draft: t < WALK_T.typeHeadline[0] ? d.headline : walkTyped(WALK_NEW_HEADLINE, t, WALK_T.typeHeadline[0], WALK_T.typeHeadline[1]),
      pressed,
    },
    edited: t >= WALK_T.done + 150,
    saved: t >= WALK_T.save + 150,
  };
}

// ── The scenes' screens: MAIRO's components, inert ─────────────────────────

const press = (on: boolean): CSSProperties | undefined => (on ? { transform: "scale(0.96)", filter: "brightness(1.15)" } : undefined);

const IntroWorld = memo(function IntroWorld({ site, goal, focus, pressed }: IntroState) {
  return (
    <div className="px-6 pb-16 pt-8">
      <Steps step={1} />
      <section className="mx-auto max-w-[760px]">
        <p className="text-[clamp(32px,5vw,52px)] font-semibold leading-[1.04] tracking-[-0.035em] text-white">Build your free ad plan</p>
        <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-white/75">Tell us about your business, share your Instagram, or add your website — MAIRO builds a personalized advertising plan around your goals.</p>
        <div id="walk-form" className="mt-7">
          <FreePlanForm idPrefix="walk" demo={{ website: site, goal, focus, pressed }} />
        </div>
      </section>
    </div>
  );
});

const AnalysisWorld = memo(function AnalysisWorld({ phase, step, done, shown, goal, pressed }: AnalysisState) {
  if (phase === "reading") {
    return (
      <div className="px-6 pb-16 pt-8">
        <Steps step={2} />
        <section className="mx-auto max-w-[760px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-violet-bright">Step 1 · Reading your website</p>
          <p className="mt-2 text-[30px] font-semibold tracking-[-0.02em] text-white">MAIRO is reading {WALK_SITE}</p>
          <div id="walk-scan" className="mt-5">
            <ScanProgressView progress={{ step, label: SCAN_LABEL[step], ...(step === "pages" ? { done, total: 3 } : {}) }} />
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="px-6 pb-16 pt-8">
      <Steps step={3} />
      <section className="mx-auto max-w-[980px]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-violet-bright">Step 2 · What MAIRO discovered</p>
        <p data-cue="title" className="mt-2 text-[30px] font-semibold tracking-[-0.02em] text-white">Here&rsquo;s what MAIRO found</p>
        <p className="mt-2 text-[12.5px] text-white/50">
          Read from <span className="text-white/70">{WALK_SITE}</span>
        </p>
        <div data-cue="discovered">
          <Discovered facts={FACTS} shown={shown} />
        </div>
        <div id="walk-confirm" className="mt-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-violet-bright">Step 3 · Confirm the important details</p>
          <GoalFieldset value={goal} onChange={noop} />
          <div className="mt-6">
            <button type="button" className={primaryBtn} style={press(pressed)}>
              Build my free plan
            </button>
          </div>
        </div>
      </section>
    </div>
  );
});

const PlanWorld = memo(function PlanWorld() {
  return (
    <div className="px-6 pb-16 pt-8">
      <PlanView preview={PREVIEW} facts={FACTS} findings={[]} isExample={false} exampleType={null} demoArt="service" headingRef={HEADING} onEdit={noop} onRefine={noop} onSave={noop} onStartOver={noop} signUpHref="/sign-up" />
    </div>
  );
});

const CreativeWorld = memo(function CreativeWorld({ demo, edited, saved }: CreativeState) {
  return (
    <div className="px-6 pb-16 pt-8">
      <Panel id="pl-creative" title="Creative strategy & concepts">
        <p className="max-w-[820px] text-[14px] leading-relaxed text-white/80">{PREVIEW.creativeStrategy}</p>
        <p className="mt-2 text-[12.5px] text-faint">These are concepts — the words and a direction for the picture — not finished ads. You approve every ad before it runs.</p>
        <ol id="walk-grid" className="mt-5 grid gap-4 @4xl:grid-cols-3">
          {PREVIEW.directions.map((c, i) => {
            const first = i === 0;
            const words = { hook: c.hook, headline: first && edited ? WALK_NEW_HEADLINE : c.headline, body: c.primaryText };
            return (
              <ConceptCard key={c.angle} index={i} concept={c} words={words} facts={FACTS} businessName={PREVIEW.name} saved={first && saved} canSwap isExample={false} art="service" signUpHref="/sign-up" onEdit={noop} onSwap={noop} onSave={noop} demo={first ? demo : { placement: null, editing: false, draft: c.headline, pressed: null }} />
            );
          })}
        </ol>
      </Panel>
    </div>
  );
});

const ApprovalWorld = memo(function ApprovalWorld({ approved }: { approved: boolean }) {
  return (
    <div className="p-6">
      <DemoFrame view="approvals" sampleLabel={false}>
        <DemoScreen view="approvals" approved={approved} />
      </DemoFrame>
    </div>
  );
});

const ResultsWorld = memo(function ResultsWorld() {
  return (
    <div className="p-6">
      <DemoFrame view="overview" sampleLabel={false}>
        <DemoScreen view="overview" />
      </DemoFrame>
    </div>
  );
});

function World({ id, t }: { id: WalkChapterId; t: number }) {
  if (id === "intro") return <IntroWorld {...introState(t)} />;
  if (id === "analysis") return <AnalysisWorld {...analysisState(t)} />;
  if (id === "plan") return <PlanWorld />;
  if (id === "creative") return <CreativeWorld {...creativeState(t)} />;
  if (id === "approval") return <ApprovalWorld approved={t >= WALK_T.approve + 150} />;
  if (id === "results") return <ResultsWorld />;
  return null;
}

/** What changes the layout of a scene's screen — targets are measured again when it changes. */
function layoutKey(id: WalkChapterId, t: number): string {
  if (id === "analysis") return analysisState(t).phase;
  if (id === "creative") {
    const s = creativeState(t);
    return `${s.demo.placement}|${s.demo.editing}|${s.edited}|${s.saved}`;
  }
  if (id === "approval") return String(t >= WALK_T.approve + 150);
  return id;
}

// ── Finding the targets, the camera and the cursor ─────────────────────────

type Rect = { x: number; y: number; w: number; h: number };
type Measured = { rects: Record<WalkCue, Rect>; height: number };

function locate(root: HTMLElement, cue: WalkCue): HTMLElement | null {
  if (!cue.startsWith("text:")) return root.querySelector<HTMLElement>(cue);
  const want = cue.slice(5);
  let starts: HTMLElement | null = null;
  for (const el of root.querySelectorAll<HTMLElement>("button, a, label, span, h1, h2, h3, p, dt, legend")) {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text === want) return el;
    if (!starts && text.startsWith(want)) starts = el;
  }
  return starts;
}

function cuesOf(id: WalkChapterId): WalkCue[] {
  return [...new Set([...WALK_CURSOR[id].map((k) => k.cue), ...WALK_CAMERA[id].flatMap((k) => (k.cue ? [k.cue] : []))])];
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

type Cam = { tx: number; ty: number; s: number };

function cameraAt(id: WalkChapterId, t: number, layout: WalkLayout, m: Measured | null): Cam {
  const { w: SW, h: SH } = WALK_STAGE[layout];
  const WW = WALK_WORLD[layout];
  const base = SW / WW;
  const safe = WALK_SAFE[layout];
  const H = m?.height ?? SH / base;
  const target = (k: WalkCameraKey | null): Cam => {
    const s = base * (k ? (layout === "narrow" ? k.narrowZoom ?? 1 : k.zoom) : 1);
    const r = k?.cue ? m?.rects[k.cue] : undefined;
    let tx = (SW - WW * s) / 2;
    let ty = safe.top;
    if (r) {
      tx = SW / 2 - (r.x + r.w / 2) * s;
      if (k!.align === "top") ty = safe.top + 10 - r.y * s;
      else ty = safe.top + (SH - safe.top - safe.bottom) / 2 - (r.y + r.h / 2) * s;
    }
    const ww = WW * s;
    const hh = H * s;
    tx = ww <= SW ? (SW - ww) / 2 : Math.min(0, Math.max(SW - ww, tx));
    const bottom = SH - safe.bottom;
    ty = hh <= bottom - safe.top ? safe.top : Math.min(safe.top, Math.max(bottom - hh, ty));
    return { tx, ty, s };
  };
  const keys = WALK_CAMERA[id];
  if (!keys.length) return target(null);
  let i = -1;
  for (let j = 0; j < keys.length; j++) if (t >= keys[j].at) i = j;
  if (i <= 0) return target(keys[0]);
  const from = target(keys[i - 1]);
  const to = target(keys[i]);
  const p = walkEase(t, keys[i].at, keys[i].at + (keys[i].dur ?? 1100));
  return { tx: lerp(from.tx, to.tx, p), ty: lerp(from.ty, to.ty, p), s: lerp(from.s, to.s, p) };
}

type Pointer = { x: number; y: number; o: number; down: boolean; ripple: number | null };

function cursorAt(id: WalkChapterId, t: number, m: Measured | null): Pointer | null {
  if (!m) return null;
  const keys = WALK_CURSOR[id].filter((k) => m.rects[k.cue]);
  if (!keys.length) return null;
  const pt = (cue: WalkCue) => {
    const r = m.rects[cue];
    return { x: r.x + Math.min(r.w / 2, 70), y: r.y + Math.min(r.h / 2, 36) };
  };
  const first = keys[0];
  const last = keys[keys.length - 1];
  const appear = first.at - 1000;
  const vanish = last.at + 1200;
  if (t < appear - 300 || t > vanish + 300) return null;
  const o = walkEase(t, appear - 300, appear) * (1 - walkEase(t, vanish, vanish + 300));
  let x: number;
  let y: number;
  if (t <= first.at) {
    const p0 = pt(first.cue);
    const p = walkEase(t, first.at - 900, first.at);
    x = lerp(p0.x + 150, p0.x, p);
    y = lerp(p0.y + 110, p0.y, p);
  } else {
    let i = 0;
    for (let j = 0; j < keys.length; j++) if (t >= keys[j].at) i = j;
    const a = pt(keys[i].cue);
    const next = keys[i + 1];
    if (!next) {
      x = a.x;
      y = a.y;
    } else {
      const b = pt(next.cue);
      const p = walkEase(t, Math.max(keys[i].at + 300, next.at - 850), next.at);
      x = lerp(a.x, b.x, p);
      y = lerp(a.y, b.y, p) - Math.sin(p * Math.PI) * 18;
    }
  }
  const click = keys.find((k) => k.click && t >= k.at && t < k.at + 560);
  return { x, y, o, down: Boolean(click && t < click.at + 150), ripple: click ? (t - click.at) / 560 : null };
}

function SceneLayer({ id, t, layout, onMeasured }: { id: WalkChapterId; t: number; layout: WalkLayout; onMeasured?: (id: WalkChapterId, missing: string[], found: string[]) => void }) {
  const world = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Measured | null>(null);
  const key = layoutKey(id, t);
  const measure = useCallback(() => {
    const root = world.current;
    if (!root || !root.offsetWidth) return;
    const rr = root.getBoundingClientRect();
    const k = rr.width / root.offsetWidth || 1;
    const found: Record<WalkCue, Rect> = {};
    const missing: string[] = [];
    for (const cue of cuesOf(id)) {
      const el = locate(root, cue);
      const er = el?.getBoundingClientRect();
      // Not there, or there but not drawn in this layout (the plan's section list on a phone).
      if (!er || (er.width === 0 && er.height === 0)) {
        missing.push(cue);
        continue;
      }
      found[cue] = { x: (er.left - rr.left) / k, y: (er.top - rr.top) / k, w: er.width / k, h: er.height / k };
    }
    // A target that isn't on screen in this state keeps where it last was, so the cursor can still leave it.
    setM((prev) => ({ rects: { ...(prev?.rects ?? {}), ...found }, height: root.offsetHeight }));
    onMeasured?.(id, missing, Object.keys(found));
  }, [id, onMeasured]);
  useLayoutEffect(() => {
    measure();
  }, [measure, key, layout]);
  useLayoutEffect(() => {
    const root = world.current;
    if (!root) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    void document.fonts?.ready.then(() => measure());
    return () => ro.disconnect();
  }, [measure]);

  const scene = WALK_SCENES.find((s) => s.id === id)!;
  const fadeIn = id === "intro" ? walkEase(t, WALK_T.formIn, WALK_T.formIn + 600) : walkEase(t, scene.start - 400, scene.start + 150);
  const fadeOut = id === "results" ? 1 - walkEase(t, WALK_T.endIn, WALK_T.endIn + 700) : 1 - walkEase(t, scene.end - 300, scene.end + 200);
  const cam = cameraAt(id, t, layout, m);
  const pointer = cursorAt(id, t, m);
  return (
    <div className="absolute inset-0" style={{ opacity: Math.min(fadeIn, fadeOut) }}>
      <div ref={world} inert className="absolute left-0 top-0 origin-top-left" style={{ width: WALK_WORLD[layout], transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})` }}>
        <World id={id} t={t} />
      </div>
      {pointer && pointer.o > 0.01 && <Cursor x={cam.tx + pointer.x * cam.s} y={cam.ty + pointer.y * cam.s} o={pointer.o} down={pointer.down} ripple={pointer.ripple} />}
    </div>
  );
}

function Cursor({ x, y, o, down, ripple }: { x: number; y: number; o: number; down: boolean; ripple: number | null }) {
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-20" style={{ transform: `translate(${x}px, ${y}px)`, opacity: o }}>
      {ripple !== null && <span className="absolute rounded-full border-2 border-white/70" style={{ width: 44, height: 44, left: -22, top: -22, transform: `scale(${0.3 + ripple * 0.9})`, opacity: 1 - ripple }} />}
      <svg width="22" height="26" viewBox="0 0 22 26" className="absolute -left-[3px] -top-[2px] drop-shadow-[0_4px_10px_rgba(0,0,0,0.55)]" style={{ transform: down ? "scale(0.86)" : undefined, transformOrigin: "3px 2px" }}>
        <path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.5 L11.7 15 L18.6 14.6 Z" fill="#fff" stroke="#121212" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── Drawn over the scenes ──────────────────────────────────────────────────

function Backdrop({ t }: { t: number }) {
  const drift = Math.sin(t / 2400) * 6;
  return <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(ellipse 60% 45% at ${50 + drift}% 34%, rgba(255,255,255,0.34), transparent 70%), radial-gradient(ellipse 45% 35% at ${78 - drift}% 88%, rgba(210,210,210,0.22), transparent 70%), #0a0a0a` }} />;
}

function Wordmark({ size }: { size: number }) {
  return (
    <span className="font-light text-white" style={{ fontSize: size, letterSpacing: "0.42em", paddingLeft: "0.42em" }}>
      MAIRO
    </span>
  );
}

function TitleCard({ t, narrow }: { t: number; narrow: boolean }) {
  const o = 1 - walkEase(t, WALK_T.titleOut - 200, WALK_T.titleOut + 400);
  if (o <= 0.001) return null;
  const mark = walkEase(t, 200, 900);
  const meet = walkEase(t, 800, 1700);
  const sub = walkEase(t, 1500, 2200);
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center" style={{ opacity: o }}>
      <Backdrop t={t} />
      <div className="relative" style={{ opacity: mark, transform: `translateY(${(1 - mark) * 10}px)` }}>
        <Wordmark size={narrow ? 15 : 17} />
      </div>
      <p className="relative mt-5 font-semibold text-white" style={{ fontSize: narrow ? 44 : 76, lineHeight: 1, letterSpacing: `${-0.04 + 0.14 * (1 - meet)}em`, opacity: meet, transform: `scale(${1.05 - 0.05 * meet})`, textShadow: "0 0 50px rgba(255,255,255,0.5)" }}>
        {WALK_ONSCREEN.intro}
      </p>
      <p className="relative mt-4 bg-gradient-to-r from-[#ffffff] via-[#ffffff] to-[#f6f6f6] bg-clip-text font-semibold text-transparent" style={{ fontSize: narrow ? 20 : 28, opacity: sub, transform: `translateY(${(1 - sub) * 10}px)` }}>
        {WALK_ONSCREEN.introSub}
      </p>
    </div>
  );
}

function EndScreen({ t, narrow }: { t: number; narrow: boolean }) {
  const o = walkEase(t, WALK_T.endIn, WALK_T.endIn + 800);
  if (o <= 0.001) return null;
  const title = walkEase(t, 65400, 66300);
  const cta = walkEase(t, 67900, 68700);
  const glow = 0.4 + 0.15 * walkEase(t, 68700, 70500);
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center" style={{ opacity: o }}>
      <Backdrop t={t} />
      <div className="relative">
        <Wordmark size={narrow ? 13 : 15} />
      </div>
      <p className="relative mt-5 max-w-[760px] font-semibold leading-[1.02] tracking-[-0.04em] text-white [text-wrap:balance]" style={{ fontSize: narrow ? 34 : 54, opacity: title, transform: `translateY(${(1 - title) * 14}px)` }}>
        {WALK_ONSCREEN.end}
      </p>
      <ul className={`relative mt-7 grid gap-x-4 gap-y-3 ${narrow ? "grid-cols-4" : "grid-cols-8"}`}>
        {AGENTS.map((a, i) => {
          const r = walkEase(t, 66300 + i * 140, 66800 + i * 140);
          return (
            <li key={a.role} className="flex w-[72px] flex-col items-center gap-1.5" style={{ opacity: r, transform: `translateY(${(1 - r) * 10}px)` }}>
              <AgentIcon role={a.role} size={narrow ? 30 : 36} />
              <span className="text-[10px] leading-tight text-white/65">{a.name.replace(/ Agent$/, "")}</span>
            </li>
          );
        })}
      </ul>
      <div className="relative mt-8 flex flex-col items-center" style={{ opacity: cta, transform: `scale(${0.96 + 0.04 * cta})` }}>
        <span className="inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-7 text-[17px] font-semibold text-black" style={{ boxShadow: `0 0 48px rgba(47,107,255,${glow}), 0 18px 40px -16px rgba(210,210,210,0.6)` }}>
          {WALK_ONSCREEN.cta} <span aria-hidden>→</span>
        </span>
        <span className="mt-3 text-[12px] text-white/60">{WALK_ONSCREEN.ctaNote}</span>
      </div>
    </div>
  );
}

/** The scene's name as it starts: "02 · MAIRO reads your business". */
function SceneTitle({ t, narrow }: { t: number; narrow: boolean }) {
  const scene = walkSceneAt(t);
  const n = WALK_SCENES.indexOf(scene);
  if (scene.id === "intro" || scene.id === "ready") return null;
  const o = walkEase(t, scene.start + 200, scene.start + 600) * (1 - walkEase(t, scene.start + 2800, scene.start + 3200));
  if (o <= 0.01) return null;
  return (
    <p className="absolute right-3 top-3 z-40 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white" style={{ opacity: o }}>
      <span className="text-[#ffffff]">{String(n + 1).padStart(2, "0")}</span> · {narrow ? WALK_CHAPTERS[n].label : scene.label}
    </p>
  );
}

export function WalkthroughStage({ t, layout, showCaption = true, onMeasured }: { t: number; layout: WalkLayout; showCaption?: boolean; onMeasured?: (id: WalkChapterId, missing: string[], found: string[]) => void }) {
  const { w, h } = WALK_STAGE[layout];
  const narrow = layout === "narrow";
  const cap = walkCaptionAt(t);
  const capO = walkEase(t, cap.start, cap.start + 300) * (1 - walkEase(t, cap.end - 200, cap.end));
  // Only the scenes near t are drawn.
  const live = WALK_SCENES.filter((s) => s.id !== "ready" && t >= s.start - 600 && t < s.end + 600);
  return (
    <div className="relative overflow-hidden text-left" style={{ width: w, height: h, background: "#0a0a0a", backgroundImage: "var(--mairo-atmosphere)" }}>
      <DemoContext.Provider value>
        {live.map((s) => (
          <SceneLayer key={`${s.id}-${layout}`} id={s.id} t={t} layout={layout} onMeasured={onMeasured} />
        ))}
      </DemoContext.Provider>
      <TitleCard t={t} narrow={narrow} />
      <EndScreen t={t} narrow={narrow} />
      <SceneTitle t={t} narrow={narrow} />
      {showCaption && (
        <p aria-hidden className={`pointer-events-none absolute bottom-3 left-4 right-4 z-40 text-center font-medium leading-snug text-white ${narrow ? "text-[12.5px]" : "text-[14px]"}`} style={{ opacity: capO }}>
          <span className="box-decoration-clone rounded-md bg-black/70 px-2.5 py-1">{cap.text}</span>
        </p>
      )}
    </div>
  );
}
