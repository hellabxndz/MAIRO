"use client";

import { useEffect, useRef } from "react";
import { CAPTIONS, RUNTIME, SCENES } from "@/lib/intro/script";

// The moving part of the intro: sky, galaxy, planet. Type is handled in the DOM
// on top of this, because DOM text stays sharp, picks up the site's font for
// free, and can be read by a screen reader.
//
// The rules that keep this at frame rate are the same ones the marketing page
// backdrop had to learn:
//
//   Anything detailed is rasterised ONCE into an offscreen canvas and then
//   blitted. The galaxy is roughly twenty thousand dots; drawing those per
//   frame is impossible, drawing them once and then scaling one image is free.
//
//   Stars are drawn as batched strokes, not one path each. They are bucketed by
//   width and brightness into nine buckets and stroked nine times, instead of
//   nine hundred times. A round line cap means the same code draws a dot when
//   the camera is slow and a streak when it is fast, with no branch.
//
//   React is never involved in a frame. This component owns the clock and only
//   calls back when the scene or the caption actually changes — about twenty
//   times across the whole film.

const FOCAL = 900;
const Z_FAR = 1400;

type Star = { x: number; y: number; z: number; w: number; a: number };

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Smooth 0→1 ramp between two times. The film is built almost entirely of these. */
function ramp(from: number, to: number, t: number) {
  const x = clamp((t - from) / (to - from), 0, 1);
  return x * x * (3 - 2 * x);
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * A barred spiral, face on — the Milky Way as we would see it from outside,
 * which is the one view of our own galaxy nobody has ever actually had.
 *
 * Built from four ingredients that together stop it reading as a pinwheel
 * clipart: a warm core, a central bar, arms whose stars scatter off the ideal
 * spiral by a gaussian, and dust lanes cut back OUT of the finished image with
 * destination-out so they darken what is already there rather than sitting on
 * top of it as grey paint.
 */
function buildGalaxy(size: number, dense: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const x = c.getContext("2d");
  if (!x) return c;

  const mid = size / 2;
  const R = size * 0.46;
  const rand = seeded(90210);
  const gauss = () => (rand() + rand() + rand() + rand() - 2) * 0.5;

  // Halo: a very faint wash so the arms sit in something rather than on black.
  const halo = x.createRadialGradient(mid, mid, 0, mid, mid, R);
  halo.addColorStop(0, "rgba(255,232,196,0.30)");
  halo.addColorStop(0.22, "rgba(210,190,255,0.10)");
  halo.addColorStop(0.62, "rgba(120,140,255,0.045)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = halo;
  x.fillRect(0, 0, size, size);

  const ARMS = 2;
  // Dense enough that the arms read as a haze of stars rather than as a
  // scattering of separate dots. The galaxy is on screen at close to 1:1 when
  // the wordmark lands, so this detail is actually visible; it is also a
  // one-off build cost, not a per-frame one.
  const perArm = dense ? 13000 : 4200;
  const TWIST = 2.42;

  for (let arm = 0; arm < ARMS; arm++) {
    const base = (arm / ARMS) * Math.PI * 2;
    for (let i = 0; i < perArm; i++) {
      // Biased towards the centre, which is where the stars actually are.
      const f = Math.pow(rand(), 0.62);
      const theta = base + f * TWIST * Math.PI;
      const radius = R * f;
      // Scatter widens further out, so the arms fray at the edges.
      const spread = 0.035 + f * 0.10;
      const px = mid + Math.cos(theta) * radius + gauss() * R * spread;
      const py = mid + Math.sin(theta) * radius * 0.97 + gauss() * R * spread;

      const d = Math.hypot(px - mid, py - mid) / R;
      if (d > 1) continue;

      // Warm in the core, blue in the arms, with occasional pink where new
      // stars are forming. Real spirals do this and it is most of the colour.
      let col: string;
      const roll = rand();
      if (d < 0.2) col = `rgba(255,${222 + rand() * 30},${180 + rand() * 50},`;
      else if (roll > 0.965) col = `rgba(255,${140 + rand() * 40},${185 + rand() * 40},`;
      else if (roll > 0.55) col = `rgba(${196 + rand() * 40},${216 + rand() * 30},255,`;
      else col = `rgba(255,255,255,`;

      const alpha = (0.5 - d * 0.34) * (0.35 + rand() * 0.65);
      const r = d < 0.18 ? 0.5 + rand() * 0.9 : 0.28 + rand() * 0.66;
      x.fillStyle = `${col}${Math.max(alpha, 0.02).toFixed(3)})`;
      x.beginPath();
      x.arc(px, py, r, 0, Math.PI * 2);
      x.fill();
    }
  }

  // The bar. Ours is a barred spiral and the bar is what makes it read as one
  // particular galaxy rather than a generic swirl.
  for (let i = 0; i < (dense ? 4200 : 1500); i++) {
    const t = rand() * 2 - 1;
    const px = mid + t * R * 0.34 + gauss() * R * 0.045;
    const py = mid + gauss() * R * 0.055;
    x.fillStyle = `rgba(255,${226 + rand() * 26},${190 + rand() * 45},${(0.32 * (1 - Math.abs(t) * 0.5)).toFixed(3)})`;
    x.beginPath();
    x.arc(px, py, 0.45 + rand() * 0.9, 0, Math.PI * 2);
    x.fill();
  }

  // Core.
  const core = x.createRadialGradient(mid, mid, 0, mid, mid, R * 0.2);
  core.addColorStop(0, "rgba(255,246,226,0.95)");
  core.addColorStop(0.35, "rgba(255,226,170,0.42)");
  core.addColorStop(1, "rgba(255,200,140,0)");
  x.fillStyle = core;
  x.fillRect(0, 0, size, size);

  // Dust lanes, cut out of what is already drawn.
  x.globalCompositeOperation = "destination-out";
  for (let arm = 0; arm < ARMS; arm++) {
    const base = (arm / ARMS) * Math.PI * 2 - 0.32;
    for (let i = 0; i < (dense ? 3000 : 1100); i++) {
      const f = Math.pow(rand(), 0.6);
      const theta = base + f * TWIST * Math.PI;
      const radius = R * f;
      const px = mid + Math.cos(theta) * radius + gauss() * R * 0.05;
      const py = mid + Math.sin(theta) * radius * 0.97 + gauss() * R * 0.05;
      x.fillStyle = `rgba(0,0,0,${(0.05 + rand() * 0.16).toFixed(3)})`;
      x.beginPath();
      x.arc(px, py, 1 + rand() * 3.4, 0, Math.PI * 2);
      x.fill();
    }
  }
  x.globalCompositeOperation = "source-over";

  return c;
}

/**
 * Earth. Not a texture map — an impression of one, built from overlapping
 * ellipses inside a circular clip, lit from the upper left with a terminator
 * falling away to the lower right and an atmosphere drawn outside the disc.
 *
 * It is deliberately not a real coastline. A recognisable but non-literal blue
 * planet reads correctly at the size it is on screen and does not pretend to be
 * satellite imagery.
 */
function buildEarth(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const x = c.getContext("2d");
  if (!x) return c;

  const mid = size / 2;
  const R = size * 0.38;
  const rand = seeded(31415);

  // Atmosphere first, so the disc lands on top of its inner edge.
  const air = x.createRadialGradient(mid, mid, R * 0.92, mid, mid, R * 1.22);
  air.addColorStop(0, "rgba(120,190,255,0)");
  air.addColorStop(0.35, "rgba(120,190,255,0.30)");
  air.addColorStop(0.7, "rgba(80,150,255,0.13)");
  air.addColorStop(1, "rgba(60,120,255,0)");
  x.fillStyle = air;
  x.fillRect(0, 0, size, size);

  x.save();
  x.beginPath();
  x.arc(mid, mid, R, 0, Math.PI * 2);
  x.clip();

  // Ocean, lit from the upper left.
  const sea = x.createRadialGradient(mid - R * 0.35, mid - R * 0.4, R * 0.05, mid, mid, R * 1.25);
  sea.addColorStop(0, "#2f7fd0");
  sea.addColorStop(0.4, "#14538f");
  sea.addColorStop(0.78, "#08284d");
  sea.addColorStop(1, "#03101f");
  x.fillStyle = sea;
  x.fillRect(0, 0, size, size);

  // Land. Each continent is one closed path whose radius is modulated by a
  // couple of harmonics, drawn through the midpoints of its vertices so the
  // outline comes out as a smooth, irregular coastline.
  //
  // The first version of this was clusters of overlapping ellipses. At the size
  // Earth reaches on screen they merged into one green mass with no coast and
  // no open ocean — recognisably algae in a dish rather than a planet. A shape
  // with an actual edge is what makes it read.
  const coast = (ox: number, oy: number, base: number) => {
    const N = 26;
    const h1 = 0.26 + rand() * 0.26;
    const h2 = 0.10 + rand() * 0.16;
    const p1 = rand() * 6.283;
    const p2 = rand() * 6.283;
    const k1 = 2 + Math.floor(rand() * 2);
    const k2 = 4 + Math.floor(rand() * 3);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = base * (1 + h1 * Math.sin(a * k1 + p1) + h2 * Math.sin(a * k2 + p2)) * (0.88 + rand() * 0.24);
      pts.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r * 0.84]);
    }
    x.beginPath();
    x.moveTo((pts[0][0] + pts[N - 1][0]) / 2, (pts[0][1] + pts[N - 1][1]) / 2);
    for (let i = 0; i < N; i++) {
      const cur = pts[i];
      const next = pts[(i + 1) % N];
      x.quadraticCurveTo(cur[0], cur[1], (cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2);
    }
    x.closePath();
  };

  // Placed to leave real ocean between them. Nothing here is a real coastline;
  // it is an impression of a populated blue planet, not a map.
  const masses: Array<[number, number, number]> = [
    [-0.44, -0.46, 0.21], [0.20, -0.54, 0.15], [-0.34, 0.22, 0.24],
    [0.38, 0.04, 0.20], [0.54, 0.56, 0.12], [-0.66, 0.18, 0.10],
    [0.02, 0.66, 0.11], [0.68, -0.36, 0.09],
  ];
  for (const [cx, cy, scale] of masses) {
    const ox = mid + cx * R;
    const oy = mid + cy * R;
    coast(ox, oy, R * scale);
    const g = x.createLinearGradient(ox, oy - R * scale, ox, oy + R * scale);
    g.addColorStop(0, "#5d7a45");
    g.addColorStop(0.45, "#4a6b38");
    g.addColorStop(1, "#3d5b30");
    x.fillStyle = g;
    x.fill();

    // Arid interior, so the land is not one flat green.
    x.save();
    x.clip();
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * R * scale * 0.5;
      coast(ox + Math.cos(a) * d, oy + Math.sin(a) * d, R * scale * (0.22 + rand() * 0.32));
      x.fillStyle = `rgba(${(126 + rand() * 40) | 0},${(108 + rand() * 26) | 0},${(66 + rand() * 26) | 0},${(0.4 + rand() * 0.35).toFixed(2)})`;
      x.fill();
    }
    x.restore();
  }

  // Islands.
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.pow(rand(), 0.5) * R * 0.92;
    coast(mid + Math.cos(a) * d, mid + Math.sin(a) * d, R * (0.012 + rand() * 0.03));
    x.fillStyle = `rgba(78,104,58,${(0.55 + rand() * 0.4).toFixed(2)})`;
    x.fill();
  }

  // Ice at both poles.
  for (const sign of [-1, 1]) {
    const ice = x.createRadialGradient(mid, mid + sign * R, 0, mid, mid + sign * R, R * 0.55);
    ice.addColorStop(0, "rgba(238,248,255,0.92)");
    ice.addColorStop(0.6, "rgba(215,238,255,0.28)");
    ice.addColorStop(1, "rgba(215,238,255,0)");
    x.fillStyle = ice;
    x.fillRect(0, 0, size, size);
  }

  // Cloud systems: thin, banded, and following latitudes rather than scattered
  // at random, which is what stops them reading as smudges on a lens.
  for (let i = 0; i < 190; i++) {
    const lat = (rand() * 2 - 1) * 0.94;
    const band = Math.cos(lat * 3.1) * 0.5 + 0.5;
    if (rand() > 0.16 + band * 0.42) continue;
    const lon = (rand() * 2 - 1) * Math.sqrt(Math.max(1 - lat * lat, 0));
    const px = mid + lon * R;
    const py = mid + lat * R;
    // Widely varied sizes. Uniform wisps tile into something that reads as
    // texture on a lens rather than weather on a planet.
    const w = R * (0.015 + Math.pow(rand(), 2) * 0.16);
    x.fillStyle = `rgba(255,255,255,${(0.06 + rand() * 0.17).toFixed(3)})`;
    x.beginPath();
    x.ellipse(px, py, w, w * (0.12 + rand() * 0.3), (rand() - 0.5) * 0.7, 0, Math.PI * 2);
    x.fill();
  }

  // Terminator: night falling away to the lower right.
  const night = x.createRadialGradient(mid - R * 0.45, mid - R * 0.5, R * 0.1, mid, mid, R * 1.45);
  night.addColorStop(0, "rgba(0,0,0,0)");
  night.addColorStop(0.52, "rgba(0,0,6,0.12)");
  night.addColorStop(0.82, "rgba(0,0,8,0.68)");
  night.addColorStop(1, "rgba(0,0,10,0.93)");
  x.fillStyle = night;
  x.fillRect(0, 0, size, size);

  x.restore();

  // A bright edge where the atmosphere catches the light. Drawn as a soft band
  // hugging the limb from inside rather than as a stroked arc, which read as a
  // circle someone had drawn on top of the planet.
  const limb = x.createRadialGradient(mid, mid, R * 0.93, mid, mid, R);
  limb.addColorStop(0, "rgba(150,205,255,0)");
  limb.addColorStop(1, "rgba(175,220,255,0.42)");
  x.save();
  x.beginPath();
  x.arc(mid, mid, R, 0, Math.PI * 2);
  x.clip();
  x.fillStyle = limb;
  x.fillRect(0, 0, size, size);
  x.restore();

  return c;
}

type Props = {
  onScene: (id: string) => void;
  onCaption: (index: number) => void;
  onEnd: () => void;
  /** Called if the device cannot hold a watchable frame rate. */
  onTooSlow: () => void;
  mobile: boolean;
};

export function SpaceStage({ onScene, onCaption, onEnd, onTooSlow, mobile }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  // Held in a ref, and refreshed after render rather than during it, so that a
  // re-render swaps the callbacks without tearing down the canvas and starting
  // the film again from black.
  const cb = useRef({ onScene, onCaption, onEnd, onTooSlow });
  useEffect(() => {
    cb.current = { onScene, onCaption, onEnd, onTooSlow };
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      cb.current.onTooSlow();
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = 0;
    let height = 0;

    const galaxy = buildGalaxy(mobile ? 720 : 1400, !mobile);
    const earth = buildEarth(mobile ? 560 : 1024);

    const COUNT = mobile ? 380 : 900;
    const rand = seeded(777);
    let stars: Star[] = [];

    function seedStars() {
      const spread = Math.max(width, height);
      stars = Array.from({ length: COUNT }, () => ({
        x: (rand() * 2 - 1) * spread,
        y: (rand() * 2 - 1) * spread,
        z: rand() * Z_FAR + 1,
        w: rand() > 0.9 ? 2.6 : rand() > 0.6 ? 1.7 : 1,
        a: 0.3 + rand() * 0.7,
      }));
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.ceil(width * dpr);
      canvas!.height = Math.ceil(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      if (!stars.length) seedStars();
    }
    resize();

    /**
     * How fast the camera is moving at time t, in world units per second.
     *
     * This curve is the whole feel of the opening: still, then creeping, then
     * a hard acceleration into the galaxy, then braking hard as Earth comes up.
     * It goes negative at the end, which is the camera pulling back out.
     */
    function speedAt(t: number) {
      if (t < 1.0) return 0;
      if (t < 4) return 70 * ramp(1, 4, t);
      if (t < 6.5) return 70 + 380 * ramp(4, 6.5, t);
      if (t < 9) return 450 + 420 * ramp(6.5, 9, t);
      if (t < 13) return 870 * (1 - ramp(9, 12.6, t)) + 20;
      if (t < 58) return 18;
      return -34 * ramp(58, 60.5, t);
    }

    const bucketW = [1, 1.8, 2.9];
    const bucketA = [0.3, 0.62, 0.95];
    const buckets: number[][] = Array.from({ length: 9 }, () => []);

    let raf = 0;
    let started = 0;
    let last = 0;
    let scene = "";
    let caption = -1;
    const frames: number[] = [];
    let bailed = false;

    function frame(now: number) {
      if (!started) {
        started = now;
        last = now;
      }
      const t = (now - started) / 1000;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      // Health check. If the device genuinely cannot render this, the film gets
      // out of the way rather than stuttering through sixty seconds of it.
      if (!bailed && t > 0.6) {
        frames.push(dt);
        if (frames.length === 45) {
          const sorted = [...frames].sort((a, b) => a - b);
          if (sorted[22] > 0.042) {
            bailed = true;
            cb.current.onTooSlow();
            return;
          }
        }
      }

      const cx = width / 2;
      const cy = height / 2;
      const speed = speedAt(t);

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.fillStyle = "#000000";
      ctx!.fillRect(0, 0, width, height);

      // ── The galaxy, seen from outside ──────────────────────────────────
      // Grows from a single point to filling the frame, then we go through it.
      // It comes back at the very end, small, as the camera pulls out.
      const approach = ramp(1.1, 6.5, t);
      const leaving = ramp(6.4, 8.6, t);
      const returning = ramp(58.6, 63, t);
      const gAlpha = Math.max((1 - leaving) * ramp(1.0, 2.4, t), returning * 0.85);

      if (gAlpha > 0.002) {
        const near = Math.pow(approach, 3.1);
        const size =
          returning > 0.01 && leaving > 0.99
            ? Math.max(width, height) * (0.72 - 0.42 * returning)
            : Math.max(width, height) * (0.012 + near * 2.6);
        ctx!.save();
        ctx!.globalAlpha = gAlpha;
        ctx!.translate(cx, cy);
        ctx!.rotate(t * 0.012);
        ctx!.drawImage(galaxy, -size / 2, -size / 2, size, size);
        ctx!.restore();
      }

      // ── Inside the Milky Way ───────────────────────────────────────────
      // Once through, the galaxy stops being an object in front of us and
      // becomes the band of light we actually live inside.
      const band = ramp(6.9, 8.4, t) * (1 - ramp(11, 12.8, t));
      if (band > 0.002) {
        ctx!.save();
        ctx!.globalAlpha = band;
        ctx!.translate(cx, cy);
        ctx!.rotate(-0.42);
        const g = ctx!.createLinearGradient(0, -height * 0.5, 0, height * 0.5);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.4, "rgba(150,160,220,0.10)");
        g.addColorStop(0.5, "rgba(224,220,255,0.20)");
        g.addColorStop(0.6, "rgba(150,160,220,0.10)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = g;
        const w = Math.hypot(width, height) * 1.2;
        ctx!.fillRect(-w / 2, -height * 0.5, w, height);
        ctx!.restore();
      }

      // ── Stars ──────────────────────────────────────────────────────────
      for (const b of buckets) b.length = 0;

      const trail = clamp(speed * dt * 1.7, 0, 260);
      for (const s of stars) {
        s.z -= speed * dt;
        if (s.z < 1) {
          s.z += Z_FAR;
          s.x = (rand() * 2 - 1) * Math.max(width, height);
          s.y = (rand() * 2 - 1) * Math.max(width, height);
        } else if (s.z > Z_FAR) {
          s.z -= Z_FAR;
        }

        const k = FOCAL / s.z;
        const px = cx + s.x * k;
        const py = cy + s.y * k;
        if (px < -80 || px > width + 80 || py < -80 || py > height + 80) continue;

        const k2 = FOCAL / (s.z + trail);
        const qx = cx + s.x * k2;
        const qy = cy + s.y * k2;

        // Fade in from the far plane and out as they rush past the camera.
        const depth = clamp(1 - s.z / Z_FAR, 0, 1);
        const alpha = s.a * (0.15 + depth * 0.85) * clamp(s.z / 90, 0, 1) * ramp(0.9, 2.6, t);
        if (alpha < 0.03) continue;

        const wi = s.w > 2 ? 2 : s.w > 1.4 ? 1 : 0;
        const ai = alpha > 0.72 ? 2 : alpha > 0.42 ? 1 : 0;
        const b = buckets[wi * 3 + ai];
        b.push(px, py, qx, qy);
      }

      ctx!.lineCap = "round";
      for (let wi = 0; wi < 3; wi++) {
        for (let ai = 0; ai < 3; ai++) {
          const b = buckets[wi * 3 + ai];
          if (!b.length) continue;
          ctx!.strokeStyle = `rgba(255,255,255,${bucketA[ai]})`;
          ctx!.lineWidth = bucketW[wi];
          ctx!.beginPath();
          for (let i = 0; i < b.length; i += 4) {
            ctx!.moveTo(b[i], b[i + 1]);
            ctx!.lineTo(b[i + 2], b[i + 3]);
          }
          ctx!.stroke();
        }
      }

      // ── Earth ──────────────────────────────────────────────────────────
      // The one thing in the film that is not an abstraction. Everything the
      // rest of it talks about happens down there.
      const eIn = ramp(8.5, 12.9, t);
      const eOut = ramp(12.9, 14.1, t);
      if (eIn > 0.001 && eOut < 0.999) {
        // Ends with the disc just filling the frame. An earlier version ran to
        // 1.75x and pushed straight through the surface, at which point you are
        // not looking at a planet any more, you are looking at the brush work.
        const size = Math.max(width, height) * (0.02 + Math.pow(eIn, 2.4) * 0.92);
        ctx!.save();
        ctx!.globalAlpha = (1 - eOut) * clamp(eIn * 6, 0, 1);
        // Sits slightly off centre so the approach does not look like a target
        // reticle, and drifts towards the middle as we close on it.
        ctx!.translate(cx + (1 - eIn) * width * 0.14, cy - (1 - eIn) * height * 0.1);
        ctx!.drawImage(earth, -size / 2, -size / 2, size, size);
        ctx!.restore();
      }

      // ── The quiet middle ───────────────────────────────────────────────
      // Behind the explanatory scenes: near-empty space with a little colour,
      // so the type has somewhere to sit without competing with it.
      const calm = ramp(13.4, 15.5, t) * (1 - ramp(58, 60, t));
      if (calm > 0.002) {
        const g = ctx!.createRadialGradient(cx, cy * 1.1, 0, cx, cy, Math.max(width, height) * 0.75);
        g.addColorStop(0, `rgba(96,70,190,${(0.16 * calm).toFixed(3)})`);
        g.addColorStop(0.45, `rgba(48,40,120,${(0.07 * calm).toFixed(3)})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = g;
        ctx!.fillRect(0, 0, width, height);
      }

      // The intelligence everything orbits in the "why AI" scene.
      const core = ramp(51, 52.6, t) * (1 - ramp(57.6, 58.8, t));
      if (core > 0.002) {
        const pulse = 1 + Math.sin(t * 2.1) * 0.06;
        const r = Math.min(width, height) * 0.1 * pulse;
        const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(255,255,255,${(0.5 * core).toFixed(3)})`);
        g.addColorStop(0.3, `rgba(190,170,255,${(0.22 * core).toFixed(3)})`);
        g.addColorStop(1, "rgba(120,90,255,0)");
        ctx!.fillStyle = g;
        ctx!.fillRect(cx - r, cy - r, r * 2, r * 2);
      }

      // ── Report position, only when it changes ──────────────────────────
      const nowScene = SCENES.find((s) => t >= s.from && t < s.to)?.id ?? "final";
      if (nowScene !== scene) {
        scene = nowScene;
        cb.current.onScene(scene);
      }
      const nowCaption = CAPTIONS.findIndex((c) => t >= c.from && t < c.to);
      if (nowCaption !== caption) {
        caption = nowCaption;
        cb.current.onCaption(caption);
      }

      if (t >= RUNTIME) {
        cb.current.onEnd();
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    let resizeTimer: number | undefined;
    function onResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 180);
    }
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, [mobile]);

  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />;
}
