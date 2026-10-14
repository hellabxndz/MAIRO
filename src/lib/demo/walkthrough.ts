// The MAIRO demo: a 73-second product walkthrough in seven scenes, one sample
// business (Brightwater Plumbing, from lib/demo/examples.ts) going from "See
// Your Free Plan" to its first results. A pure function of time, in two
// compositions (16:9 and 9:16), every figure sample data.
//
// The scenes are drawn with MAIRO's own components — the free plan form, the
// website read, what MAIRO discovered, the plan, the concept cards with their
// placement mock-ups, the approvals and overview screens — driven by this
// clock. A cursor moves between named targets in those screens (cues, found
// in the rendered page) and a camera follows it, so the motion stays right
// when the components change.
//
// The script (docs/WALKTHROUGH-SCRIPT.md) is written for a narrator. Until a
// licensed voice records it, the narration is the captions — the same lines,
// the same timings — and the player says there's no voice-over.

export const WALK_DURATION = 73000;

export type WalkLayout = "wide" | "narrow";

/** The stage, in CSS pixels: 16:9 on wide screens, 9:16 on phones. */
export const WALK_STAGE: Record<WalkLayout, { w: number; h: number }> = { wide: { w: 960, h: 540 }, narrow: { w: 360, h: 640 } };

/** The width each product screen is laid out at before the camera scales it to the stage. */
export const WALK_WORLD: Record<WalkLayout, number> = { wide: 1200, narrow: 420 };

/** Kept clear at the top (the sample-data label) and the bottom (captions). */
export const WALK_SAFE: Record<WalkLayout, { top: number; bottom: number }> = { wide: { top: 46, bottom: 58 }, narrow: { top: 54, bottom: 92 } };

export type WalkChapterId = "intro" | "analysis" | "plan" | "creative" | "approval" | "results" | "ready";

export type WalkScene = { id: WalkChapterId; label: string; start: number; end: number };

export const WALK_SCENES: WalkScene[] = [
  { id: "intro", label: "Meet MAIRO", start: 0, end: 8000 },
  { id: "analysis", label: "MAIRO reads your business", start: 8000, end: 18000 },
  { id: "plan", label: "Your free plan", start: 18000, end: 28000 },
  { id: "creative", label: "Creative concepts", start: 28000, end: 42000 },
  { id: "approval", label: "Review and approve", start: 42000, end: 52000 },
  { id: "results", label: "Results and next steps", start: 52000, end: 65000 },
  { id: "ready", label: "Your AI team is ready", start: 65000, end: 73000 },
];

export const WALK_CHAPTERS: { id: WalkChapterId; label: string }[] = [
  { id: "intro", label: "Intro" },
  { id: "analysis", label: "Analysis" },
  { id: "plan", label: "Free plan" },
  { id: "creative", label: "Creative" },
  { id: "approval", label: "Approval" },
  { id: "results", label: "Results" },
  { id: "ready", label: "Get started" },
];

/**
 * The narration, line by line, timed to the scenes. They are the script, the
 * captions, the WebVTT file and the text burned into the video.
 */
export const WALK_CAPTIONS: { start: number; end: number; text: string }[] = [
  { start: 0, end: 4000, text: "Advertising your business shouldn't mean learning another complicated dashboard." },
  { start: 4000, end: 8000, text: "Meet MAIRO, your AI advertising team. Start with your website, or a few words about your business." },
  { start: 8000, end: 12500, text: "MAIRO reads your website and shows what it found, and where it found it." },
  { start: 12500, end: 18000, text: "You confirm what matters: your offer, your area, and what you want from your ads." },
  { start: 18000, end: 23000, text: "Then MAIRO builds your free advertising plan: the objective, the audience and the budget." },
  { start: 23000, end: 28000, text: "Every recommendation comes with the reason behind it, and nothing is spent to see it." },
  { start: 28000, end: 33000, text: "Three creative concepts, written for your business, with the one to test first." },
  { start: 33000, end: 38000, text: "Preview them where they'd run, and make the words your own." },
  { start: 38000, end: 42000, text: "Save the concept you want to test first." },
  { start: 42000, end: 47000, text: "With a subscription, MAIRO builds the campaign in your own Meta ad account." },
  { start: 47000, end: 52000, text: "Nothing launches, and nothing is spent, until you approve it." },
  { start: 52000, end: 58000, text: "Follow your results in one place: what Meta reports, kept apart from what you confirm." },
  { start: 58000, end: 65000, text: "And see what MAIRO recommends next, with the figures behind it, waiting for your yes." },
  { start: 65000, end: 73000, text: "Your AI advertising team is ready. See your free plan." },
];

/** The words on screen in the intro and the end screen — motion typography, not captions. */
export const WALK_ONSCREEN = {
  intro: "Meet MAIRO.",
  introSub: "Your AI advertising team.",
  end: "Your AI Advertising Team Is Ready.",
  cta: "See Your Free Plan",
  ctaNote: "Free · no credit card · nothing runs until you approve it",
} as const;

/** The sample business's website, typed into the form, and the headline the owner writes. */
export const WALK_SITE = "brightwater-plumbing.example";
export const WALK_NEW_HEADLINE = "Leak repair in Eastfield, this week";

/** When things happen, on the demo's clock. */
export const WALK_T = {
  titleOut: 2600,
  formIn: 2700,
  typeSite: [3900, 5500] as const,
  goal: 6200,
  submit: 7100,
  scan: [
    [8300, "home"],
    [9000, "pages"],
    [9900, "links"],
    [10500, "audit"],
    [11100, "done"],
  ] as const,
  found: 11300,
  cards: [11700, 12100, 12500, 12900, 13300] as const,
  confirmGoal: 14600,
  build: 16600,
  igFeed: 31000,
  edit: 33200,
  typeHeadline: [33800, 35300] as const,
  done: 35900,
  story: 37400,
  save: 39400,
  approve: 46800,
  endIn: 64600,
} as const;

/**
 * A target in a scene: "text:Label" (the first control or label reading
 * exactly — or else starting with — that text) or a CSS selector.
 */
export type WalkCue = string;
export type WalkCursorKey = { at: number; cue: WalkCue; click?: boolean };
/** Where the camera looks from `at` (moving there over `dur`): a cue, centred or with its top near the top; no cue is the screen's top. */
export type WalkCameraKey = { at: number; cue?: WalkCue; zoom: number; narrowZoom?: number; align?: "center" | "top"; dur?: number };

export const WALK_CURSOR: Record<WalkChapterId, WalkCursorKey[]> = {
  intro: [
    { at: 3700, cue: "#walk-website", click: true },
    { at: WALK_T.goal, cue: "#walk-goal", click: true },
    { at: WALK_T.submit, cue: "text:See Your Free Plan", click: true },
  ],
  analysis: [
    { at: 13900, cue: '[data-cue="discovered"]' },
    { at: WALK_T.confirmGoal, cue: "text:Leads", click: true },
    { at: WALK_T.build, cue: "text:Build my free plan", click: true },
  ],
  plan: [
    { at: 20400, cue: 'nav a[href="#pl-strategy"]', click: true },
    { at: 23000, cue: 'nav a[href="#pl-budget"]', click: true },
    { at: 25600, cue: 'nav a[href="#pl-why"]', click: true },
  ],
  creative: [
    { at: 30000, cue: "text:Test this first" },
    { at: WALK_T.igFeed, cue: "text:Instagram feed", click: true },
    { at: WALK_T.edit, cue: "text:Edit headline", click: true },
    { at: WALK_T.done, cue: "text:Done", click: true },
    { at: WALK_T.story, cue: "text:Instagram Story", click: true },
    { at: WALK_T.save, cue: "text:Save concept", click: true },
  ],
  approval: [
    { at: 45000, cue: '[data-panel="demo-launch"]' },
    { at: WALK_T.approve, cue: '[data-cue="approve"]', click: true },
    { at: 49600, cue: '[data-cue="approved"]' },
  ],
  results: [
    { at: 55400, cue: '[data-cue="results"]' },
    { at: 60400, cue: "text:Review & approve" },
  ],
  ready: [],
};

export const WALK_CAMERA: Record<WalkChapterId, WalkCameraKey[]> = {
  intro: [
    { at: WALK_T.formIn, cue: "section", zoom: 1, align: "top", dur: 1 },
    { at: 3200, cue: "section", zoom: 1.2, narrowZoom: 1.05, align: "top", dur: 1400 },
    { at: 6400, cue: "#walk-form", zoom: 1.2, narrowZoom: 1, dur: 1000 },
  ],
  analysis: [
    { at: 7800, cue: "#walk-scan", zoom: 1.4, narrowZoom: 1.05, dur: 1 },
    { at: WALK_T.found, cue: "h1", zoom: 1.05, align: "top", dur: 1 },
    { at: 13700, cue: "#walk-confirm", zoom: 1.1, narrowZoom: 1, dur: 1200 },
  ],
  plan: [
    { at: 17800, cue: "h1", zoom: 1, align: "top", dur: 1 },
    { at: 20400, cue: '[data-panel="pl-objective"]', zoom: 1.1, narrowZoom: 1, align: "top" },
    { at: 23000, cue: '[data-panel="pl-budget"]', zoom: 1.15, narrowZoom: 1, align: "top" },
    { at: 25600, cue: '[data-panel="pl-why"]', zoom: 1.15, narrowZoom: 1, align: "top" },
  ],
  creative: [
    { at: 27800, zoom: 1, dur: 1 },
    { at: 30200, cue: "#walk-grid > li:first-child", zoom: 1.45, narrowZoom: 1.05, align: "top" },
    { at: 31500, cue: "#walk-grid > li:first-child figure", zoom: 1.3, narrowZoom: 1.05 },
    { at: 32700, cue: "text:Edit headline", zoom: 1.35, narrowZoom: 1.05 },
    { at: 33500, cue: "#walk-grid > li:first-child", zoom: 1.5, narrowZoom: 1.05, align: "top" },
    { at: 36300, cue: "text:Instagram Story", zoom: 1.3, narrowZoom: 1.05 },
    { at: 37900, cue: "#walk-grid > li:first-child figure", zoom: 1.25, narrowZoom: 1.05 },
    { at: 38900, cue: "text:Save concept", zoom: 1.35, narrowZoom: 1.05 },
    { at: 40300, zoom: 1, dur: 1300 },
  ],
  approval: [
    { at: 41800, zoom: 1, dur: 1 },
    { at: 43800, cue: '[data-panel="demo-launch"]', zoom: 1.35, narrowZoom: 1.05 },
    { at: 49800, cue: '[data-panel="demo-launch"]', zoom: 1.1, narrowZoom: 1 },
  ],
  results: [
    { at: 51800, zoom: 1, dur: 1 },
    { at: 54600, cue: '[data-cue="results"]', zoom: 1.15, narrowZoom: 1 },
    { at: 58400, cue: '[data-panel="action-center"]', zoom: 1.2, narrowZoom: 1 },
    { at: 62600, cue: '[data-panel="action-center"]', zoom: 1, narrowZoom: 1 },
  ],
  ready: [],
};

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

/** 0 → 1 between a and b, eased. */
export function walkEase(t: number, a: number, b: number): number {
  if (t <= a) return 0;
  if (t >= b) return 1;
  const x = (t - a) / (b - a);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** How much of a line is typed by t, at an even typing pace. */
export function walkTyped(text: string, t: number, a: number, b: number): string {
  if (t <= a) return "";
  if (t >= b) return text;
  return text.slice(0, Math.floor((text.length * (t - a)) / (b - a)));
}
