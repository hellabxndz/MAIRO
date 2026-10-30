"use client";

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { ELECTRIC, ELECTRIC_ON_LIGHT, ParticleEngine, webgl2Available } from "./engine";
import type { Points } from "@/lib/cinematic/shapes";

// The canvas the particles live on, and the loop that moves them.
//
// Whoever owns the stage (the homepage's scroll director, the dashboard's
// MAIRO core) writes where the particles should be into `target`; the loop
// eases toward it every frame, so a scroll or a state change becomes a
// glide rather than a jump. The loop is careful with the machine:
//
//   - stops completely when the stage is hidden, off screen or in a
//     background tab, and starts again when it's back
//   - holds 30 fps on weaker devices
//   - under "reduce motion" there is no drift, swirl or easing: the
//     particles jump to each new shape and the canvas only redraws when the
//     target changes
//   - without WebGL2 (or if the GPU drops the context) it shows `fallback`
//     instead, so nothing on the page depends on the canvas

export type StageTarget = {
  /** The shapes in order; `pos` is a position along them (1.5 = halfway from the 2nd to the 3rd). */
  seq: string[];
  pos: number;
  energy: number;
  pulse: number;
  turbulence: number;
  disperse: number;
  /** How fast it turns on its own, 0 for shapes that face the viewer (text). */
  spin: number;
  yaw: number;
  pitch: number;
  distance: number;
  size: number;
  gain: number;
  focus: number;
  offsetX: number;
  offsetY: number;
  /** Whether it should be drawn at all. */
  visible: boolean;
};

export const DEFAULT_TARGET: StageTarget = {
  seq: ["core"],
  pos: 0,
  energy: 0,
  pulse: 0,
  turbulence: 0.35,
  disperse: 0,
  spin: 1,
  yaw: 0,
  pitch: 0.18,
  distance: 6,
  size: 0.068,
  gain: 1,
  focus: 6,
  offsetX: 0,
  offsetY: 0,
  visible: true,
};

type Num = Exclude<keyof StageTarget, "seq" | "visible">;
const EASED: Num[] = ["energy", "pulse", "turbulence", "disperse", "spin", "yaw", "pitch", "distance", "size", "gain", "focus", "offsetX", "offsetY"];

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ParticleStage({
  target,
  count,
  shapes,
  className = "",
  style,
  fallback = null,
  weak = false,
  pointer = true,
  label,
}: {
  target: MutableRefObject<StageTarget>;
  count: number;
  /** Builds every shape the stage will need. Called once, after mount. */
  shapes: (count: number) => Record<string, Points>;
  className?: string;
  style?: React.CSSProperties;
  fallback?: ReactNode;
  /** A weaker device: 30 fps. */
  weak?: boolean;
  /** Turn a little toward the cursor. */
  pointer?: boolean;
  /** Read out instead of the canvas, which is decorative. */
  label?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    // Reported after this effect, never during it.
    const fail = () => void Promise.resolve().then(() => setFailed(true));
    if (!webgl2Available()) {
      fail();
      return;
    }
    const light = document.documentElement.dataset.theme === "light";
    let engine: ParticleEngine;
    try {
      engine = new ParticleEngine(el, count, { ...(light ? ELECTRIC_ON_LIGHT : ELECTRIC), additive: !light });
      for (const [k, p] of Object.entries(shapes(count))) engine.addShape(k, p);
    } catch (error) {
      // Said once in the console, so a broken GPU path is diagnosable.
      console.warn("MAIRO particles unavailable:", error instanceof Error ? error.message : error);
      fail();
      return;
    }

    const reduced = prefersReducedMotion();
    const cur = { ...target.current };
    const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = performance.now();
    let time = 0;
    // The turn so far. Shapes that face the viewer (spin 0) settle to the
    // nearest full turn rather than snapping back through every turn made.
    let angle = 0;
    let skip = false;
    let onScreen = true;
    let lastKey = "";
    let lost = false;

    const resize = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 1.75);
      engine.resize(r.width, r.height, dpr);
      lastKey = "";
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      wake();
    });
    io.observe(el);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      ptr.tx = (e.clientX / window.innerWidth) * 2 - 1;
      ptr.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    if (pointer && !reduced) window.addEventListener("pointermove", onMove, { passive: true });
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      setFailed(true);
    };
    el.addEventListener("webglcontextlost", onLost);

    const tick = (now: number) => {
      raf = 0;
      timer = null;
      if (lost) return;
      const t = target.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) time += dt * (1 + cur.energy * 0.8);
      if (weak && !reduced) {
        skip = !skip;
        if (skip) return schedule();
      }

      // Ease toward the target; a long way off, cut most of the distance
      // first so a jump to the end isn't a montage of every shape between.
      const k = reduced ? 1 : 1 - Math.exp(-dt * 3.2);
      if (Math.abs(t.pos - cur.pos) > 1.5) cur.pos = t.pos - Math.sign(t.pos - cur.pos);
      cur.pos += (t.pos - cur.pos) * k;
      if (reduced) cur.pos = Math.round(t.pos);
      for (const f of EASED) cur[f] += ((f === "gain" && !t.visible ? 0 : t[f]) - cur[f]) * k;
      if (!reduced) {
        if (t.spin > 0.01) angle += cur.spin * dt * 0.12;
        else angle += (Math.round(angle / (Math.PI * 2)) * Math.PI * 2 - angle) * k;
      }
      ptr.x += (ptr.tx - ptr.x) * k;
      ptr.y += (ptr.ty - ptr.y) * k;

      const seq = t.seq;
      const i = Math.max(0, Math.min(seq.length - 1, Math.floor(cur.pos)));
      const j = Math.min(seq.length - 1, i + 1);
      const morph = Math.min(1, Math.max(0, cur.pos - i));
      const frame = {
        from: seq[i],
        to: seq[j],
        morph,
        time,
        energy: cur.energy,
        pulse: reduced ? 0 : cur.pulse,
        turbulence: reduced ? 0 : cur.turbulence,
        disperse: cur.disperse,
        yaw: cur.yaw + (reduced ? 0 : angle + ptr.x * 0.25),
        pitch: cur.pitch + (reduced ? 0 : ptr.y * 0.12),
        distance: cur.distance,
        size: cur.size,
        gain: cur.gain,
        focus: cur.focus,
        offsetX: cur.offsetX,
        offsetY: cur.offsetY,
      };
      const key = `${frame.from}${frame.to}${morph.toFixed(3)}${cur.gain.toFixed(3)}${cur.distance.toFixed(2)}${cur.offsetY.toFixed(2)}`;
      if (!reduced || key !== lastKey) {
        engine.render(frame);
        lastKey = key;
      }
      schedule();
    };
    const asleep = () => document.hidden || !onScreen || (!target.current.visible && cur.gain < 0.004);
    const schedule = () => {
      if (asleep()) return;
      if (reduced) timer = setTimeout(() => tick(performance.now()), 200);
      else raf = requestAnimationFrame(tick);
    };
    function wake() {
      if (raf || timer || asleep()) return;
      last = performance.now();
      schedule();
    }
    // The owner calls this when it changes the target, so a sleeping stage
    // that's been asked to show something starts again.
    (el as HTMLCanvasElement & { wake?: () => void }).wake = wake;
    const onVis = () => wake();
    document.addEventListener("visibilitychange", onVis);
    wake();

    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      el.removeEventListener("webglcontextlost", onLost);
      engine.dispose();
    };
    // The stage is built once; everything that changes goes through `target`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return <>{fallback}</>;
  return <canvas ref={canvas} data-stage aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label} className={className} style={style} />;
}

/** Wakes any stage that went to sleep because it had nothing to draw. */
export function wakeStages() {
  if (typeof document === "undefined") return;
  document.querySelectorAll<HTMLCanvasElement & { wake?: () => void }>("canvas[data-stage]").forEach((c) => c.wake?.());
}
