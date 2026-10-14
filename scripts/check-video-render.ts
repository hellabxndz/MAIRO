// Checks writing a video's edits into a new file, with a real render:
//
//   - the crop is centred, the right shape and has even sides; output is
//     never bigger than Meta shows;
//   - captions are timed from the start of the trimmed clip, clipped to it,
//     and written literally (no subtitle markup gets through);
//   - a real ffmpeg render of a sample video has the trimmed length, the
//     cropped size, a poster, and the caption burned into the picture —
//     compared against the same render without it;
//   - text over the whole clip and the business's logo in a corner are in the
//     picture of a real render too, the logo read only from the business's
//     own uploads;
//   - the original is never changed; a render is claimed, so pressing twice
//     makes one file; a failure is recorded with a reason and can be retried;
//   - the approved file and the campaign draft are the rendered one;
//   - one business can't render another's video.
//
//   npm run check:video-render   (needs the local database and ffmpeg — FFMPEG_PATH or ffmpeg-static)

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../src/lib/db";
import { assFile, assText, cropFor, logoPlacement, outputSize, renderPlan } from "../src/lib/suggested-ads/render";
import { ffmpegBinary, renderToFiles, renderVideoRevision } from "../src/lib/suggested-ads/render-run";
import { NO_EDITS, editsNotInFile, parseEdits, sameEdits, type VideoEdits, type VideoMeta } from "../src/lib/suggested-ads/video";
import { approveCreative, draftFromApproval, ensureDirections, listSuggestions, saveOwnerVideo, saveVideoEdits } from "../src/lib/suggested-ads/store";
import { changeBrain } from "../src/lib/brain/store";
import { encryptSecret } from "../src/lib/crypto/secret-box";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const SAMPLE = join(process.cwd(), "public/walkthrough/story-service-wide.mp4");
const META: VideoMeta = { durationMs: 20_000, width: 1140, height: 840 };
const TAG = "zz-vrn";
const A = `${TAG}-a`;
const B = `${TAG}-b`;

/** Duration in ms and size from ffmpeg's own report (no ffprobe needed). */
function probe(bin: string, file: string): { ms: number; w: number; h: number } {
  let out = "";
  try {
    execFileSync(bin, ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    out = String((e as { stderr?: Buffer }).stderr ?? "");
  }
  const d = out.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const v = out.match(/Video: .*?, (\d{2,5})x(\d{2,5})/);
  assert.ok(d && v, `couldn't read ${file}`);
  return { ms: Math.round((+d![1] * 3600 + +d![2] * 60 + +d![3]) * 1000), w: +v![1], h: +v![2] };
}

/** A grey frame's top band as raw bytes, to see whether a caption is drawn there. */
/** One region of a frame, as grey bytes: a share of the width and height from a corner. */
function region(bin: string, file: string, atSec: number, size: { w: number; h: number }, r: { x0: number; y0: number; x1: number; y1: number }): Buffer {
  const raw = execFileSync(bin, ["-hide_banner", "-loglevel", "error", "-ss", String(atSec), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  const rows: Buffer[] = [];
  for (let y = Math.floor(size.h * r.y0); y < Math.floor(size.h * r.y1); y++) rows.push(raw.subarray(y * size.w + Math.floor(size.w * r.x0), y * size.w + Math.floor(size.w * r.x1)));
  return Buffer.concat(rows);
}

function topBand(bin: string, file: string, atSec: number, size: { w: number; h: number }): Buffer {
  const raw = execFileSync(bin, ["-hide_banner", "-loglevel", "error", "-ss", String(atSec), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  return raw.subarray(0, size.w * Math.round(size.h * 0.3));
}
const meanDiff = (a: Buffer, b: Buffer) => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s / n;
};

async function cleanup() {
  await db.campaignDraft.deleteMany({ where: { organizationId: { startsWith: TAG } } });
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function main() {
  await cleanup();

  console.log("— the plan —");
  await check("crop: centred, the right shape, even sides", () => {
    assert.deepEqual(cropFor(META, "9:16"), { w: 472, h: 840, x: 334, y: 0 });
    assert.deepEqual(cropFor(META, "4:5"), { w: 672, h: 840, x: 234, y: 0 });
    assert.deepEqual(cropFor(META, "1:1"), { w: 840, h: 840, x: 150, y: 0 });
    assert.deepEqual(cropFor({ width: 1080, height: 1921 }, "original"), { w: 1080, h: 1920, x: 0, y: 0 });
    assert.deepEqual(cropFor({ width: 1080, height: 1920 }, "4:5"), { w: 1080, h: 1350, x: 0, y: 284 });
  });
  await check("never bigger than 1080 on the short side", () => {
    assert.deepEqual(outputSize({ w: 2160, h: 3840, x: 0, y: 0 }), { w: 1080, h: 1920 });
    assert.deepEqual(outputSize({ w: 472, h: 840, x: 0, y: 0 }), { w: 472, h: 840 });
  });
  await check("captions timed from the trimmed start, clipped to it, written literally", () => {
    const ass = assFile([{ startMs: 500, endMs: 3500, text: "Leak? {\\b1}We pick up." }, { startMs: 9000, endMs: 12000, text: "outside" }], { trimStartMs: 2000 }, 6000, { w: 472, h: 840 });
    const lines = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    assert.equal(lines.length, 1, "the caption after the clip ends is dropped");
    assert.match(lines[0], /^Dialogue: 0,0:00:00\.00,0:00:01\.50,Caption,,0,0,0,,Leak\? \(⧵b1\)We pick up\.$/);
    assert.equal(assText("a\nb {x}"), "a b (x)");
    assert.match(ass, /PlayResX: 472\nPlayResY: 840/);
  });
  await check("ffmpeg is asked for exactly the trim, crop, captions and an MP4 Meta runs", () => {
    const e: VideoEdits = { trimStartMs: 2000, trimEndMs: 8000, captions: [{ startMs: 2000, endMs: 4000, text: "Hi" }], aspect: "9:16" };
    const p = renderPlan({ source: "/t/in", output: "/t/out.mp4", poster: "/t/p.jpg", assPath: "/t/c.ass", fontsDir: "/f" }, e, META);
    const a = p.args.join(" ");
    assert.match(a, /-ss 2\.000 -i \/t\/in -t 6\.000/);
    assert.match(a, /crop=472:840:334:0/);
    assert.match(a, /subtitles=filename=\/t\/c\.ass:fontsdir=\/f/);
    assert.match(a, /-c:v libx264 .*-pix_fmt|format=yuv420p/);
    assert.match(a, /-movflags \+faststart \/t\/out\.mp4$/);
    const none = renderPlan({ source: "s", output: "o", poster: "p", assPath: "a", fontsDir: "f" }, { ...NO_EDITS, trimStartMs: 1000 }, META);
    assert.ok(!none.args.join(" ").includes("subtitles"), "no captions, no subtitle filter");
  });

  await check("text and logo: kept only when set, cleaned, with safe defaults; named when not yet in a file", () => {
    const e = parseEdits({ overlay: { text: "  Free   call-out before 6pm — and much more text than fits on one line of video  ", position: "sideways" }, logo: { url: " https://x/ad-media/o/logo.png ", corner: "centre" } }, META);
    assert.equal(e.overlay!.text.length, 60);
    assert.equal(e.overlay!.position, "bottom");
    assert.deepEqual(e.logo, { url: "https://x/ad-media/o/logo.png", corner: "top-right" });
    assert.ok(sameEdits(parseEdits({ overlay: { text: "   " }, logo: { url: "" } }, META), parseEdits({}, META)), "empty text and logo are no edit at all");
    assert.ok(!("overlay" in parseEdits({}, META)), "an old edit list reads the same as before");
    assert.deepEqual(editsNotInFile(e), ["the text", "the logo"]);
  });
  await check("the text is one line for the whole clip, in its own style, written literally", () => {
    const ass = assFile([], { trimStartMs: 2000 }, 6000, { w: 472, h: 840 }, undefined, { text: "Free {\\b1}call-out", position: "bottom" });
    assert.match(ass, /^Style: Overlay,.*,2,\d+,\d+,202,1$/m);
    assert.match(ass, /^Dialogue: 0,0:00:00\.00,0:00:06\.00,Overlay,,0,0,0,,Free \(⧵b1\)call-out$/m);
    assert.match(assFile([], { trimStartMs: 0 }, 6000, { w: 472, h: 840 }, undefined, { text: "Top", position: "top" }), /^Style: Overlay,.*,8,\d+,\d+,185,1$/m);
  });
  await check("a logo is a second input laid over its corner; without the file, there's no logo", () => {
    const e = parseEdits({ trimStartMs: 2000, trimEndMs: 8000, aspect: "9:16", logo: { url: "u", corner: "bottom-left" } }, META);
    const p = renderPlan({ source: "/t/in", output: "/t/out.mp4", poster: "/t/p.jpg", assPath: "/t/c.ass", fontsDir: "/f", logoPath: "/t/logo" }, e, META);
    const a = p.args.join(" ");
    assert.ok(p.hasLogo);
    assert.match(a, /-i \/t\/in -i \/t\/logo -t 6\.000/);
    assert.match(a, /\[1:v\]scale=74:-2\[logo\];\[base\]\[logo\]overlay=19:H-h-19,format=yuv420p\[v\] -map \[v\] -map 0:a:0\?/);
    assert.deepEqual(logoPlacement("top-right", { w: 472, h: 840 }), { w: 74, x: "W-w-19", y: "19" });
    const noFile = renderPlan({ source: "/t/in", output: "/t/out.mp4", poster: "/t/p.jpg", assPath: "/t/c.ass", fontsDir: "/f" }, e, META);
    assert.ok(!noFile.hasLogo && !noFile.args.includes("-filter_complex"));
  });

  console.log("— a real render —");
  const bin = await ffmpegBinary();
  assert.ok(bin, "No ffmpeg: set FFMPEG_PATH, or install ffmpeg-static with its install script.");
  const dir = await mkdtemp(join(tmpdir(), "mairo-vr-"));
  const before = await readFile(SAMPLE);
  const edits = parseEdits({ trimStartMs: 2000, trimEndMs: 8000, aspect: "9:16", captions: [{ startMs: 2000, endMs: 5000, text: "WATER EVERYWHERE? WE PICK UP." }] }, META);
  const plain = { ...edits, captions: [] };
  const withCaps = await renderToFiles(bin!, SAMPLE, join(dir, ""), edits, META).then(async (r) => {
    await copyFile(r.video, join(dir, "with.mp4"));
    await copyFile(r.poster, join(dir, "with.jpg"));
    return r;
  });
  const d2 = await mkdtemp(join(tmpdir(), "mairo-vr2-"));
  const without = await renderToFiles(bin!, SAMPLE, d2, plain, META);
  await check("the new file has the trimmed length and the cropped size", () => {
    const p = probe(bin!, join(dir, "with.mp4"));
    assert.ok(Math.abs(p.ms - 6000) <= 150, `length ${p.ms}ms`);
    assert.equal(p.w, 472);
    assert.equal(p.h, 840);
    assert.equal(withCaps.plan.size.w, 472);
  });
  await check("a poster is made from the new file", async () => {
    assert.ok((await stat(join(dir, "with.jpg"))).size > 1000);
  });
  await check("the caption is in the picture — the top of the frame differs from the same render without it", () => {
    const withTop = topBand(bin!, join(dir, "with.mp4"), 1, withCaps.plan.size);
    const plainTop = topBand(bin!, without.video, 1, without.plan.size);
    const afterCaption = topBand(bin!, join(dir, "with.mp4"), 4.5, withCaps.plan.size);
    const plainLater = topBand(bin!, without.video, 4.5, without.plan.size);
    const during = meanDiff(withTop, plainTop);
    const after = meanDiff(afterCaption, plainLater);
    assert.ok(during > 3, `caption should change the top band (diff ${during.toFixed(2)})`);
    assert.ok(after < 1.5, `after the caption ends the frames match again (diff ${after.toFixed(2)})`);
  });
  const d3 = await mkdtemp(join(tmpdir(), "mairo-vr3-"));
  const logo = join(d3, "logo.png");
  execFileSync(bin!, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0xFF2D55:s=240x120", "-frames:v", "1", logo]);
  const dressed = { ...plain, overlay: { text: "FREE CALL-OUT BEFORE 6PM", position: "bottom" as const }, logo: { url: "unused", corner: "top-right" as const } };
  const withMarks = await renderToFiles(bin!, SAMPLE, d3, dressed, META, logo);
  await check("a real render has the text along the bottom and the logo in the top-right corner", () => {
    const size = withMarks.plan.size;
    const logoNow = region(bin!, withMarks.video, 2, size, { x0: 0.78, y0: 0.02, x1: 0.98, y1: 0.1 });
    const logoPlain = region(bin!, without.video, 2, size, { x0: 0.78, y0: 0.02, x1: 0.98, y1: 0.1 });
    const textNow = region(bin!, withMarks.video, 2, size, { x0: 0.1, y0: 0.62, x1: 0.9, y1: 0.78 });
    const textPlain = region(bin!, without.video, 2, size, { x0: 0.1, y0: 0.62, x1: 0.9, y1: 0.78 });
    const leftTop = region(bin!, withMarks.video, 2, size, { x0: 0.02, y0: 0.02, x1: 0.2, y1: 0.1 });
    const leftTopPlain = region(bin!, without.video, 2, size, { x0: 0.02, y0: 0.02, x1: 0.2, y1: 0.1 });
    assert.ok(meanDiff(logoNow, logoPlain) > 20, `logo corner diff ${meanDiff(logoNow, logoPlain).toFixed(1)}`);
    assert.ok(meanDiff(textNow, textPlain) > 3, `text band diff ${meanDiff(textNow, textPlain).toFixed(1)}`);
    assert.ok(meanDiff(leftTop, leftTopPlain) < 1.5, "the other corner is untouched");
    const p = probe(bin!, withMarks.video);
    assert.ok(Math.abs(p.ms - 6000) <= 150 && p.w === 472 && p.h === 840);
  });
  await rm(d3, { recursive: true, force: true });
  await check("the original sample is untouched", async () => {
    assert.ok(before.equals(await readFile(SAMPLE)));
  });
  await rm(d2, { recursive: true, force: true });

  console.log("— the records —");
  await db.organization.create({ data: { id: A, name: "Render Plumbing" } });
  await db.organization.create({ data: { id: B, name: "Other Co" } });
  await db.metaAdAccount.create({ data: { organizationId: A, metaAdAccountId: "act_vr", accessToken: encryptSecret("fake"), status: "CONNECTED", pageId: "1" } });
  await changeBrain(A, { op: "set", field: "focusItem", value: "Emergency plumbing repairs" }, "customer");
  await ensureDirections(A, "user-a");
  const angle = (await listSuggestions(A)).directions[0];
  const URL0 = `https://store.public.blob.vercel-storage.com/ad-media/${A}/v.mp4`;
  const saved = await saveOwnerVideo(A, "user-a", { angleId: angle.id, url: URL0, posterUrl: `https://store.public.blob.vercel-storage.com/ad-media/${A}/p.jpg`, name: "van.mp4", durationMs: 20_000, width: 1140, height: 840, bytes: before.length });
  assert.ok(saved.ok);
  const videoId = saved.ok ? saved.videoId : "";
  const stored = new Map<string, string>();
  const deps = {
    fetchSource: async (_url: string, to: string) => {
      await new Promise((r) => setTimeout(r, 200));
      await copyFile(SAMPLE, to);
    },
    store: async (pathname: string, file: string) => {
      const keep = join(dir, pathname.replace(/[^\w.-]/g, "_"));
      await copyFile(file, keep);
      const url = `https://store.public.blob.vercel-storage.com/${pathname}`;
      stored.set(url, keep);
      return url;
    },
  };
  await check("nothing to render for the original", async () => {
    const r = await renderVideoRevision(A, videoId, deps);
    assert.deepEqual(r, { ok: true, status: "NOT_NEEDED", url: URL0 });
  });
  await saveVideoEdits(A, "user-a", videoId, edits);
  await check("pressing twice makes one file: the second press is told it's rendering", async () => {
    const [x, y] = await Promise.all([renderVideoRevision(A, videoId, deps), renderVideoRevision(A, videoId, deps)]);
    const statuses = [x, y].map((r) => (r.ok ? r.status : "error")).sort();
    assert.deepEqual(statuses, ["READY", "RENDERING"]);
    assert.equal([...stored.keys()].filter((k) => k.endsWith(".mp4")).length, 1);
  });
  await check("the version records the new file; the original video row is unchanged", async () => {
    const rev = await db.ownerVideoRevision.findFirstOrThrow({ where: { videoId }, orderBy: { version: "desc" } });
    assert.equal(rev.renderStatus, "READY");
    assert.match(rev.renderedUrl ?? "", new RegExp(`/ad-media/${A}/rendered/${videoId}-v2`));
    assert.equal(rev.renderedWidth, 472);
    assert.equal(rev.renderedDurationMs, 6000);
    assert.equal((await db.ownerVideo.findUniqueOrThrow({ where: { id: videoId } })).url, URL0);
    const p = probe(bin!, stored.get(rev.renderedUrl!)!);
    assert.ok(Math.abs(p.ms - 6000) <= 150 && p.w === 472);
  });
  await check("asking again returns the same file without rendering again", async () => {
    const r = await renderVideoRevision(A, videoId, deps);
    assert.ok(r.ok && r.status === "READY");
    assert.equal([...stored.keys()].filter((k) => k.endsWith(".mp4")).length, 1);
  });
  await check("approval and the campaign draft use the rendered file — no acknowledgement needed", async () => {
    const cur = (await listSuggestions(A)).directions.find((d) => d.id === angle.id)!;
    assert.equal(cur.videos[0].render?.status, "READY");
    const r = await approveCreative(A, "user-a", { angleId: angle.id, revisionId: cur.words!.revisionId, videoRevisionId: cur.videos[0].revisionId });
    assert.ok(r.ok);
    const draft = await draftFromApproval(A, "user-a", angle.id);
    assert.ok(draft.ok);
    if (!draft.ok) return;
    const plan = (await db.campaignDraft.findUniqueOrThrow({ where: { id: draft.draftId } })).data as { video: { url: string; width: number; durationSec: number } };
    assert.match(plan.video.url, /\/rendered\//);
    assert.equal(plan.video.width, 472);
    assert.equal(plan.video.durationSec, 6);
  });
  await check("a new edit is a new version with nothing rendered yet; the approval is withdrawn", async () => {
    await saveVideoEdits(A, "user-a", videoId, { ...edits, aspect: "1:1" });
    const cur = (await listSuggestions(A)).directions.find((d) => d.id === angle.id)!;
    assert.equal(cur.videos[0].version, 3);
    assert.equal(cur.videos[0].render?.status ?? null, null);
    assert.equal(cur.approval?.state, "changed");
  });
  await check("a failed render says why and can be tried again", async () => {
    const bad = { ...deps, fetchSource: async () => { throw new Error("source unavailable"); } };
    const r = await renderVideoRevision(A, videoId, bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /couldn't be read from storage/);
    const rev = await db.ownerVideoRevision.findFirstOrThrow({ where: { videoId }, orderBy: { version: "desc" } });
    assert.equal(rev.renderStatus, "FAILED");
    const again = await renderVideoRevision(A, videoId, deps);
    assert.ok(again.ok && again.status === "READY");
    assert.equal((await db.ownerVideoRevision.findFirstOrThrow({ where: { id: rev.id } })).renderAttempts, 2);
  });
  await check("a logo is accepted only from this business's own uploads", async () => {
    const foreign = await saveVideoEdits(A, "user-a", videoId, { ...edits, logo: { url: "https://cdn.example.com/logo.png", corner: "top-right" } });
    assert.ok(!foreign.ok && /uploads/.test(foreign.error));
    const other = await saveVideoEdits(A, "user-a", videoId, { ...edits, logo: { url: `https://store.public.blob.vercel-storage.com/ad-media/${B}/logo.png`, corner: "top-right" } });
    assert.ok(!other.ok, "another business's upload isn't this one's");
    const own = await saveVideoEdits(A, "user-a", videoId, { ...edits, logo: { url: `https://store.public.blob.vercel-storage.com/ad-media/${A}/logo.png`, corner: "top-right" } });
    assert.ok(own.ok && own.changed);
  });
  await check("another business can't render this video", async () => {
    const r = await renderVideoRevision(B, videoId, deps);
    assert.equal(r.ok, false);
  });

  await rm(dir, { recursive: true, force: true });
  await cleanup();
  console.log(`\nVideo render: ${passed} checks passed.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  process.exit(1);
});
