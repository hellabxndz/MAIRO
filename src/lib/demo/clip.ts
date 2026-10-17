import { walkEase, walkTyped } from "@/lib/demo/walkthrough";

// The homepage's product clips and film: each a pure function of time, drawn
// with MAIRO's own components (components/clips/), in two compositions —
// 16:9 for wide screens and 9:16 for phones. This file holds what doesn't
// need React: the stage sizes, the timing types, captions and their WebVTT,
// and the easing the scenes share with the walkthrough.
//
// A clip is rendered to video by video/render.mjs from /demo/render, frame by
// frame, so the files can't drift from the components; the player falls back
// to drawing it live when a file hasn't been rendered.

export const ease = walkEase;
export const typed = walkTyped;

export type ClipLayout = "wide" | "narrow";

export const CLIP_IDS = ["film", "creative", "understand", "plan", "campaign", "team", "dashboard", "optimize", "results"] as const;
export type ClipId = (typeof CLIP_IDS)[number];

export function isClipId(v: unknown): v is ClipId {
  return typeof v === "string" && (CLIP_IDS as readonly string[]).includes(v);
}

/** The stage, in CSS pixels. */
export const CLIP_STAGE: Record<ClipLayout, { w: number; h: number }> = { wide: { w: 960, h: 540 }, narrow: { w: 360, h: 640 } };

/** The width a scene's screen is laid out at before the camera scales it to the stage. */
export const CLIP_WORLD: Record<ClipLayout, number> = { wide: 1200, narrow: 420 };

/** Kept clear at the top (the sample-data label) and the bottom (captions, when the player draws them). */
export const CLIP_SAFE: Record<ClipLayout, { top: number; bottom: number }> = { wide: { top: 44, bottom: 54 }, narrow: { top: 50, bottom: 86 } };

export type Caption = { start: number; end: number; text: string };

/** A target in a scene: "text:Label" (the first control or label reading — or starting with — that text), a CSS selector, or "selector >> text:Label" (the text inside it). */
export type Cue = string;
export type CursorKey = { at: number; cue: Cue; click?: boolean };
/** Where the camera looks from `at`, moving there over `dur`: a cue (centred, or its top near the top), or the screen's top. `xCue`, when set, centres it across on another cue — a whole card while it moves down to a label inside it. */
export type CameraKey = { at: number; cue?: Cue; xCue?: Cue; zoom: number; narrowZoom?: number; align?: "center" | "top"; dur?: number };

export function captionAt(captions: Caption[], t: number): Caption | null {
  return captions.find((c) => t >= c.start && t < c.end) ?? null;
}

export function captionsVtt(captions: Caption[]): string {
  const ts = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const f = Math.round(ms % 1000);
    return `00:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(3, "0")}`;
  };
  return ["WEBVTT", "", ...captions.flatMap((c, i) => [`${i + 1}`, `${ts(c.start)} --> ${ts(c.end)}`, c.text, ""])].join("\n");
}

/** Whether t falls in the short moment after `at` — a press, drawn as a pressed state. */
export const pressedAt = (t: number, at: number, ms = 260) => t >= at && t < at + ms;
