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

export type ChapterId = "business" | "understanding" | "creatives" | "editing" | "approval" | "results";
export type Scene = { id: ChapterId | "invite"; label: string; start: number; end: number };

export const HERO_SCENES: Scene[] = [
  { id: "business", label: "Start with your business.", start: 0, end: 4000 },
  { id: "understanding", label: "Your offer. Your audience. Your goals.", start: 4000, end: 8000 },
  { id: "creatives", label: "See what MAIRO recommends—and why.", start: 8000, end: 13000 },
  { id: "editing", label: "Create a new ad. Or improve your footage.", start: 13000, end: 17000 },
  { id: "approval", label: "Your campaign. Your approval.", start: 17000, end: 20000 },
  { id: "results", label: "See what's working—and what's next.", start: 20000, end: 22600 },
  { id: "invite", label: "What could MAIRO create for your business?", start: 22600, end: 24000 },
];
export const HERO_DURATION = 24000;

export const CHAPTERS: { id: ChapterId; label: string; describe: string }[] = [
  { id: "business", label: "Business", describe: "A fictional business's website address goes into MAIRO and its website opens." },
  { id: "understanding", label: "Understanding", describe: "MAIRO points out the offer, the imagery and the call to action, turns them into what the business sells, who it serves and its goal, and the owner confirms them." },
  { id: "creatives", label: "Creatives", describe: "Three ad concepts, each with a picture, a hook and a button. One is recommended as the first test, with the reason." },
  { id: "editing", label: "Editing", describe: "The recommended ad as a finished draft in the feed and as a vertical story. The owner chooses their own video, which is trimmed to start at the demonstration, captioned and cropped to 9:16 as a new file." },
  { id: "approval", label: "Approval", describe: "A review of the ad, where it sends people and an example budget. The owner approves; in this demo nothing is sent to Meta." },
  { id: "results", label: "Results", describe: "A simple dashboard of what happened after the ads, in sample figures, and a recommendation with its evidence, waiting for the owner's approval." },
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

export type ElementId =
  | "browser"
  | "input"
  | "p0"
  | "p1"
  | "p2"
  | "confirm"
  | "c0"
  | "c1"
  | "c2"
  | "reason"
  | "story"
  | "actions"
  | "edit"
  | "review"
  | "dashboard"
  | "invite";

/** The moments inside elements — typing, highlights, ticks, presses. Both compositions share them. */
export const MOMENTS = {
  typeFrom: 500,
  typeTo: 2000,
  press: 2250,
  marks: [4500, 4900, 5300],
  marksEnd: 7600,
  ticks: [6900, 7050, 7200],
  confirm: 7400,
  recommend: 10400,
  useVideo: 14350,
  after: 15300,
  editTicks: [15500, 15800, 16100, 16400],
  approve: 18500,
  journey: [20500, 20800, 21100],
  recommendation: 21500,
} as const;

/**
 * Positions for each element, per layout. Concepts c0–c2 are positional
 * (left, centre, right); the recommended concept is always drawn in the
 * centre slot, so it can grow into the feed preview and then sit inside the
 * review panel. The three business cards (p0–p2) come out of the website and
 * become the strip the concepts are built on.
 */
function wide(): Record<ElementId, (t: number) => Box> {
  return {
    input: track([
      [0, { x: 160, y: 251, w: 440, h: 58, o: 0, z: 3 }],
      [350, { o: 1 }],
      [2500, {}],
      [3200, { x: 150, y: 452, w: 460, h: 52 }],
      [4000, {}],
      [4500, { y: 470, o: 0 }],
    ]),
    browser: track([
      [2500, { x: 150, y: 70, w: 460, h: 360, o: 0, s: 0.96, z: 1 }],
      [3200, { o: 1, s: 1 }],
      [4000, {}],
      [4600, { x: 28, y: 96, w: 360, h: 300 }],
      [8000, {}],
      [8600, { x: -20, o: 0, s: 0.94 }],
    ]),
    p0: track([
      [5300, { x: 260, y: 120, w: 200, h: 60, o: 0, z: 2 }],
      [5800, { x: 408, y: 76, w: 324, h: 104, o: 1 }],
      [8000, {}],
      [8600, { x: 40, y: 48, w: 220, h: 48 }],
      [12600, {}],
      [13100, { y: 30, o: 0 }],
    ]),
    p1: track([
      [5600, { x: 260, y: 240, w: 200, h: 60, o: 0, z: 2 }],
      [6100, { x: 408, y: 192, w: 324, h: 104, o: 1 }],
      [8000, {}],
      [8600, { x: 270, y: 48, w: 220, h: 48 }],
      [12600, {}],
      [13100, { y: 30, o: 0 }],
    ]),
    p2: track([
      [5900, { x: 260, y: 330, w: 200, h: 60, o: 0, z: 2 }],
      [6400, { x: 408, y: 308, w: 324, h: 104, o: 1 }],
      [8000, {}],
      [8600, { x: 500, y: 48, w: 220, h: 48 }],
      [12600, {}],
      [13100, { y: 30, o: 0 }],
    ]),
    confirm: track([
      [6500, { x: 408, y: 436, w: 324, h: 52, o: 0, s: 0.96, z: 2 }],
      [6900, { y: 424, o: 1, s: 1 }],
      [7900, {}],
      [8400, { y: 444, o: 0 }],
    ]),
    c0: track([
      [8200, { x: 150, y: 60, w: 150, h: 40, o: 0, z: 1 }],
      [9100, { x: 40, y: 120, w: 210, h: 330, o: 1 }],
      [10000, {}],
      [10600, { x: 24, y: 150, w: 170, h: 270, o: 0.5 }],
      [12600, {}],
      [13100, { x: -30, o: 0 }],
    ]),
    c1: track([
      [8300, { x: 300, y: 60, w: 160, h: 40, o: 0, z: 4 }],
      [9200, { x: 275, y: 120, w: 210, h: 330, o: 1 }],
      [10000, {}],
      [10600, { x: 220, y: 92, w: 290, h: 420 }],
      [13000, {}],
      [13700, { x: 40, y: 56, w: 250, h: 456 }],
      [17000, {}],
      [17700, { x: 172, y: 124, w: 170, h: 300 }],
      [19800, {}],
      [20300, { o: 0, s: 0.96 }],
    ]),
    c2: track([
      [8400, { x: 450, y: 60, w: 150, h: 40, o: 0, z: 1 }],
      [9300, { x: 510, y: 120, w: 210, h: 330, o: 1 }],
      [10000, {}],
      [10600, { x: 566, y: 150, w: 170, h: 270, o: 0.5 }],
      [10900, {}],
      [11300, { x: 640, o: 0 }],
    ]),
    reason: track([
      [10900, { x: 540, y: 170, w: 200, h: 250, o: 0, s: 0.96, z: 3 }],
      [11400, { x: 528, y: 150, w: 212, h: 270, o: 1, s: 1 }],
      [12600, {}],
      [13100, { x: 560, o: 0 }],
    ]),
    story: track([
      [13300, { x: 310, y: 96, w: 196, h: 384, o: 0, s: 0.95, z: 2 }],
      [13900, { y: 80, h: 400, w: 200, o: 1, s: 1 }],
      [14500, {}],
      [15000, { o: 0, s: 0.95 }],
    ]),
    actions: track([
      [13600, { x: 530, y: 96, w: 210, h: 178, o: 0, s: 0.96, z: 3 }],
      [14100, { y: 80, o: 1, s: 1 }],
      [14700, {}],
      [15200, { x: 310, y: 64, w: 430, h: 112 }],
      [16900, {}],
      [17400, { y: 40, o: 0 }],
    ]),
    edit: track([
      [14800, { x: 310, y: 216, w: 430, h: 296, o: 0, s: 0.97, z: 3 }],
      [15300, { y: 192, h: 320, o: 1, s: 1 }],
      [16900, {}],
      [17400, { y: 230, o: 0, s: 0.97 }],
    ]),
    review: track([
      [17100, { x: 150, y: 84, w: 460, h: 400, o: 0, s: 0.97, z: 3 }],
      [17700, { y: 70, o: 1, s: 1 }],
      [19800, {}],
      [20400, { x: 40, y: 60, w: 680, h: 390, o: 0 }],
    ]),
    dashboard: track([
      [19800, { x: 150, y: 70, w: 460, h: 400, o: 0, z: 2 }],
      [20400, { x: 40, y: 60, w: 680, h: 390, o: 1 }],
      [22600, {}],
      [23100, { x: 100, y: 96, w: 560, h: 350, o: 0.1, s: 0.97 }],
    ]),
    invite: track([
      [22700, { x: 130, y: 210, w: 500, h: 140, o: 0, s: 0.96, z: 5 }],
      [23200, { o: 1, s: 1 }],
    ]),
  };
}

function narrow(): Record<ElementId, (t: number) => Box> {
  return {
    input: track([
      [0, { x: 16, y: 270, w: 328, h: 56, o: 0, z: 3 }],
      [350, { o: 1 }],
      [2500, {}],
      [3200, { y: 452, h: 52 }],
      [4000, {}],
      [4500, { y: 520, o: 0 }],
    ]),
    browser: track([
      [2500, { x: 16, y: 72, w: 328, h: 360, o: 0, s: 0.96, z: 1 }],
      [3200, { y: 56, h: 380, o: 1, s: 1 }],
      [4000, {}],
      [4600, { y: 52, h: 204 }],
      [8000, {}],
      [8600, { y: 20, o: 0, s: 0.94 }],
    ]),
    p0: track([
      [5300, { x: 40, y: 220, w: 280, h: 50, o: 0, z: 2 }],
      [5800, { x: 16, y: 268, w: 328, h: 66, o: 1 }],
      [8000, {}],
      [8600, { x: 16, y: 48, w: 104, h: 40 }],
      [12600, {}],
      [13100, { y: 30, o: 0 }],
    ]),
    p1: track([
      [5600, { x: 40, y: 300, w: 280, h: 50, o: 0, z: 2 }],
      [6100, { x: 16, y: 342, w: 328, h: 66, o: 1 }],
      [8000, {}],
      [8600, { x: 128, y: 48, w: 104, h: 40 }],
      [12600, {}],
      [13100, { y: 30, o: 0 }],
    ]),
    p2: track([
      [5900, { x: 40, y: 380, w: 280, h: 50, o: 0, z: 2 }],
      [6400, { x: 16, y: 416, w: 328, h: 66, o: 1 }],
      [8000, {}],
      [8600, { x: 240, y: 48, w: 104, h: 40 }],
      [12600, {}],
      [13100, { y: 30, o: 0 }],
    ]),
    confirm: track([
      [6500, { x: 16, y: 508, w: 328, h: 50, o: 0, s: 0.96, z: 2 }],
      [6900, { y: 496, o: 1, s: 1 }],
      [7900, {}],
      [8400, { y: 516, o: 0 }],
    ]),
    c0: track([
      [8200, { x: 40, y: 70, w: 120, h: 40, o: 0, z: 1 }],
      [9100, { x: -110, y: 130, w: 170, h: 290, o: 0.7 }],
      [10000, {}],
      [10600, { x: -150, o: 0.35 }],
      [11000, { x: -180, o: 0 }],
    ]),
    c1: track([
      [8300, { x: 120, y: 70, w: 120, h: 40, o: 0, z: 4 }],
      [9200, { x: 75, y: 110, w: 210, h: 330, o: 1 }],
      [10000, {}],
      [10600, { x: 50, y: 98, w: 260, h: 352 }],
      [13000, {}],
      [13700, { x: 16, y: 52, w: 196, h: 330 }],
      [14700, {}],
      [15100, { o: 0, s: 0.96 }],
      [17000, { x: 32, y: 108, w: 124, h: 206 }],
      [17600, { o: 1, s: 1 }],
      [19800, {}],
      [20300, { o: 0, s: 0.96 }],
    ]),
    c2: track([
      [8400, { x: 200, y: 70, w: 120, h: 40, o: 0, z: 1 }],
      [9300, { x: 300, y: 130, w: 170, h: 290, o: 0.7 }],
      [10000, {}],
      [10600, { x: 330, o: 0.35 }],
      [11000, { x: 360, o: 0 }],
    ]),
    reason: track([
      [10900, { x: 16, y: 476, w: 328, h: 84, o: 0, s: 0.96, z: 3 }],
      [11400, { y: 462, h: 96, o: 1, s: 1 }],
      [12600, {}],
      [13100, { y: 480, o: 0 }],
    ]),
    story: track([
      [13300, { x: 224, y: 64, w: 120, h: 318, o: 0, s: 0.95, z: 2 }],
      [13900, { y: 52, h: 330, o: 1, s: 1 }],
      [14600, {}],
      [15100, { o: 0, s: 0.95 }],
    ]),
    actions: track([
      [13600, { x: 16, y: 406, w: 328, h: 104, o: 0, s: 0.96, z: 3 }],
      [14100, { y: 394, o: 1, s: 1 }],
      [14700, {}],
      [15200, { y: 52, h: 96 }],
      [16900, {}],
      [17400, { y: 30, o: 0 }],
    ]),
    edit: track([
      [14800, { x: 16, y: 180, w: 328, h: 330, o: 0, s: 0.97, z: 3 }],
      [15300, { y: 160, h: 340, o: 1, s: 1 }],
      [16900, {}],
      [17400, { y: 200, o: 0, s: 0.97 }],
    ]),
    review: track([
      [17100, { x: 16, y: 72, w: 328, h: 420, o: 0, s: 0.97, z: 3 }],
      [17700, { y: 56, o: 1, s: 1 }],
      [19800, {}],
      [20400, { y: 52, h: 440, o: 0 }],
    ]),
    dashboard: track([
      [19800, { x: 16, y: 72, w: 328, h: 420, o: 0, z: 2 }],
      [20400, { y: 52, h: 440, o: 1 }],
      [22600, {}],
      [23100, { x: 36, y: 90, w: 288, h: 400, o: 0.1, s: 0.97 }],
    ]),
    invite: track([
      [22700, { x: 16, y: 200, w: 328, h: 170, o: 0, s: 0.96, z: 5 }],
      [23200, { o: 1, s: 1 }],
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
  [0, { x: 3, y: -4, s: 0.99 }],
  [4000, {}],
  [4600, { x: 2, y: -2, s: 1 }],
  [8000, {}],
  [8600, { x: 0, y: 0, s: 1 }],
  [13000, {}],
  [13600, { x: 1, y: 2, s: 1 }],
  [17000, {}],
  [17600, { x: 0, y: 0, s: 1 }],
  [20000, {}],
  [20600, { x: 2, y: 0, s: 1 }],
  [22600, {}],
  [23200, { x: 0, y: 0, s: 0.99 }],
]);

/** rotateX (x) and rotateY (y) in degrees, and a scale. */
export function camera(t: number): { rx: number; ry: number; s: number } {
  const c = CAMERA(t);
  return { rx: c.x, ry: c.y, s: c.s };
}

/** The time the timeline rests on for a chapter when motion is reduced or a chapter is chosen while paused. */
export function restingTime(id: ChapterId | "invite"): number {
  return { business: 3900, understanding: 7800, creatives: 12500, editing: 16800, approval: 19600, results: 22400, invite: 23900 }[id];
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
