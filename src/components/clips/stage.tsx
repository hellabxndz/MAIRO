"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CLIP_SAFE, CLIP_STAGE, CLIP_WORLD, captionAt, ease, type CameraKey, type Caption, type ClipId, type ClipLayout, type Cue, type CursorKey } from "@/lib/demo/clip";
import { DemoContext } from "@/components/console/kit";

// One frame of a product clip, a pure function of time. Each scene is one of
// MAIRO's own screens laid out at a fixed width and driven by the clip's
// clock; a camera frames what matters and a cursor moves between named
// targets found in the rendered screen, so the motion follows the real
// layout when the components change. Generalised from the walkthrough's
// stage (components/walkthrough/walkthrough-stage.tsx).
//
// Every frame carries the sample-data label. Nothing here reaches a server:
// the screens are inert.

export type ClipScene = {
  id: string;
  /** The chapter's name, shown as the scene starts. */
  label: string;
  start: number;
  end: number;
  /** The screen at time t — MAIRO's components, fed sample data. */
  world: (t: number, layout: ClipLayout) => ReactNode;
  /** What changes the screen's layout: targets are measured again when it changes. */
  layoutKey?: (t: number) => string;
  cursor?: CursorKey[];
  camera?: CameraKey[];
  /** A screen laid out wider or narrower than the default. */
  worldWidth?: Partial<Record<ClipLayout, number>>;
  /** False for a scene that isn't a chapter of its own (the film's title and end cards). */
  chip?: boolean;
};

export type Clip = {
  id: ClipId;
  /** What the clip shows, for its accessible name. */
  title: string;
  duration: number;
  scenes: ClipScene[];
  captions: Caption[];
  /** Drawn over the scenes: title and end cards. */
  overlay?: (t: number, layout: ClipLayout) => ReactNode;
  /** Name each scene as it starts (the film); short clips leave it off. */
  chapters?: boolean;
  /** Where a poster is taken from, in ms. */
  posterAt: number;
};

type Rect = { x: number; y: number; w: number; h: number };
type Measured = { rects: Record<Cue, Rect>; height: number };

function locate(root: HTMLElement, cue: Cue): HTMLElement | null {
  // "aside >> text:Campaigns": the text, looked for only inside the first match of the selector.
  const scoped = cue.indexOf(" >> ");
  if (scoped > 0) {
    // The first one that's drawn in this layout (the sidebar is hidden on a phone).
    const within = [...root.querySelectorAll<HTMLElement>(cue.slice(0, scoped))].find((el) => el.getClientRects().length > 0);
    return within ? locate(within, cue.slice(scoped + 4)) : null;
  }
  if (!cue.startsWith("text:")) return root.querySelector<HTMLElement>(cue);
  const want = cue.slice(5);
  let starts: HTMLElement | null = null;
  for (const el of root.querySelectorAll<HTMLElement>("button, a, label, span, h1, h2, h3, p, dt, legend, li")) {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text === want) return el;
    if (!starts && text.startsWith(want)) starts = el;
  }
  return starts;
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
type Cam = { tx: number; ty: number; s: number };

function cameraAt(scene: ClipScene, t: number, layout: ClipLayout, m: Measured | null): Cam {
  const { w: SW, h: SH } = CLIP_STAGE[layout];
  const WW = scene.worldWidth?.[layout] ?? CLIP_WORLD[layout];
  const base = SW / WW;
  const safe = CLIP_SAFE[layout];
  const H = m?.height ?? SH / base;
  const target = (k: CameraKey | null): Cam => {
    const s = base * (k ? (layout === "narrow" ? (k.narrowZoom ?? 1) : k.zoom) : 1);
    const r = k?.cue ? m?.rects[k.cue] : undefined;
    let tx = (SW - WW * s) / 2;
    let ty = safe.top;
    if (r) {
      const rx = (k!.xCue && m?.rects[k!.xCue]) || r;
      tx = SW / 2 - (rx.x + rx.w / 2) * s;
      ty = k!.align === "top" ? safe.top + 10 - r.y * s : safe.top + (SH - safe.top - safe.bottom) / 2 - (r.y + r.h / 2) * s;
    }
    const ww = WW * s;
    const hh = H * s;
    tx = ww <= SW ? (SW - ww) / 2 : Math.min(0, Math.max(SW - ww, tx));
    const bottom = SH - safe.bottom;
    ty = hh <= bottom - safe.top ? safe.top : Math.min(safe.top, Math.max(bottom - hh, ty));
    return { tx, ty, s };
  };
  const keys = scene.camera ?? [];
  if (!keys.length) return target(null);
  let i = -1;
  for (let j = 0; j < keys.length; j++) if (t >= keys[j].at) i = j;
  if (i <= 0) return target(keys[0]);
  const from = target(keys[i - 1]);
  const to = target(keys[i]);
  const p = ease(t, keys[i].at, keys[i].at + (keys[i].dur ?? 1100));
  return { tx: lerp(from.tx, to.tx, p), ty: lerp(from.ty, to.ty, p), s: lerp(from.s, to.s, p) };
}

type Pointer = { x: number; y: number; o: number; down: boolean; ripple: number | null };

function cursorAt(scene: ClipScene, t: number, m: Measured | null): Pointer | null {
  if (!m) return null;
  const keys = (scene.cursor ?? []).filter((k) => m.rects[k.cue]);
  if (!keys.length) return null;
  const pt = (cue: Cue) => {
    const r = m.rects[cue];
    return { x: r.x + Math.min(r.w / 2, 70), y: r.y + Math.min(r.h / 2, 30) };
  };
  const first = keys[0];
  const last = keys[keys.length - 1];
  const appear = first.at - 900;
  const vanish = last.at + 1000;
  if (t < appear - 300 || t > vanish + 300) return null;
  const o = ease(t, appear - 300, appear) * (1 - ease(t, vanish, vanish + 300));
  let x: number;
  let y: number;
  if (t <= first.at) {
    const p0 = pt(first.cue);
    const p = ease(t, first.at - 800, first.at);
    x = lerp(p0.x + 140, p0.x, p);
    y = lerp(p0.y + 100, p0.y, p);
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
      const p = ease(t, Math.max(keys[i].at + 250, next.at - 800), next.at);
      x = lerp(a.x, b.x, p);
      y = lerp(a.y, b.y, p) - Math.sin(p * Math.PI) * 16;
    }
  }
  const click = keys.find((k) => k.click && t >= k.at && t < k.at + 520);
  return { x, y, o, down: Boolean(click && t < click.at + 140), ripple: click ? (t - click.at) / 520 : null };
}

function cuesOf(scene: ClipScene): Cue[] {
  return [...new Set([...(scene.cursor ?? []).map((k) => k.cue), ...(scene.camera ?? []).flatMap((k) => [k.cue, k.xCue].filter((c): c is Cue => Boolean(c)))])];
}

function SceneLayer({ scene, t, layout, first, last, onMeasured }: { scene: ClipScene; t: number; layout: ClipLayout; first: boolean; last: boolean; onMeasured?: (id: string, missing: string[], found: string[]) => void }) {
  const world = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Measured | null>(null);
  const key = scene.layoutKey?.(t) ?? scene.id;
  const measure = useCallback(() => {
    const root = world.current;
    if (!root || !root.offsetWidth) return;
    const rr = root.getBoundingClientRect();
    const k = rr.width / root.offsetWidth || 1;
    const found: Record<Cue, Rect> = {};
    const missing: string[] = [];
    for (const cue of cuesOf(scene)) {
      const el = locate(root, cue);
      const er = el?.getBoundingClientRect();
      if (!er || (er.width === 0 && er.height === 0)) {
        missing.push(cue);
        continue;
      }
      found[cue] = { x: (er.left - rr.left) / k, y: (er.top - rr.top) / k, w: er.width / k, h: er.height / k };
    }
    // A target that isn't on screen in this state keeps where it last was, so the cursor can still leave it.
    setM((prev) => ({ rects: { ...(prev?.rects ?? {}), ...found }, height: root.offsetHeight }));
    onMeasured?.(scene.id, missing, Object.keys(found));
  }, [scene, onMeasured]);
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

  // One screen gives way to the next — out, then in — so two never show through each other.
  const fadeIn = first ? 1 : ease(t, scene.start, scene.start + 380);
  const fadeOut = last ? 1 : 1 - ease(t, scene.end - 380, scene.end);
  const cam = cameraAt(scene, t, layout, m);
  const pointer = cursorAt(scene, t, m);
  return (
    <div className="absolute inset-0" style={{ opacity: Math.min(fadeIn, fadeOut) }}>
      <div ref={world} inert className="absolute left-0 top-0 origin-top-left" style={{ width: scene.worldWidth?.[layout] ?? CLIP_WORLD[layout], transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})` }}>
        {scene.world(t, layout)}
      </div>
      {pointer && pointer.o > 0.01 && <Cursor x={cam.tx + pointer.x * cam.s} y={cam.ty + pointer.y * cam.s} o={pointer.o} down={pointer.down} ripple={pointer.ripple} />}
    </div>
  );
}

function Cursor({ x, y, o, down, ripple }: { x: number; y: number; o: number; down: boolean; ripple: number | null }) {
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-20" style={{ transform: `translate(${x}px, ${y}px)`, opacity: o }}>
      {ripple !== null && <span className="absolute rounded-full border-2 border-white/70" style={{ width: 42, height: 42, left: -21, top: -21, transform: `scale(${0.3 + ripple * 0.9})`, opacity: 1 - ripple }} />}
      <svg width="22" height="26" viewBox="0 0 22 26" className="absolute -left-[3px] -top-[2px] drop-shadow-[0_4px_10px_rgba(0,0,0,0.55)]" style={{ transform: down ? "scale(0.86)" : undefined, transformOrigin: "3px 2px" }}>
        <path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.5 L11.7 15 L18.6 14.6 Z" fill="#fff" stroke="#05070d" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function ChapterChip({ clip, t, narrow }: { clip: Clip; t: number; narrow: boolean }) {
  const scene = clip.scenes.find((s) => t >= s.start && t < s.end);
  if (!scene || scene.chip === false) return null;
  // Numbered by chapter, and shown as a chapter starts — not again at each cut within it.
  const chapters = [...new Set(clip.scenes.filter((s) => s.chip !== false).map((s) => s.label))];
  const first = clip.scenes.find((s) => s.label === scene.label)!;
  if (first !== scene && clip.scenes[clip.scenes.indexOf(scene) - 1]?.label === scene.label) return null;
  const n = chapters.indexOf(scene.label);
  const o = ease(t, scene.start + 200, scene.start + 600) * (1 - ease(t, scene.start + 2900, scene.start + 3300));
  if (o <= 0.01) return null;
  return (
    <p className={`absolute z-40 rounded-full border border-white/15 bg-[#05070d]/75 px-2.5 py-1 font-semibold uppercase tracking-[0.14em] text-white ${narrow ? "left-3 top-10 text-[9.5px]" : "right-3 top-3 text-[11px]"}`} style={{ opacity: o }}>
      <span className="text-[#7fb0ff]">{String(n + 1).padStart(2, "0")}</span> · {scene.label}
    </p>
  );
}

/** The burned-in label: on every frame, so a still or a clip on its own still says what it is. */
export function SampleBadge({ narrow }: { narrow: boolean }) {
  return (
    <p className={`absolute left-3 top-3 z-50 rounded-full border border-amber-200/35 bg-[#05070d]/80 px-2.5 py-1 font-semibold text-amber-100 ${narrow ? "text-[9.5px]" : "text-[11px]"}`}>
      Product demo · fictional business · sample data
    </p>
  );
}

export function ClipStage({ clip, t, layout, showCaption = false, onMeasured }: { clip: Clip; t: number; layout: ClipLayout; showCaption?: boolean; onMeasured?: (id: string, missing: string[], found: string[]) => void }) {
  const { w, h } = CLIP_STAGE[layout];
  const narrow = layout === "narrow";
  const cap = showCaption ? captionAt(clip.captions, t) : null;
  const capO = cap ? ease(t, cap.start, cap.start + 250) * (1 - ease(t, cap.end - 200, cap.end)) : 0;
  // Only the scenes near t are drawn.
  const live = clip.scenes.filter((s) => t >= s.start - 50 && t < s.end + 50);
  return (
    <div className="relative overflow-hidden text-left" style={{ width: w, height: h, background: "#05070d", backgroundImage: "var(--mairo-atmosphere)" }}>
      <DemoContext.Provider value>
        {live.map((s) => (
          <SceneLayer key={`${s.id}-${layout}`} scene={s} t={t} layout={layout} first={s === clip.scenes[0]} last={s === clip.scenes[clip.scenes.length - 1]} onMeasured={onMeasured} />
        ))}
      </DemoContext.Provider>
      {clip.overlay?.(t, layout)}
      {clip.chapters && <ChapterChip clip={clip} t={t} narrow={narrow} />}
      <SampleBadge narrow={narrow} />
      {cap && (
        <p aria-hidden className={`pointer-events-none absolute bottom-3 left-4 right-4 z-40 text-center font-medium leading-snug text-white ${narrow ? "text-[12.5px]" : "text-[14px]"}`} style={{ opacity: capO }}>
          <span className="box-decoration-clone rounded-md bg-black/70 px-2.5 py-1">{cap.text}</span>
        </p>
      )}
    </div>
  );
}
