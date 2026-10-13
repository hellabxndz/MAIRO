// The landing-page story as a deterministic timeline: every element's box,
// opacity and depth is a pure function of time and layout. The animated hero,
// the reduced-motion version and the rendered video all read the same
// function, so the video is frame-for-frame the page.
//
// Two compositions: "wide" (desktop) and "narrow" (phone), designed
// separately — the phone version restacks the scenes rather than shrinking
// the desktop one.

export type Layout = "wide" | "narrow";
export type Box = { x: number; y: number; w: number; h: number; o: number; s: number; z: number };
type Key = [number, Partial<Box>];

export const STAGE: Record<Layout, { w: number; h: number }> = { wide: { w: 760, h: 560 }, narrow: { w: 360, h: 600 } };

export type ChapterId = "business" | "plan" | "creative" | "approval" | "results";
export type Scene = { id: ChapterId | "invite"; label: string; start: number; end: number };

export const HERO_SCENES: Scene[] = [
  { id: "business", label: "Start with your business.", start: 0, end: 3000 },
  { id: "plan", label: "Build around your offer.", start: 3000, end: 6000 },
  { id: "creative", label: "Explore your campaign.", start: 6000, end: 10000 },
  { id: "approval", label: "Review before launch.", start: 10000, end: 14000 },
  { id: "results", label: "Understand your results.", start: 14000, end: 18000 },
  { id: "invite", label: "What could MAIRO create for your business?", start: 18000, end: 20000 },
];
export const HERO_DURATION = 20000;

export const CHAPTERS: { id: ChapterId; label: string; describe: string }[] = [
  { id: "business", label: "Business", describe: "A fictional business's website and its address going into MAIRO." },
  { id: "plan", label: "Plan", describe: "The website becomes a short business profile: offer, audience, location and brand style." },
  { id: "creative", label: "Creative", describe: "Three different ad concepts built from the profile; one is selected." },
  { id: "approval", label: "Approval", describe: "The selected ad in the feed and as a vertical story, with an example budget and the owner's approval." },
  { id: "results", label: "Results", describe: "A simple dashboard showing where spend and results appear, and a proposed next action with its reason." },
];

export function sceneAt(t: number, scenes: Scene[] = HERO_SCENES): Scene {
  return scenes.find((s) => t >= s.start && t < s.end) ?? scenes[scenes.length - 1];
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const BASE: Box = { x: 0, y: 0, w: 100, h: 100, o: 0, s: 1, z: 0 };

/** Keyframes → a box at time t, easing between neighbours and holding at the ends. */
export function track(keys: Key[]): (t: number) => Box {
  // Fill each key from the one before it, so a key only states what changes.
  const filled: [number, Box][] = [];
  let prev = BASE;
  for (const [t, k] of keys) {
    prev = { ...prev, ...k };
    filled.push([t, prev]);
  }
  return (t: number) => {
    if (t <= filled[0][0]) return filled[0][1];
    for (let i = 1; i < filled.length; i++) {
      const [t1, b1] = filled[i];
      if (t <= t1) {
        const [t0, b0] = filled[i - 1];
        const p = t1 === t0 ? 1 : ease((t - t0) / (t1 - t0));
        const mix = (a: number, b: number) => a + (b - a) * p;
        return { x: mix(b0.x, b1.x), y: mix(b0.y, b1.y), w: mix(b0.w, b1.w), h: mix(b0.h, b1.h), o: mix(b0.o, b1.o), s: mix(b0.s, b1.s), z: b1.z };
      }
    }
    return filled[filled.length - 1][1];
  };
}

/** 0→1 over [a, b], eased; for fades and reveals inside an element. */
export function reveal(t: number, a: number, b: number): number {
  if (t <= a) return 0;
  if (t >= b) return 1;
  return ease((t - a) / (b - a));
}

export type ElementId = "browser" | "input" | "profile" | "c0" | "c1" | "c2" | "feed" | "story" | "review" | "dashboard" | "invite";

/**
 * Positions for each element, per layout. Concepts c0–c2 are positional
 * (left, centre, right); the selected concept is always drawn in the centre
 * slot so it can grow into the feed preview.
 */
function wide(): Record<ElementId, (t: number) => Box> {
  return {
    browser: track([
      [0, { x: 70, y: 70, w: 470, h: 310, o: 0, s: 0.97 }],
      [700, { o: 1, s: 1 }],
      [3000, {}],
      [3700, { x: 28, y: 110, w: 340, h: 270 }],
      [6000, {}],
      [6500, { x: -40, o: 0, s: 0.92 }],
    ]),
    input: track([
      [0, { x: 160, y: 420, w: 440, h: 58, o: 0, z: 3 }],
      [500, { o: 1 }],
      [3000, {}],
      [3500, { y: 450, o: 0 }],
    ]),
    profile: track([
      [3400, { x: 396, y: 84, w: 336, h: 350, o: 0, s: 0.96, z: 2 }],
      [4000, { o: 1, s: 1 }],
      [6000, {}],
      [6700, { x: 40, y: 52, w: 680, h: 60 }],
      [10000, {}],
      [10500, { o: 0, y: 30 }],
    ]),
    c0: track([
      [6300, { x: 160, y: 60, w: 150, h: 40, o: 0, z: 1 }],
      [7200, { x: 40, y: 140, w: 210, h: 320, o: 1 }],
      [8000, {}],
      [8800, { x: 20, y: 165, w: 190, h: 290, o: 0.82 }],
      [10000, {}],
      [10500, { x: -20, o: 0 }],
    ]),
    c1: track([
      [6400, { x: 300, y: 60, w: 160, h: 40, o: 0, z: 2 }],
      [7300, { x: 275, y: 140, w: 210, h: 320, o: 1 }],
      [8000, {}],
      [8800, { x: 245, y: 128, w: 270, h: 370 }],
      [10000, {}],
      [10800, { x: 58, y: 56, w: 250, h: 456 }],
      [14000, {}],
      [14600, { x: 40, y: 60, w: 220, h: 420, o: 0 }],
    ]),
    c2: track([
      [6500, { x: 440, y: 60, w: 150, h: 40, o: 0, z: 1 }],
      [7400, { x: 510, y: 140, w: 210, h: 320, o: 1 }],
      [8000, {}],
      [8800, { x: 550, y: 165, w: 190, h: 290, o: 0.82 }],
      [10000, {}],
      [10500, { x: 600, o: 0 }],
    ]),
    feed: track([[0, { x: 58, y: 56, w: 250, h: 456, o: 0 }]]),
    story: track([
      [10500, { x: 340, y: 60, w: 180, h: 440, o: 0, s: 0.94, z: 2 }],
      [11200, { y: 56, h: 456, o: 1, s: 1 }],
      [14000, {}],
      [14600, { o: 0, s: 0.94 }],
    ]),
    review: track([
      [10900, { x: 548, y: 110, w: 190, h: 330, o: 0, s: 0.95, z: 3 }],
      [11500, { o: 1, s: 1 }],
      [14000, {}],
      [14800, { x: 60, y: 100, w: 640, h: 330, o: 0 }],
    ]),
    dashboard: track([
      [14000, { x: 548, y: 110, w: 190, h: 330, o: 0, z: 2 }],
      [14800, { x: 60, y: 100, w: 640, h: 330, o: 1 }],
      [18000, {}],
      [18600, { x: 110, y: 110, w: 540, h: 300, o: 0.18, s: 0.94 }],
      [20000, {}],
    ]),
    invite: track([
      [18200, { x: 130, y: 220, w: 500, h: 130, o: 0, s: 0.96, z: 4 }],
      [18900, { o: 1, s: 1 }],
    ]),
  };
}

function narrow(): Record<ElementId, (t: number) => Box> {
  return {
    browser: track([
      [0, { x: 16, y: 60, w: 328, h: 300, o: 0, s: 0.97 }],
      [700, { o: 1, s: 1 }],
      [3000, {}],
      [3700, { x: 16, y: 56, w: 328, h: 140, o: 0.9 }],
      [6000, {}],
      [6500, { y: 10, o: 0 }],
    ]),
    input: track([
      [0, { x: 16, y: 380, w: 328, h: 56, o: 0, z: 3 }],
      [500, { o: 1 }],
      [3000, {}],
      [3500, { y: 410, o: 0 }],
    ]),
    profile: track([
      [3400, { x: 16, y: 214, w: 328, h: 330, o: 0, s: 0.96, z: 2 }],
      [4000, { o: 1, s: 1 }],
      [6000, {}],
      [6700, { x: 16, y: 52, w: 328, h: 64 }],
      [10000, {}],
      [10500, { o: 0, y: 30 }],
    ]),
    c0: track([
      [6300, { x: 40, y: 70, w: 120, h: 40, o: 0, z: 1 }],
      [7200, { x: -110, y: 150, w: 170, h: 300, o: 0.7 }],
      [10000, {}],
      [10500, { x: -160, o: 0 }],
    ]),
    c1: track([
      [6400, { x: 120, y: 70, w: 120, h: 40, o: 0, z: 2 }],
      [7300, { x: 75, y: 130, w: 210, h: 340, o: 1 }],
      [8000, {}],
      [8800, { x: 60, y: 120, w: 240, h: 380 }],
      [10000, {}],
      [10800, { x: 16, y: 52, w: 196, h: 326 }],
      [14000, {}],
      [14600, { o: 0, s: 0.94 }],
    ]),
    c2: track([
      [6500, { x: 200, y: 70, w: 120, h: 40, o: 0, z: 1 }],
      [7400, { x: 300, y: 150, w: 170, h: 300, o: 0.7 }],
      [10000, {}],
      [10500, { x: 360, o: 0 }],
    ]),
    feed: track([[0, { x: 16, y: 52, w: 196, h: 326, o: 0 }]]),
    story: track([
      [10500, { x: 224, y: 64, w: 120, h: 314, o: 0, s: 0.94, z: 2 }],
      [11200, { y: 52, h: 326, o: 1, s: 1 }],
      [14000, {}],
      [14600, { o: 0 }],
    ]),
    review: track([
      [10900, { x: 16, y: 390, w: 328, h: 162, o: 0, s: 0.95, z: 3 }],
      [11500, { o: 1, s: 1 }],
      [14000, {}],
      [14800, { x: 16, y: 80, w: 328, h: 410, o: 0 }],
    ]),
    dashboard: track([
      [14000, { x: 16, y: 390, w: 328, h: 162, o: 0, z: 2 }],
      [14800, { x: 16, y: 80, w: 328, h: 410, o: 1 }],
      [18000, {}],
      [18600, { x: 36, y: 100, w: 288, h: 380, o: 0.18, s: 0.94 }],
    ]),
    invite: track([
      [18200, { x: 16, y: 210, w: 328, h: 170, o: 0, s: 0.96, z: 4 }],
      [18900, { o: 1, s: 1 }],
    ]),
  };
}

const TRACKS: Record<Layout, Record<ElementId, (t: number) => Box>> = { wide: wide(), narrow: narrow() };

export function boxes(t: number, layout: Layout): Record<ElementId, Box> {
  const tr = TRACKS[layout];
  return Object.fromEntries((Object.keys(tr) as ElementId[]).map((k) => [k, tr[k](t)])) as Record<ElementId, Box>;
}

/** The camera: a little depth that changes per scene, never a spin. */
const CAMERA = track([
  [0, { x: 6, y: -7, s: 0.985 }],
  [3000, {}],
  [3600, { x: 3, y: -3, s: 1 }],
  [6000, {}],
  [6600, { x: 0, y: 0, s: 1 }],
  [10000, {}],
  [10600, { x: 2, y: 4, s: 1 }],
  [14000, {}],
  [14600, { x: 4, y: 0, s: 1 }],
  [18000, {}],
  [18600, { x: 0, y: 0, s: 0.985 }],
]);

/** rotateX (x) and rotateY (y) in degrees, and a scale. */
export function camera(t: number): { rx: number; ry: number; s: number } {
  const c = CAMERA(t);
  return { rx: c.x, ry: c.y, s: c.s };
}

/** The time the timeline rests on for a chapter when motion is reduced or a chapter is chosen while paused. */
export function restingTime(id: ChapterId | "invite"): number {
  return { business: 2900, plan: 5900, creative: 9900, approval: 13900, results: 17900, invite: 19900 }[id];
}

export function chapterStart(id: ChapterId): number {
  return HERO_SCENES.find((s) => s.id === id)!.start;
}

/** WebVTT captions for the rendered video — the same labels the page shows. */
export function captionsVtt(scenes: Scene[] = HERO_SCENES): string {
  const ts = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const f = ms % 1000;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(3, "0")}`;
  };
  return ["WEBVTT", "", ...scenes.flatMap((s, i) => [`${i + 1}`, `${ts(s.start)} --> ${ts(s.end)}`, s.label, ""])].join("\n");
}
