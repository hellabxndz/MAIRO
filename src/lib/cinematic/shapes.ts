// The shapes MAIRO's particles assemble into. Each is N points in a space
// about four units wide, centred on the origin, so any two can be morphed
// into each other point for point.
//
// Pure and deterministic (a seeded random), so the same scene draws the same
// way every visit and the rules can be checked without a browser
// (scripts/check-cinematic.ts). The one shape that needs a browser is the
// wordmark, sampled from text drawn on a canvas — see textShape().

export type ShapeKey =
  | "void" // far and faint: particles dispersed into darkness
  | "chaos" // disconnected fragments: the old way of advertising
  | "core" // the MAIRO core: shells and rings
  | "brief" // lines of a business description
  | "creative" // an ad: a frame, a picture, a headline
  | "network" // campaigns, connected
  | "results" // rising columns
  | "wordmark"; // M A I R O

export type Points = Float32Array;

/** A small seeded random (mulberry32), so shapes are the same on every visit. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const TAU = Math.PI * 2;

function fill(n: number, seed: number, at: (i: number, r: Rand, out: [number, number, number]) => void): Points {
  const r = seeded(seed);
  const p = new Float32Array(n * 3);
  const v: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    at(i, r, v);
    p[i * 3] = v[0];
    p[i * 3 + 1] = v[1];
    p[i * 3 + 2] = v[2];
  }
  return p;
}

/** A point on a sphere of radius r, evenly spread (Fibonacci). */
function sphere(i: number, n: number, r: number, out: [number, number, number]) {
  const y = 1 - ((i + 0.5) / n) * 2;
  const rad = Math.sqrt(1 - y * y);
  const th = i * 2.399963229728653;
  out[0] = Math.cos(th) * rad * r;
  out[1] = y * r;
  out[2] = Math.sin(th) * rad * r;
}

function rotate(out: [number, number, number], ax: number, ay: number) {
  const [x, y, z] = out;
  const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  out[0] = x1;
  out[1] = y * cx - z1 * sx;
  out[2] = y * sx + z1 * cx;
}

const SHAPES: Record<Exclude<ShapeKey, "wordmark">, (n: number) => Points> = {
  void: (n) =>
    fill(n, 11, (_, r, o) => {
      const d = 7 + r() * 9;
      sphere(Math.floor(r() * 4096), 4096, d, o);
    }),

  // Rectangles of UI scattered at odd angles: cards, charts, files.
  chaos: (n) => {
    const r0 = seeded(23);
    const panels = Array.from({ length: 14 }, () => ({
      x: (r0() - 0.5) * 7,
      y: (r0() - 0.5) * 3.6,
      z: (r0() - 0.5) * 4,
      w: 0.5 + r0() * 1.1,
      h: 0.3 + r0() * 0.8,
      ax: (r0() - 0.5) * 1.4,
      ay: (r0() - 0.5) * 1.8,
    }));
    return fill(n, 29, (i, r, o) => {
      const p = panels[i % panels.length];
      // Edges more than fill, so each reads as a panel.
      const edge = r() < 0.55;
      let u = r() - 0.5, v = r() - 0.5;
      if (edge) {
        if (r() < 0.5) u = r() < 0.5 ? -0.5 : 0.5;
        else v = r() < 0.5 ? -0.5 : 0.5;
      } else if (r() < 0.5) v = Math.round(v * 6) / 6; // lines of "text"
      o[0] = u * p.w; o[1] = v * p.h; o[2] = (r() - 0.5) * 0.02;
      rotate(o, p.ax, p.ay);
      o[0] += p.x; o[1] += p.y; o[2] += p.z;
    });
  },

  // Two shells and three tilted rings, with a bright heart.
  core: (n) =>
    fill(n, 37, (i, r, o) => {
      const k = r();
      if (k < 0.5) sphere(i, n, 1.15, o);
      else if (k < 0.68) sphere(i, n, 0.62, o);
      else if (k < 0.74) {
        const rr = Math.cbrt(r()) * 0.3;
        sphere(Math.floor(r() * 4096), 4096, rr, o);
      } else {
        const ring = Math.floor(r() * 3);
        const a = r() * TAU;
        const rad = 1.55 + ring * 0.22 + (r() - 0.5) * 0.04;
        o[0] = Math.cos(a) * rad; o[1] = (r() - 0.5) * 0.03; o[2] = Math.sin(a) * rad;
        rotate(o, 0.35 + ring * 0.55, ring * 1.1);
      }
    }),

  // A business described: lines of text in a column.
  brief: (n) =>
    fill(n, 41, (_, r, o) => {
      const line = Math.floor(r() * 9);
      const len = line === 0 ? 0.55 : 0.7 + ((line * 37) % 5) / 10;
      o[0] = -1.3 + r() * 2.6 * len;
      o[1] = 1.15 - line * 0.29 + (r() - 0.5) * (line === 0 ? 0.09 : 0.035);
      o[2] = (r() - 0.5) * 0.06;
    }),

  // An ad in a 4:5 frame: the picture, a headline, a button.
  creative: (n) =>
    fill(n, 43, (_, r, o) => {
      const W = 1.7, H = 2.15;
      const k = r();
      if (k < 0.28) {
        // the frame
        let u = r() - 0.5, v = r() - 0.5;
        if (r() < 0.5) u = r() < 0.5 ? -0.5 : 0.5;
        else v = r() < 0.5 ? -0.5 : 0.5;
        o[0] = u * W; o[1] = v * H;
      } else if (k < 0.78) {
        // the picture: a soft product silhouette in the top 60%
        const a = r() * TAU, rr = Math.sqrt(r());
        o[0] = Math.cos(a) * rr * 0.55;
        o[1] = 0.35 + Math.sin(a) * rr * 0.62;
      } else if (k < 0.93) {
        const line = Math.floor(r() * 2);
        o[0] = -0.7 + r() * (line ? 1.0 : 1.4);
        o[1] = -0.5 - line * 0.17;
      } else {
        o[0] = -0.7 + r() * 0.75;
        o[1] = -0.88 + (r() - 0.5) * 0.12;
      }
      o[2] = (r() - 0.5) * 0.05;
    }),

  // Campaign nodes around a hub, with links between them.
  network: (n) => {
    const nodes: [number, number, number][] = [[0, 0, 0]];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      nodes.push([Math.cos(a) * 1.9, Math.sin(a * 2) * 0.35, Math.sin(a) * 1.9]);
    }
    return fill(n, 47, (_, r, o) => {
      if (r() < 0.45) {
        const node = nodes[Math.floor(r() * nodes.length)];
        sphere(Math.floor(r() * 4096), 4096, node === nodes[0] ? 0.42 : 0.2 * Math.cbrt(r()) + 0.05, o);
        o[0] += node[0]; o[1] += node[1]; o[2] += node[2];
      } else {
        const a = 1 + Math.floor(r() * 6);
        const b = r() < 0.6 ? 0 : 1 + ((a + Math.floor(r() * 2)) % 6);
        const t = r();
        const A = nodes[a], B = nodes[b];
        o[0] = A[0] + (B[0] - A[0]) * t;
        o[1] = A[1] + (B[1] - A[1]) * t + Math.sin(t * Math.PI) * 0.12;
        o[2] = A[2] + (B[2] - A[2]) * t;
      }
    });
  },

  // Columns rising left to right on a base line.
  results: (n) =>
    fill(n, 53, (_, r, o) => {
      const cols = 7;
      const c = Math.floor(r() * cols);
      const h = 0.5 + (c / (cols - 1)) * 1.9 + Math.sin(c * 1.7) * 0.2;
      const base = -1.1;
      if (r() < 0.12) {
        o[0] = -2 + r() * 4; o[1] = base - 0.08; o[2] = (r() - 0.5) * 0.4;
      } else {
        o[0] = -1.8 + c * 0.6 + (r() - 0.5) * 0.32;
        o[1] = base + r() * h;
        o[2] = (r() - 0.5) * 0.32;
      }
    }),
};

/** A shape's points, cached per count. */
const cache = new Map<string, Points>();
export function shape(key: Exclude<ShapeKey, "wordmark">, n: number): Points {
  const id = `${key}:${n}`;
  let p = cache.get(id);
  if (!p) {
    p = SHAPES[key](n);
    cache.set(id, p);
  }
  return p;
}

/**
 * The wordmark, sampled from text drawn on a canvas: N points spread over
 * the letters' pixels, scaled to `width` units. Browser only. Falls back to
 * the core where there's no canvas.
 */
export function textShape(text: string, n: number, width = 4.6): Points {
  if (typeof document === "undefined") return shape("core", n);
  const c = document.createElement("canvas");
  const W = 900, H = 220;
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return shape("core", n);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "700 150px Inter, 'Helvetica Neue', Arial, sans-serif";
  // Widely spaced, as the wordmark is.
  const letters = text.split("");
  const spacing = 36;
  const widths = letters.map((l) => g.measureText(l).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (letters.length - 1);
  let x = (W - total) / 2;
  letters.forEach((l, i) => {
    g.fillText(l, x + widths[i] / 2, H / 2);
    x += widths[i] + spacing;
  });
  const data = g.getImageData(0, 0, W, H).data;
  const lit: number[] = [];
  for (let y = 0; y < H; y += 2) for (let xx = 0; xx < W; xx += 2) if (data[(y * W + xx) * 4 + 3] > 128) lit.push(xx, y);
  if (lit.length === 0) return shape("core", n);
  const r = seeded(59);
  const p = new Float32Array(n * 3);
  const scale = width / total;
  for (let i = 0; i < n; i++) {
    const k = Math.floor(r() * (lit.length / 2)) * 2;
    p[i * 3] = (lit[k] - W / 2 + (r() - 0.5) * 2) * scale;
    p[i * 3 + 1] = -(lit[k + 1] - H / 2 + (r() - 0.5) * 2) * scale;
    p[i * 3 + 2] = (r() - 0.5) * 0.12;
  }
  return p;
}

/** How many particles this device should draw. */
export function particleBudget(input: { width: number; cores?: number; memory?: number; reducedData?: boolean }, kind: "stage" | "core" = "stage"): number {
  const small = input.width < 768;
  const weak = (input.cores ?? 8) <= 4 || (input.memory ?? 8) <= 4 || input.reducedData;
  if (kind === "core") return weak ? 1400 : small ? 2200 : 3200;
  if (weak) return small ? 3000 : 6000;
  return small ? 7000 : 16000;
}
