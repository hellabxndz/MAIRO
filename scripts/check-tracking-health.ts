// Checks MAIRO's managed tracking (lib/tracking/health.ts, monitor.ts) and the
// "MAIRO is managing" status on Home (lib/dashboard/manager.ts), against the
// real code and the local database with Meta replaced by a pretend one:
//
//   - tracking is "working" only on Meta's own evidence: a recent fire and a
//     count for every chosen event; selected-but-silent, stopped, and
//     never-seen are told apart, and a day Meta didn't answer claims nothing;
//   - the daily check stores the verdict and notifies on changes only —
//     first working, stopped, recovered — never the same news twice;
//   - one business's check never reads or writes another's;
//   - Pausing Autopilot keeps the chosen level, makes MAIRO act as Manual
//     (both automatic paths), and is recorded; resuming restores it.
//
//   npm run check:tracking-health   (local database; no Meta, no network)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { encryptSecret } from "../src/lib/crypto/secret-box";
import { baselineFrom, MAX_STALE_DAYS, STALE_DAYS, staleAfterDays, trackingHealth, transition, type HealthInput } from "../src/lib/tracking/health";
import { checkTrackingHealth, monitorAllTracking } from "../src/lib/tracking/monitor";
import { byWhom, modeView } from "../src/lib/dashboard/manager";
import { effectiveLevel } from "../src/lib/decisions/store";
import { runAutoOptimize } from "../src/lib/budget/recommendations";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-health";
const A = `${TAG}-shop`;
const B = `${TAG}-other`;
const ACT_A = "act_7001";
const ACT_B = "act_7002";
const PIX_A = "770000000000001";
const PIX_B = "770000000000002";
const day = 864e5;
const NOW = new Date("2026-11-20T10:00:00Z");

// --- A pretend Meta: per-pixel last fire and event counts ------------------------
const world = {
  lastFired: {} as Record<string, string | undefined>,
  stats: {} as Record<string, Record<string, number>>,
  down: false,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fakeMeta: typeof fetch = async (input) => {
  if (world.down) return json({ error: { message: "Service temporarily unavailable", code: 2 } }, 503);
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/v\d+\.\d+/, "");
  if (path === "/me/permissions") return json({ data: [{ permission: "ads_management", status: "granted" }] });
  const list = path.match(/^\/(act_\d+)\/adspixels$/);
  if (list) {
    const id = list[1] === ACT_A ? PIX_A : list[1] === ACT_B ? PIX_B : "770000000000003";
    return json({ data: [{ id, name: "Pixel", last_fired_time: world.lastFired[id] }] });
  }
  const stats = path.match(/^\/(\d+)\/stats$/);
  if (stats) return json({ data: [{ start_time: NOW.toISOString(), aggregation: "event", data: Object.entries(world.stats[stats[1]] ?? {}).map(([value, count]) => ({ value, count })) }] });
  const node = path.match(/^\/(\d+)$/);
  if (node) return json({ id: node[1], name: "Pixel", last_fired_time: world.lastFired[node[1]] });
  return json({ data: [] });
};
const viaMeta = <T,>(fn: () => Promise<T>) => withGraphTransport({ fetch: fakeMeta, record: false, retryBaseMs: 1 }, fn);

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}
async function shop(id: string, act: string, pixel: string) {
  await db.organization.create({ data: { id, name: id === A ? "Fernleaf Ceramics" : "Other Shop", website: "https://shop.fixture.test", industry: "ecommerce" } });
  await db.metaAdAccount.create({ data: { organizationId: id, metaAdAccountId: act, accessToken: encryptSecret("fake-token"), status: "CONNECTED" } });
  await db.trackingPixel.create({ data: { organizationId: id, platform: "META", externalPixelId: pixel, name: "Pixel", metaAdAccountId: act } });
  await db.trackingProfile.create({ data: { organizationId: id, nicheId: "ecommerce", measurementGoals: JSON.stringify(["purchase", "add_to_cart"]), measurementGoalsSavedAt: new Date(NOW.getTime() - 30 * day) } });
}

const base: HealthInput = {
  now: NOW,
  hasPixel: true,
  declined: false,
  need: "required_for_purchases",
  metaConnected: true,
  accessible: true,
  lastFiredAt: new Date(NOW.getTime() - 3600_000),
  events: [
    { event: "Purchase", status: "VERIFIED", count: 18, everVerified: true, typicalWeekly: 16 },
    { event: "AddToCart", status: "VERIFIED", count: 120, everVerified: true, typicalWeekly: 110 },
  ],
  liveCampaigns: 1,
  typicalPageViewsWeekly: 900,
};

async function main() {
  await cleanup();

  console.log("— the rules —");
  await check("working only on Meta's evidence: a recent fire and a count for every chosen event", () => {
    const h = trackingHealth(base);
    assert.equal(h.status, "working");
    assert.match(h.detail, /18 purchase events/);
    assert.match(h.detail, /120 add-to-cart events/);
    assert.equal(trackingHealth({ ...base, events: [{ event: "Purchase", status: "VERIFIED", count: 1, everVerified: true }] }).detail.includes("1 purchase event,"), true);
  });
  await check("a Pixel chosen but never fired is the next step, not 'working'", () => {
    const h = trackingHealth({ ...base, lastFiredAt: null });
    assert.equal(h.status, "attention");
    assert.match(h.headline, /hasn't received any events yet/);
  });
  await check(`a busy site's Pixel silent for more than ${STALE_DAYS} days has stopped, with the date`, () => {
    const h = trackingHealth({ ...base, lastFiredAt: new Date(NOW.getTime() - 5 * day) });
    assert.equal(h.status, "attention");
    assert.match(h.headline, /stopped sending events on Nov 15/);
    assert.match(h.detail, /about 900 page views a week/);
    assert.match(h.detail, /live campaigns/);
  });
  await check("usual volume: the median of earlier weeks, and nothing until there are at least three", () => {
    assert.equal(baselineFrom([]), null);
    assert.equal(baselineFrom([4, 9]), null);
    assert.equal(baselineFrom([2, 9, 4]), 4);
    assert.equal(baselineFrom([1, 0, 2, 1]), 1);
  });
  await check("how long silence must last scales with traffic: 3 days busy, a week unknown, up to 2 weeks quiet", () => {
    assert.equal(staleAfterDays(900), STALE_DAYS);
    assert.equal(staleAfterDays(null), 7);
    assert.equal(staleAfterDays(4), 6);
    assert.equal(staleAfterDays(1), MAX_STALE_DAYS);
    assert.equal(staleAfterDays(0), MAX_STALE_DAYS);
  });
  await check("LOW TRAFFIC: a quiet site's Pixel silent for days is not called stopped", () => {
    const quiet = { ...base, typicalPageViewsWeekly: 4, lastFiredAt: new Date(NOW.getTime() - 5 * day), events: [] };
    assert.equal(trackingHealth(quiet).status, "working");
    // Unknown traffic: a week's grace, then conditional wording.
    assert.equal(trackingHealth({ ...quiet, typicalPageViewsWeekly: null }).status, "working");
    const late = trackingHealth({ ...quiet, typicalPageViewsWeekly: null, lastFiredAt: new Date(NOW.getTime() - 8 * day) });
    assert.equal(late.status, "attention");
    assert.match(late.headline, /^No website events since/);
    assert.match(late.detail, /If people visited your site in that time/);
    // Even a very quiet site is asked about after two weeks of nothing.
    assert.equal(trackingHealth({ ...quiet, typicalPageViewsWeekly: 1, lastFiredAt: new Date(NOW.getTime() - 15 * day) }).status, "attention");
  });
  await check("LOW TRAFFIC: a week with no purchases is a quiet week for a shop that sells one or two a week", () => {
    const h = trackingHealth({ ...base, events: [{ event: "Purchase", status: "NOT_SEEN", count: 0, everVerified: true, typicalWeekly: 1 }] });
    assert.equal(h.status, "working");
    assert.equal(h.headline, "Your Pixel is working — a quiet week");
    assert.match(h.detail, /No purchase events this week — normal for your volume \(usually about 1 purchase a week\)/);
    assert.equal(transition("working", h.status, "Tracking is working", h.headline), null, "no notification");
    const unknownVolume = trackingHealth({ ...base, events: [{ event: "Purchase", status: "NOT_SEEN", count: 0, everVerified: true, typicalWeekly: null }] });
    assert.equal(unknownVolume.status, "working");
    assert.match(unknownVolume.detail, /doesn't know your usual volume yet/);
  });
  await check("purchases that stop at a shop that usually sells several a week: attention, worded honestly", () => {
    const h = trackingHealth({ ...base, events: [{ event: "Purchase", status: "NOT_SEEN", count: 0, everVerified: true, typicalWeekly: 6 }, base.events[1]] });
    assert.equal(h.status, "attention");
    assert.match(h.detail, /usually get about 6 a week/);
    assert.match(h.detail, /If you made sales in that time/);
  });
  await check("an event never seen on a new setup is 'waiting for your first', not 'stopped'", () => {
    const h = trackingHealth({ ...base, events: [{ event: "Purchase", status: "NOT_SEEN", count: 0, everVerified: false }] });
    assert.match(h.headline, /Waiting for your first purchase event/);
  });
  await check("lost access, a removed permission and a disconnected Meta are broken, each with its own fix", () => {
    assert.equal(trackingHealth({ ...base, accessible: false }).status, "broken");
    assert.equal(trackingHealth({ ...base, events: [{ event: "Purchase", status: "MISSING_PERMISSION", count: null, everVerified: true }] }).fix?.href, "/dashboard/meta");
    assert.equal(trackingHealth({ ...base, metaConnected: false }).status, "broken");
  });
  await check("Meta not answering claims nothing either way", () => {
    const h = trackingHealth({ ...base, accessible: null, events: [{ event: "Purchase", status: "FAILED", count: null, everVerified: true }] });
    assert.equal(h.status, "unknown");
    assert.equal(transition("working", "unknown", "Tracking is working", h.headline), null);
    assert.equal(transition("attention", "unknown", "x", h.headline), null);
  });
  await check("no Pixel: not set up, or not needed when the owner declined or results come from Meta directly", () => {
    assert.equal(trackingHealth({ ...base, hasPixel: false }).status, "not_set_up");
    assert.equal(trackingHealth({ ...base, hasPixel: false, declined: true }).status, "not_needed");
    assert.equal(trackingHealth({ ...base, hasPixel: false, need: "not_needed" }).status, "not_needed");
  });
  await check("notifications on changes only: first working, problem, recovered — and setting up isn't an alarm", () => {
    assert.equal(transition(null, "working", null, "Tracking is working")?.kind, "working");
    assert.equal(transition("working", "working", "Tracking is working", "Tracking is working"), null);
    assert.equal(transition("working", "attention", "Tracking is working", "No purchase events in the last 7 days")?.kind, "problem");
    assert.equal(transition("attention", "attention", "No purchase events in the last 7 days", "No purchase events in the last 7 days"), null);
    assert.equal(transition("attention", "broken", "a", "MAIRO can't reach your Pixel")?.kind, "problem");
    assert.equal(transition("attention", "working", "a", "Tracking is working")?.kind, "recovered");
    assert.equal(transition(null, "attention", null, "Your Pixel hasn't received any events yet"), null);
    assert.equal(transition("not_set_up", "attention", null, "Waiting for your first purchase event"), null);
    assert.equal(transition("working", "attention", "Tracking is working", "Waiting for your first add-to-cart event"), null, "never seen isn't a regression");
  });

  console.log("\n— the daily check, against the database —");
  await shop(A, ACT_A, PIX_A);
  await shop(B, ACT_B, PIX_B);
  // Shop A's history: it usually sells 15–20 a week, and gets hundreds of visits.
  for (const [n, d] of [[16, 20], [19, 13], [15, 6]] as const) {
    await db.trackingVerification.create({ data: { organizationId: A, pixelId: PIX_A, check: "event:Purchase", status: "VERIFIED", source: "meta_stats", count: n, checkedAt: new Date(NOW.getTime() - d * day) } });
    await db.trackingVerification.create({ data: { organizationId: A, pixelId: PIX_A, check: "event:PageView", status: "VERIFIED", source: "meta_stats", count: 800, checkedAt: new Date(NOW.getTime() - d * day) } });
  }

  await check("working: stored on the profile, and the owner told once", async () => {
    world.lastFired[PIX_A] = new Date(NOW.getTime() - 3600_000).toISOString();
    world.stats[PIX_A] = { Purchase: 18, AddToCart: 120, PageView: 900 };
    const r = await viaMeta(() => checkTrackingHealth(A, NOW));
    assert.equal(r.health.status, "working");
    assert.equal(r.transition?.kind, "working");
    const p = await db.trackingProfile.findUniqueOrThrow({ where: { organizationId: A } });
    assert.equal(p.healthStatus, "working");
    assert.ok(p.healthCheckedAt && p.healthChangedAt);
    const again = await viaMeta(() => checkTrackingHealth(A, new Date(NOW.getTime() + day)));
    assert.equal(again.transition, null);
    const notes = await db.notification.findMany({ where: { organizationId: A, kind: "TRACKING_WORKING" } });
    assert.equal(notes.length, 1, "told once, not every day");
    // Each check is kept like a manual one.
    assert.ok((await db.trackingVerification.count({ where: { organizationId: A, check: "event:AddToCart" } })) >= 2);
  });
  await check("purchases stop: a problem notification with the fix, once", async () => {
    world.stats[PIX_A] = { AddToCart: 80, PageView: 700 };
    const t = new Date(NOW.getTime() + 2 * day);
    // The Pixel itself keeps firing (page views); only purchases stopped.
    world.lastFired[PIX_A] = new Date(t.getTime() - 3600_000).toISOString();
    const r = await viaMeta(() => checkTrackingHealth(A, t));
    assert.equal(r.health.status, "attention");
    assert.equal(r.transition?.kind, "problem");
    world.lastFired[PIX_A] = new Date(t.getTime() + day - 3600_000).toISOString();
    await viaMeta(() => checkTrackingHealth(A, new Date(t.getTime() + day)));
    const notes = await db.notification.findMany({ where: { organizationId: A, kind: "TRACKING_PROBLEM" } });
    assert.equal(notes.length, 1);
    assert.equal(notes[0].actionHref, "/dashboard/pixel");
    assert.match(notes[0].body, /If you made sales/);
  });
  await check("a day Meta doesn't answer keeps the last verdict", async () => {
    world.down = true;
    const r = await viaMeta(() => checkTrackingHealth(A, new Date(NOW.getTime() + 4 * day)));
    world.down = false;
    assert.equal(r.health.status, "unknown");
    const p = await db.trackingProfile.findUniqueOrThrow({ where: { organizationId: A } });
    assert.equal(p.healthStatus, "attention", "still the last definite verdict");
  });
  await check("recovery: 'working again', a new notification after the problem", async () => {
    world.stats[PIX_A] = { Purchase: 4, AddToCart: 60, PageView: 500 };
    world.lastFired[PIX_A] = new Date(NOW.getTime() + 5 * day - 3600_000).toISOString();
    const r = await viaMeta(() => checkTrackingHealth(A, new Date(NOW.getTime() + 5 * day)));
    assert.equal(r.transition?.kind, "recovered");
    const notes = await db.notification.findMany({ where: { organizationId: A, kind: "TRACKING_WORKING" }, orderBy: { createdAt: "asc" } });
    assert.equal(notes.length, 2);
    assert.equal(notes[1].title, "Tracking is working again");
  });
  await check("each business is checked on its own Pixel; nothing crosses over", async () => {
    world.lastFired[PIX_B] = undefined;
    world.stats[PIX_B] = {};
    const r = await viaMeta(() => checkTrackingHealth(B, NOW));
    assert.equal(r.health.status, "attention");
    assert.equal(r.transition, null, "a new setup that hasn't fired isn't an alarm");
    assert.equal((await db.trackingVerification.count({ where: { organizationId: B, pixelId: PIX_A } })), 0);
    assert.equal((await db.notification.count({ where: { organizationId: B } })), 0);
    assert.equal((await db.trackingProfile.findUniqueOrThrow({ where: { organizationId: A } })).healthStatus, "working");
  });
  await check("the sweep covers connected businesses, oldest check first, and reports what it found", async () => {
    const out = await viaMeta(() => monitorAllTracking(500, Number.POSITIVE_INFINITY, new Date(NOW.getTime() + 6 * day)));
    assert.ok(out.checked >= 2);
    assert.equal(out.failed, 0);
  });

  await check("LOW TRAFFIC, end to end: a shop selling about one a week has a sale-free week — no alarm, no notification", async () => {
    const C = `${TAG}-tiny`;
    await shop(C, "act_7003", "770000000000003");
    for (const [n, d] of [[1, 21], [0, 14], [2, 7], [1, 3]] as const) {
      await db.trackingVerification.create({ data: { organizationId: C, pixelId: "770000000000003", check: "event:Purchase", status: n ? "VERIFIED" : "NOT_SEEN", source: "meta_stats", count: n, checkedAt: new Date(NOW.getTime() - d * day) } });
      await db.trackingVerification.create({ data: { organizationId: C, pixelId: "770000000000003", check: "event:PageView", status: "VERIFIED", source: "meta_stats", count: 6, checkedAt: new Date(NOW.getTime() - d * day) } });
      await db.trackingVerification.create({ data: { organizationId: C, pixelId: "770000000000003", check: "event:AddToCart", status: "VERIFIED", source: "meta_stats", count: n + 1, checkedAt: new Date(NOW.getTime() - d * day) } });
    }
    await db.trackingProfile.update({ where: { organizationId: C }, data: { healthStatus: "working", healthHeadline: "Tracking is working" } });
    // Last visit four days ago; no purchases and no add-to-carts this week.
    world.lastFired["770000000000003"] = new Date(NOW.getTime() - 4 * day).toISOString();
    world.stats["770000000000003"] = { PageView: 3 };
    const r = await viaMeta(() => checkTrackingHealth(C, NOW));
    assert.equal(r.health.status, "working", `${r.health.headline} — ${r.health.detail}`);
    assert.equal(r.transition, null);
    assert.equal(await db.notification.count({ where: { organizationId: C } }), 0);
  });

  console.log("\n— Autopilot: pause keeps the level, and MAIRO acts as Manual while paused —");
  await db.organization.update({ where: { id: A }, data: { subscriptionTier: "SCALE_V2", subscriptionStatus: "active", hasPaid: true } });
  await db.autoOptimizeSettings.create({ data: { organizationId: A, level: "ASSISTED", enabled: true, maxDailyBudgetCents: 10_000 } });
  await check("running: effective level and the words on Home", async () => {
    assert.equal(await effectiveLevel(A), "ASSISTED");
    const v = modeView({ level: "ASSISTED", enabled: true, pausedAt: null }, { assist: true, autopilot: true });
    assert.equal(v.key, "autopilot");
    assert.match(v.detail, /New campaigns and a bigger total budget always wait for you/);
  });
  await check("paused: Manual everywhere automatic, the level kept for resuming", async () => {
    await db.autoOptimizeSettings.update({ where: { organizationId: A }, data: { pausedAt: NOW } });
    assert.equal(await effectiveLevel(A), "MANUAL");
    assert.deepEqual(await runAutoOptimize(A), { applied: 0, refused: [] });
    assert.equal((await db.autoOptimizeSettings.findUniqueOrThrow({ where: { organizationId: A } })).level, "ASSISTED");
    assert.equal(modeView({ level: "ASSISTED", enabled: true, pausedAt: NOW }, { assist: true, autopilot: true }).key, "paused");
  });
  await check("resumed: the chosen level applies again", async () => {
    await db.autoOptimizeSettings.update({ where: { organizationId: A }, data: { pausedAt: null } });
    assert.equal(await effectiveLevel(A), "ASSISTED");
  });
  await check("a plan without Autopilot says Approval mode, and why", () => {
    const v = modeView({ level: "AUTOPILOT", enabled: true, pausedAt: null }, { assist: false, autopilot: false });
    assert.equal(v.key, "approval");
    assert.match(v.detail, /isn't part of your plan/);
    assert.equal(modeView(null, { assist: true, autopilot: true }).key, "approval");
  });
  await check("'Lately' says who: MAIRO on its own, a person's setting, or a change someone approved", () => {
    assert.equal(byWhom("decision.applied", true), "by MAIRO");
    assert.equal(byWhom("autopilot.paused", false), "by your team");
    assert.equal(byWhom("decision.applied", false), "you approved");
  });
  await check("the pause action is role-checked, recorded and audited (source)", async () => {
    const { readFileSync } = await import("node:fs");
    // The action resolves the role on the server; the rules live in lib/automation/pause.ts (check:autopilot).
    const src = readFileSync("src/lib/actions/autopilot-actions.ts", "utf8");
    assert.match(src, /currentMember\(\)/);
    assert.match(src, /setAutopilotPaused\(member\.organizationId/);
    assert.match(readFileSync("src/lib/decisions/store.ts", "utf8"), /settings\.pausedAt\) return "MANUAL"/);
  });

  await cleanup();
  console.log(`\nTracking health: ${passed} checks passed. Meta was simulated; nothing was sent to Meta or any website.`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => undefined);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
