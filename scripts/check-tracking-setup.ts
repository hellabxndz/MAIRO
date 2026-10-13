// Checks the tracking workflow against a pretend Meta (no real Meta call, no
// spend, nothing published) and the fixture websites:
//
//   - pixels listed with their owners, the one worth reusing recommended;
//   - nothing chosen or created without being asked; a typed ID is confirmed
//     by Meta before it's saved;
//   - creating is idempotent — a double click makes one pixel, a lost reply
//     is recovered without a duplicate, and no id means no success;
//   - the stages and the check results keep their meanings (not detected,
//     not seen and missing permission are answers, not failures);
//   - orders respect the owner's consent setting, and drop identifiers when
//     they may not be sent;
//   - one business never sees another's pixel or checks.
//
//   npm run check:tracking-setup   (needs the local database)

import assert from "node:assert/strict";
import { join } from "node:path";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { encryptSecret } from "../src/lib/crypto/secret-box";
import { checkEvents, checkInstallation, createPixel, listPixelChoices, rankPixels, selectPixel, setConsentPolicy, setInstallRoute, trackingOverview } from "../src/lib/tracking/setup";
import { campaignHandoff, consentAllows, normalizeConsent, suggestedRoute, trackingStage, type CheckRecord } from "../src/lib/tracking/state";
import { recordOrder } from "../src/lib/tracking/orders";
import { recommendedEvents } from "../src/lib/tracking/events";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-trk";
const A = `${TAG}-a`;
const B = `${TAG}-b`;
const ACT = "act_777";
const day = 864e5;

// --- A pretend Meta ---------------------------------------------------------------
type FakePixel = { id: string; name: string; last_fired_time?: string; creation_time?: string; is_unavailable?: boolean; owner_business?: { id: string; name: string } };
const world = {
  pixels: [] as FakePixel[],
  nextId: 900000000000001,
  loseCreateReply: false,
  createWithoutId: false,
  createDelayMs: 0,
  stats: {} as Record<string, number>,
  statsError: null as null | { code: number; status: number },
};
const calls: string[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fakeMeta: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/v\d+\.\d+/, "");
  const method = (init?.method ?? "GET").toUpperCase();
  calls.push(`${method} ${path}`);
  if (path === `/${ACT}/adspixels` && method === "GET") return json({ data: world.pixels });
  if (path === `/${ACT}/adspixels` && method === "POST") {
    if (world.createDelayMs) await new Promise((r) => setTimeout(r, world.createDelayMs));
    const name = url.searchParams.get("name") ?? "pixel";
    if (world.createWithoutId) return json({});
    const p: FakePixel = { id: String(world.nextId++), name, creation_time: new Date().toISOString() };
    world.pixels.push(p);
    if (world.loseCreateReply) return json({ error: { message: "Service temporarily unavailable", code: 2 } }, 500);
    return json({ id: p.id });
  }
  const stats = path.match(/^\/(\d+)\/stats$/);
  if (stats) {
    if (world.statsError) return json({ error: { message: "Permissions error", code: world.statsError.code } }, world.statsError.status);
    return json({ data: [{ start_time: new Date().toISOString(), aggregation: "event", data: Object.entries(world.stats).map(([value, count]) => ({ value, count })) }] });
  }
  const ev = path.match(/^\/(\d+)\/events$/);
  if (ev) return json({ events_received: 1, fbtrace_id: "t" });
  const node = path.match(/^\/(\d+)$/);
  if (node) {
    const p = world.pixels.find((x) => x.id === node[1]);
    return p ? json(p) : json({ error: { message: "Unsupported get request", code: 100, error_subcode: 33 } }, 400);
  }
  return json({ data: [] });
};
const viaMeta = <T,>(fn: () => Promise<T>) => withGraphTransport({ fetch: fakeMeta, record: false }, fn);

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function org(id: string, website: string | null) {
  await db.organization.create({ data: { id, name: id === A ? "Fernleaf Ceramics" : "Other Co", website } });
  await db.metaAdAccount.create({ data: { organizationId: id, metaAdAccountId: ACT, accessToken: encryptSecret("fake-token"), status: "CONNECTED" } });
}

const rec = (status: CheckRecord["status"]): CheckRecord => ({ status, source: "meta_stats", detail: null, count: null, checkedAt: new Date() });

async function main() {
  process.env.MAIRO_SCAN_FIXTURES = join(process.cwd(), "scripts/fixtures/sites");
  await cleanup();
  await org(A, "https://shop.fixture.test");
  await org(B, "https://plumber.fixture.test");
  const now = Date.now();
  world.pixels = [
    { id: "111111111111", name: "Old store pixel", last_fired_time: new Date(now - 2 * day).toISOString(), creation_time: new Date(now - 400 * day).toISOString(), owner_business: { id: "bm1", name: "Fernleaf Ceramics Ltd" } },
    { id: "222222222222", name: "Never used", creation_time: new Date(now - 30 * day).toISOString() },
    { id: "333333333333", name: "Retired", is_unavailable: true, last_fired_time: new Date(now - 1 * day).toISOString() },
    { id: "123456789012345", name: "Website pixel", creation_time: new Date(now - 90 * day).toISOString(), owner_business: { id: "bm1", name: "Fernleaf Ceramics Ltd" } },
  ];

  console.log("— choosing a pixel —");
  await check("the pixel with recent events is recommended; an unavailable one never is, and sorts last", async () => {
    const r = await viaMeta(() => listPixelChoices(A));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const rec = r.data.choices.filter((c) => c.recommended);
    assert.equal(rec.length, 1);
    assert.equal(rec[0].id, "111111111111");
    assert.equal(rec[0].ownerBusiness?.name, "Fernleaf Ceramics Ltd");
    assert.equal(r.data.choices[r.data.choices.length - 1].id, "333333333333");
    assert.equal(r.data.choices.find((c) => c.id === "333333333333")!.recommended, false);
  });
  await check("with only unavailable pixels, none is recommended; with none, the list is empty", () => {
    assert.deepEqual(rankPixels([]), []);
    const only = rankPixels([{ id: "9", name: "Gone", lastFiredAt: null, unavailable: true }]);
    assert.equal(only[0].recommended, false);
    assert.match(only[0].why, /unavailable/);
  });
  await check("listing chooses nothing and creates nothing", async () => {
    assert.equal(await db.trackingPixel.count({ where: { organizationId: A } }), 0);
    assert.ok(!calls.some((c) => c.startsWith("POST")));
  });
  await check("a typed ID is checked with Meta first: malformed and unknown IDs are refused", async () => {
    const bad = await viaMeta(() => selectPixel(A, "user-1", "abc"));
    assert.equal(bad.ok, false);
    const unknown = await viaMeta(() => selectPixel(A, "user-1", "555555555555"));
    assert.equal(unknown.ok, false);
    assert.equal(await db.trackingPixel.count({ where: { organizationId: A } }), 0);
  });
  await check("an unavailable pixel can't be chosen", async () => {
    const r = await viaMeta(() => selectPixel(A, "user-1", "333333333333"));
    assert.equal(r.ok, false);
  });
  await check("choosing saves the pixel Meta confirmed, with its owner and who chose it", async () => {
    const r = await viaMeta(() => selectPixel(A, "user-1", "123456789012345"));
    assert.equal(r.ok, true);
    const row = await db.trackingPixel.findUniqueOrThrow({ where: { organizationId_platform: { organizationId: A, platform: "META" } } });
    assert.equal(row.externalPixelId, "123456789012345");
    assert.equal(row.ownerBusinessName, "Fernleaf Ceramics Ltd");
    assert.equal(row.origin, "EXISTING");
    assert.equal(row.selectedById, "user-1");
    assert.ok(row.selectedAt);
  });
  await check("asking to create when a pixel is already chosen returns that one — no second pixel", async () => {
    const before = calls.filter((c) => c.startsWith("POST")).length;
    const r = await viaMeta(() => createPixel(A, "user-1", "Fernleaf Ceramics"));
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.data.id, "123456789012345");
    assert.equal(calls.filter((c) => c.startsWith("POST")).length, before);
  });

  console.log("— creating a pixel —");
  await check("two create requests at once make one pixel", async () => {
    world.pixels = [];
    world.createDelayMs = 150;
    const [x, y] = await Promise.all([viaMeta(() => createPixel(B, "user-b", "Other Co")), viaMeta(() => createPixel(B, "user-b", "Other Co"))]);
    world.createDelayMs = 0;
    assert.equal(calls.filter((c) => c === `POST /${ACT}/adspixels`).length, 1);
    assert.ok(x.ok || y.ok);
    const failed = [x, y].find((r) => !r.ok);
    if (failed && !failed.ok) assert.equal(failed.reason, "in_progress");
    assert.equal(await db.trackingPixel.count({ where: { organizationId: B } }), 1);
    const row = await db.trackingPixel.findFirstOrThrow({ where: { organizationId: B } });
    assert.equal(row.origin, "CREATED_BY_MAIRO");
    const profile = await db.trackingProfile.findUniqueOrThrow({ where: { organizationId: B } });
    assert.equal(profile.pixelCreateStartedAt, null, "the lease is released");
  });
  await check("a create whose reply was lost is recovered on retry, without a duplicate", async () => {
    await db.trackingPixel.deleteMany({ where: { organizationId: B } });
    world.pixels = [];
    world.loseCreateReply = true;
    const first = await viaMeta(() => createPixel(B, "user-b", "Other Co"));
    assert.equal(first.ok, false);
    assert.equal(await db.trackingPixel.count({ where: { organizationId: B } }), 0, "no success without a confirmed id");
    world.loseCreateReply = false;
    const posts = calls.filter((c) => c === `POST /${ACT}/adspixels`).length;
    const second = await viaMeta(() => createPixel(B, "user-b", "Other Co"));
    assert.equal(second.ok, true);
    if (second.ok) assert.equal(second.data.reused, true);
    assert.equal(calls.filter((c) => c === `POST /${ACT}/adspixels`).length, posts, "no second create");
    assert.equal(world.pixels.length, 1);
  });
  await check("Meta answering without an id is not a success, and nothing is saved", async () => {
    await db.trackingPixel.deleteMany({ where: { organizationId: B } });
    world.pixels = [];
    world.createWithoutId = true;
    const r = await viaMeta(() => createPixel(B, "user-b", "Other Co"));
    world.createWithoutId = false;
    assert.equal(r.ok, false);
    assert.equal(await db.trackingPixel.count({ where: { organizationId: B } }), 0);
  });

  console.log("— checks and stages —");
  await check("the website is read for the pixel: found on the shop's pages → installation verified", async () => {
    const r = await viaMeta(() => checkInstallation(A));
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.data.status, "VERIFIED");
      assert.equal(r.data.source, "public_scan");
    }
  });
  await check("a pixel not on the pages read is NOT_DETECTED — an answer, not a failure", async () => {
    world.pixels.push({ id: "444444444444", name: "B pixel" });
    await viaMeta(() => selectPixel(B, "user-b", "444444444444"));
    const r = await viaMeta(() => checkInstallation(B));
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.data.status, "NOT_DETECTED");
  });
  await check("events: none received → NOT_SEEN; some → VERIFIED with the count; no access → MISSING_PERMISSION; outage → FAILED", async () => {
    world.stats = { PageView: 40 };
    let r = await viaMeta(() => checkEvents(A, ["Purchase"]));
    assert.ok(r.ok && r.data.Purchase.status === "NOT_SEEN");
    world.stats = { PageView: 40, Purchase: 3 };
    r = await viaMeta(() => checkEvents(A, ["Purchase"]));
    assert.ok(r.ok && r.data.Purchase.status === "VERIFIED" && r.data.Purchase.count === 3);
    world.statsError = { code: 200, status: 403 };
    r = await viaMeta(() => checkEvents(A, ["Purchase"]));
    assert.ok(r.ok && r.data.Purchase.status === "MISSING_PERMISSION");
    world.statsError = { code: 1, status: 500 };
    r = await viaMeta(() => checkEvents(A, ["Purchase"]));
    assert.ok(r.ok && r.data.Purchase.status === "FAILED");
    world.statsError = null;
  });
  await check("the stages follow the checks, in order", () => {
    const pixel = { id: "1", lastFiredAt: null };
    assert.equal(trackingStage({ pixel: null, installRoute: null, installMarkedAt: null, install: null, requiredEvent: "Lead", events: {} }).stage, "no_asset");
    assert.equal(trackingStage({ pixel, installRoute: null, installMarkedAt: null, install: null, requiredEvent: "Lead", events: {} }).stage, "asset_selected");
    assert.equal(trackingStage({ pixel, installRoute: "manual", installMarkedAt: null, install: rec("NOT_DETECTED"), requiredEvent: "Lead", events: {} }).stage, "installation_pending");
    assert.equal(trackingStage({ pixel, installRoute: "manual", installMarkedAt: null, install: rec("VERIFIED"), requiredEvent: "Lead", events: {} }).stage, "installation_detected");
    assert.equal(trackingStage({ pixel, installRoute: "manual", installMarkedAt: null, install: rec("VERIFIED"), requiredEvent: "Lead", events: { Lead: rec("NOT_SEEN") } }).stage, "event_verification_pending");
    assert.equal(trackingStage({ pixel, installRoute: "manual", installMarkedAt: null, install: rec("VERIFIED"), requiredEvent: "Lead", events: { Lead: rec("VERIFIED") } }).stage, "verified");
    // Meta having seen any event counts as installed, even if the page check couldn't see it (Shopify's sandbox).
    assert.equal(trackingStage({ pixel: { id: "1", lastFiredAt: new Date() }, installRoute: null, installMarkedAt: null, install: rec("NOT_DETECTED"), requiredEvent: "Lead", events: {} }).stage, "installation_detected");
  });
  await check("a missing permission says what to do, and isn't called broken", () => {
    const v = trackingStage({ pixel: { id: "1", lastFiredAt: new Date() }, installRoute: null, installMarkedAt: null, install: rec("VERIFIED"), requiredEvent: "Lead", events: { Lead: rec("MISSING_PERMISSION") } });
    assert.match(v.next, /Reconnect Meta/);
    assert.doesNotMatch(v.next, /broken|failed/i);
  });
  await check("the campaign is told it's ready only when the event is verified (or a lead form needs none)", () => {
    assert.equal(campaignHandoff("installation_detected", "Lead").ready, false);
    assert.equal(campaignHandoff("verified", "Lead").ready, true);
    assert.equal(campaignHandoff("asset_selected", null).ready, true);
  });
  await check("the overview reads its own records: the shop's purchase check, its route, and the right stage", async () => {
    await setInstallRoute(A, "shopify_app");
    await db.trackingProfile.update({ where: { organizationId: A }, data: { nicheId: "ecommerce" } });
    world.stats = { Purchase: 2 };
    await viaMeta(() => checkEvents(A, ["Purchase"]));
    const o = await trackingOverview(A);
    assert.equal(o.requiredEvent, "Purchase");
    assert.equal(o.route, "shopify_app");
    assert.equal(o.stage.stage, "verified");
    assert.equal(o.handoff.ready, true);
  });
  await check("install routes follow the platform the website reader detected", () => {
    assert.equal(suggestedRoute("Shopify"), "shopify_app");
    assert.equal(suggestedRoute("WooCommerce"), "wordpress_plugin");
    assert.equal(suggestedRoute(null), "manual");
  });
  await check("events fire on outcomes: a Lead after the form is accepted, never on the click", () => {
    const lead = recommendedEvents("service").find((e) => e.name === "Lead")!;
    assert.match(lead.when, /accepted/);
    assert.match(lead.notWhen, /Submit button/);
  });

  console.log("— consent —");
  await check("the consent rules", () => {
    assert.equal(consentAllows("respect_denied", null), true);
    assert.equal(consentAllows("respect_denied", "denied"), false);
    assert.equal(consentAllows("require_granted", null), false);
    assert.equal(consentAllows("require_granted", "granted"), true);
    assert.equal(normalizeConsent("yes"), "granted");
    assert.equal(normalizeConsent(false), "denied");
    assert.equal(normalizeConsent("maybe"), null);
  });
  await check("an order the setting doesn't allow is counted, not sent, and keeps nothing identifying", async () => {
    await setConsentPolicy(A, "require_granted");
    const r = await viaMeta(() => recordOrder(A, "CUSTOM", { externalOrderId: `${TAG}-1`, valueCents: 4900, currency: "USD", occurredAt: new Date(), email: "shopper@example.com", phone: "+15550100", clientIp: "203.0.113.9", consent: null }));
    assert.equal(r.forwarded[0].status, "SKIPPED");
    const row = await db.conversionEvent.findFirstOrThrow({ where: { organizationId: A, externalOrderId: `${TAG}-1` }, include: { forwards: true } });
    assert.equal(row.hashedEmail, null);
    assert.equal(row.hashedPhone, null);
    assert.equal(row.clientIp, null);
    assert.match(row.forwards[0].message ?? "", /consent/);
  });
  await check("with consent (or no refusal under the default), the order is sent once with its event id", async () => {
    await setConsentPolicy(A, "respect_denied");
    const before = calls.filter((c) => c.endsWith("/events")).length;
    const r = await viaMeta(() => recordOrder(A, "CUSTOM", { externalOrderId: `${TAG}-2`, valueCents: 4900, currency: "USD", occurredAt: new Date(), email: "shopper@example.com", consent: null }));
    assert.equal(r.forwarded[0].status === "SENT" || r.forwarded[0].status === "ACCEPTED_WITH_WARNINGS", true, r.forwarded[0].status);
    assert.equal(calls.filter((c) => c.endsWith("/events")).length, before + 1);
    const denied = await viaMeta(() => recordOrder(A, "CUSTOM", { externalOrderId: `${TAG}-3`, valueCents: 100, currency: "USD", occurredAt: new Date(), email: "x@example.com", consent: "denied" }));
    assert.equal(denied.forwarded[0].status, "SKIPPED");
  });

  console.log("— isolation —");
  await check("one business never reads another's pixel or checks", async () => {
    const a = await trackingOverview(A);
    const b = await trackingOverview(B);
    assert.notEqual(a.pixel?.id, b.pixel?.id);
    assert.ok(Object.keys(b.events).length === 0);
    const bChecks = await db.trackingVerification.findMany({ where: { organizationId: B } });
    assert.ok(bChecks.every((c) => c.pixelId === "444444444444"));
  });

  await cleanup();
  console.log(`\nTracking setup: ${passed} checks passed.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  process.exit(1);
});
