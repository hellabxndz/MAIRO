// Checks the shared website reader behind onboarding, the "Before you spend on
// ads" report and the five website tools — against local fixture sites, so
// nothing leaves this machine:
//
//   - detectors: platform, Shopify theme and apps, tracking tags, consent,
//     contact/booking/checkout, social links, structured business data — each
//     with its evidence, and "unknown" when the page doesn't say;
//   - the audit: top three distinct changes, observed vs inferred vs not
//     checked, speed only from PageSpeed (lab and field apart), message match,
//     suggested wording built only from what's on the site;
//   - failures: social profiles, private and malformed addresses, unreachable
//     sites, and page text that tries to give instructions;
//   - the database: scans and owner decisions per business, isolation between
//     businesses, recheck confirming a fix, free-use limits and the public cache.
//
//   npm run check:website   (needs DATABASE_URL; makes no network calls)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/lib/db";
import {
  blockText,
  detectApps,
  detectConsent,
  detectDeclaredBusiness,
  detectDestinations,
  detectPlatform,
  detectShopifyTheme,
  detectSocial,
  detectTracking,
  quoteSentences,
  socialProfileFrom,
  OFFER_RE,
} from "../src/lib/website/detect";
import { scanWebsite, type Fetcher } from "../src/lib/website/scan";
import { readPagespeed } from "../src/lib/website/pagespeed";
import { ANON_SCANS_PER_HOUR, cachedPublicScan, findingDecisions, latestOrgScan, saveScan, setFindingStatus, takeScanQuota } from "../src/lib/website/store";
import { recommendedEvents } from "../src/lib/tracking/events";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const SITES = new URL("./fixtures/sites/", import.meta.url).pathname;
const page = (host: string, path = "index") => readFileSync(join(SITES, host, `${path}.html`), "utf8");
const plumber = page("plumber.fixture.test");
const shop = page("shop.fixture.test");

/** Serves the fixture folders; any other host is unreachable, as in a sandbox. */
function fixtures(overrides: Record<string, string> = {}): Fetcher {
  return async (url) => {
    const u = new URL(url);
    const key = `${u.hostname}${u.pathname}`;
    if (overrides[key] !== undefined) return { ok: true, status: 200, finalUrl: url, body: overrides[key], contentType: "text/html", bytes: overrides[key].length, redirects: [] };
    if (!u.hostname.endsWith(".fixture.test")) return { ok: false, reason: "unreachable", message: "The site didn't answer." };
    try {
      const body = page(u.hostname, u.pathname === "/" ? "index" : u.pathname.replace(/^\/+|\/+$/g, ""));
      return { ok: true, status: 200, finalUrl: url, body, contentType: "text/html", bytes: body.length, redirects: [] };
    } catch {
      return { ok: false, reason: "error_status", status: 404, message: "The site answered with an error (404)." };
    }
  };
}

const TAG = "zz-website";
const cleanup = async () => {
  await db.websiteScan.deleteMany({ where: { OR: [{ organizationId: { startsWith: TAG } }, { url: { contains: "fixture.test" } }] } });
  await db.toolUsage.deleteMany({ where: { bucket: { contains: TAG } } });
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
};

async function main() {
  console.log("— detectors —");
  await check("Shopify is detected with evidence; theme name, original and Theme Store ID read from the page", () => {
    const p = detectPlatform(shop)!;
    assert.equal(p.name, "Shopify");
    assert.equal(p.confidence, "certain");
    assert.match(p.evidence[0].where, /cdn\.shopify\.com|Shopify\.theme|window\.Shopify/);
    const t = detectShopifyTheme(shop)!;
    assert.deepEqual([t.name, t.schemaName, t.themeStoreId], ["Dawn", "Dawn", 887]);
    assert.equal(detectShopifyTheme(plumber), null);
    assert.equal(detectPlatform(plumber), null);
  });
  await check("apps, tags and consent tools each carry the address that matched", () => {
    const apps = detectApps(shop).map((a) => a.name);
    assert.deepEqual(apps.sort(), ["Judge.me", "Klaviyo"].sort());
    const t = detectTracking(shop);
    assert.deepEqual(t.metaPixelIds, ["123456789012345"]);
    assert.deepEqual(t.gtmContainers, ["GTM-ABC1234"]);
    assert.equal(t.shopifyWebPixels, true);
    assert.deepEqual(detectConsent(shop).map((c) => c.name), ["Cookiebot"]);
    assert.equal(detectTracking(plumber).metaPixelScript, false);
  });
  await check("phone, booking link and a form without a send button are found", () => {
    const d = detectDestinations(plumber + page("plumber.fixture.test", "contact"));
    assert.deepEqual(d.phoneLinks, ["+15550100"]);
    assert.equal(d.booking[0].provider, "Calendly");
    assert.equal(d.forms[0].hasSubmit, false);
    assert.equal(d.forms[0].hasEmailField, true);
  });
  await check("social profiles are recognised and never read; a profile typed as a website is refused with a reason", () => {
    assert.equal(detectSocial(plumber)[0].network, "Facebook");
    assert.equal(socialProfileFrom("https://www.instagram.com/fernleafceramics")?.network, "Instagram");
    assert.equal(socialProfileFrom("https://fernleaf.example"), null);
    assert.equal(socialProfileFrom("https://www.facebook.com/sharer/sharer.php"), null);
  });
  await check("structured business data: type, locality; quotes keep block boundaries", () => {
    const b = detectDeclaredBusiness(plumber);
    assert.deepEqual([b.name, b.types[0], b.locality], ["Brightwater Plumbing", "Plumber", "Eastfield"]);
    assert.deepEqual(quoteSentences(blockText(page("plumber.fixture.test", "services")), OFFER_RE), ["Leak repair, drain clearing, water heaters. Free estimate on every job."].flatMap((s) => s.split(/(?<=\.)\s+/)).filter((s) => OFFER_RE.test(s)));
  });

  console.log("\n— the scan and the audit —");
  const { result: p } = await scanWebsite("plumber.fixture.test", { fetcher: fixtures() });
  await check("a service site: three different top changes, each with evidence and a confidence level", () => {
    assert.equal(p.status, "OK");
    assert.equal(p.kind, "service");
    assert.equal(p.pages.length, 3);
    const rules = p.audit.top.map((f) => f.rule);
    assert.equal(new Set(rules).size, rules.length);
    assert.ok(rules.includes("link-broken") && rules.includes("tracking") && rules.includes("headline-vague"), rules.join());
    for (const f of p.audit.top) assert.ok(f.evidence && f.evidenceUrl && f.why && f.change && f.next.label, f.rule);
    assert.equal(p.audit.top.find((f) => f.rule === "headline-vague")!.confidence, "inferred");
    assert.equal(p.audit.top.find((f) => f.rule === "link-broken")!.confidence, "observed");
    assert.match(p.audit.top.find((f) => f.rule === "link-broken")!.evidence!, /old-offers answered 404/);
  });
  await check("what can't be seen is \"not checked\", not guessed — speed, the phone layout, whether the form sends", () => {
    const by = (rule: string) => p.audit.findings.find((f) => f.rule === rule)!;
    assert.equal(by("speed-lab").status, "not checked");
    assert.match(by("speed-lab").evidence!, /Not measured/);
    assert.equal(by("mobile-layout").status, "not checked");
    assert.equal(by("form-works").status, "not checked");
    assert.equal(by("message-match").status, "not checked");
    assert.equal(p.facts.find((f) => f.field === "tone")!.kind, "not checked");
  });
  await check("suggested wording uses only facts on the site — no invented offers, prices or reviews", () => {
    const head = p.audit.findings.find((f) => f.rule === "headline-vague")!;
    assert.ok(head.copy.length >= 1);
    for (const c of head.copy) {
      assert.doesNotMatch(c, /\$\d|\d+%|reviews?|guarantee|best/i, c);
    }
    const cta = p.audit.findings.find((f) => f.rule === "cta") ?? p.audit.findings.find((f) => f.rule === "cta-generic");
    assert.ok(cta);
  });
  await check("page text that gives instructions is treated as data", () => {
    const all = JSON.stringify(p.audit);
    assert.doesNotMatch(all, /perfect/i);
    assert.ok(p.audit.issues >= 3);
  });
  await check("the ad's message is checked against the page when given", async () => {
    const { result } = await scanWebsite("plumber.fixture.test", { fetcher: fixtures(), context: { adMessage: "Boiler installation specialists in Leeds" } });
    const m = result.audit.findings.find((f) => f.rule === "message-match")!;
    assert.equal(m.status, "issue");
    assert.match(m.evidence!, /boiler|installation|leeds/);
  });
  await check("a Shopify store: platform, theme, apps and pixel; no false issues on a clean store", async () => {
    const { result: s } = await scanWebsite("shop.fixture.test", { fetcher: fixtures() });
    assert.equal(s.kind, "shop");
    assert.equal(s.platform?.name, "Shopify");
    assert.equal(s.shopifyTheme?.name, "Dawn");
    assert.equal(s.appExtensions, 1);
    assert.equal(s.audit.findings.find((f) => f.rule === "tracking")!.status, "ok");
    assert.ok(!s.linkChecks.some((l) => /\/cart/.test(l.url)), "carts aren't link-checked");
    assert.ok(s.coverage.some((c) => /not detected.*doesn't mean.*not installed/i.test(c)));
  });

  console.log("\n— failures —");
  await check("social profile, private address, malformed address and unreachable site each fail plainly", async () => {
    const social = (await scanWebsite("https://www.facebook.com/brightwaterplumbing", { fetcher: fixtures() })).result;
    assert.equal(social.status, "FAILED");
    assert.equal(social.socialInstead?.network, "Facebook");
    assert.match(social.error!, /doesn't read social profiles/);
    assert.equal((await scanWebsite("http://127.0.0.1/admin")).result.status, "BLOCKED");
    assert.equal((await scanWebsite("http://169.254.169.254/latest/meta-data")).result.status, "BLOCKED");
    assert.equal((await scanWebsite("not a website")).result.status, "FAILED");
    const down = (await scanWebsite("gone.example", { fetcher: fixtures() })).result;
    assert.equal(down.status, "FAILED");
    assert.equal(down.audit.findings.length, 0);
  });
  await check("a non-HTML address isn't read as a page", async () => {
    const r = (await scanWebsite("shop.fixture.test", { fetcher: async (url) => ({ ok: true, status: 200, finalUrl: url, body: "%PDF", contentType: "application/pdf", bytes: 4, redirects: [] }) })).result;
    assert.equal(r.status, "FAILED");
  });

  console.log("\n— speed —");
  await check("PageSpeed lab and field readings are kept apart; origin data is labelled as the whole site", () => {
    const both = readPagespeed({ lighthouseResult: { categories: { performance: { score: 0.42 } }, audits: { "largest-contentful-paint": { numericValue: 5200 }, "cumulative-layout-shift": { numericValue: 0.12 }, "total-blocking-time": { numericValue: 600 } } }, loadingExperience: { overall_category: "SLOW", metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 4100 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 12 } } } });
    assert.equal(both.lab!.lcpMs, 5200);
    assert.equal(both.field!.scope, "page");
    assert.equal(both.field!.cls, 0.12);
    const origin = readPagespeed({ lighthouseResult: { audits: {} }, loadingExperience: { origin_fallback: true, metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1 } } }, originLoadingExperience: { overall_category: "FAST", metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2000 } } } });
    assert.equal(origin.field!.scope, "origin");
    assert.equal(readPagespeed({ lighthouseResult: { audits: {} } }).field, null);
  });
  await check("a slow lab reading becomes an observed, high-priority speed finding", async () => {
    const { result } = await scanWebsite("plumber.fixture.test", { fetcher: fixtures() });
    const { auditSite } = await import("../src/lib/website/audit");
    const a = auditSite({ ...result, url: result.finalUrl!, text: "", performance: readPagespeed({ lighthouseResult: { categories: { performance: { score: 0.3 } }, audits: { "largest-contentful-paint": { numericValue: 6100 } } } }) });
    const s = a.findings.find((f) => f.rule === "speed-lab")!;
    assert.deepEqual([s.status, s.confidence, s.priority], ["issue", "observed", "high"]);
    assert.match(s.evidence!, /PageSpeed Insights, simulated phone/);
  });

  console.log("\n— events —");
  await check("events fire on outcomes: purchase for shops, lead/schedule for services — never on a click", () => {
    const shopEvents = recommendedEvents("shop");
    assert.equal(shopEvents.find((e) => e.required)!.name, "Purchase");
    const svc = recommendedEvents("service", { booking: true, phone: true });
    assert.deepEqual(svc.filter((e) => e.required).map((e) => e.name), ["Lead", "Schedule"]);
    assert.match(svc.find((e) => e.name === "Schedule")!.notWhen, /taps your booking link/);
    assert.match(svc.find((e) => e.name === "Lead")!.carries, /No form contents/);
  });

  console.log("\n— the database —");
  await cleanup();
  await db.organization.create({ data: { id: `${TAG}-a`, name: "Website A" } });
  await db.organization.create({ data: { id: `${TAG}-b`, name: "Website B" } });
  await check("an account's scan saves its findings for that business only", async () => {
    await saveScan({ result: p, source: "report", organizationId: `${TAG}-a` });
    const a = await findingDecisions(`${TAG}-a`);
    assert.ok(a.has("link-broken:/") && a.get("link-broken:/")!.status === "OPEN");
    assert.equal((await findingDecisions(`${TAG}-b`)).size, 0);
    assert.equal(await latestOrgScan(`${TAG}-b`), null);
    assert.equal((await latestOrgScan(`${TAG}-a`))!.result.finalUrl, p.finalUrl);
  });
  await check("marking resolved works only inside the business that owns the finding", async () => {
    assert.equal(await setFindingStatus(`${TAG}-b`, "link-broken:/", "RESOLVED", null), false);
    assert.equal(await setFindingStatus(`${TAG}-a`, "link-broken:/", "RESOLVED", null), true);
    assert.equal((await findingDecisions(`${TAG}-a`)).get("link-broken:/")!.status, "RESOLVED");
  });
  await check("a recheck that no longer sees a problem marks it gone; one still seen keeps the owner's decision", async () => {
    const fixedHome = plumber.replace('<a href="/old-offers">Offers</a>', "");
    const { result } = await scanWebsite("plumber.fixture.test", { fetcher: fixtures({ "plumber.fixture.test/": fixedHome }) });
    assert.ok(!result.audit.findings.some((f) => f.rule === "link-broken"));
    await saveScan({ result, source: "recheck", organizationId: `${TAG}-a` });
    const d = await findingDecisions(`${TAG}-a`);
    assert.ok(d.get("link-broken:/")!.goneAt, "fixed link confirmed gone");
    assert.equal(d.get("tracking:/")!.goneAt, null);
    assert.equal(d.get("link-broken:/")!.status, "RESOLVED");
  });
  await check("free checks: a disclosed per-visitor limit, separate from account limits", async () => {
    const anon = `${TAG}-visitor`;
    for (let i = 0; i < ANON_SCANS_PER_HOUR; i++) assert.equal((await takeScanQuota({ anonKey: anon })).ok, true);
    const over = await takeScanQuota({ anonKey: anon });
    assert.equal(over.ok, false);
    if (!over.ok) assert.equal(over.reason, "visitor");
    assert.equal((await takeScanQuota({ organizationId: `${TAG}-a` })).ok, true);
    await db.toolUsage.deleteMany({ where: { bucket: { contains: "scan:all:" } } });
  });
  await check("the public cache serves public readings only — never an account's, nor one carrying ad text", async () => {
    assert.equal(await cachedPublicScan(p.requestedUrl), null, "the account scans above aren't public");
    await saveScan({ result: p, source: "tool", anonKey: `${TAG}-visitor` });
    assert.equal((await cachedPublicScan(p.requestedUrl))!.finalUrl, p.finalUrl);
    await db.websiteScan.deleteMany({ where: { url: p.requestedUrl, organizationId: null } });
    await saveScan({ result: p, source: "tool-ad", anonKey: `${TAG}-visitor` });
    assert.equal(await cachedPublicScan(p.requestedUrl), null, "a reading with someone's ad text isn't reused");
  });
  await cleanup();
  await db.toolUsage.deleteMany({ where: { bucket: { startsWith: "scan:org:zz-website" } } });

  console.log(`\nWebsite: ${passed} checks passed. Fixture sites only — nothing left this machine.`);
}

main()
  .catch(async (e) => {
    await cleanup().catch(() => {});
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
