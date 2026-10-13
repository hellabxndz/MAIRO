// Renders the landing story (20 s, three examples, wide and phone) and the
// 60-second walkthrough (wide and phone) to muted MP4 files, WebP posters and
// WebVTT captions in public/walkthrough/, then writes src/lib/demo/media.ts
// listing exactly what was rendered.
//
// Each frame is the real component at a fixed time (/demo/render), captured
// by a headless browser and encoded by ffmpeg — so the video can't drift from
// the page. Needs:
//   - the app running with MAIRO_RENDER_ROUTE=1 (next start is best: no dev overlay)
//   - ffmpeg on PATH, or FFMPEG_PATH
//   - playwright-core (npm install in this folder) or playwright, with Chromium
//
//   node render.mjs --base http://localhost:3100 [--fps 30] [--only story|walkthrough] [--scale 2]

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
const jobs = [];
if (ONLY === "all" || ONLY === "story") {
  for (const type of ["shop", "service", "appointments"]) for (const layout of ["wide", "narrow"]) jobs.push({ clip: "story", type, layout, ms: 20000, posterAt: 1200, name: `story-${type}-${layout}` });
}
if (ONLY === "all" || ONLY === "walkthrough") {
  for (const layout of ["wide", "narrow"]) jobs.push({ clip: "walkthrough", type: "service", layout, ms: 60000, posterAt: 36800, name: `walkthrough-${layout}` });
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
  const { w, h } = STAGE[job.layout];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: SCALE });
  await page.goto(`${BASE}/demo/render?clip=${job.clip}&type=${job.type}&layout=${job.layout}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction(() => document.documentElement.dataset.renderReady === "1", null, { timeout: 60000 });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" });
  const frame = page.locator("[data-palette=classic]").first();
  const shot = async (t) => {
    await page.evaluate((x) => window.__mairoSetT(x), t);
    return frame.screenshot({ type: "jpeg", quality: 92 });
  };

  // Poster: the still the page shows before the story starts.
  const posterJpg = join(OUT, `${job.name}-poster.jpg`);
  writeFileSync(posterJpg, await shot(job.posterAt));
  const poster = join(OUT, `${job.name}-poster.webp`);
  await run(FFMPEG, ["-y", "-loglevel", "error", "-i", posterJpg, "-c:v", "libwebp", "-quality", "82", poster]);
  // Keep only the WebP.
  (await import("node:fs")).rmSync(posterJpg);

  const mp4 = join(OUT, `${job.name}.mp4`);
  const frames = Math.round((job.ms / 1000) * FPS);
  let done = 0;
  await run(
    FFMPEG,
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4],
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
  await page.close();
  return { mp4, poster, vtt, width: w * SCALE, height: h * SCALE };
}

const chromium = loadChromium();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const media = { renderedAt: new Date().toISOString(), story: {}, walkthrough: {}, captions: {} };
for (const job of jobs) {
  const started = Date.now();
  const r = await render(browser, job);
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
let previous = { story: {}, walkthrough: {}, captions: {} };
try {
  const text = (await import("node:fs")).readFileSync(manifestPath, "utf8");
  const m = text.match(/export const RENDERED_MEDIA: RenderedMedia = (\{[\s\S]*\});\s*$/);
  if (m) previous = JSON.parse(m[1]);
} catch {
  // first render
}
const merged = {
  renderedAt: media.renderedAt,
  story: ONLY === "walkthrough" ? previous.story : media.story,
  walkthrough: ONLY === "story" ? previous.walkthrough : media.walkthrough,
  captions: { ...previous.captions, ...media.captions },
};
const header = `// Video files rendered from the landing story and the walkthrough. Written by
// video/render.mjs after each render — it lists only files that exist, so a
// page can offer a video only when there is one. Edit by re-rendering, not by
// hand.

export type RenderedClip = { mp4: string; poster: string; width: number; height: number; ms: number; bytes: number };
export type RenderedMedia = {
  renderedAt: string | null;
  story: Partial<Record<"shop" | "service" | "appointments", Partial<Record<"wide" | "narrow", RenderedClip>>>>;
  walkthrough: Partial<Record<"wide" | "narrow", RenderedClip>>;
  captions: { story?: string; walkthrough?: string };
};

export const RENDERED_MEDIA: RenderedMedia = ${JSON.stringify(merged, null, 2)};
`;
writeFileSync(manifestPath, header);
console.log(`Wrote ${manifestPath}`);
