// The owner's own video, edited without touching the file.
//
// An edit is a list — where to start and end, captions at times, a crop, a
// line of text over the whole clip, the business's logo in a corner — kept as
// a new revision each time, so the original is always one click away. The
// suggestions come from what MAIRO can know without watching: the video's
// length and shape, and the ad's own words. They say so; nothing here claims
// to have seen what's in the video.
//
// The edits are previewed in the browser, then written into a new file on
// request (render.ts, render-run.ts). Until a version is rendered the ad
// uses the original file, and `editsNotInFile` names exactly which edits
// wouldn't be in it. Pure; pinned by scripts/check-suggested-ads.ts.

export type Aspect = "original" | "9:16" | "4:5" | "1:1";
export type Caption = { startMs: number; endMs: number; text: string };
/** A line of text on screen for the whole clip — an offer, a name. */
export type TextOverlay = { text: string; position: "top" | "middle" | "bottom" };
/** The business's logo, uploaded to its own storage, in one corner. */
export type LogoMark = { url: string; corner: "top-left" | "top-right" | "bottom-left" | "bottom-right" };
export type VideoEdits = { trimStartMs: number; trimEndMs: number | null; captions: Caption[]; aspect: Aspect; overlay?: TextOverlay | null; logo?: LogoMark | null };
export type VideoMeta = { durationMs: number; width: number; height: number };

export const NO_EDITS: VideoEdits = { trimStartMs: 0, trimEndMs: null, captions: [], aspect: "original" };
const ASPECTS: Aspect[] = ["original", "9:16", "4:5", "1:1"];
const POSITIONS: TextOverlay["position"][] = ["top", "middle", "bottom"];
const CORNERS: LogoMark["corner"][] = ["top-left", "top-right", "bottom-left", "bottom-right"];
export const OVERLAY_MAX = 60;
const MAX_CAPTIONS = 20;

export function fmtTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Reads a stored or submitted edit list, keeping only what makes sense for this video. */
export function parseEdits(raw: unknown, meta: VideoMeta): VideoEdits {
  const v = (typeof raw === "string" ? safeJson(raw) : raw) as Partial<VideoEdits> | null;
  if (!v || typeof v !== "object") return { ...NO_EDITS };
  const dur = meta.durationMs;
  const start = clamp(num(v.trimStartMs, 0), 0, dur);
  const endRaw = v.trimEndMs === null || v.trimEndMs === undefined ? null : clamp(num(v.trimEndMs, dur), 0, dur);
  const end = endRaw !== null && endRaw - start >= 1000 && endRaw < dur ? endRaw : null;
  const captions = (Array.isArray(v.captions) ? v.captions : [])
    .map((c) => ({ startMs: clamp(num(c?.startMs, 0), 0, dur), endMs: clamp(num(c?.endMs, 0), 0, dur), text: String(c?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 120) }))
    .filter((c) => c.text && c.endMs > c.startMs)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, MAX_CAPTIONS);
  const aspect = ASPECTS.includes(v.aspect as Aspect) ? (v.aspect as Aspect) : "original";
  const out: VideoEdits = { trimStartMs: start, trimEndMs: end, captions, aspect };
  // Text and logo are kept only when set, so a list without them reads the same as before they existed.
  const o = v.overlay;
  const text = o && typeof o === "object" ? String(o.text ?? "").replace(/\s+/g, " ").trim().slice(0, OVERLAY_MAX) : "";
  if (text) out.overlay = { text, position: POSITIONS.includes(o!.position) ? o!.position : "bottom" };
  const l = v.logo;
  const url = l && typeof l === "object" && typeof l.url === "string" ? l.url.trim().slice(0, 600) : "";
  if (url) out.logo = { url, corner: CORNERS.includes(l!.corner) ? l!.corner : "top-right" };
  return out;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x) : d);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function sameEdits(a: VideoEdits, b: VideoEdits): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The part of the video the ad would play. */
export function playedRange(e: VideoEdits, meta: VideoMeta): { startMs: number; endMs: number; lengthMs: number } {
  const endMs = e.trimEndMs ?? meta.durationMs;
  return { startMs: e.trimStartMs, endMs, lengthMs: Math.max(0, endMs - e.trimStartMs) };
}

export type SuggestionKind = "caption" | "trim" | "crop" | "info";
export type VideoSuggestion = {
  id: string;
  kind: SuggestionKind;
  atMs: number;
  untilMs: number | null;
  title: string;
  detail: string;
  /** The edit list after applying it; null for advice that has nothing to apply. */
  apply: VideoEdits | null;
};

/**
 * Timestamped suggestions from the video's length and shape and the ad's
 * words. Already-applied ones aren't offered again.
 */
export function videoSuggestions(meta: VideoMeta, words: { hook: string; cta: string }, e: VideoEdits): VideoSuggestion[] {
  const out: VideoSuggestion[] = [];
  const r = playedRange(e, meta);
  const hook = words.hook.trim().slice(0, 120);
  const cta = words.cta.trim().slice(0, 60);

  const hasCaptionAt = (ms: number) => e.captions.some((c) => c.startMs <= ms && c.endMs > ms);
  if (hook && !hasCaptionAt(r.startMs + 100)) {
    const until = Math.min(r.endMs, r.startMs + 3000);
    out.push({
      id: "open-hook",
      kind: "caption",
      atMs: r.startMs,
      untilMs: until,
      title: `${fmtTime(r.startMs)}–${fmtTime(until)}: put your opening line on screen`,
      detail: `Most people decide in the first three seconds, usually with the sound off. Add “${hook}” as a caption here.`,
      apply: { ...e, captions: sortCaps([...e.captions, { startMs: r.startMs, endMs: until, text: hook }]) },
    });
  }
  if (r.lengthMs > 30_000) {
    const keep = Math.min(20_000, r.lengthMs);
    out.push({
      id: "trim",
      kind: "trim",
      atMs: r.startMs,
      untilMs: r.startMs + keep,
      title: `${fmtTime(r.lengthMs)} is long for Stories and Reels — trim to under 30 seconds`,
      detail: `Keeping ${fmtTime(r.startMs)}–${fmtTime(r.startMs + keep)} is a start; you can move the start and end to the strongest part.`,
      apply: { ...e, trimEndMs: r.startMs + keep, captions: e.captions.filter((c) => c.startMs < r.startMs + keep) },
    });
  }
  if (r.lengthMs < 5_000) {
    out.push({ id: "short", kind: "info", atMs: r.startMs, untilMs: r.endMs, title: "Under 5 seconds", detail: "Fine for a looping clip; for anything that needs explaining, a longer cut works better.", apply: null });
  }
  const ratio = meta.width / meta.height;
  if (e.aspect === "original" && ratio > 1.2) {
    out.push({
      id: "crop",
      kind: "crop",
      atMs: 0,
      untilMs: null,
      title: "Wide video — Stories and Reels are tall",
      detail: "Crop to 4:5 for the feed (or 9:16 for Stories and Reels), keeping the subject in the centre of the frame.",
      apply: { ...e, aspect: "4:5" },
    });
  } else if (ratio < 0.7) {
    out.push({ id: "vertical", kind: "info", atMs: 0, untilMs: null, title: "Already vertical", detail: "Good for Stories and Reels. In the feed Meta shows it at 4:5.", apply: null });
  }
  const endAt = Math.max(r.startMs, r.endMs - 3000);
  if (cta && r.lengthMs >= 6000 && !hasCaptionAt(r.endMs - 100)) {
    out.push({
      id: "cta-end",
      kind: "caption",
      atMs: endAt,
      untilMs: r.endMs,
      title: `${fmtTime(endAt)}–${fmtTime(r.endMs)}: say what to do next`,
      detail: `End on the action: add “${cta}” as a caption over the last three seconds.`,
      apply: { ...e, captions: sortCaps([...e.captions, { startMs: endAt, endMs: r.endMs, text: cta }]) },
    });
  }
  out.push({
    id: "sound",
    kind: "info",
    atMs: r.startMs,
    untilMs: r.endMs,
    title: "Captions for anything said",
    detail: "MAIRO can't hear or watch your video. If someone speaks, add their key words as captions at the moment they say them.",
    apply: null,
  });
  out.push({ id: "safe", kind: "info", atMs: r.startMs, untilMs: r.endMs, title: "Keep the bottom fifth clear", detail: "Reels covers the bottom of the frame with the caption and buttons — keep faces and words above it.", apply: null });
  return out;
}

const sortCaps = (c: Caption[]) => [...c].sort((a, b) => a.startMs - b.startMs).slice(0, MAX_CAPTIONS);

/** What the edits do, in words — the revision note. */
export function describeEdits(e: VideoEdits, meta: VideoMeta): string[] {
  const out: string[] = [];
  const r = playedRange(e, meta);
  if (e.trimStartMs > 0 || e.trimEndMs !== null) out.push(`Plays ${fmtTime(r.startMs)}–${fmtTime(r.endMs)} (${fmtTime(r.lengthMs)})`);
  if (e.captions.length) out.push(`${e.captions.length} caption${e.captions.length === 1 ? "" : "s"}`);
  if (e.aspect !== "original") out.push(`Cropped to ${e.aspect}`);
  if (e.overlay) out.push(`Text: “${e.overlay.text}”`);
  if (e.logo) out.push(`Logo ${e.logo.corner.replace("-", " ")}`);
  return out.length ? out : ["The original, unedited"];
}

/** The edits that would only be in the ad once this version is rendered into a file. */
export function editsNotInFile(e: VideoEdits): string[] {
  const out: string[] = [];
  if (e.trimStartMs > 0 || e.trimEndMs !== null) out.push("the trim");
  if (e.captions.length) out.push("the captions");
  if (e.aspect !== "original") out.push("the crop");
  if (e.overlay) out.push("the text");
  if (e.logo) out.push("the logo");
  return out;
}
