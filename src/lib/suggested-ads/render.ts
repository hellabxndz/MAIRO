import { playedRange, type Caption, type TextOverlay, type VideoEdits, type VideoMeta } from "./video";

// Writing an edit list into a real video file: the part that plays, cropped
// to the chosen shape, with the captions and the text burned into the
// picture and the logo laid over a corner, encoded as an MP4 Meta runs
// (H.264, AAC, yuv420p, fast start). The uploaded original
// is read, never changed; the result is a new file for that edit version.
//
// Pure: the crop, the caption file and the ffmpeg arguments, so they can be
// pinned exactly (scripts/check-video-render.ts). Running ffmpeg is in
// render-run.ts.

export type Crop = { w: number; h: number; x: number; y: number };

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
/** An offset can be 0; a side can't. */
const evenOffset = (n: number) => Math.max(0, Math.floor(n / 2) * 2);

/** The centred region kept for an aspect ratio, in source pixels, with even sides (H.264 needs them). */
export function cropFor(meta: Pick<VideoMeta, "width" | "height">, aspect: VideoEdits["aspect"]): Crop {
  const { width: W, height: H } = meta;
  if (aspect === "original") return { w: even(W), h: even(H), x: 0, y: 0 };
  const target = aspect === "9:16" ? 9 / 16 : aspect === "4:5" ? 4 / 5 : 1;
  const source = W / H;
  let w = W;
  let h = H;
  if (source > target) w = Math.round(H * target);
  else h = Math.round(W / target);
  w = even(Math.min(w, W));
  h = even(Math.min(h, H));
  return { w, h, x: evenOffset((W - w) / 2), y: evenOffset((H - h) / 2) };
}

/** Never larger than 1080 on the short side, which is all Meta shows. */
export function outputSize(c: Crop): { w: number; h: number } {
  const short = Math.min(c.w, c.h);
  if (short <= 1080) return { w: c.w, h: c.h };
  const k = 1080 / short;
  return { w: even(c.w * k), h: even(c.h * k) };
}

const ts = (ms: number) => {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

/** ASS override blocks and line breaks are written literally, never interpreted. */
export function assText(t: string): string {
  return t.replace(/\\/g, "⧵").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, " ").trim();
}

/**
 * The captions as an ASS subtitle file, timed from the start of the trimmed
 * clip, for the output size: bold white on a dark box, near the top (Reels
 * and Stories cover the bottom of the frame).
 */
export function assFile(captions: Caption[], e: Pick<VideoEdits, "trimStartMs">, playMs: number, size: { w: number; h: number }, font = "DejaVu Sans", overlay: TextOverlay | null = null): string {
  const fontSize = Math.max(18, Math.round(Math.min(size.w, size.h) * 0.06));
  const margin = Math.round(size.h * 0.1);
  // The text over the whole clip: larger, and kept clear of the captions at
  // the top and of the buttons Stories and Reels put along the bottom.
  const overlaySize = Math.max(20, Math.round(Math.min(size.w, size.h) * 0.075));
  const overlayAlign = overlay?.position === "top" ? 8 : overlay?.position === "middle" ? 5 : 2;
  const overlayMargin = overlay?.position === "top" ? Math.round(size.h * 0.22) : overlay?.position === "middle" ? 0 : Math.round(size.h * 0.24);
  const overlayText = overlay ? assText(overlay.text) : "";
  const lines = captions
    .map((c) => ({ start: c.startMs - e.trimStartMs, end: c.endMs - e.trimStartMs, text: assText(c.text) }))
    .map((c) => ({ ...c, start: Math.max(0, c.start), end: Math.min(playMs, c.end) }))
    .filter((c) => c.text && c.end > c.start);
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${size.w}`,
    `PlayResY: ${size.h}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Caption,${font},${fontSize},&H00FFFFFF,&H00FFFFFF,&H40000000,&H40000000,1,0,0,0,100,100,0,0,3,${Math.round(fontSize * 0.35)},0,8,${Math.round(size.w * 0.06)},${Math.round(size.w * 0.06)},${margin},1`,
    ...(overlayText ? [`Style: Overlay,${font},${overlaySize},&H00FFFFFF,&H00FFFFFF,&H30000000,&H30000000,1,0,0,0,100,100,0,0,3,${Math.round(overlaySize * 0.4)},0,${overlayAlign},${Math.round(size.w * 0.07)},${Math.round(size.w * 0.07)},${overlayMargin},1`] : []),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...(overlayText ? [`Dialogue: 0,${ts(0)},${ts(playMs)},Overlay,,0,0,0,,${overlayText}`] : []),
    ...lines.map((c) => `Dialogue: 0,${ts(c.start)},${ts(c.end)},Caption,,0,0,0,,${c.text}`),
    "",
  ].join("\n");
}

/** A filter-graph path: ffmpeg's filter syntax treats \ : ' , [ ] ; as special. */
const filterPath = (p: string) => p.replace(/\\/g, "/").replace(/([:'\[\],;])/g, "\\$1");

export type RenderPlan = {
  args: string[];
  posterArgs: string[];
  crop: Crop;
  size: { w: number; h: number };
  lengthMs: number;
  hasCaptions: boolean;
  /** The subtitle file is needed: captions or the text overlay. */
  hasText: boolean;
  hasLogo: boolean;
};

/** Where the logo sits: a corner, inset 4% of the width, at 16% of the width. */
export function logoPlacement(corner: NonNullable<VideoEdits["logo"]>["corner"], size: { w: number; h: number }): { w: number; x: string; y: string } {
  const w = even(size.w * 0.16);
  const m = Math.round(size.w * 0.04);
  const x = corner.endsWith("left") ? String(m) : `W-w-${m}`;
  const y = corner.startsWith("top") ? String(m) : `H-h-${m}`;
  return { w, x, y };
}

/** Everything ffmpeg is asked to do for one edit version. */
export function renderPlan(input: { source: string; output: string; poster: string; assPath: string; fontsDir: string; logoPath?: string | null }, edits: VideoEdits, meta: VideoMeta): RenderPlan {
  const range = playedRange(edits, meta);
  const crop = cropFor(meta, edits.aspect);
  const size = outputSize(crop);
  const hasCaptions = edits.captions.some((c) => c.endMs > range.startMs && c.startMs < range.endMs && c.text.trim());
  const hasText = hasCaptions || Boolean(edits.overlay?.text.trim());
  const hasLogo = Boolean(edits.logo && input.logoPath);
  const filters = [
    edits.aspect !== "original" ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}` : null,
    size.w !== crop.w || size.h !== crop.h ? `scale=${size.w}:${size.h}` : edits.aspect === "original" ? `scale=${size.w}:${size.h}` : null,
    "setsar=1",
    hasText ? `subtitles=filename=${filterPath(input.assPath)}:fontsdir=${filterPath(input.fontsDir)}` : null,
  ].filter(Boolean) as string[];
  // Without a logo, one simple filter chain; with one, the logo is a second input laid over a corner.
  const video = hasLogo
    ? (() => {
        const p = logoPlacement(edits.logo!.corner, size);
        return ["-filter_complex", `[0:v]${filters.join(",")}[base];[1:v]scale=${p.w}:-2[logo];[base][logo]overlay=${p.x}:${p.y},format=yuv420p[v]`, "-map", "[v]", "-map", "0:a:0?"];
      })()
    : ["-map", "0:v:0", "-map", "0:a:0?", "-vf", [...filters, "format=yuv420p"].join(",")];
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", (range.startMs / 1000).toFixed(3),
    "-i", input.source,
    ...(hasLogo ? ["-i", input.logoPath!] : []),
    "-t", (range.lengthMs / 1000).toFixed(3),
    ...video,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-profile:v", "high",
    "-c:a", "aac", "-b:a", "128k", "-ac", "2",
    "-movflags", "+faststart",
    input.output,
  ];
  const posterArgs = ["-hide_banner", "-loglevel", "error", "-y", "-ss", Math.min(1, range.lengthMs / 3000).toFixed(3), "-i", input.output, "-frames:v", "1", "-q:v", "3", input.poster];
  return { args, posterArgs, crop, size, lengthMs: range.lengthMs, hasCaptions, hasText, hasLogo };
}
