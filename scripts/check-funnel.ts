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
import { FUNNEL_STEPS, SERVER_EVENT_NAMES, median, previewSeconds, tallyFunnel, tallyRetention } from "../src/lib/analytics/funnel";

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
  // The plan review, and the quick start from a free plan the owner liked (/plan/start).
  assert.deepEqual(where("plan_created"), ["src/lib/actions/start-actions.ts", "src/lib/actions/strategy-actions.ts"]);
  assert.deepEqual(where("plan_approved"), ["src/lib/actions/start-actions.ts", "src/lib/actions/strategy-actions.ts"]);
  assert.deepEqual(where("checkout_success"), ["src/lib/stripe/apply-subscription.ts"]);
  assert.deepEqual(where("first_launch"), ["src/lib/campaigns/auto-launch.ts"]);
  assert.deepEqual(where("checkout_start"), ["src/lib/billing/checkout.ts"]);
  assert.deepEqual(where("meta_connected"), ["src/lib/meta/connection.ts"]);
  assert.deepEqual(where("tracking_ready"), ["src/lib/tracking/measurement-store.ts"]);
  assert.deepEqual(where("launch_approved"), ["src/lib/campaigns/approval.ts"]);
  assert.deepEqual(where("first_result"), ["src/lib/dashboard/console.ts"]);
  // Purchase tracking counts as ready only when Meta verified the Purchase event.
  assert.match(read("src/lib/tracking/measurement-store.ts"), /if \(check === "event:Purchase" && r\.status === "VERIFIED"\) await recordOnce\("tracking_ready"/);
  // A launch approval is counted only after it's saved with its terms.
  assert.match(read("src/lib/campaigns/approval.ts"), /launchApprovalHash: approvalHash\(c\) \},\n\s*\}\);\n\s*await recordOnce\("launch_approved"/);
  // The first result is one Meta reported, not a figure MAIRO filled in.
  assert.match(read("src/lib/dashboard/console.ts"), /firstResult\.source === "Meta reports"/);
  // Approved only after the approval was saved; subscribed only when Stripe says live.
  const actions = read("src/lib/actions/strategy-actions.ts");
  assert.match(actions, /const r = await approve\(ctx\.organizationId, expectedVersion\);\n\s*if \(!r\.ok\) return r;\n\s*await recordOnce\("plan_approved"/);
  const start = read("src/lib/actions/start-actions.ts");
  assert.match(start, /const r = await approve\(w\.organizationId, version\);\n\s*if \(!r\.ok\) return \{ error: r\.error \};\n\s*await recordOnce\("plan_approved"/);
  assert.match(start, /const s = await createStrategy\(organizationId\);\n\s*if \(!s\.ok\) return \{ error: s\.error \};\n(?:\s*\/\/.*\n)*\s*await recordOnce\("plan_created"/);
  // Recorded for every live subscription; the &&-chain after it only decides whether MAIRO's own pixel hears too.
  assert.match(read("src/lib/stripe/apply-subscription.ts"), /if \(live && \(await recordOnce\("checkout_success", organizationId\)\)/);
  // Live only after Meta switched it on: after the resume call succeeded and at least one campaign launched.
  const launch = read("src/lib/campaigns/auto-launch.ts");
  const resume = launch.indexOf("adapter.resumeCampaign(");
  const empty = launch.indexOf("if (names.length === 0) return");
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
  assert.deepEqual(t.map((s) => s.count), [4, 2, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0]);
  assert.equal(t[0].fromPrevious, null);
  assert.equal(t[1].fromPrevious, 0.5);
  assert.equal(t[4].fromPrevious, 1);
  assert.equal(t[6].fromPrevious, null, "no share of a step nobody reached");
  assert.equal(t[7].fromPrevious, 0);
  assert.equal(tallyFunnel([])[3].fromPrevious, null, "no share of nothing");
});
check("a step only shops take isn't read as a leak for everyone else", () => {
  const t = tallyFunnel(["meta_connected", "meta_connected", "tracking_ready", "launch_approved"]);
  const at = (n: string) => t.find((s) => s.name === n)!;
  assert.equal(at("tracking_ready").fromPrevious, 0.5);
  assert.equal(at("launch_approved").fromPrevious, 0.5, "compared with Meta connected, not with tracking");
});
check("time to first ad: same visitor, start to shown, median", () => {
  const t = (s: number) => new Date(Date.UTC(2026, 10, 1, 12, 0, s));
  const secs = previewSeconds([
    { name: "preview_start", anonId: "a", at: t(0) },
    { name: "preview_complete", anonId: "a", at: t(20) },
    { name: "preview_complete", anonId: "a", at: t(50) },
    { name: "preview_start", anonId: "b", at: t(5) },
    { name: "preview_complete", anonId: "b", at: t(45) },
    { name: "preview_complete", anonId: "c", at: t(10) },
    { name: "preview_start", anonId: null, at: t(1) },
  ]);
  assert.deepEqual(secs, [20, 40], "first finish only; no start, no time");
  assert.equal(median(secs), 30);
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
});
check("retention counts only businesses that subscribed long enough ago", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const r = tallyRetention([{ subscribedAt: ago(45), status: "active" }, { subscribedAt: ago(31), status: "trialing" }, { subscribedAt: ago(60), status: "canceled" }, { subscribedAt: ago(5), status: "active" }], 30, now);
  assert.deepEqual(r, { afterDays: 30, eligible: 3, retained: 2, rate: 2 / 3 });
  assert.equal(tallyRetention([{ subscribedAt: ago(2), status: "active" }], 30, now).rate, null);
});

console.log(`\nFunnel: ${passed} checks passed`);
