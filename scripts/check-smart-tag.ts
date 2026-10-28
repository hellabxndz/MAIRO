// The MAIRO tag (lib/tracking/smart-tag.ts, lib/tracking/tag-relay.ts): what
// each kind of business's tag counts, that the file can't be broken out of,
// what the relay accepts from a stranger's browser, and exactly what it sends
// Meta. Meta is a fake; the database is the local one.
//
//   npm run check:smart-tag

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { encryptSecret } from "../src/lib/crypto/secret-box";
import { nicheById, type Niche } from "../src/lib/tracking/niches";
import { acceptedEvents, pasteGuideFor, tagRules, tagScript, tagSnippet, validTagId } from "../src/lib/tracking/smart-tag";
import { buildTagFile, judgeHit, onBusinessSite, parseTagHit, relayHit, tagTarget, underRateLimit, type TagTarget } from "../src/lib/tracking/tag-relay";
import { detectTracking } from "../src/lib/website/detect";
import { GET as tagFile } from "../src/app/t/[file]/route";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const ORG = "zz-tag-org";
const PIXEL = "123456789012345";
const sent: { path: string; data: Record<string, unknown>[] }[] = [];
const fakeMeta: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const form = new URLSearchParams(String(init?.body ?? ""));
  sent.push({ path: url.pathname, data: JSON.parse(url.searchParams.get("data") ?? form.get("data") ?? "[]") });
  return Response.json({ events_received: 1 });
};

const hit = (over: Record<string, unknown> = {}) => JSON.stringify({ e: "Lead", id: "mabc12345xyz", u: "https://www.bobsplumbing.com/contact?name=Jane", fbp: "fb.1.1700000000000.123", fbc: null, c: 1, ...over });

async function main() {
  await check("each kind of business's tag counts what that business converts on", () => {
    const trades = tagRules(nicheById("home_services"));
    assert.deepEqual(trades.map((r) => `${r.k}:${r.e}`), ["tel:Contact", "form:Lead", "mail:Contact"]);
    const shop = tagRules(nicheById("ecommerce"));
    // A page address can't confirm an order or say what it was worth: the tag never fires Purchase on its own.
    assert.deepEqual(shop.map((r) => `${r.k}:${r.e}`), ["url:InitiateCheckout", "dl:AddToCart"]);
    assert.ok(!shop.some((r) => r.e === "Purchase"));
  });

  await check("the tag file: numeric pixel only, and nothing in it can close the script", () => {
    assert.throws(() => tagScript({ pixel: "123');alert(1)//", endpoint: "https://x/api/t/c1", rules: [], consentRequired: false, events: [], purchase: false }));
    const evil: Niche = { ...nicheById("general"), actions: [{ id: "x", label: "x", why: "", metaEvent: "Lead", detection: "url_contains", match: "</script><script>alert(1)</script>", hasValue: false }] };
    const js = tagScript({ pixel: PIXEL, endpoint: "https://www.mairo.io/api/t/cabc", rules: tagRules(evil), consentRequired: false, events: ["Lead"], purchase: true });
    assert.ok(!js.includes("</script>"), "no closing tag survives");
    assert.ok(js.includes("\\u003c/script\\u003e"));
    assert.ok(js.includes("globalPrivacyControl"), "honours Global Privacy Control");
    assert.ok(js.includes('"trackSingle", C.pixel'), "events go to this pixel only, not to other pixels on the page");
    new Function(js); // parses
  });

  await check("the one line, and which paste guide fits the website", () => {
    assert.equal(tagSnippet("https://www.mairo.io/", "cabc123"), '<script async src="https://www.mairo.io/t/cabc123.js"></script>');
    assert.equal(pasteGuideFor("Wix"), "wix");
    assert.equal(pasteGuideFor("WooCommerce"), "wordpress");
    assert.equal(pasteGuideFor("Square Online"), "other");
    assert.equal(pasteGuideFor(null), "other");
  });

  await check("the website check recognises the tag (it loads the pixel, so the pixel id isn't in the page)", () => {
    const t = detectTracking('<html><head><script async src="https://www.mairo.io/t/cmabcdefghijklmnopqrstuvw.js"></script></head></html>');
    assert.deepEqual(t.mairoTagIds, ["cmabcdefghijklmnopqrstuvw"]);
    assert.equal(t.metaPixelScript, true);
    assert.deepEqual(detectTracking("<html></html>").mairoTagIds, []);
  });

  await check("a report from a browser is checked field by field; the query is never kept", () => {
    const h = parseTagHit(hit())!;
    assert.equal(h.u, "https://www.bobsplumbing.com/contact", "name=Jane is dropped");
    assert.equal(h.fbp, "fb.1.1700000000000.123");
    assert.equal(parseTagHit(hit({ e: "Lead<script>" })), null);
    assert.equal(parseTagHit(hit({ id: "../../etc" })), null);
    assert.equal(parseTagHit(hit({ u: "javascript:alert(1)" })), null);
    assert.equal(parseTagHit(hit({ fbp: "not-a-cookie" }))!.fbp, null);
    assert.equal(parseTagHit("x".repeat(3000)), null);
    assert.equal(parseTagHit("not json"), null);
    assert.equal(validTagId("cmabcdefghijklmnopqrstuvw"), true);
    assert.equal(validTagId("1 OR 1=1"), false);
  });

  await check("relayed only: an event this business counts, with consent when required, from its own website", () => {
    const target: TagTarget = { organizationId: ORG, pixelId: PIXEL, nicheId: "home_services", consentRequired: false, website: "bobsplumbing.com", chosen: null, storeRelaysOrders: false };
    assert.deepEqual(judgeHit(parseTagHit(hit())!, target), { send: true });
    assert.equal(parseTagHit(hit({ e: "Purchase" })), null, "a purchase without its order id, value and currency isn't one");
    const sale = parseTagHit(hit({ e: "Purchase", id: "mairo_1001", v: 49.99, cur: "USD" }))!;
    assert.deepEqual([sale.v, sale.cur], [49.99, "USD"]);
    assert.deepEqual(judgeHit(sale, target), { send: true }, "before the owner chooses, a valid purchase is relayed");
    assert.deepEqual(judgeHit(sale, { ...target, chosen: ["Lead"] }), { send: false, why: "event" }, "not when purchases weren't chosen");
    assert.deepEqual(judgeHit(sale, { ...target, storeRelaysOrders: true }), { send: false, why: "store" }, "the store sends the server copy");
    assert.equal(parseTagHit(hit({ e: "Purchase", id: "mairo_1001", v: 0, cur: "USD" })), null);
    assert.equal(parseTagHit(hit({ e: "Purchase", id: "mairo_1001", v: 10, cur: "dollars" })), null);
    assert.deepEqual(judgeHit(parseTagHit(hit({ u: "https://evil.example/contact" }))!, target), { send: false, why: "site" });
    assert.deepEqual(judgeHit(parseTagHit(hit({ c: 0 }))!, { ...target, consentRequired: true }), { send: false, why: "consent" });
    assert.ok(onBusinessSite("https://shop.bobsplumbing.com/x", "https://www.bobsplumbing.com"), "subdomains count");
    assert.ok(!onBusinessSite("https://bobsplumbing.com.evil.io/x", "bobsplumbing.com"));
    assert.ok(onBusinessSite("https://anything.example/x", null), "no website on file: accepted");
    assert.ok(acceptedEvents(nicheById("ecommerce")).has("Purchase"));
  });

  await check("a flood on one tag is cut off at 60 a minute", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 60; i++) assert.ok(underRateLimit("cflood", t0 + i));
    assert.equal(underRateLimit("cflood", t0 + 61), false);
    assert.ok(underRateLimit("cflood", t0 + 61_000), "a new minute");
  });

  // ——— against the database ———
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.organization.create({ data: { id: ORG, name: "Bob's Plumbing", website: "https://bobsplumbing.com" } });
  await db.metaAdAccount.create({ data: { organizationId: ORG, metaAdAccountId: "act_1", accessToken: encryptSecret("fake-token"), status: "CONNECTED" } });
  await db.trackingProfile.create({ data: { organizationId: ORG, nicheId: "home_services", nicheConfirmed: true } });
  const row = await db.trackingPixel.create({ data: { organizationId: ORG, platform: "META", externalPixelId: PIXEL, name: "Bob's pixel" } });

  try {
    await check("the tag file is served for a real tag, and a made-up one gets a harmless 404", async () => {
      const res = await tagFile(new Request(`http://localhost/t/${row.id}.js`), { params: Promise.resolve({ file: `${row.id}.js` }) });
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type") ?? "", /javascript/);
      const js = await res.text();
      assert.ok(js.includes(PIXEL) && js.includes(`/api/t/${row.id}`) && js.includes('"k":"tel"'));
      assert.ok(!js.includes("fake-token"), "never the access token");
      const missing = await tagFile(new Request("http://localhost/t/cnope.js"), { params: Promise.resolve({ file: "cmzzzzzzzzzzzzzzzzzzzzzzz.js" }) });
      assert.equal(missing.status, 404);
      const target = await tagTarget(row.id);
      assert.deepEqual({ pixel: target!.pixelId, niche: target!.nicheId }, { pixel: PIXEL, niche: "home_services" });
    });

    await check("consent required: the tag waits for the site to say so", async () => {
      await db.trackingProfile.update({ where: { organizationId: ORG }, data: { serverEventsConsent: "require_granted" } });
      const target = await tagTarget(row.id);
      assert.equal(target!.consentRequired, true);
      assert.ok(buildTagFile(target!, row.id, "https://www.mairo.io").includes('"consentRequired":true'));
      await db.trackingProfile.update({ where: { organizationId: ORG }, data: { serverEventsConsent: "respect_denied" } });
    });

    await check("a relayed lead reaches the business's own pixel with no value, no query and the visitor's cookie", async () => {
      sent.length = 0;
      const target = (await tagTarget(row.id))!;
      await withGraphTransport({ fetch: fakeMeta, record: false }, () => relayHit(target, parseTagHit(hit())!, { ip: "203.0.113.9", userAgent: "Mozilla/5.0" }));
      assert.equal(sent.length, 1);
      assert.match(sent[0].path, new RegExp(`/${PIXEL}/events$`));
      const e = sent[0].data[0] as { event_name: string; event_id: string; event_source_url: string; custom_data?: unknown; user_data: Record<string, unknown> };
      assert.equal(e.event_name, "Lead");
      assert.equal(e.event_id, "mabc12345xyz", "the browser's id, so Meta counts it once");
      assert.equal(e.event_source_url, "https://www.bobsplumbing.com/contact");
      assert.equal(e.custom_data, undefined, "a lead carries no made-up value");
      assert.equal(e.user_data.fbp, "fb.1.1700000000000.123");
      assert.equal(e.user_data.client_ip_address, "203.0.113.9");
    });

    await check("Meta disconnected: nothing is sent, nothing throws", async () => {
      sent.length = 0;
      await db.metaAdAccount.updateMany({ where: { organizationId: ORG }, data: { status: "DISCONNECTED" } });
      const target = (await tagTarget(row.id))!;
      await withGraphTransport({ fetch: fakeMeta, record: false }, () => relayHit(target, parseTagHit(hit())!, { ip: null, userAgent: null }));
      assert.equal(sent.length, 0);
    });
  } finally {
    await db.organization.deleteMany({ where: { id: ORG } });
  }

  console.log(`\n${passed} smart-tag checks passed. (Meta faked — a real install is proven by "Check with Meta" on the Tracking page.)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
