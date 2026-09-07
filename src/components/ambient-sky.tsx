"use client";

import { useEffect, useRef } from "react";
import { CosmicVeil } from "@/components/cosmic-veil";

// The signed-in backdrop: the same sky as the marketing page, turned right
// down.
//
// The restraint is the whole point. A landing page is somewhere you look; a
// dashboard is somewhere you work, and a backdrop that moves is a backdrop
// that competes with the numbers someone is trying to read. So this keeps the
// identity and drops the theatre:
//
//   The stars do not move. They are drawn once, on mount, and then left alone
//   — no requestAnimationFrame loop at all, so the per-frame cost of being on
//   any dashboard screen is exactly zero. The marketing field runs a loop
//   because travelling through it is the point; here it would just be a
//   battery drain behind a spreadsheet.
//
//   The nebulae behind them do not drift either. Measured: three large
//   translucent gradients being recomposited every frame took these screens
//   from 117fps to 29fps. A still sky costs nothing and, behind a tool, looks
//   more deliberate than a moving one.
//
//   They are dimmer and sparser than the marketing sky, and the nebulae behind
//   them sit at a fraction of their usual opacity. Text over this has to stay
//   as readable as text over flat black, which is the constraint that set
//   every number below.
//
// One frame, then nothing.

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function AmbientSky() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let timer: number | undefined;

    function paint() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas!.width = Math.ceil(w * dpr);
      canvas!.height = Math.ceil(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);

      // Density by area rather than a fixed count, so a wide monitor does not
      // end up with a sparser sky than a laptop.
      const rand = seeded(4242);
      const count = Math.min(Math.round((w * h) / 5200), 420);

      for (let i = 0; i < count; i++) {
        const x = rand() * w;
        const y = rand() * h;
        // Squared, so most are barely there and only a handful read as stars.
        const a = Math.pow(rand(), 2.4) * 0.5 + 0.03;
        const r = rand() > 0.94 ? 1.1 : 0.6;
        const roll = rand();
        const rgb =
          roll > 0.9 ? "205,220,255" : roll > 0.8 ? "228,214,255" : "255,255,255";
        ctx!.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
        ctx!.beginPath();
        ctx!.arc(x, y, r, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    paint();

    // Repainted only when the window settles at a new size. Still no loop.
    function onResize() {
      window.clearTimeout(timer);
      timer = window.setTimeout(paint, 200);
    }
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-neutral-950">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      {/* The marketing page's own nebulae, at a fraction of their strength. */}
      <CosmicVeil still className="pointer-events-none absolute inset-0 overflow-hidden opacity-40" />
      {/* Keeps the working area of the screen quieter than the edges. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(10,10,14,0.72)_0%,rgba(10,10,14,0.35)_55%,rgba(10,10,14,0)_100%)]" />
    </div>
  );
}
