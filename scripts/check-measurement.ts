// Checks the guided tracking setup (lib/tracking/measurement.ts and
// measurement-store.ts) against the real code and the local database, with
// Meta replaced by a pretend one:
//
//   - only the fixed list of goals ever becomes a Meta event, whoever
//     suggested it — the AI's suggestion included — and nothing it says can
//     mark tracking as working;
//   - each choice maps to the right standard event, lead businesses get their
//     own path, and native Meta counts aren't pushed through the Pixel;
//   - progress is saved on the server and survives a reload; deferring holds
//     purchase campaigns and says why;
//   - each business sees and changes only its own setup;
//   - a website address is checked before it's read, and private ones refused;
//   - pressing "Create a new Pixel" twice creates one;
//   - each event is verified on its own: PageView doesn't prove Purchase, a
//     purchase without value and currency needs attention, and a permission
//     error is reported as one;
//   - MAIRO's tag never fires a purchase from a page address, and the store
//     relay doesn't send a second server copy when the platform already does;
//   - the report shows unavailable as unavailable, and refuses a funnel from
//     mismatched readings or too few events.
//
// SIMULATED Meta: nothing is sent to Meta, no event is created and nothing
// is spent. Whether Meta accepts these requests for a real account is what a
// real Pixel and "Check with Meta" answer.
//
//   npm run check:measurement   (needs DATABASE_URL)

import assert from "node:assert/strict";
import { join } from "node:path";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { encryptSecret } from "../src/lib/crypto/secret-box";
import {
  GOALS,
  SHOPPING_JOURNEY,
  acceptAiSuggestion,
  eventsFor,
  goalsFrom,
  installPlan,
  measurementReport,
  platformFrom,
  platformGuess,
  setupState,
  shoppingFunnel,
  suggestGoals,
  validateGoals,
  type StateInput,
} from "../src/lib/tracking/measurement";
import { confirmPlatform, deferSetup, loadMeasurementSetup, normaliseWebsite, resumeSetup, saveGoals, saveWebsiteAndDetect, verifyMeasurement } from "../src/lib/tracking/measurement-store";
import { choosePixel, createPixelForBusiness, campaignLaunchGate } from "../src/lib/tracking/pixel-setup";
import { setInstallRoute } from "../src/lib/tracking/setup";
import { launchGate, type PixelState } from "../src/lib/tracking/pixel-rules";
import { tagRules } from "../src/lib/tracking/smart-tag";
import { nicheById } from "../src/lib/tracking/niches";
import { recordOrder } from "../src/lib/tracking/orders";
import type { CheckRecord } from "../src/lib/tracking/state";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-meas";
const A = `${TAG}-shop`;
const B = `${TAG}-other`;
const ACT = "act_888";
const day = 864e5;

// --- A pretend Meta ----------------------------------------------------------------
type FakePixel = { id: string; name: string; last_fired_time?: string; creation_time?: string };
const world = {
  pixels: [] as FakePixel[],
  nextId: 910000000000001,
  createDelayMs: 0,
  stats: {} as Record<string, number>,
  web: {} as Record<string, number>,
  server: {} as Record<string, number>,
  fields: [] as string[],
  statsError: null as null | { code: number; status: number },
};
const calls: string[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const rows = (o: Record<string, number>) => Object.entries(o).map(([value, count]) => ({ value, count }));
const fakeMeta: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/v\d+\.\d+/, "");
  const method = (init?.method ?? "GET").toUpperCase();
  calls.push(`${method} ${path}`);
  if (path === "/me/permissions") return json({ data: [{ permission: "ads_management", status: "granted" }] });
  if (path === `/${ACT}/adspixels` && method === "GET") return json({ data: world.pixels });
  if (path === `/${ACT}/adspixels` && method === "POST") {
    if (world.createDelayMs) await new Promise((r) => setTimeout(r, world.createDelayMs));
    const p: FakePixel = { id: String(world.nextId++), name: url.searchParams.get("name") ?? "pixel", creation_time: new Date().toISOString() };
    world.pixels.push(p);
    return json({ id: p.id });
  }
  const stats = path.match(/^\/(\d+)\/stats$/);
  if (stats) {
    if (world.statsError) return json({ error: { message: "Permissions error", code: world.statsError.code } }, world.statsError.status);
    const agg = url.searchParams.get("aggregation");
    if (agg === "custom_data_field") return json({ data: [{ data: world.fields.map((value) => ({ value, count: 3 })) }] });
    const src = url.searchParams.get("event_source");
    const data = src === "WEB_ONLY" ? world.web : src === "SERVER_ONLY" ? world.server : world.stats;
    return json({ data: [{ start_time: new Date().toISOString(), aggregation: "event", data: rows(data) }] });
  }
  if (/^\/(\d+)\/events$/.test(path)) return json({ events_received: 1 });
  const node = path.match(/^\/(\d+)$/);
  if (node) {
    const p = world.pixels.find((x) => x.id === node[1]);
    return p ? json(p) : json({ error: { message: "Unsupported get request", code: 100 } }, 400);
  }
  return json({ data: [] });
};
const viaMeta = <T,>(fn: () => Promise<T>) => withGraphTransport({ fetch: fakeMeta, record: false, retryBaseMs: 1 }, fn);

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}
async function org(id: string, opts: { website: string | null; industry: string }) {
  await db.organization.create({ data: { id, name: id === A ? "Fernleaf Ceramics" : "Harbour Plumbing", website: opts.website, industry: opts.industry } });
  await db.metaAdAccount.create({ data: { organizationId: id, metaAdAccountId: ACT, accessToken: encryptSecret("fake-token"), status: "CONNECTED" } });
}

const rec = (status: CheckRecord["status"], count: number | null = null, end = new Date()): CheckRecord & { windowStart: Date; windowEnd: Date } => ({
  status,
  source: "meta_stats",
  detail: null,
  count,
  checkedAt: end,
  windowStart: new Date(end.getTime() - 7 * day),
  windowEnd: end,
});
const base: StateInput = { goals: [], goalsSavedAt: null, deferredAt: null, pixel: null, installVerified: false, installRoute: null, installMarkedAt: null, events: {}, purchaseParams: null };

async function main() {
  process.env.MAIRO_SCAN_FIXTURES = join(process.cwd(), "scripts/fixtures/sites");

  console.log("— what can be measured: a fixed list —");
  await check("each choice becomes exactly one of Meta's standard events; native and MAIRO counts have none", () => {
    const map = Object.fromEntries(Object.values(GOALS).map((g) => [g.id, g.event]));
    assert.deepEqual(map, {
      view_content: "ViewContent",
      add_to_cart: "AddToCart",
      initiate_checkout: "InitiateCheckout",
      purchase: "Purchase",
      lead: "Lead",
      complete_registration: "CompleteRegistration",
      phone_click: "Contact",
      meta_lead_form: null,
      call_ads: null,
      qualified_leads: null,
    });
    assert.deepEqual(GOALS.purchase.requires, ["value", "currency"]);
    assert.match(GOALS.purchase.never, /Buy-button click or a checkout-page visit/);
    assert.match(GOALS.phone_click.detail, /A tap isn't a call/);
  });
  await check("unknown, invented or hostile ids are dropped, never stored as events", () => {
    const r = validateGoals(["purchase", "SuperPurchase", "<script>", "lead", "purchase", 7]);
    assert.deepEqual(r.goals, ["purchase", "lead"]);
    assert.deepEqual(r.dropped, ["SuperPurchase", "<script>", "7"]);
    assert.deepEqual(goalsFrom("not json"), []);
    assert.deepEqual(goalsFrom('["view_content","CustomEvent123"]'), ["view_content"]);
    assert.deepEqual(eventsFor(["view_content", "meta_lead_form", "qualified_leads"]), ["ViewContent"]);
  });
  await check("a shop is offered the full shopping journey; a lead business its own path, without purchases", () => {
    assert.deepEqual(suggestGoals({ sellsOnline: true }).goals, SHOPPING_JOURNEY);
    const plumber = suggestGoals({ sellsOnline: false, site: { forms: true, phoneLinks: true, booking: false, checkout: false, cart: false } });
    assert.deepEqual(plumber.goals, ["lead", "phone_click", "call_ads", "qualified_leads"]);
    assert.ok(!plumber.goals.includes("purchase"));
    assert.ok(suggestGoals({ sellsOnline: false, leadMeasurement: "meta_forms", site: { forms: false, phoneLinks: false, booking: false, checkout: false, cart: false } }).goals.includes("meta_lead_form"));
  });
  await check("the AI's suggestion is data: only listed ids survive, reasons are cleaned, and it can't say anything works", () => {
    const fallback = suggestGoals({ sellsOnline: false });
    const r = acceptAiSuggestion('Sure! {"goals": ["lead", "Purchase_Verified", "phone_click"], "why": {"lead": "<b>Forms</b> are how they enquire", "phone_click": "Calls"}, "status": "receiving_events"}', fallback);
    assert.deepEqual(r.suggestion.goals, ["lead", "phone_click"]);
    assert.deepEqual(r.dropped, ["Purchase_Verified"]);
    assert.equal(r.suggestion.why.lead, "bForms/b are how they enquire");
    assert.equal(r.suggestion.source, "ai");
    assert.deepEqual(Object.keys(r.suggestion).sort(), ["goals", "preset", "source", "why"], "a suggestion carries no status");
    assert.equal(acceptAiSuggestion("not json at all", fallback).suggestion, fallback);
    assert.equal(acceptAiSuggestion('{"goals": ["Bogus"]}', fallback).suggestion, fallback);
  });

  console.log("\n— platform and installing —");
  await check("the website reader's guess is only a suggestion, mapped onto the fixed list", () => {
    assert.deepEqual(platformGuess({ name: "Shopify", confidence: "certain" }), { platform: "shopify", confidence: "certain" });
    assert.deepEqual(platformGuess({ name: "Duda", confidence: "likely" }), { platform: "other", confidence: "likely" });
    assert.equal(platformGuess(null), null);
    assert.equal(platformFrom("magento"), null);
  });
  await check("a platform's own Meta integration comes first; nothing is ever installed automatically", () => {
    const shop = installPlan("shopify", ["view_content", "purchase", "lead"]);
    assert.equal(shop.method, "native");
    assert.deepEqual(shop.covers, ["view_content", "purchase"]);
    assert.equal(shop.notCovered[0].goal, "lead", "enquiries aren't pushed through a second Pixel code on Shopify");
    assert.match(shop.server, /doesn't send your Shopify orders to Meta a second time/);
    const custom = installPlan("custom", ["initiate_checkout", "purchase"]);
    assert.equal(custom.method, "mairo_tag");
    assert.ok(custom.steps.some((s) => /order confirmation, once per order: mairo\('purchase', \{ value/.test(s)));
    for (const p of ["shopify", "woocommerce", "wordpress", "wix", "squarespace", "webflow", "custom", "other"] as const) assert.equal(installPlan(p, ["lead"]).automatic, false);
  });
  await check("MAIRO's tag never fires a purchase from a page address, and fires only what was chosen", () => {
    const shop = nicheById("ecommerce");
    assert.ok(!tagRules(shop).some((r) => r.e === "Purchase"));
    assert.deepEqual(tagRules(shop, new Set(["AddToCart"])).map((r) => r.e), ["AddToCart"]);
  });

  console.log("\n— where a business stands —");
  await check("each state in order, from records only", () => {
    const pixel = { lastFiredAt: null, accessLost: false, otherAdAccount: false };
    assert.equal(setupState(base).state, "not_started");
    const g = { ...base, goals: ["purchase" as const], goalsSavedAt: new Date() };
    assert.equal(setupState(g).state, "goals_saved");
    assert.equal(setupState({ ...g, pixel }).state, "pixel_selected");
    assert.equal(setupState({ ...g, pixel, installRoute: "mairo_tag" }).state, "installation_needed");
    assert.equal(setupState({ ...g, pixel, installRoute: "mairo_tag", installMarkedAt: new Date() }).state, "waiting_for_verification");
    const live = { ...g, pixel: { ...pixel, lastFiredAt: new Date() }, installRoute: "mairo_tag" };
    assert.equal(setupState({ ...live, events: { Purchase: rec("VERIFIED", 4) }, purchaseParams: rec("VERIFIED") }).state, "receiving_events");
    assert.equal(setupState({ ...g, deferredAt: new Date() }).state, "deferred");
    assert.equal(setupState({ ...base, goals: ["meta_lead_form"], goalsSavedAt: new Date() }).state, "no_website_tracking");
  });
  await check("PageView doesn't prove Purchase; a purchase without value, lost access or a permission error needs attention", () => {
    const live: StateInput = { ...base, goals: ["purchase", "lead"], goalsSavedAt: new Date(), pixel: { lastFiredAt: new Date(), accessLost: false, otherAdAccount: false }, installRoute: "mairo_tag" };
    const pv = setupState({ ...live, events: { Lead: rec("VERIFIED", 9) } });
    assert.equal(pv.state, "waiting_for_verification");
    assert.deepEqual(pv.events.map((e) => [e.event, e.status]), [["Purchase", "not_checked"], ["Lead", "verified"]]);
    assert.equal(setupState({ ...live, events: { Purchase: rec("VERIFIED", 3), Lead: rec("VERIFIED", 1) }, purchaseParams: rec("NOT_SEEN") }).state, "needs_attention");
    assert.equal(setupState({ ...live, pixel: { ...live.pixel!, accessLost: true } }).state, "needs_attention");
    assert.equal(setupState({ ...live, events: { Purchase: rec("MISSING_PERMISSION") } }).state, "needs_attention");
  });
  await check("launch: a purchase campaign waits when setup is deferred or purchases weren't chosen; others don't", () => {
    const s: PixelState = { decision: "use", pixel: { id: "1", name: "p", lastFiredAt: new Date(), installDetected: true, accessLost: false, otherAdAccount: false }, purchaseVerified: true };
    assert.deepEqual(launchGate("required_for_purchases", s), { ok: true });
    const deferred = launchGate("required_for_purchases", { ...s, measurement: { goalsSaved: true, purchaseChosen: true, deferred: true } });
    assert.equal(deferred.ok === false && deferred.code, "deferred");
    const notChosen = launchGate("required_for_purchases", { ...s, measurement: { goalsSaved: true, purchaseChosen: false, deferred: false } });
    assert.equal(notChosen.ok === false && notChosen.code, "purchase_not_chosen");
    assert.deepEqual(launchGate("recommended", { ...s, measurement: { goalsSaved: true, purchaseChosen: false, deferred: true } }), { ok: true });
  });

  console.log("\n— honest reporting —");
  await check("no reading is unavailable, not zero; counts are events, not people", () => {
    const r = measurementReport({ goals: ["view_content", "purchase", "meta_lead_form"], checks: { ViewContent: rec("FAILED") }, storeOrders: null });
    assert.deepEqual(r.rows.map((x) => x.value), [null, null, null]);
    assert.equal(r.rows[0].unit, "website events");
    assert.equal(r.uniquePeople.available, false);
    assert.match(r.rows[2].source, /Meta, per campaign/);
    const z = measurementReport({ goals: ["lead"], checks: { Lead: rec("NOT_SEEN", 0) }, storeOrders: null });
    assert.equal(z.rows[0].value, 0, "a real zero from Meta is a zero");
  });
  await check("the shopping funnel only from one reading, with enough events — never mixed", () => {
    const t = new Date();
    const ok = { ViewContent: rec("VERIFIED", 400, t), AddToCart: rec("VERIFIED", 60, t), InitiateCheckout: rec("VERIFIED", 30, t), Purchase: rec("VERIFIED", 12, t) };
    const f = shoppingFunnel(SHOPPING_JOURNEY, ok);
    assert.ok(f.steps);
    assert.deepEqual(f.steps!.map((s) => s.events), [400, 60, 30, 12]);
    assert.equal(f.steps![1].fromPrevious, 0.15);
    const early = new Date(t.getTime() - 3 * 36e5);
    assert.equal(shoppingFunnel(SHOPPING_JOURNEY, { ...ok, Purchase: rec("VERIFIED", 12, early) }).steps, null, "read at different times");
    assert.equal(shoppingFunnel(SHOPPING_JOURNEY, { ...ok, ViewContent: rec("VERIFIED", 10, t) }).steps, null, "too few to read");
    assert.equal(shoppingFunnel(["purchase"], ok).steps, null);
    const report = measurementReport({ goals: SHOPPING_JOURNEY, checks: ok, storeOrders: { count: 9, revenueCents: 45000, currency: "USD", window: { start: early, end: t }, lastReceivedAt: t } });
    assert.ok(report.insights.some((i) => /Event counts, not shoppers/.test(i)));
    assert.ok(report.insights.some((i) => /side by side, not compared as a rate/.test(i)));
  });

  console.log("\n— saved on the server, per business —");
  await cleanup();
  await org(A, { website: "https://shop.fixture.test", industry: "Online shop selling ceramics" });
  await org(B, { website: null, industry: "Plumbing" });
  world.pixels = [{ id: "123123123123", name: "Fernleaf store", last_fired_time: new Date(Date.now() - day).toISOString(), creation_time: new Date(Date.now() - 300 * day).toISOString() }];

  await check("a website address is checked first: private, local and malformed ones are refused", async () => {
    for (const bad of ["http://localhost:3000", "http://127.0.0.1", "http://10.0.0.5/admin", "https://user:pw@shop.example.com", "ftp://shop.example.com", "notawebsite"]) {
      const r = await normaliseWebsite(bad);
      assert.equal(r.ok, false, bad);
    }
    const ok = await normaliseWebsite("shop.fixture.test/");
    assert.deepEqual(ok, { ok: true, url: "https://shop.fixture.test" });
  });
  await check("the saved website is read and its platform suggested — not assumed", async () => {
    const r = await saveWebsiteAndDetect(A, "https://shop.fixture.test");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.guess?.platform, "shopify");
    const v = await loadMeasurementSetup(A);
    assert.equal(v.platform.confirmed, null, "not confirmed until the owner says so");
    assert.equal(v.platform.guess?.platform, "shopify");
  });
  await check("choices are saved and survive a reload; the other business sees none of it", async () => {
    assert.equal((await saveGoals(A, "user-a", [])).ok, false);
    const r = await saveGoals(A, "user-a", [...SHOPPING_JOURNEY, "Bogus"]);
    assert.equal(r.ok && r.dropped[0], "Bogus");
    await confirmPlatform(A, "custom");
    const v = await loadMeasurementSetup(A);
    assert.deepEqual(v.goals, SHOPPING_JOURNEY);
    assert.equal(v.platform.confirmed, "custom");
    assert.equal(v.state.state, "goals_saved");
    const other = await loadMeasurementSetup(B);
    assert.deepEqual(other.goals, []);
    assert.equal(other.state.state, "not_started");
    assert.equal(other.platform.confirmed, null);
  });
  await check("putting it off is saved, holds a purchase campaign, and resuming clears it", async () => {
    await deferSetup(A);
    assert.equal((await loadMeasurementSetup(A)).state.state, "deferred");
    const gate = await campaignLaunchGate(A, { objective: "SALES", destinationType: "WEBSITE" });
    assert.equal(gate.ok === false && gate.code, "deferred");
    assert.equal((await campaignLaunchGate(A, { objective: "LEADS", destinationType: "LEAD_FORM" })).ok, true);
    await resumeSetup(A);
    assert.equal((await loadMeasurementSetup(A)).state.state, "goals_saved");
  });

  console.log("\n— the Pixel: reuse, access, one create —");
  await check("a Pixel not shared with the ad account can't be chosen", async () => {
    const r = await viaMeta(() => choosePixel(A, "user-a", { pixelId: "999999999999", websiteDomain: "shop.fixture.test" }));
    assert.equal(r.ok, false);
  });
  await check("two presses of “Create a new Pixel” at once create one Pixel", async () => {
    world.createDelayMs = 150;
    calls.length = 0;
    const [x, y] = await viaMeta(() => Promise.all([createPixelForBusiness(B, "user-b", null), createPixelForBusiness(B, "user-b", null)]));
    world.createDelayMs = 0;
    assert.equal(calls.filter((c) => c === `POST /${ACT}/adspixels`).length, 1);
    assert.ok([x, y].some((r) => r.ok));
    const again = await viaMeta(() => createPixelForBusiness(B, "user-b", null));
    assert.equal(again.ok, false, "with a Pixel chosen, MAIRO won't create a second");
    assert.equal(await db.trackingPixel.count({ where: { organizationId: B } }), 1);
  });
  await check("the existing Pixel is reused for the shop", async () => {
    const r = await viaMeta(() => choosePixel(A, "user-a", { pixelId: "123123123123", websiteDomain: "shop.fixture.test" }));
    assert.equal(r.ok, true);
    assert.equal((await loadMeasurementSetup(A)).pixel.pixel?.id, "123123123123");
  });

  console.log("\n— verifying each event with Meta —");
  await setInstallRoute(A, "mairo_tag");
  await check("PageView arriving proves nothing about the shopping events", async () => {
    world.stats = { PageView: 900 };
    calls.length = 0;
    const r = await viaMeta(() => verifyMeasurement(A));
    assert.equal(r.ok && r.verified.length, 0);
    const v = await loadMeasurementSetup(A);
    assert.equal(v.state.state, "waiting_for_verification");
    assert.ok(v.state.events.every((e) => e.status === "not_seen"));
    assert.ok(!calls.some((c) => c.startsWith("POST")), "checking sends nothing to Meta — no test or made-up events");
  });
  await check("purchases without a value and currency need attention", async () => {
    world.stats = { ViewContent: 400, AddToCart: 60, InitiateCheckout: 30, Purchase: 12 };
    world.web = { ...world.stats };
    world.server = { Purchase: 12 };
    world.fields = ["content_ids"];
    await viaMeta(() => verifyMeasurement(A));
    const v = await loadMeasurementSetup(A);
    assert.equal(v.state.state, "needs_attention");
    assert.equal(v.state.events.find((e) => e.event === "Purchase")?.status, "missing_value");
    assert.match(v.purchaseParams?.detail ?? "", /missing a value and a currency/);
  });
  await check("with value and currency, every event received: stored with source, window and time, and the funnel reads", async () => {
    world.fields = ["value", "currency", "content_ids"];
    await viaMeta(() => verifyMeasurement(A));
    const v = await loadMeasurementSetup(A);
    assert.equal(v.state.state, "receiving_events");
    assert.equal(v.checks.Purchase?.source, "meta_stats");
    assert.equal(v.checks.Purchase?.count, 12);
    assert.ok("steps" in v.report.funnel && v.report.funnel.steps);
    assert.match(v.dedup.Purchase?.detail ?? "", /same event name and ID/, "browser and server copies, both from MAIRO's tag");
    assert.match(v.dedup.ViewContent?.detail ?? "", /Only browser copies/);
    const row = await db.trackingVerification.findFirst({ where: { organizationId: A, check: "event:Purchase" }, orderBy: { checkedAt: "desc" } });
    assert.ok(row?.windowStart && row.windowEnd && row.source === "meta_stats");
  });
  await check("copies from tools MAIRO doesn't control: it says it can't confirm the IDs match", async () => {
    await setInstallRoute(A, "shopify_app");
    await viaMeta(() => verifyMeasurement(A));
    const v = await loadMeasurementSetup(A);
    assert.equal(v.dedup.Purchase?.status, "UNAVAILABLE");
    assert.match(v.dedup.Purchase?.detail ?? "", /Event deduplication/);
    await setInstallRoute(A, "mairo_tag");
  });
  await check("a permission error is reported as one, not as 'not received'", async () => {
    world.statsError = { code: 200, status: 403 };
    await viaMeta(() => verifyMeasurement(A));
    world.statsError = null;
    const v = await loadMeasurementSetup(A);
    assert.equal(v.state.state, "needs_attention");
    assert.ok(v.state.events.every((e) => e.status === "permission"));
  });
  await check("a business without a Pixel can't verify, and never sees another business's checks", async () => {
    await org(`${TAG}-new`, { website: null, industry: "Bakery" });
    await saveGoals(`${TAG}-new`, "user-c", ["lead"]);
    const r = await verifyMeasurement(`${TAG}-new`);
    assert.equal(r.ok === false && r.reason, "no_pixel");
    const b = await loadMeasurementSetup(B);
    assert.deepEqual(b.checks, {});
  });

  console.log("\n— server events from the store —");
  await check("with the platform's own Meta integration, MAIRO keeps the order but doesn't send a second server copy", async () => {
    await setInstallRoute(A, "shopify_app");
    calls.length = 0;
    const r = await viaMeta(() => recordOrder(A, "SHOPIFY", { externalOrderId: "1001", valueCents: 4999, currency: "USD", occurredAt: new Date() }));
    assert.equal(r.created, true);
    assert.equal(r.forwarded[0]?.status, "SKIPPED");
    assert.ok(!calls.some((c) => /\/events$/.test(c)));
    await setInstallRoute(A, "mairo_tag");
  });

  await cleanup();
  console.log(`\nMeasurement: ${passed} checks passed. SIMULATED Meta — nothing was sent to Meta, created there or spent.`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => {});
    process.exit(1);
  })
  .finally(() => db.$disconnect());
