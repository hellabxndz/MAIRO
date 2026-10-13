import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { isOwnUpload } from "@/lib/campaigns/media-rules";
import { storageConfigured } from "@/lib/storage/blob";
import { editsNotInFile, parseEdits, type VideoMeta } from "./video";
import { assFile, renderPlan } from "./render";

// Running a render: one edit version of the owner's video into a new MP4 and
// a poster, stored beside the original in the business's own folder, and
// recorded on that version. The original is read and never changed.
//
// Safe to press twice: a version being rendered is claimed, so a second
// request waits for the first rather than making a second file; a render
// that died (a timeout, a restart) is retried after RENDER_STALE_MS. Failures
// are recorded with a reason the owner can act on — never a stack trace, the
// video, or anything from inside it.

export const RENDER_STALE_MS = 10 * 60 * 1000;
const MAX_SOURCE_BYTES = 500 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 240_000;
const FONTS_DIR = join(process.cwd(), "assets", "fonts");

/** The ffmpeg binary: FFMPEG_PATH, or the one ffmpeg-static installs. Null when neither exists. */
export async function ffmpegBinary(): Promise<string | null> {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv && existsSync(/*turbopackIgnore: true*/ fromEnv)) return fromEnv;
  try {
    const mod = (await import("ffmpeg-static")) as unknown as { default?: string | null };
    const p = mod.default ?? null;
    return p && existsSync(/*turbopackIgnore: true*/ p) ? p : null;
  } catch {
    return null;
  }
}

/**
 * Development only: rendered files go to public/_local-media and sample
 * videos are read from public/, so the whole flow can be tried in a browser
 * without cloud storage. Never on in production.
 */
export const localMedia = () => process.env.NODE_ENV !== "production" && process.env.MAIRO_LOCAL_MEDIA === "1";
const LOCAL_DIR = join(process.cwd(), "public", "_local-media");

async function localStore(pathname: string, file: string) {
  const { mkdir } = await import("node:fs/promises");
  const name = pathname.replace(/[^\w.-]/g, "_");
  await mkdir(/*turbopackIgnore: true*/ LOCAL_DIR, { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ join(LOCAL_DIR, name), await readFile(/*turbopackIgnore: true*/ file));
  return `/_local-media/${name}`;
}
async function localFetch(url: string, to: string) {
  if (!url.startsWith("/") || url.includes("..")) throw new Error("source unavailable");
  await writeFile(/*turbopackIgnore: true*/ to, await readFile(/*turbopackIgnore: true*/ join(process.cwd(), "public", url)));
}

export async function renderingAvailable(): Promise<{ ok: boolean; reason: string | null }> {
  if (!(await ffmpegBinary())) return { ok: false, reason: "Turning edits into a video file isn't switched on for this deployment yet (it needs ffmpeg on the server). Your edits are saved; the ad would use the original video." };
  if (!storageConfigured() && !localMedia()) return { ok: false, reason: "Video storage isn't switched on for this deployment yet." };
  return { ok: true, reason: null };
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d: Buffer) => {
      err = (err + d.toString()).slice(-2000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("timeout"));
    }, FFMPEG_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300)}`));
    });
  });
}

/** Turns one edit version into files on disk. Exported for the render check, which runs it on a sample video. */
export async function renderToFiles(bin: string, source: string, dir: string, edits: ReturnType<typeof parseEdits>, meta: VideoMeta) {
  const out = { video: join(dir, "out.mp4"), poster: join(dir, "poster.jpg"), ass: join(dir, "captions.ass") };
  const plan = renderPlan({ source, output: out.video, poster: out.poster, assPath: out.ass, fontsDir: FONTS_DIR }, edits, meta);
  if (plan.hasCaptions) await writeFile(/*turbopackIgnore: true*/ out.ass, assFile(edits.captions, edits, plan.lengthMs, plan.size));
  await run(bin, plan.args);
  await run(bin, plan.posterArgs);
  const bytes = (await stat(/*turbopackIgnore: true*/ out.video)).size;
  return { ...out, plan, bytes };
}

export type RenderDeps = {
  /** Copies the original to a local file. Defaults to fetching it from storage. */
  fetchSource?: (url: string, to: string) => Promise<void>;
  /** Stores a finished file and returns its URL. Defaults to the business's storage folder. */
  store?: (pathname: string, file: string, contentType: string) => Promise<string>;
};

async function fetchToFile(url: string, to: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error("source unavailable");
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_SOURCE_BYTES) throw new Error("source too large");
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(/*turbopackIgnore: true*/ to));
}

async function storeFile(pathname: string, file: string, contentType: string) {
  const r = await put(pathname, await readFile(/*turbopackIgnore: true*/ file), { access: "public", contentType, addRandomSuffix: true });
  return r.url;
}

export type RenderOutcome = { ok: true; status: "READY" | "RENDERING" | "NOT_NEEDED"; url: string | null } | { ok: false; error: string };

/**
 * Renders the latest edit version of one of this business's videos, or says
 * it's already being rendered, or that there's nothing to render.
 */
export async function renderVideoRevision(organizationId: string, videoId: string, depsIn: RenderDeps = {}, now = new Date()): Promise<RenderOutcome> {
  const deps: RenderDeps = localMedia() ? { fetchSource: localFetch, store: localStore, ...depsIn } : depsIn;
  const video = await db.ownerVideo.findFirst({ where: { id: videoId, organizationId }, include: { revisions: { orderBy: { version: "desc" }, take: 1 } } });
  const rev = video?.revisions[0];
  if (!video || !rev) return { ok: false, error: "That video isn't in your account." };
  const meta: VideoMeta = { durationMs: video.durationMs, width: video.width, height: video.height };
  const edits = parseEdits(rev.editsJson, meta);
  if (!editsNotInFile(edits).length) return { ok: true, status: "NOT_NEEDED", url: video.url };
  if (rev.renderStatus === "READY" && rev.renderedUrl) return { ok: true, status: "READY", url: rev.renderedUrl };

  const bin = await ffmpegBinary();
  if (!bin) return { ok: false, error: (await renderingAvailable()).reason ?? "Rendering isn't available." };
  if (!deps.store && !storageConfigured()) return { ok: false, error: "Video storage isn't switched on for this deployment yet." };
  if (!deps.fetchSource && !isOwnUpload(video.url, organizationId)) return { ok: false, error: "That video isn't in your business's uploads." };

  // Claim this version: only one render at a time, and a stale one is taken over.
  const claimed = await db.ownerVideoRevision.updateMany({
    where: { id: rev.id, organizationId, OR: [{ renderStatus: null }, { renderStatus: "FAILED" }, { renderStatus: "RENDERING", renderStartedAt: { lt: new Date(now.getTime() - RENDER_STALE_MS) } }] },
    data: { renderStatus: "RENDERING", renderStartedAt: now, renderError: null, renderAttempts: { increment: 1 } },
  });
  if (claimed.count === 0) return { ok: true, status: "RENDERING", url: null };

  const dir = await mkdtemp(join(tmpdir(), "mairo-render-"));
  try {
    const source = join(dir, "source");
    await (deps.fetchSource ?? fetchToFile)(video.url, source);
    const r = await renderToFiles(bin, source, dir, edits, meta);
    const base = `ad-media/${organizationId}/rendered/${video.id}-v${rev.version}`;
    const save = deps.store ?? storeFile;
    const [url, posterUrl] = await Promise.all([save(`${base}.mp4`, r.video, "video/mp4"), save(`${base}.jpg`, r.poster, "image/jpeg")]);
    await db.ownerVideoRevision.update({
      where: { id: rev.id },
      data: { renderStatus: "READY", renderedAt: new Date(), renderedUrl: url, renderedPosterUrl: posterUrl, renderedDurationMs: r.plan.lengthMs, renderedWidth: r.plan.size.w, renderedHeight: r.plan.size.h, renderedBytes: r.bytes, renderError: null },
    });
    return { ok: true, status: "READY", url };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    const reason = /timeout/.test(msg) ? "The render took too long. Try a shorter cut." : /too large/.test(msg) ? "That video is too large to render here." : /unavailable/.test(msg) ? "The original video couldn't be read from storage." : "The video couldn't be rendered. Your edits are saved — try again, or use the original.";
    // The reason is logged without the video's address or contents.
    console.error("Video render failed:", msg.slice(0, 300));
    await db.ownerVideoRevision.update({ where: { id: rev.id }, data: { renderStatus: "FAILED", renderError: reason } });
    return { ok: false, error: reason };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => null);
  }
}
