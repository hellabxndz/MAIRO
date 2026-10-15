// Renders the homepage's product clips and film (components/clips/, wide and
// phone) to silent MP4 files, WebP posters and WebVTT captions in
// public/demo/, and the older landing story and walkthrough to
// public/walkthrough/, then writes src/lib/demo/media.ts listing exactly what
// was rendered. Narration, once a licensed voice records it, is muxed in
// afterwards (docs/WALKTHROUGH-SCRIPT.md).
//
// Each frame is the real component at a fixed time (/demo/render), captured
// by a headless browser and encoded by ffmpeg — so the video can't drift from
// the page. Needs:
//   - the app running with MAIRO_RENDER_ROUTE=1 (next start is best: no dev overlay)
//   - ffmpeg on PATH, or FFMPEG_PATH
//   - playwright-core (npm install in this folder) or playwright, with Chromium
//
//   node render.mjs --base http://localhost:3100 [--fps 30] [--only clips|story|walkthrough] [--clips film,creative] [--layouts wide,narrow] [--scale 1.5]

import { spawn } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]] : acc), []));
const BASE = args.base ?? "http://localhost:3100";
const FPS = Number(args.fps ?? 30);
const SCALE = Number(args.scale ?? 2);
const ONLY = args.only ?? "all";
const OUT = join(root, "public/walkthrough");
const CLIP_OUT = join(root, "public/demo");
const CLIP_IDS = ["film", "creative", "understand", "campaign", "team", "dashboard", "optimize", "results"];
const CLIPS = args.clips ? args.clips.split(",").filter((c) => CLIP_IDS.includes(c)) : CLIP_IDS;
const LAYOUTS = (args.layouts ?? "wide,narrow").split(",").filter((l) => l === "wide" || l === "narrow");
// The clips are drawn at 1.5× — crisp text without heavy files.
const CLIP_SCALE = Number(args["clip-scale"] ?? 1.5);
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

function loadChromium() {
  const require = createRequire(import.meta.url);
  for (const name of ["playwright-core", "playwright"]) {
    try {
      return require(name).chromium;
    } catch {
      // try the next one
    }
  }
  throw new Error("Install playwright-core in video/ (npm install) or make playwright resolvable via NODE_PATH.");
}

const STAGE = { wide: { w: 760, h: 560 }, narrow: { w: 360, h: 600 } };
// The clips are 16:9 and 9:16 (CLIP_STAGE in src/lib/demo/clip.ts).
const CLIP_STAGE = { wide: { w: 960, h: 540 }, narrow: { w: 360, h: 640 } };
// The walkthrough is 16:9 and 9:16 (WALK_STAGE in src/lib/demo/walkthrough.ts).
const WALK_STAGE = { wide: { w: 960, h: 540 }, narrow: { w: 360, h: 640 } };
const jobs = [];
if (ONLY === "all" || ONLY === "story") {
  for (const type of ["shop", "service", "brands"]) for (const layout of ["wide", "narrow"]) jobs.push({ clip: "story", type, layout, ms: 24000, posterAt: 1200, name: `story-${type}-${layout}` });
}
if (ONLY === "all" || ONLY === "walkthrough") {
  for (const layout of ["wide", "narrow"]) jobs.push({ clip: "walkthrough", type: "service", layout, ms: 73000, posterAt: 1900, name: `walkthrough-${layout}` });
}
if (ONLY === "all" || ONLY === "clips") {
  // Length and poster come from the clip itself, read from the page.
  for (const id of CLIPS) for (const layout of LAYOUTS) jobs.push({ clip: id, type: "shop", layout, product: true, name: `${id}-${layout}` });
}

function run(cmd, argv, input) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, argv, { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", fail);
    p.on("close", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`))));
    if (input) input(p.stdin);
  });
}

async function render(browser, job) {
  const { w, h } = (job.product ? CLIP_STAGE : job.clip === "walkthrough" ? WALK_STAGE : STAGE)[job.layout];
  const scale = job.product ? CLIP_SCALE : SCALE;
  const out = job.product ? CLIP_OUT : OUT;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.goto(`${BASE}/demo/render?clip=${job.clip}&type=${job.type}&layout=${job.layout}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction(() => document.documentElement.dataset.renderReady === "1", null, { timeout: 60000 });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" });
  if (job.product) {
    const meta = await page.evaluate(() => window.__mairoClip);
    job.ms = meta.duration;
    job.posterAt = meta.posterAt;
  }
  const frame = page.locator(job.product ? "[data-clip-frame]" : "[data-palette=classic]").first();
  const shot = async (t) => {
    await page.evaluate((x) => window.__mairoSetT(x), t);
    return frame.screenshot({ type: "jpeg", quality: 92 });
  };

  // Poster: the still the page shows before the story starts.
  const posterJpg = join(out, `${job.name}-poster.jpg`);
  writeFileSync(posterJpg, await shot(job.posterAt));
  const poster = join(out, `${job.name}-poster.webp`);
  await run(FFMPEG, ["-y", "-loglevel", "error", "-i", posterJpg, "-c:v", "libwebp", "-quality", "82", poster]);
  // Keep only the WebP.
  (await import("node:fs")).rmSync(posterJpg);

  const mp4 = join(out, `${job.name}.mp4`);
  const frames = Math.round((job.ms / 1000) * FPS);
  let done = 0;
  await run(
    FFMPEG,
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", job.product ? "27" : "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4],
    (stdin) =>
      (async () => {
        for (let i = 0; i < frames; i++) {
          const buf = await shot(Math.min(job.ms - 1, (i * 1000) / FPS));
          if (!stdin.write(buf)) await new Promise((r) => stdin.once("drain", r));
          done = i + 1;
          if (done % (FPS * 5) === 0) process.stdout.write(`  ${job.name}: ${done}/${frames}\n`);
        }
        stdin.end();
      })().catch((e) => {
        stdin.destroy(e);
      }),
  );
  const vtt = await page.evaluate(() => window.__mairoVtt);
  const missing = await page.evaluate(() => window.__mairoMissing ?? {});
  await page.close();
  return { mp4, poster, vtt, missing, width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** WebVTT back to cues, for the transcript the page shows beside a clip. */
function cuesOf(vtt) {
  const ms = (s) => {
    const [h, m, rest] = s.split(":");
    return Math.round((Number(h) * 3600 + Number(m) * 60 + Number(rest)) * 1000);
  };
  return vtt
    .split(/\n\n+/)
    .map((block) => block.split("\n"))
    .map((lines) => {
      const i = lines.findIndex((l) => l.includes("-->"));
      if (i < 0) return null;
      const [a, b] = lines[i].split("-->").map((x) => x.trim());
      return { start: ms(a), end: ms(b), text: lines.slice(i + 1).join(" ").trim() };
    })
    .filter(Boolean);
}

const chromium = loadChromium();
mkdirSync(OUT, { recursive: true });
mkdirSync(CLIP_OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const media = { renderedAt: new Date().toISOString(), clips: {}, story: {}, walkthrough: {}, captions: {} };
for (const job of jobs) {
  const started = Date.now();
  const r = await render(browser, job);
  if (job.product) {
    const entry = { mp4: `/demo/${job.name}.mp4`, poster: `/demo/${job.name}-poster.webp`, width: r.width, height: r.height, ms: job.ms, bytes: statSync(r.mp4).size };
    const vttName = `${job.clip}.vtt`;
    writeFileSync(join(CLIP_OUT, vttName), r.vtt);
    const c = (media.clips[job.clip] ??= { vtt: `/demo/${vttName}`, cues: cuesOf(r.vtt) });
    c[job.layout] = entry;
    const lost = Object.entries(r.missing).filter(([, v]) => v.length);
    console.log(`${job.name}: ${(entry.bytes / 1024).toFixed(0)} KB in ${((Date.now() - started) / 1000).toFixed(0)} s${lost.length ? ` · targets not found at the end: ${JSON.stringify(Object.fromEntries(lost))}` : ""}`);
    continue;
  }
  const entry = { mp4: `/walkthrough/${job.name}.mp4`, poster: `/walkthrough/${job.name}-poster.webp`, width: r.width, height: r.height, ms: job.ms, bytes: statSync(r.mp4).size };
  if (job.clip === "story") (media.story[job.type] ??= {})[job.layout] = entry;
  else media.walkthrough[job.layout] = entry;
  const vttName = job.clip === "story" ? "story.vtt" : "walkthrough.vtt";
  writeFileSync(join(OUT, vttName), r.vtt);
  media.captions[job.clip] = `/walkthrough/${vttName}`;
  console.log(`${job.name}: ${(entry.bytes / 1024).toFixed(0)} KB in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
await browser.close();

// Merge with what's already there when only one kind was rendered.
const manifestPath = join(root, "src/lib/demo/media.ts");
let previous = { clips: {}, story: {}, walkthrough: {}, captions: {} };
try {
  const text = (await import("node:fs")).readFileSync(manifestPath, "utf8");
  const m = text.match(/export const RENDERED_MEDIA: RenderedMedia = (\{[\s\S]*\});\s*$/);
  if (m) previous = JSON.parse(m[1]);
} catch {
  // first render
}
// Clips merge one by one (and layout by layout), so rendering one clip keeps the others.
const clips = { ...(previous.clips ?? {}) };
for (const [id, c] of Object.entries(media.clips)) clips[id] = { ...(clips[id] ?? {}), ...c };
const merged = {
  renderedAt: media.renderedAt,
  clips,
  story: ONLY === "all" || ONLY === "story" ? media.story : previous.story,
  walkthrough: ONLY === "all" || ONLY === "walkthrough" ? media.walkthrough : previous.walkthrough,
  captions: { ...previous.captions, ...media.captions },
};
const header = `// Video files rendered from the product clips, the landing story and the
// walkthrough. Written by video/render.mjs after each render — it lists only
// files that exist, so a page can offer a video only when there is one. Edit
// by re-rendering, not by hand.

import type { ClipId } from "@/lib/demo/clip";

export type RenderedClip = { mp4: string; poster: string; width: number; height: number; ms: number; bytes: number; /** The file carries the recorded narration. */ audio?: boolean };
/** A product clip as rendered: its 16:9 and 9:16 files, its WebVTT captions, and the same captions as text for a transcript. */
export type ClipMedia = { wide?: RenderedClip; narrow?: RenderedClip; vtt: string; cues: { start: number; end: number; text: string }[] };
export type RenderedMedia = {
  renderedAt: string | null;
  clips?: Partial<Record<ClipId, ClipMedia>>;
  story: Partial<Record<"shop" | "service" | "appointments" | "brands", Partial<Record<"wide" | "narrow", RenderedClip>>>>;
  walkthrough: Partial<Record<"wide" | "narrow", RenderedClip>>;
  captions: { story?: string; walkthrough?: string };
};

export const RENDERED_MEDIA: RenderedMedia = ${JSON.stringify(merged, null, 2)};
`;
writeFileSync(manifestPath, header);
console.log(`Wrote ${manifestPath}`);
