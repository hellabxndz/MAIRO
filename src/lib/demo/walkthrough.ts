import { track, type Box, type Layout } from "./timeline";

// The 60-second walkthrough: one sample business (Brightwater Plumbing, from
// lib/demo/examples.ts) going from its website to a first result. Same rules
// as the 20-second story — a pure function of time, two compositions, every
// figure sample data — but slower, with a caption for each step, because
// there is no voice-over yet and the captions carry the meaning.

export const WALK_DURATION = 60000;

export type WalkChapterId = "website" | "facts" | "plan" | "creative" | "approval" | "results";

export type WalkScene = { id: WalkChapterId; label: string; start: number; end: number };

export const WALK_SCENES: WalkScene[] = [
  { id: "website", label: "Your website and your goal", start: 0, end: 8000 },
  { id: "facts", label: "What MAIRO found", start: 8000, end: 17000 },
  { id: "plan", label: "Your plan", start: 17000, end: 27000 },
  { id: "creative", label: "Your ads", start: 27000, end: 38000 },
  { id: "approval", label: "Your approval", start: 38000, end: 49000 },
  { id: "results", label: "Your results", start: 49000, end: 60000 },
];

export const WALK_CHAPTERS: { id: WalkChapterId; label: string }[] = [
  { id: "website", label: "Website & goal" },
  { id: "facts", label: "Facts" },
  { id: "plan", label: "Plan" },
  { id: "creative", label: "Creative" },
  { id: "approval", label: "Approval" },
  { id: "results", label: "Results" },
];

/** One caption per step. They are the transcript, the WebVTT file and the text burned into the video. */
export const WALK_CAPTIONS: { start: number; end: number; text: string }[] = [
  { start: 0, end: 3500, text: "Brightwater Plumbing, a sample business, enters its website." },
  { start: 3500, end: 8000, text: "The owner picks a goal: get more qualified leads." },
  { start: 8000, end: 12000, text: "MAIRO reads the website and shows what it found, and where." },
  { start: 12000, end: 17000, text: "What the website didn't say is asked, not guessed. The owner confirms the offer and how far they travel." },
  { start: 17000, end: 22000, text: "A plan: one Meta campaign, with a form inside the ad, for homeowners within 15 miles." },
  { start: 22000, end: 27000, text: "Why that audience, and an example budget. The owner sets the real one." },
  { start: 27000, end: 31000, text: "Three ad directions. One is recommended as the first test." },
  { start: 31000, end: 34500, text: "The owner picks it and rewrites the opening line. The original is kept." },
  { start: 34500, end: 38000, text: "Previews show the ad in the feed and in Stories, on a phone." },
  { start: 38000, end: 43500, text: "Before launch: every check, and the Meta connection, in one place." },
  { start: 43500, end: 49000, text: "Nothing runs until the owner approves this exact ad and budget." },
  { start: 49000, end: 54000, text: "Results, with sample figures: money spent, leads, and which leads were qualified and booked." },
  { start: 54000, end: 57000, text: "The owner marks a lead as booked." },
  { start: 57000, end: 60000, text: "MAIRO proposes a next step and says why. The owner decides." },
];

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

export function walkBoxes(t: number, layout: Layout): Record<WalkElement, Box> {
  const tr = TRACKS[layout];
  return Object.fromEntries((Object.keys(tr) as WalkElement[]).map((k) => [k, tr[k](t)])) as Record<WalkElement, Box>;
}
