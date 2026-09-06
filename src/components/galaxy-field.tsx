"use client";

import { useEffect, useRef } from "react";

// The deep-space environment the whole marketing page floats in.
//
// The technique matters more than it looks. A starfield redrawn dot by dot
// every frame is the obvious way to write this and it is what an earlier
// version of this page did — it measured 17fps, because a few thousand
// individual fill calls a frame is genuinely a lot of work on the main thread.
//
// Instead each depth layer is rendered ONCE into an offscreen canvas at start
// up, and every frame is three drawImage calls with different offsets. The
// browser hands those to the compositor, so the per-frame cost stops depending
// on how many stars there are and starts depending only on how many layers
// there are. Three layers of two thousand stars costs the same as three layers
// of two hundred.
//
// The layers tile, so drift never reaches an edge and there is no seam to hide.
// The tiling is drawn as four wrapped sub-rectangles rather than four whole
// copies: a layer canvas is exactly viewport-sized, so however far it has
// drifted, the part of it you can actually see is always exactly one viewport
// of pixels. Blitting whole copies drew four, three of them entirely offscreen,
// and across three layers that was thirteen viewports of fill a frame against
// the four it needs.

type Layer = {
  canvas: HTMLCanvasElement;
  /** How far this layer moves relative to the camera. Nearer = larger. */
  depth: number;
  /** Base drift, in pixels per second. */
  driftX: number;
  driftY: number;
  offsetX: number;
  offsetY: number;
};

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Renders one depth layer of stars into its own canvas.
 *
 * Nearer layers get bigger, softer stars; distant ones stay a single sharp
 * pixel. That size and focus difference is most of what reads as depth — more
 * than the parallax does on its own.
 */
function buildLayer(
  width: number,
  height: number,
  count: number,
  maxRadius: number,
  blur: number,
  seed: number,
  dpr: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);

  const rand = seeded(seed);
  // Mostly white, with a few cool and warm ones. Real starfields are not
  // monochrome, but the variation has to be slight or it reads as confetti.
  const hues = ["255,255,255", "255,255,255", "255,255,255", "202,224,255", "255,241,224", "214,203,255"];

  if (blur > 0) ctx.filter = `blur(${blur}px)`;

  for (let i = 0; i < count; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = 0.45 + rand() * maxRadius;
    // Skewed so most stars are faint and only a few are bright, which is what
    // stops an even scatter of dots from looking like noise. Squaring it was too
    // severe — the field measured 0.27% of pixels lit at an average alpha of
    // 40/255, which is a black screen with a rumour of stars on it.
    const alpha = Math.pow(rand(), 1.4) * 0.85 + 0.12;
    ctx.fillStyle = `rgba(${hues[Math.floor(rand() * hues.length)]},${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

/**
 * Draws `src` tiled across the whole viewport, offset by (tx, ty).
 *
 * Destination pixel X shows source pixel (X - tx) wrapped into range, which
 * splits the viewport into at most four rectangles — one per corner the wrap
 * cuts across. Total pixels written is exactly one viewport regardless of
 * offset.
 *
 * The split point is snapped to a whole device pixel. On a fractional boundary
 * the two halves resample against each other and leave a visible hairline down
 * the middle of the sky.
 */
function drawTiled(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  tx: number,
  ty: number,
  width: number,
  height: number,
  dpr: number
) {
  const axDev = Math.round((((tx % width) + width) % width) * dpr);
  const ayDev = Math.round((((ty % height) + height) % height) * dpr);
  const wDev = src.width;
  const hDev = src.height;

  // Left/top strips take the far edge of the source; right/bottom take the near
  // edge. A zero-width strip means the wrap fell exactly on the boundary, and
  // drawImage rejects an empty source rectangle, so those are skipped.
  const cols: Array<[number, number, number]> = [];
  if (axDev > 0) cols.push([wDev - axDev, axDev, 0]);
  if (wDev - axDev > 0) cols.push([0, wDev - axDev, axDev]);

  const rows: Array<[number, number, number]> = [];
  if (ayDev > 0) rows.push([hDev - ayDev, ayDev, 0]);
  if (hDev - ayDev > 0) rows.push([0, hDev - ayDev, ayDev]);

  for (const [sx, sw, dx] of cols) {
    for (const [sy, sh, dy] of rows) {
      // Source rectangles are in the layer's own device pixels; the context is
      // already scaled by dpr, so destinations are in CSS pixels.
      ctx.drawImage(src, sx, sy, sw, sh, dx / dpr, dy / dpr, sw / dpr, sh / dpr);
    }
  }
}

export function GalaxyField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const narrow = window.innerWidth < 760;

    // Capped at 1.5 rather than the device's full ratio. A 3x phone screen
    // means nine times the pixels to push for a difference nobody can see on a
    // field of one-pixel stars.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let width = 0;
    let height = 0;
    let layers: Layer[] = [];
    let raf = 0;
    let last = performance.now();

    // Pointer and scroll are read as targets and eased towards, so the camera
    // never snaps — it always arrives.
    let pointerX = 0;
    let pointerY = 0;
    let easedX = 0;
    let easedY = 0;
    let scrollTarget = 0;
    let easedScroll = 0;

    function build() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.ceil(width * dpr);
      canvas!.height = Math.ceil(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;

      // Fewer stars on a phone: the screen is smaller, the pixels are denser,
      // and the battery is not plugged in.
      //
      // These counts are a one-off cost at build time, not a per-frame one —
      // the layers are rasterised once — so the field can be as dense as it
      // needs to look right without touching the frame budget.
      const scale = narrow ? 0.45 : 1;

      layers = [
        // Far: tiny, sharp, barely moves. This is the bulk of the field.
        { canvas: buildLayer(width, height, Math.round(2600 * scale), 0.55, 0, 20260906, dpr),
          depth: 0.12, driftX: 0.9, driftY: 0.25, offsetX: 0, offsetY: 0 },
        // Middle: a little larger, a little softer.
        { canvas: buildLayer(width, height, Math.round(620 * scale), 0.95, 0.3, 77712, dpr),
          depth: 0.34, driftX: 2.1, driftY: 0.6, offsetX: 0, offsetY: 0 },
        // Near: few, blurred, because they are closest to the camera.
        { canvas: buildLayer(width, height, Math.round(90 * scale), 1.7, 1.4, 5150, dpr),
          depth: 0.8, driftX: 4.4, driftY: 1.3, offsetX: 0, offsetY: 0 },
      ];
    }

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      easedX += (pointerX - easedX) * 0.04;
      easedY += (pointerY - easedY) * 0.04;
      easedScroll += (scrollTarget - easedScroll) * 0.06;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, width, height);

      for (const layer of layers) {
        layer.offsetX = (layer.offsetX + layer.driftX * dt) % width;
        layer.offsetY = (layer.offsetY + layer.driftY * dt) % height;

        // Pointer shifts each layer by a few pixels; scroll pushes the field
        // upward so the page reads as travelling forward rather than the
        // background simply sitting still behind it.
        const px = -easedX * layer.depth * 26;
        const py = -easedY * layer.depth * 18 + easedScroll * layer.depth * 140;

        drawTiled(ctx!, layer.canvas, -layer.offsetX + px, -layer.offsetY + py, width, height, dpr);
      }

      raf = requestAnimationFrame(frame);
    }

    function onPointer(e: PointerEvent) {
      pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      pointerY = (e.clientY / window.innerHeight) * 2 - 1;
    }
    function onScroll() {
      scrollTarget = window.scrollY / Math.max(window.innerHeight, 1);
    }

    let resizeTimer: number | undefined;
    function onResize() {
      window.clearTimeout(resizeTimer);
      // Rebuilding means re-rendering every layer, so it waits for the resize
      // to actually finish rather than doing it on every pixel of a drag.
      resizeTimer = window.setTimeout(build, 220);
    }

    build();

    if (reduced) {
      // One still frame: the field is there, nothing moves.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const layer of layers) ctx.drawImage(layer.canvas, 0, 0, width, height);
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    raf = requestAnimationFrame(frame);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ background: "#000000" }}
    />
  );
}
