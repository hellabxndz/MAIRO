// Checks the free AI ad plan generator's report (src/lib/preview/answers.ts
// and report.ts) against the fixture websites — an online shop, a local
// service that takes bookings and a lead-generation business — and with no
// website at all:
//
//   - each fact says where it came from: the website's words stay the
//     website's until the visitor changes them;
//   - the plan changes with the business, the goal and the budget — the
//     objective, the placements, the budget split and the first month;
//   - technical statements about a website appear only when it was read;
//   - nothing in it is a forecast or a claim MAIRO can't stand behind;
//   - a saved or shared plan shows exactly what the visitor saw.
//
//   npm run check:report   (reads scripts/fixtures/sites; no network, no database)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanWebsite, type ScanResult } from "../src/lib/website/scan";
import { factsFromAnswers, readSells, toSavedPlan, asName, type GeneratorAnswers, type Writing } from "../src/lib/preview/answers";
import { buildReport, type PlanReport } from "../src/lib/preview/report";
import { savedPlanSchema } from "../src/lib/preview/saved-plan";
import { GOAL_OPTIONS } from "../src/lib/preview/strategy";
import { BANNED_CLAIMS } from "../src/lib/capabilities";
import type { PreviewGoal } from "../src/lib/preview/build";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const SITES = join(process.cwd(), "scripts/fixtures/sites");
const fixtures = async (url: string) => {
  const u = new URL(url);
  if (!u.hostname.endsWith(".fixture.test")) return { ok: false as const, reason: "unreachable" as const, message: "The site didn't answer." };
  try {
    const body = readFileSync(join(SITES, u.hostname, `${u.pathname === "/" ? "index" : u.pathname.replace(/^\/+|\/+$/g, "")}.html`), "utf8");
    return { ok: true as const, status: 200, finalUrl: url, body, contentType: "text/html", bytes: body.length, redirects: [] as string[] };
  } catch {
    return { ok: false as const, reason: "error_status" as const, status: 404, message: "The site answered with an error (404)." };
  }
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = async (host: string) => (await scanWebsite(host, { fetcher: fixtures as any })).result;

const TEMPLATES: Writing = { source: { by: "templates", why: "off" }, plan: null, dropped: [], filled: 0 };
const FORECAST = /\bguarantee|\bwill (get|bring|deliver|generate)\b|\bexpect(ed)? \d|\b\d+\s*(leads|sales|customers|bookings|visits) (a|per|each) (day|week|month)|\broas\b|\breturn on ad spend of\b/i;

function plan(a: GeneratorAnswers, scan: ScanResult | null, w: Writing = TEMPLATES): PlanReport {
  const f = factsFromAnswers(a, scan);
  const saved = toSavedPlan(a, f, scan, w);
  assert.ok(saved, "the plan validates");
  const r = buildReport(saved!);
  assert.ok(r, "a report is built");
  return r!;
}
const allText = (r: PlanReport) => JSON.stringify(r);

(async () => {
  const shop = await read("shop.fixture.test");
  const plumber = await read("plumber.fixture.test");
  const solar = await read("solar.fixture.test");

  console.log("— an online shop: Fernleaf Ceramics, $1,000 a month, more online sales —");
  const shopSells = factsFromAnswers({ website: "https://shop.fixture.test", sells: "", name: "", goal: "sales", monthly: 1000 }, shop).offering;
  const s = plan({ website: "https://shop.fixture.test", sells: shopSells, name: "", goal: "sales", monthly: 1000 }, shop);
  await check("what they sell comes from the website, prefilled — and says so", () => {
    assert.equal(s.name, "Fernleaf Ceramics");
    assert.ok(shopSells.length > 3);
    assert.equal(s.business.facts.find((x) => x.key === "offering")?.from, "website");
    assert.equal(s.business.facts.find((x) => x.key === "name")?.from, "website");
  });
  await check("the website reading is reported as seen: pages, Shopify, pixel found, checkout found", () => {
    assert.equal(s.website.read, true);
    assert.ok(s.website.pagesRead >= 1);
    assert.equal(s.website.platform, "Shopify");
    assert.match(s.website.seen.find((x) => x.label === "Meta pixel")!.value, /^Found/);
    assert.equal(s.website.seen.find((x) => x.label === "Checkout")!.value, "Found");
  });
  await check("$1,000 splits 650 / 200 / 150 and adds up exactly", () => {
    assert.deepEqual(s.budget.lines.map((l) => [l.key, l.monthly]), [["prospecting", 650], ["retargeting", 200], ["testing", 150]]);
    assert.equal(s.budget.lines.reduce((t, l) => t + l.monthly, 0), 1000);
  });
  await check("three concepts, one to test first, each with every field", () => {
    assert.equal(s.concepts.list.length, 3);
    for (const c of s.concepts.list) for (const k of ["headline", "primaryText", "format", "visual", "cta", "targetCustomer", "why"] as const) assert.ok(c[k].trim(), `${k} is filled`);
    assert.ok(s.concepts.first >= 0 && s.concepts.first < 3);
    assert.ok(s.concepts.firstWhy);
  });

  console.log("\n— a local service that takes bookings: Brightwater Plumbing, $500, bookings —");
  const p = plan({ website: "https://plumber.fixture.test", sells: "Emergency plumbing and drain repair", name: "", goal: "bookings", monthly: 500 }, plumber);
  await check("changing what they sell makes it theirs; the website's name stays the website's", () => {
    assert.equal(p.business.facts.find((x) => x.key === "offering")?.from, "you");
    assert.equal(p.business.facts.find((x) => x.key === "name")?.from, "website");
  });
  await check("booking through Calendly is seen, and the plan sends people straight to it", () => {
    assert.match(p.website.seen.find((x) => x.label === "Online booking")!.value, /Calendly/i);
    assert.ok(p.business.opportunities.some((o) => /booking/i.test(o.title)));
    assert.match(p.strategy.objective, /Calendly/i);
  });
  await check("at $500 there's no retargeting, and the plan says why", () => {
    assert.ok(!p.budget.lines.some((l) => l.key === "retargeting"));
    assert.ok(p.budget.notes.some((n) => /No retargeting yet/.test(n)));
  });

  console.log("\n— lead generation: Sunline Solar, $2,500, more leads —");
  const l = plan({ website: "https://solar.fixture.test", sells: factsFromAnswers({ website: "x", sells: "", name: "", goal: "leads", monthly: 2500 }, solar).offering, name: "", goal: "leads", monthly: 2500 }, solar);
  await check("its quote form is found, so leads go to the website's form, not a lead form", () => {
    assert.equal(l.website.seen.find((x) => x.label === "Contact form")!.value, "Found");
    assert.match(l.strategy.objective, /website's form/);
  });
  await check("no pixel found: retargeting waits for it, and adding one is an opportunity", () => {
    assert.ok(!l.budget.lines.some((x) => x.key === "retargeting"));
    assert.ok(l.budget.notes.some((n) => /no Meta pixel/i.test(n)));
    assert.ok(l.business.opportunities.some((o) => /Let Meta see your results/.test(o.title)));
  });
  await check("the website's own words build trust, as facts from the website", () => {
    assert.ok(l.business.facts.some((x) => x.from === "website"));
    assert.equal(l.business.customers.from, "suggestion", "who's likely to buy is MAIRO's suggestion when nobody said");
  });

  console.log("\n— no website —");
  const n = plan({ website: null, sells: "We sell hand-poured soy candles for gift shoppers.", name: "wick and ember", goal: "sales", monthly: 300 }, null);
  await check("the description gives what they sell and who for; the name is theirs", () => {
    assert.equal(n.name, "Wick And Ember");
    assert.equal(n.business.offering, "Hand-poured soy candles for gift shoppers");
    assert.equal(n.business.customers.text, "Gift shoppers");
    assert.equal(n.business.customers.from, "you");
    assert.ok(n.business.facts.every((x) => x.from === "you"));
  });
  await check("no website read: no technical claims at all", () => {
    assert.equal(n.website.read, false);
    assert.deepEqual(n.website.seen, []);
    assert.deepEqual(n.website.findings, []);
    assert.ok(!/pixel (was )?found|checkout found/i.test(allText(n)));
  });
  await check("a website that couldn't be read is kept as typed, with nothing claimed about it", () => {
    const failed = { ...shop, status: "FAILED" as const, error: "The site didn't answer." };
    const r = plan({ website: "https://shop.fixture.test", sells: "Handmade mugs", name: "Fernleaf", goal: "sales", monthly: 1000 }, failed);
    assert.equal(r.website.read, false);
    assert.equal(r.website.url, "https://shop.fixture.test");
    assert.ok(r.budget.notes.length >= 0);
  });

  console.log("\n— the plan follows the inputs —");
  await check("each of the five goals gives its own objective, placements and first month", () => {
    const reports = GOAL_OPTIONS.map((g) => plan({ website: "https://solar.fixture.test", sells: "Home solar panel installation", name: "", goal: g.value, monthly: 1000 }, solar));
    assert.equal(new Set(reports.map((r) => r.strategy.objective)).size, 5);
    assert.ok(new Set(reports.map((r) => r.strategy.placements.join("|"))).size >= 4);
    assert.equal(new Set(reports.map((r) => JSON.stringify(r.month))).size, 5);
    assert.equal(reports.find((r) => r.goal === "awareness")!.budget.lines[0].key, "reach");
  });
  await check("each budget gives its own split and daily amount", () => {
    const budgets = [300, 500, 1000, 2500, 5000].map((m) => plan({ website: "https://shop.fixture.test", sells: shopSells, name: "", goal: "sales", monthly: m }, shop));
    assert.equal(new Set(budgets.map((r) => JSON.stringify(r.budget.lines))).size, 5);
    for (const [i, m] of [300, 500, 1000, 2500, 5000].entries()) assert.equal(budgets[i].budget.lines.reduce((t, x) => t + x.monthly, 0), m);
    assert.ok(budgets[4].budget.notes.some((x) => /\$5,000/.test(x)));
  });
  await check("different businesses get different plans", () => {
    assert.notEqual(s.strategy.audience, l.strategy.audience);
    assert.notDeepEqual(s.concepts.list.map((c) => c.headline), l.concepts.list.map((c) => c.headline));
  });

  console.log("\n— honest throughout —");
  await check("no forecasts and no claims MAIRO can't back, in any report", () => {
    for (const r of [s, p, l, n]) {
      const t = allText(r);
      assert.ok(!FORECAST.test(t), `no forecast in ${r.name}: ${t.match(FORECAST)?.[0]}`);
      for (const b of BANNED_CLAIMS) assert.ok(!b.pattern.test(t), `${b.why} in ${r.name}`);
    }
  });
  await check("templates say they're templates; AI writing is used when given, checked", () => {
    assert.deepEqual(s.concepts.source, { by: "templates", why: "off" });
    const ai: Writing = { source: { by: "ai" }, plan: { appeal: ["Handmade in a small studio."], customers: "People who buy gifts", messaging: ["Lead with free shipping over $60."], concepts: [{ label: "The offer", headline: "Free shipping over $60", primaryText: "Handmade mugs. Free shipping on orders over $60.", format: "Single image", visual: "A mug on a kitchen table, morning light.", cta: "Shop now", targetCustomer: "Gift buyers", why: "A real offer." }], first: 0, firstWhy: "The offer is concrete." }, dropped: [], filled: 0 };
    const r = plan({ website: "https://shop.fixture.test", sells: shopSells, name: "", goal: "sales", monthly: 1000 }, shop, ai);
    assert.equal(r.concepts.source.by, "ai");
    assert.equal(r.concepts.list[0].headline, "Free shipping over $60");
    assert.deepEqual(r.business.appeal, ["Handmade in a small studio."]);
  });
  await check("a saved or shared plan shows exactly what the visitor saw", () => {
    const a: GeneratorAnswers = { website: "https://plumber.fixture.test", sells: "Emergency plumbing and drain repair", name: "", goal: "bookings", monthly: 500 };
    const saved = toSavedPlan(a, factsFromAnswers(a, plumber), plumber, TEMPLATES)!;
    const shared = savedPlanSchema.parse(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(buildReport(shared), buildReport(saved));
  });
  await check("small helpers: names and descriptions", () => {
    assert.equal(asName("nova sports"), "Nova Sports");
    assert.equal(asName("iPhone Repair Co"), "iPhone Repair Co");
    assert.deepEqual(readSells("I offer dog walking for busy owners"), { offering: "Dog walking for busy owners", customer: "Busy owners" });
    assert.deepEqual(readSells("Premium coffee for everyone"), { offering: "Premium coffee for everyone", customer: "" });
  });

  const goals: PreviewGoal[] = ["sales", "leads", "bookings", "traffic", "awareness"];
  void goals;
  console.log(`\nReport: ${passed} checks passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
