// Checks the homepage's product clips and film as rendered (video/render.mjs
// writes src/lib/demo/media.ts and the files in public/demo/):
//
//   - every clip is rendered in both compositions, 16:9 and 9:16, and each
//     MP4, poster and WebVTT file is really there;
//   - the film runs 60–90 seconds, each demonstration 12–30 seconds;
//   - the captions run in order, inside the clip, long enough to read, and
//     the manifest's transcript is exactly what the WebVTT file says;
//   - nothing in them claims what MAIRO doesn't do: other ad networks, AI
//     video, guarantees, forecasts, testimonials;
//   - every frame carries the sample-data label (it's drawn by the stage).
//
//   npm run check:clips   (files only — no browser, no network, no database)

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CLIP_IDS, CLIP_STAGE, captionsVtt } from "../src/lib/demo/clip";
import { RENDERED_MEDIA, type RenderedClip } from "../src/lib/demo/media";
import { BANNED_CLAIMS } from "../src/lib/capabilities";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const root = process.cwd();
const file = (p: string) => join(root, "public", p.replace(/^\//, ""));
const clips = RENDERED_MEDIA.clips ?? {};

/** What a clip may not say: networks MAIRO doesn't run, AI video, forecasts. */
const NOT_OFFERED = [
  { pattern: /\btiktok\b|\bgoogle ads\b|\byoutube ads\b|\blinkedin ads\b/i, why: "another ad network" },
  { pattern: /\b(ai[- ]generated|generates?|makes?)\s+(a\s+)?videos?\b/i, why: "AI video generation" },
  { pattern: /\bwill (get|bring|deliver|generate) (you )?\d|\b\d+ (sales|leads|customers) (a|per) (day|week|month)\b|\broas\b/i, why: "a forecast" },
  ...BANNED_CLAIMS,
];

check("every clip is rendered in 16:9 and 9:16", () => {
  for (const id of CLIP_IDS) {
    const c = clips[id];
    assert.ok(c, `${id}: rendered`);
    for (const layout of ["wide", "narrow"] as const) {
      const r: RenderedClip | undefined = c[layout];
      assert.ok(r, `${id}: ${layout} rendered`);
      const stage = CLIP_STAGE[layout];
      assert.equal(Math.round((r.width / r.height) * 100), Math.round((stage.w / stage.h) * 100), `${id} ${layout}: ${stage.w}:${stage.h}`);
    }
  }
});

check("each listed file exists and isn't empty", () => {
  for (const id of CLIP_IDS) {
    const c = clips[id]!;
    for (const r of [c.wide!, c.narrow!]) {
      for (const p of [r.mp4, r.poster]) {
        assert.ok(existsSync(file(p)), `${p} exists`);
        assert.ok(statSync(file(p)).size > 1000, `${p} isn't empty`);
      }
      assert.equal(statSync(file(r.mp4)).size, r.bytes, `${r.mp4}: the size the manifest says`);
      assert.ok(r.mp4.endsWith(".mp4") && r.poster.endsWith(".webp"), `${id}: MP4 and a WebP poster`);
    }
    assert.ok(existsSync(file(c.vtt)), `${c.vtt} exists`);
  }
});

check("the film runs 60–90 seconds; each demonstration 12–30", () => {
  for (const id of CLIP_IDS) {
    const c = clips[id]!;
    assert.equal(c.wide!.ms, c.narrow!.ms, `${id}: both compositions the same length`);
    const s = c.wide!.ms / 1000;
    if (id === "film") assert.ok(s >= 60 && s <= 90, `film: ${s} s`);
    else assert.ok(s >= 12 && s <= 30, `${id}: ${s} s`);
  }
});

check("captions run in order, inside the clip, long enough to read — and match the WebVTT file", () => {
  for (const id of CLIP_IDS) {
    const c = clips[id]!;
    assert.ok(c.cues.length >= 3, `${id}: captioned`);
    for (let i = 0; i < c.cues.length; i++) {
      const q = c.cues[i];
      assert.ok(q.end > q.start, `${id}: "${q.text}" has length`);
      assert.ok(q.end - q.start >= 2500, `${id}: "${q.text}" on screen long enough to read`);
      assert.ok(q.end <= c.wide!.ms, `${id}: "${q.text}" ends inside the clip`);
      if (i > 0) assert.ok(q.start >= c.cues[i - 1].end, `${id}: captions don't overlap`);
    }
    assert.equal(readFileSync(file(c.vtt), "utf8"), captionsVtt(c.cues), `${id}: transcript = WebVTT`);
  }
});

check("no caption claims what MAIRO doesn't do", () => {
  for (const id of CLIP_IDS) {
    for (const q of clips[id]!.cues) for (const b of NOT_OFFERED) assert.ok(!b.pattern.test(q.text), `${id}: "${q.text}" — ${b.why}`);
  }
});

check("the film says what it is about: the team, and where to start", () => {
  const text = clips.film!.cues.map((q) => q.text).join(" ");
  assert.match(text, /approve/i, "the film says nothing runs without approval");
  assert.match(text, /Meta confirms/i, "and that live means Meta confirmed it");
  assert.match(text, /Sample data/i, "and that the figures are sample data");
  assert.match(text, /Build your free ad plan/i, "and ends on the free plan");
});

check("every frame carries the sample-data label", () => {
  const stage = readFileSync(join(root, "src/components/clips/stage.tsx"), "utf8");
  assert.match(stage, /Product demo · fictional business · sample data/);
  assert.match(stage, /<SampleBadge narrow=\{narrow\} \/>/);
});

console.log(`\n${passed} checks passed.`);
