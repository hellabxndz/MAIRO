"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_TARGET, ParticleStage, prefersReducedMotion, wakeStages, type StageTarget } from "../stage";
import { particleBudget, shape } from "@/lib/cinematic/shapes";
import { FieldFallback } from "../fallback";
import { FIELD_EVENT } from "@/lib/cinematic/field-event";

// The homepage's one particle stage — the Field (docs/DESIGN-SPEC-v3.md §5) —
// fixed behind the page, and the director that tells it what to be.
//
// The whole story is one sequence of shapes. Each scene on the page marks
// the stretch of it that belongs to it (data-scene="2:4" — from the third
// shape to the fifth); as a scene scrolls through the middle of the screen,
// the lines move along its stretch, holding on each shape and moving between
// them. Off every scene (the example, pricing, the footer) the stage fades
// out and stops drawing. The hero opens in about a second and a half: the
// lines arrive from the dark as the ribbon.

export const SEQ = ["void", "ribbon", "field", "creative", "results", "ribbon"] as const;

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

/** Shapes that face the viewer don't turn. */
const FACING = new Set<string>(["creative", "results"]);
/** Shapes that are surfaces: they undulate and carry the scan line. */
const SURFACE = new Set<string>(["ribbon", "field"]);

export function CinematicBackdrop() {
  const target = useRef<StageTarget>({ ...DEFAULT_TARGET, seq: [...SEQ], pos: 0, gain: 0.9, size: 0.05, visible: true, wave: 1, scan: 1, spin: 0.35 });
  // Read once, in the browser; the server's guess is never drawn.
  const [device] = useState(deviceBudget);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const root = document.documentElement;
    let scenes: { el: HTMLElement; from: number; to: number }[] = [];
    const collect = () => {
      scenes = [...document.querySelectorAll<HTMLElement>("[data-scene]")].map((el) => {
        const [a, b] = (el.dataset.scene ?? "1:1").split(":").map(Number);
        return { el, from: a, to: Number.isFinite(b) ? b : a };
      });
    };
    collect();

    // The opening: from the dark into the ribbon. Quick, so the words never wait for it.
    const start = performance.now();
    let opening = !reduced && window.scrollY < 40;

    // A visitor typing their website: the Field quickens and the scan sweeps
    // while they type, then settles (FIELD_EVENT, website-start.tsx).
    let boost = 0;
    let settle: ReturnType<typeof setTimeout> | null = null;
    const onField = (e: Event) => {
      if (reduced) return;
      boost = Math.max(0, Math.min(1, (e as CustomEvent<{ energy?: number }>).detail?.energy ?? 0.6));
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => {
        boost = 0;
        onScroll();
      }, 1400);
      onScroll();
    };
    window.addEventListener(FIELD_EVENT, onField);

    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const mid = vh * 0.5;
      const aspect = window.innerWidth / vh;
      const wide = aspect > 1;
      const t = target.current;
      t.distance = fitDistance(aspect);
      t.focus = t.distance;
      // Farther away on a phone, so each point is drawn a little larger to keep its light.
      t.size = 0.05 * Math.pow(t.distance / 6, 0.6);
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
      // Off every scene the stage fades and sleeps.
      if (!active) {
        t.visible = false;
        root.style.setProperty("--scene-glow", "0");
        wakeStages();
        return;
      }
      const ds = active.el.dataset;
      const halfH = t.distance * Math.tan((20 * Math.PI) / 180);
      t.visible = true;
      // Where the lines sit beside the scene's words: data-scene-x/y on wide
      // screens, data-scene-ym on phones, as fractions of half the screen.
      t.offsetX = wide ? Number(ds.sceneX ?? 0) * halfH * aspect : 0;
      t.offsetY = Number((wide ? ds.sceneY : ds.sceneYm) ?? 0) * halfH;
      t.distance *= Number((wide ? ds.sceneZoom : (ds.sceneZoomM ?? ds.sceneZoom)) ?? 1);
      if (opening) {
        const ms = performance.now() - start;
        if (ms > 1500 || window.scrollY > 40) opening = false;
        t.pos = opening ? smooth(100, 1400, ms) : positionIn(active.from, active.to, l);
        if (opening) raf = requestAnimationFrame(update);
      } else {
        t.pos = positionIn(active.from, active.to, l);
      }
      const now = SEQ[Math.round(t.pos)];
      t.spin = FACING.has(now) ? 0 : 0.35;
      t.wave = SURFACE.has(now) ? 1 : 0.15;
      t.scan = SURFACE.has(now) ? 1 : 0.35;
      t.turbulence = 0.3 + boost * 0.25;
      t.energy = boost;
      t.pulse = boost * 0.35;
      if (boost) t.scan = 1;
      t.gain = (0.9 + boost * 0.2) * Number(ds.sceneDim ?? 1);
      root.style.setProperty("--scene-glow", "1");
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
      if (settle) clearTimeout(settle);
      window.removeEventListener(FIELD_EVENT, onField);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      root.style.removeProperty("--scene-glow");
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 transition-opacity duration-700" style={{ opacity: "var(--scene-glow, 1)" }}>
        <ParticleStage
          target={target}
          count={device.count}
          weak={device.weak}
          className="absolute inset-0 h-full w-full"
          shapes={(n) => {
            const out: Record<string, Float32Array> = {};
            for (const k of SEQ) if (!out[k]) out[k] = shape(k, n);
            return out;
          }}
          fallback={<FieldFallback className="absolute inset-0" />}
        />
      </div>
      {/* The edges fall away to the page's black. */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(130% 95% at 50% 50%, transparent 60%, rgba(5,5,5,0.7))" }} />
    </div>
  );
}
