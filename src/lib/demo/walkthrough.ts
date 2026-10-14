import { track, type Box, type Layout } from "./timeline";

// The MAIRO demo: a 73-second product walkthrough in seven scenes, one sample
// business (Brightwater Plumbing, from lib/demo/examples.ts) going from its
// website to its first results. A pure function of time, in two compositions,
// every figure sample data.
//
// The script (docs/WALKTHROUGH-SCRIPT.md) is written for a narrator. Until a
// licensed voice records it, the narration is the captions — the same lines,
// the same timings — and the player says there's no voice-over.
//
// Scenes 2–6 are the product's own screens, played on an inner clock: the
// original 60-second walkthrough's timings, mapped onto the new scenes
// (innerTime). The intro and the ending are drawn over them.

export const WALK_DURATION = 73000;

export type WalkChapterId = "intro" | "business" | "strategy" | "creative" | "approval" | "performance" | "ending";

export type WalkScene = { id: WalkChapterId; label: string; start: number; end: number };

export const WALK_SCENES: WalkScene[] = [
  { id: "intro", label: "Meet MAIRO", start: 0, end: 8000 },
  { id: "business", label: "Your business", start: 8000, end: 19000 },
  { id: "strategy", label: "Your ad strategy", start: 19000, end: 30000 },
  { id: "creative", label: "Creative Studio", start: 30000, end: 43000 },
  { id: "approval", label: "Your approval", start: 43000, end: 53000 },
  { id: "performance", label: "Your results", start: 53000, end: 65000 },
  { id: "ending", label: "Your free ad plan", start: 65000, end: 73000 },
];

export const WALK_CHAPTERS: { id: WalkChapterId; label: string }[] = [
  { id: "intro", label: "Intro" },
  { id: "business", label: "Business" },
  { id: "strategy", label: "Strategy" },
  { id: "creative", label: "Creative" },
  { id: "approval", label: "Approval" },
  { id: "performance", label: "Results" },
  { id: "ending", label: "Free plan" },
];

/**
 * The narration, line by line, timed to the scenes. They are the script, the
 * captions, the WebVTT file and the text burned into the video.
 */
export const WALK_CAPTIONS: { start: number; end: number; text: string }[] = [
  { start: 0, end: 8000, text: "Your business deserves more than another complicated advertising dashboard." },
  { start: 8000, end: 11800, text: "Meet MAIRO. Your AI advertising team." },
  { start: 11800, end: 19000, text: "Start with your website, and MAIRO builds an understanding of your business." },
  { start: 19000, end: 24200, text: "MAIRO recommends an advertising strategy" },
  { start: 24200, end: 30000, text: "and shows you which creative ideas are worth testing first." },
  { start: 30000, end: 35800, text: "Review your ad concepts, customize the message," },
  { start: 35800, end: 43000, text: "and turn your brand into creative that fits your goals." },
  { start: 43000, end: 46800, text: "When you're ready, connect your Meta account." },
  { start: 46800, end: 49800, text: "Review the campaign, approve your budget," },
  { start: 49800, end: 53000, text: "and stay in control before anything launches." },
  { start: 53000, end: 57000, text: "Follow your results in one place." },
  { start: 57000, end: 60800, text: "Understand what's working, what needs attention," },
  { start: 60800, end: 65000, text: "and what MAIRO recommends next." },
  { start: 65000, end: 73000, text: "You run the business. MAIRO runs the ads." },
];

/** The words on screen in the intro and the ending — motion typography, not captions. */
export const WALK_ONSCREEN = { intro: "MEET MAIRO.", endLines: ["You run the business.", "MAIRO runs the ads."], cta: "BUILD YOUR FREE AD PLAN" } as const;

/**
 * The product scenes' own clock. Each segment maps a stretch of the demo onto
 * the original walkthrough's timings: [demo from, demo to, inner from, inner to].
 * The last scene holds before the ending covers it.
 */
const INNER: [number, number, number, number][] = [
  [8000, 19000, 0, 17000],
  [19000, 30000, 17000, 27000],
  [30000, 43000, 27000, 38000],
  [43000, 53000, 38000, 49000],
  [53000, 64200, 49000, 58500],
];

export function innerTime(t: number): number {
  if (t < INNER[0][0]) return 0;
  for (const [a, b, x, y] of INNER) if (t < b) return x + ((t - a) / (b - a)) * (y - x);
  return INNER[INNER.length - 1][3];
}

export function walkSceneAt(t: number) {
  return WALK_SCENES.find((s) => t >= s.start && t < s.end) ?? WALK_SCENES[WALK_SCENES.length - 1];
}

export function walkCaptionAt(t: number) {
  return WALK_CAPTIONS.find((c) => t >= c.start && t < c.end) ?? WALK_CAPTIONS[WALK_CAPTIONS.length - 1];
}

/** Where each chapter rests when chosen while paused or with reduced motion: the end of its scene, everything shown. */
export function walkRestingTime(id: WalkChapterId): number {
  return WALK_SCENES.find((s) => s.id === id)!.end - 200;
}

export function walkChapterStart(id: WalkChapterId): number {
  return WALK_SCENES.find((s) => s.id === id)!.start;
}

export function walkCaptionsVtt(): string {
  const ts = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const f = ms % 1000;
    return `00:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(3, "0")}`;
  };
  return ["WEBVTT", "", ...WALK_CAPTIONS.flatMap((c, i) => [`${i + 1}`, `${ts(c.start)} --> ${ts(c.end)}`, c.text, ""])].join("\n");
}

export type WalkElement = "browser" | "input" | "goal" | "facts" | "plan" | "c0" | "c1" | "c2" | "editor" | "feed" | "story" | "readiness" | "review" | "dashboard" | "end";

function wide(): Record<WalkElement, (t: number) => Box> {
  return {
    input: track([
      [0, { x: 150, y: 400, w: 460, h: 58, o: 0, z: 3 }],
      [400, { o: 1 }],
      [3300, {}],
      [3800, { y: 430, o: 0 }],
    ]),
    browser: track([
      [300, { x: 110, y: 56, w: 540, h: 320, o: 0, s: 0.97 }],
      [1000, { o: 1, s: 1 }],
      [3300, {}],
      [4000, { x: 28, y: 90, w: 340, h: 270 }],
      [16500, {}],
      [17200, { x: -20, o: 0 }],
    ]),
    goal: track([
      [3600, { x: 400, y: 70, w: 330, h: 360, o: 0, s: 0.96, z: 2 }],
      [4200, { o: 1, s: 1 }],
      [7700, {}],
      [8300, { y: 40, o: 0 }],
    ]),
    facts: track([
      [8000, { x: 396, y: 70, w: 336, h: 380, o: 0, s: 0.96, z: 2 }],
      [8600, { y: 64, h: 396, o: 1, s: 1 }],
      [16600, {}],
      [17200, { o: 0, s: 0.96 }],
    ]),
    plan: track([
      [17000, { x: 90, y: 110, w: 580, h: 320, o: 0, s: 0.96, z: 2 }],
      [17600, { y: 96, h: 330, o: 1, s: 1 }],
      [26500, {}],
      [27100, { y: 70, o: 0 }],
    ]),
    c0: track([
      [27000, { x: 160, y: 120, w: 150, h: 60, o: 0, z: 1 }],
      [27900, { x: 40, y: 110, w: 210, h: 330, o: 1 }],
      [30500, {}],
      [31200, { x: 0, o: 0 }],
    ]),
    c1: track([
      [27100, { x: 300, y: 120, w: 160, h: 60, o: 0, z: 2 }],
      [28000, { x: 275, y: 110, w: 210, h: 330, o: 1 }],
      [30000, {}],
      [30700, { x: 245, y: 90, w: 270, h: 380 }],
      [31000, {}],
      [31700, { x: 40, y: 56, w: 280, h: 420 }],
      [34000, {}],
      [34800, { x: 58, y: 56, w: 250, h: 440 }],
      [37600, {}],
      [38200, { o: 0, s: 0.95 }],
    ]),
    c2: track([
      [27200, { x: 440, y: 120, w: 150, h: 60, o: 0, z: 1 }],
      [28100, { x: 510, y: 110, w: 210, h: 330, o: 1 }],
      [30500, {}],
      [31200, { x: 560, o: 0 }],
    ]),
    editor: track([
      [31200, { x: 360, y: 180, w: 360, h: 160, o: 0, s: 0.96, z: 3 }],
      [31800, { o: 1, s: 1 }],
      [34000, {}],
      [34800, { x: 540, y: 150, w: 196, h: 230 }],
      [37600, {}],
      [38200, { o: 0 }],
    ]),
    feed: track([[0, { x: 58, y: 56, w: 250, h: 440, o: 0 }]]),
    story: track([
      [34400, { x: 330, y: 70, w: 190, h: 420, o: 0, s: 0.94, z: 2 }],
      [35100, { y: 56, h: 440, o: 1, s: 1 }],
      [37600, {}],
      [38200, { o: 0, s: 0.94 }],
    ]),
    readiness: track([
      [38000, { x: 40, y: 90, w: 360, h: 370, o: 0, s: 0.96, z: 2 }],
      [38600, { y: 76, h: 380, o: 1, s: 1 }],
      [48500, {}],
      [49100, { o: 0, x: 20 }],
    ]),
    review: track([
      [39000, { x: 430, y: 110, w: 300, h: 310, o: 0, s: 0.95, z: 3 }],
      [39700, { o: 1, s: 1 }],
      [48500, {}],
      [49200, { x: 60, y: 80, w: 640, h: 330, o: 0 }],
    ]),
    dashboard: track([
      [48600, { x: 430, y: 100, w: 300, h: 330, o: 0, z: 2 }],
      [49400, { x: 60, y: 80, w: 640, h: 340, o: 1 }],
      [58600, {}],
      [59200, { x: 110, y: 90, w: 540, h: 300, o: 0.18, s: 0.94 }],
    ]),
    end: track([
      [58800, { x: 130, y: 190, w: 500, h: 150, o: 0, s: 0.96, z: 4 }],
      [59400, { o: 1, s: 1 }],
    ]),
  };
}

function narrow(): Record<WalkElement, (t: number) => Box> {
  return {
    input: track([
      [0, { x: 16, y: 330, w: 328, h: 56, o: 0, z: 3 }],
      [400, { o: 1 }],
      [3300, {}],
      [3800, { y: 360, o: 0 }],
    ]),
    browser: track([
      [300, { x: 16, y: 56, w: 328, h: 250, o: 0, s: 0.97 }],
      [1000, { o: 1, s: 1 }],
      [3300, {}],
      [4000, { x: 16, y: 52, w: 328, h: 124, o: 0.9 }],
      [16500, {}],
      [17200, { y: 30, o: 0 }],
    ]),
    goal: track([
      [3600, { x: 16, y: 200, w: 328, h: 290, o: 0, s: 0.96, z: 2 }],
      [4200, { o: 1, s: 1 }],
      [7700, {}],
      [8300, { y: 180, o: 0 }],
    ]),
    facts: track([
      [8000, { x: 16, y: 200, w: 328, h: 300, o: 0, s: 0.96, z: 2 }],
      [8600, { y: 184, h: 330, o: 1, s: 1 }],
      [16600, {}],
      [17200, { o: 0, s: 0.96 }],
    ]),
    plan: track([
      [17000, { x: 16, y: 76, w: 328, h: 440, o: 0, s: 0.96, z: 2 }],
      [17600, { y: 56, h: 455, o: 1, s: 1 }],
      [26500, {}],
      [27100, { y: 40, o: 0 }],
    ]),
    c0: track([
      [27000, { x: 40, y: 120, w: 120, h: 60, o: 0, z: 1 }],
      [27900, { x: -110, y: 150, w: 170, h: 300, o: 0.7 }],
      [30500, {}],
      [31200, { x: -160, o: 0 }],
    ]),
    c1: track([
      [27100, { x: 120, y: 120, w: 120, h: 60, o: 0, z: 2 }],
      [28000, { x: 75, y: 130, w: 210, h: 340, o: 1 }],
      [31000, {}],
      [31700, { x: 70, y: 52, w: 220, h: 300 }],
      [34000, {}],
      [34800, { x: 16, y: 52, w: 196, h: 300 }],
      [37600, {}],
      [38200, { o: 0, s: 0.95 }],
    ]),
    c2: track([
      [27200, { x: 200, y: 120, w: 120, h: 60, o: 0, z: 1 }],
      [28100, { x: 300, y: 150, w: 170, h: 300, o: 0.7 }],
      [30500, {}],
      [31200, { x: 360, o: 0 }],
    ]),
    editor: track([
      [31200, { x: 16, y: 376, w: 328, h: 140, o: 0, s: 0.96, z: 3 }],
      [31800, { y: 362, h: 150, o: 1, s: 1 }],
      [34000, {}],
      [34800, { y: 362, h: 150 }],
      [37600, {}],
      [38200, { o: 0 }],
    ]),
    feed: track([[0, { x: 16, y: 52, w: 196, h: 300, o: 0 }]]),
    story: track([
      [34400, { x: 224, y: 64, w: 120, h: 288, o: 0, s: 0.94, z: 2 }],
      [35100, { y: 52, h: 300, o: 1, s: 1 }],
      [37600, {}],
      [38200, { o: 0 }],
    ]),
    readiness: track([
      [38000, { x: 16, y: 66, w: 328, h: 276, o: 0, s: 0.96, z: 2 }],
      [38600, { y: 52, h: 290, o: 1, s: 1 }],
      [48500, {}],
      [49100, { o: 0 }],
    ]),
    review: track([
      [39000, { x: 16, y: 352, w: 328, h: 162, o: 0, s: 0.95, z: 3 }],
      [39700, { o: 1, s: 1 }],
      [48500, {}],
      [49200, { x: 16, y: 80, w: 328, h: 410, o: 0 }],
    ]),
    dashboard: track([
      [48600, { x: 16, y: 352, w: 328, h: 162, o: 0, z: 2 }],
      [49400, { x: 16, y: 70, w: 328, h: 420, o: 1 }],
      [58600, {}],
      [59200, { x: 36, y: 100, w: 288, h: 380, o: 0.18, s: 0.94 }],
    ]),
    end: track([
      [58800, { x: 16, y: 200, w: 328, h: 180, o: 0, s: 0.96, z: 4 }],
      [59400, { o: 1, s: 1 }],
    ]),
  };
}

const TRACKS: Record<Layout, Record<WalkElement, (t: number) => Box>> = { wide: wide(), narrow: narrow() };

/** Where each product screen sits at demo time t (on the inner clock). */
export function walkBoxes(t: number, layout: Layout): Record<WalkElement, Box> {
  const tr = TRACKS[layout];
  const it = innerTime(t);
  return Object.fromEntries((Object.keys(tr) as WalkElement[]).map((k) => [k, tr[k](it)])) as Record<WalkElement, Box>;
}
