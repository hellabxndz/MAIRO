"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_TARGET, ParticleStage, prefersReducedMotion, wakeStages, type StageTarget } from "../stage";
import { particleBudget, shape, textShape } from "@/lib/cinematic/shapes";
import { CoreFallback } from "../fallback";

// The homepage's one particle stage, fixed behind the page, and the director
// that tells it what to be.
//
// The whole story is one sequence of shapes. Each scene on the page marks
// the stretch of it that belongs to it (data-scene="2:4" — from the third
// shape to the fifth); as a scene scrolls through the middle of the screen,
// the particles move along its stretch, holding on each shape and moving
// between them. Off every scene (pricing, the FAQ), the stage fades out and
// stops drawing. The hero also has an opening, three seconds long: the particles arrive from the
// dark as the wordmark, then become the core.

export const SEQ = ["void", "wordmark", "core", "chaos", "void", "core", "brief", "core", "creative", "network", "results", "core"] as const;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The particles' position in SEQ for a scene's stretch at progress l (0..1): a hold on each shape, a move between. */
export function positionIn(from: number, to: number, l: number): number {
  if (to === from) return from;
  const steps = to - from;
  const x = Math.min(steps - 1e-6, Math.max(0, l * steps));
  const seg = Math.floor(x);
  return from + seg + smooth(0.12, 0.62, x - seg);
}

/** The camera distance that fits the widest shape on this screen. */
export function fitDistance(aspect: number) {
  return Math.min(11.5, Math.max(5.8, 6.6 / Math.max(0.3, aspect)));
}

/** How many particles this device draws, and whether to hold 30 fps. */
export function deviceBudget(kind: "stage" | "core" = "stage"): { count: number; weak: boolean } {
  if (typeof window === "undefined") return { count: 7000, weak: false };
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return {
    count: particleBudget({ width: window.innerWidth, cores: nav.hardwareConcurrency, memory: nav.deviceMemory, reducedData: nav.connection?.saveData }, kind),
    weak: (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4,
  };
}

/** Shapes that face the viewer don't spin. */
const FACING = new Set(["wordmark", "brief", "creative", "results"]);

export function CinematicBackdrop() {
  const target = useRef<StageTarget>({ ...DEFAULT_TARGET, seq: [...SEQ], pos: 0, gain: 1, visible: true });
  // Read once, in the browser; the server's guess is never drawn.
  const [device] = useState(deviceBudget);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const root = document.documentElement;
    let scenes: { el: HTMLElement; from: number; to: number }[] = [];
    const collect = () => {
      scenes = [...document.querySelectorAll<HTMLElement>("[data-scene]")].map((el) => {
        const [a, b] = (el.dataset.scene ?? "2:2").split(":").map(Number);
        return { el, from: a, to: Number.isFinite(b) ? b : a };
      });
    };
    collect();

    // The opening: from the dark to the wordmark, then the core.
    const start = performance.now();
    let opening = !reduced && window.scrollY < 40;
    // Quick: the words arrive while it happens, never after it (hero.tsx).
    const introPos = (ms: number) => (ms < 150 ? 0 : ms < 1150 ? smooth(150, 1150, ms) : ms < 1900 ? 1 : 1 + smooth(1900, 2900, ms));

    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const mid = vh * 0.5;
      const t = target.current;
      t.distance = fitDistance(window.innerWidth / vh);
      t.focus = t.distance;
      // Farther away on a phone, so each point is drawn a little larger to keep its light.
      t.size = 0.068 * Math.pow(t.distance / 6, 0.6);
      let active: (typeof scenes)[number] | null = null;
      let l = 0;
      for (const s of scenes) {
        const r = s.el.getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid) {
          active = s;
          l = (mid - r.top) / Math.max(1, r.height);
          break;
        }
      }
      if (opening) {
        const ms = performance.now() - start;
        if (ms > 3000 || window.scrollY > 40) opening = false;
        else {
          const hero = scenes[0]?.el.dataset;
          const halfH = t.distance * Math.tan((20 * Math.PI) / 180);
          t.offsetX = 0;
          // The wordmark forms where the core will be, above the headline, so
          // the words can be on screen from the start.
          t.distance *= Number(hero?.sceneZoom ?? 1);
          t.offsetY = Number((window.innerWidth > window.innerHeight ? hero?.sceneY : hero?.sceneYm) ?? 0) * halfH;
          t.pos = introPos(ms);
          t.visible = true;
          t.spin = t.pos < 1.5 ? 0 : 1;
          t.turbulence = 0.6;
          raf = requestAnimationFrame(update);
          wakeStages();
          return;
        }
      }
      if (active) {
        t.visible = true;
        // Where the particles sit beside the scene's words: data-scene-x/y on
        // wide screens, data-scene-ym on phones, as fractions of half the screen.
        const aspect = window.innerWidth / vh;
        const halfH = t.distance * Math.tan((20 * Math.PI) / 180);
        const ds = active.el.dataset;
        const wide = aspect > 1;
        t.offsetX = wide ? Number(ds.sceneX ?? 0) * halfH * aspect : 0;
        t.offsetY = Number((wide ? ds.sceneY : ds.sceneYm) ?? 0) * halfH;
        t.distance *= Number((wide ? ds.sceneZoom : (ds.sceneZoomM ?? ds.sceneZoom)) ?? 1);
        t.pos = positionIn(active.from, active.to, l);
        const shapeNow = SEQ[Math.round(t.pos)];
        t.spin = FACING.has(shapeNow) ? 0 : 1;
        t.yaw = FACING.has(shapeNow) ? 0 : t.yaw;
        t.turbulence = 0.4;
        // Brighter in the middle of a scene, dimmer at its edges.
        t.gain = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, Math.max(0, l)));
        if (active.el.dataset.sceneDim) t.gain *= Number(active.el.dataset.sceneDim);
        root.style.setProperty("--scene-glow", t.gain.toFixed(3));
      } else {
        t.visible = false;
        root.style.setProperty("--scene-glow", "0");
      }
      wakeStages();
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onResize = () => {
      collect();
      onScroll();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    update();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      root.style.removeProperty("--scene-glow");
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {/* Light behind the particles: an electric-blue bloom that follows the scene. */}
      <div className="absolute inset-0 transition-opacity duration-700" style={{ opacity: "var(--scene-glow, 1)", background: "radial-gradient(60% 55% at 50% 48%, rgba(40,110,255,0.20), rgba(20,60,200,0.06) 45%, transparent 72%)" }} />
      <ParticleStage
        target={target}
        count={device.count}
        weak={device.weak}
        className="absolute inset-0 h-full w-full"
        shapes={(n) => {
          const out: Record<string, Float32Array> = {};
          for (const k of SEQ) if (k !== "wordmark" && !out[k]) out[k] = shape(k, n);
          out.wordmark = textShape("MAIRO", n, window.innerWidth < 768 ? 3.3 : 4.8);
          return out;
        }}
        fallback={<CoreFallback className="absolute inset-0" />}
      />
      {/* Edges fall away to black, like a lens. */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.65))" }} />
    </div>
  );
}
