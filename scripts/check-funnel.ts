// Checks the funnel measures every step through to staying subscribed, and
// records nothing personal:
//
//   - Each server step (plan created, plan approved, subscribed, first
//     campaign live) is recorded where it really happens, once per business.
//   - The first launch is recorded only after Meta switched the campaign on.
//   - The tallies and the 30-day retention measure count correctly.
//   - Recorded props are limited to the landing version — no names, emails,
//     websites or amounts.
//
//   npm run check:funnel   (pure; no database, no network)

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FUNNEL_STEPS, SERVER_EVENT_NAMES, tallyFunnel, tallyRetention } from "../src/lib/analytics/funnel";

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}
const files: string[] = [];
const walk = (dir: string) => {
  for (const f of readdirSync(join(root, dir))) {
    const p = join(dir, f);
    if (statSync(join(root, p)).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f)) files.push(p);
  }
};
walk("src");
const calls = files.flatMap((f) => [...read(f).matchAll(/recordOnce\("([a-z_]+)",([^)]*\))?[^;]*;/g)].map((m) => ({ file: f, name: m[1], call: m[0] })));

console.log("— recorded where it happens —");
check("every server step is recorded somewhere, and only through recordOnce", () => {
  for (const name of SERVER_EVENT_NAMES) assert.ok(calls.some((c) => c.name === name), `${name} is never recorded`);
  for (const c of calls) assert.ok((SERVER_EVENT_NAMES as readonly string[]).includes(c.name), `${c.file}: unknown step ${c.name}`);
});
check("each step is recorded at the right moment", () => {
  const where = (name: string) => calls.filter((c) => c.name === name).map((c) => c.file);
  assert.deepEqual(where("plan_created"), ["src/lib/actions/strategy-actions.ts"]);
  assert.deepEqual(where("plan_approved"), ["src/lib/actions/strategy-actions.ts"]);
  assert.deepEqual(where("checkout_success"), ["src/app/api/stripe/webhook/route.ts"]);
  assert.deepEqual(where("first_launch"), ["src/lib/campaigns/auto-launch.ts"]);
  // Approved only after the approval was saved; subscribed only when Stripe says live.
  const actions = read("src/lib/actions/strategy-actions.ts");
  assert.match(actions, /const r = await approve\(ctx\.organizationId, expectedVersion\);\n\s*if \(!r\.ok\) return r;\n\s*await recordOnce\("plan_approved"/);
  assert.match(read("src/app/api/stripe/webhook/route.ts"), /if \(live\) await recordOnce\("checkout_success", organizationId\);/);
  // Live only after Meta switched it on: after the resume call succeeded and at least one campaign launched.
  const launch = read("src/lib/campaigns/auto-launch.ts");
  const resume = launch.indexOf("adapter.resumeCampaign(");
  const empty = launch.indexOf("if (names.length === 0) return NOTHING;");
  const rec = launch.indexOf('recordOnce("first_launch"');
  assert.ok(resume > 0 && empty > resume && rec > empty, "first_launch is recorded after Meta accepted the launch");
});
check("once per business: the dedupe key is the step and the business", () => {
  assert.match(read("src/lib/analytics/funnel.ts"), /dedupeKey: `\$\{name\}:\$\{organizationId\}`/);
});

console.log("\n— nothing personal —");
check("server steps carry the landing version at most", () => {
  for (const c of calls) {
    const props = c.call.match(/\{([^}]*)\}/)?.[1] ?? "";
    const keys = [...props.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
    for (const k of keys) assert.equal(k, "variant", `${c.file}: ${c.name} records ${k}`);
  }
});
check("the browser's events are a fixed list with no free text", () => {
  const route = read("src/app/api/events/route.ts");
  assert.match(route, /z\.discriminatedUnion\("name"/);
  // Every property is a fixed set of values or a narrow pattern — never an open string.
  assert.doesNotMatch(route, /z\.string\(\)(?!\.(regex|uuid)\()/);
  assert.doesNotMatch(route, /email|phone|website|url:/i);
});

console.log("\n— counting —");
check("each step counts its own events and the share of the step before", () => {
  const t = tallyFunnel(["hero_view", "hero_view", "hero_view", "hero_view", "preview_start", "preview_start", "preview_complete", "plan_created", "plan_approved", "checkout_success", "unrelated"]);
  assert.deepEqual(t.map((s) => s.name), FUNNEL_STEPS.map((s) => s.name));
  assert.deepEqual(t.map((s) => s.count), [4, 2, 1, 1, 1, 1, 0]);
  assert.equal(t[0].fromPrevious, null);
  assert.equal(t[1].fromPrevious, 0.5);
  assert.equal(t[6].fromPrevious, 0);
  assert.equal(tallyFunnel([])[3].fromPrevious, null, "no share of nothing");
});
check("retention counts only businesses that subscribed long enough ago", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const r = tallyRetention([{ subscribedAt: ago(45), status: "active" }, { subscribedAt: ago(31), status: "trialing" }, { subscribedAt: ago(60), status: "canceled" }, { subscribedAt: ago(5), status: "active" }], 30, now);
  assert.deepEqual(r, { afterDays: 30, eligible: 3, retained: 2, rate: 2 / 3 });
  assert.equal(tallyRetention([{ subscribedAt: ago(2), status: "active" }], 30, now).rate, null);
});

console.log(`\nFunnel: ${passed} checks passed`);
