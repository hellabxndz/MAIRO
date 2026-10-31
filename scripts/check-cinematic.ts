// Checks the cinematic layer: every shape is a full set of finite points the
// same size, so any two can morph; the story's sequence and scenes line up;
// devices get a sensible particle budget; the MAIRO core moves only for real
// operations; and the pages still read without the particles.
//
//   npm run check:cinematic   (pure; no browser, database, Meta or Stripe)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { particleBudget, shape, type ShapeKey } from "../src/lib/cinematic/shapes";
import { ACTIVITY_LABEL, ACTIVITY_LOOK, type Activity } from "../src/lib/cinematic/activity";
import { fitDistance, positionIn, SEQ } from "../src/components/cinematic/home/director";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}
const read = (p: string) => readFileSync(p, "utf8");

const SHAPES: Exclude<ShapeKey, "wordmark">[] = ["void", "chaos", "core", "brief", "creative", "network", "results", "ribbon", "field"];

check("every shape is the same number of finite points, and the same every time", () => {
  for (const n of [1400, 7000]) {
    for (const k of SHAPES) {
      const p = shape(k, n);
      assert.equal(p.length, n * 3, k);
      assert.ok(p.every(Number.isFinite), `${k} has a non-finite point`);
    }
  }
  assert.deepEqual([...shape("core", 500).slice(0, 9)], [...shape("core", 500).slice(0, 9)]);
});

check("shapes fit the frame: nothing but the dark is far from the centre", () => {
  for (const k of SHAPES.filter((s) => s !== "void")) {
    const p = shape(k, 4000);
    let max = 0;
    for (let i = 0; i < p.length; i += 3) max = Math.max(max, Math.hypot(p[i], p[i + 1]));
    assert.ok(max < 4.6, `${k} reaches ${max.toFixed(2)}`);
  }
  const v = shape("void", 4000);
  let min = Infinity;
  for (let i = 0; i < v.length; i += 3) min = Math.min(min, Math.hypot(v[i], v[i + 1], v[i + 2]));
  assert.ok(min > 6, "the dark stays behind the camera's subject");
});

check("the story's sequence matches its scenes: the ribbon, then Analyze · Create · Track, then the ribbon", () => {
  const scenes = [...read("src/components/cinematic/home/scenes.tsx").matchAll(/data-scene="(\d+):(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const hero = read("src/components/cinematic/home/hero.tsx").match(/data-scene="(\d+):(\d+)"/);
  assert.ok(hero);
  assert.equal(SEQ[Number(hero![1])], "ribbon");
  for (const [a, b] of scenes) {
    assert.ok(a >= 0 && b < SEQ.length && a <= b, `${a}:${b}`);
  }
  const how = scenes.find(([a, b]) => b - a === 2)!;
  assert.deepEqual(SEQ.slice(how[0], how[1] + 1), ["field", "creative", "results"]);
  assert.equal(SEQ[SEQ.length - 1], "ribbon");
  // No sphere: the Field is the only form (docs/DESIGN-SPEC-v3.md §5).
  assert.ok(!(SEQ as readonly string[]).includes("core"));
  assert.match(read("src/components/cinematic/core.tsx"), /const SEQ = \["ribbon", "field", "creative", "network"\]/);
});

check("scrolling a scene holds on each shape and moves between them", () => {
  assert.equal(positionIn(2, 4, 0), 2);
  assert.ok(Math.abs(positionIn(2, 4, 0.999) - 4) < 0.01);
  assert.equal(positionIn(6, 9, 0), 6);
  assert.ok(Math.abs(positionIn(6, 9, 0.999) - 9) < 0.01);
  // Early in a stretch it holds, late in it it has arrived.
  assert.equal(positionIn(6, 9, 0.02), 6);
  assert.ok(Math.abs(positionIn(6, 9, 1 / 3 - 0.02) - 7) < 0.02);
  assert.equal(positionIn(2, 2, 0.5), 2);
});

check("the camera fits the widest shape on any screen", () => {
  for (const aspect of [0.42, 0.56, 0.75, 1, 1.6, 2.4]) {
    const d = fitDistance(aspect);
    const visibleWidth = 2 * d * Math.tan((20 * Math.PI) / 180) * aspect;
    assert.ok(d >= 5.8 && d <= 11.5);
    assert.ok(visibleWidth > 3.2, `aspect ${aspect}: ${visibleWidth.toFixed(2)} units`);
  }
});

check("particle budgets: fewer on phones and weak devices, never more than the desktop stage", () => {
  const desk = particleBudget({ width: 1440, cores: 8, memory: 8 });
  const phone = particleBudget({ width: 390, cores: 8, memory: 8 });
  const weak = particleBudget({ width: 390, cores: 4, memory: 2 });
  const saver = particleBudget({ width: 1440, cores: 8, memory: 8, reducedData: true });
  assert.ok(desk > phone && phone > weak);
  assert.ok(saver < desk);
  assert.ok(particleBudget({ width: 1440 }, "core") <= 3200, "the app's core stays small");
});

check("the core has a look and words for every state", () => {
  const states: Activity[] = ["idle", "attention", "thinking", "analyzing", "generating", "building", "success", "error"];
  for (const s of states) {
    assert.ok(ACTIVITY_LOOK[s], s);
    assert.ok(ACTIVITY_LABEL[s], s);
  }
});

check("the core moves only for real operations: each report sits on a real pending state", () => {
  const sources: [string, RegExp][] = [
    ["src/app/dashboard/create/[service]/campaign-wizard.tsx", /useReportWhile\(checking, "analyzing"[\s\S]*useReportWhile\(pending, "building"/],
    ["src/components/decisions/approval-modal.tsx", /useReportWhile\(pending, "building"/],
    ["src/components/creative-studio/studio-workspace.tsx", /useReportWhile\(generating \|\| transforming/],
    ["src/components/mairo/assistant.tsx", /useReportWhile\(busy, "thinking"/],
  ];
  for (const [f, re] of sources) assert.match(read(f), re, f);
  // Nothing reports on a timer.
  for (const f of ["src/components/cinematic/core.tsx", "src/lib/cinematic/activity.ts", "src/lib/cinematic/use-activity.ts"]) {
    assert.doesNotMatch(read(f), /setInterval/, f);
  }
});

check("the pages read without the particles: real headings, decorative canvas, a fallback", () => {
  const hero = read("src/components/cinematic/home/hero.tsx");
  assert.match(hero, /<h1 id="hero-title"/);
  assert.match(hero, /Your ads,/);
  assert.match(hero, /<WebsiteStart id="hero-website" \/>/);
  // The website box is a plain GET form into the free plan: it works before script.
  const start = read("src/components/cinematic/home/website-start.tsx");
  assert.match(start, /action="\/preview" method="get"/);
  assert.match(start, /name="website"/);
  const stage = read("src/components/cinematic/stage.tsx");
  assert.match(stage, /aria-hidden=\{label \? undefined : true\}/);
  assert.match(stage, /if \(failed\) return <>\{fallback\}<\/>/);
  assert.match(stage, /prefers-reduced-motion/);
  const scenes = read("src/components/cinematic/home/scenes.tsx");
  assert.match(scenes, /Example · fictional business/);
  assert.match(scenes, /Sample figures for a fictional brand/);
});

check("Signal: no blue anywhere in the Field, the core or the homepage — white lines and one lime", () => {
  const files = ["src/components/cinematic/engine.ts", "src/components/cinematic/stage.tsx", "src/components/cinematic/core.tsx", "src/components/cinematic/fallback.tsx", "src/components/cinematic/home/director.tsx", "src/components/cinematic/home/hero.tsx", "src/components/cinematic/home/scenes.tsx", "src/components/cinematic/home/nav.tsx", "src/components/cinematic/home/website-start.tsx", "src/components/landing/console-home.tsx"];
  for (const f of files) assert.doesNotMatch(read(f), /#2f6bff|#8fb4ff|#9cc0ff|ELECTRIC|rgba\((?:40|50|60), ?1[0-4]0, ?255/, f);
  assert.match(read("src/components/cinematic/engine.ts"), /SIGNAL[^\n]*b: \[0\.83, 1\.0, 0\.23\]/);
  assert.match(read("src/app/globals.css"), /--v3-signal: #d4ff3a;/);
});

check("no new 3D dependency: the engine is plain WebGL2", () => {
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
  for (const dep of ["three", "@react-three/fiber", "gsap"]) assert.ok(!pkg.dependencies[dep], dep);
  assert.match(read("src/components/cinematic/engine.ts"), /getContext\("webgl2"/);
});

console.log(`\nCinematic: ${passed} checks passed`);
