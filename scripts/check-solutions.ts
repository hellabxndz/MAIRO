// Checks the use-case pages (/solutions/…) say what MAIRO does for each kind
// of business:
//
//   - Each page's example plan is the one the preview builder really makes
//     for that kind, and its result names are the ones the dashboard counts.
//   - What's described as available is built; what isn't is said plainly
//     (no catalogue ads, no booking-system connection, Meta only).
//   - Help links resolve, the pages are linked from the site, and the example
//     is labelled as a fictional business. No banned claims.
//
//   npm run check:solutions   (pure; no database, no network)

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { USE_CASES } from "../src/lib/solutions/use-cases";
import { buildPreview } from "../src/lib/preview/build";
import { exampleFacts } from "../src/lib/preview/example";
import { resultFor } from "../src/lib/dashboard/console";
import { helpArticle } from "../src/lib/help/articles";
import { BANNED_CLAIMS, capability } from "../src/lib/capabilities";
import { INTEGRATIONS } from "../src/lib/pricing/compare";

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}
const words = (u: (typeof USE_CASES)[number]) => [u.title, u.sub, ...u.forWho, ...u.measured.flatMap((m) => [m.term, m.text]), ...u.need, ...u.notDone].join(" ");

console.log("— the pages —");
check("three pages: online stores, local services, appointments", () => {
  assert.deepEqual(USE_CASES.map((u) => u.slug), ["online-stores", "local-services", "appointments"]);
});
check("each example plan is the preview builder's plan for that kind and goal", () => {
  const want = { "online-stores": ["shop", "sales", "Purchase"], "local-services": ["service", "leads", "Lead"], appointments: ["appointments", "bookings", "Schedule"] } as const;
  for (const u of USE_CASES) {
    const p = buildPreview(exampleFacts(u.example))!;
    const [kind, goal, event] = want[u.slug];
    assert.equal(p.kind, kind, u.slug);
    assert.equal(p.goal, goal, u.slug);
    assert.equal(u.family, goal, u.slug);
    assert.equal(p.tracking.events.find((e) => e.required)?.name, event, u.slug);
    assert.equal(p.directions.length, 3, u.slug);
  }
});
check("the result names are the ones the dashboard counts for that goal", () => {
  for (const u of USE_CASES) {
    const r = resultFor(u.family, {} as never);
    assert.equal(u.measured[0].term, r.label, u.slug);
    assert.equal(u.measured[1].term, r.costLabel, u.slug);
  }
});

console.log("\n— honest about what's built —");
check("Shopify is for counting orders, not running the store", () => {
  const shopify = INTEGRATIONS.find((i) => i.key === "shopify")!;
  assert.equal(shopify.status, "tracking");
  assert.match(words(USE_CASES[0]), /isn't a Shopify app/);
  assert.equal(capability("shopify-orders").status, "working");
});
check("no catalogue ads and no booking-system connection are claimed", () => {
  // Nothing that builds campaigns knows about a product catalogue.
  const builders = readdirSync(join(root, "src/lib/campaigns")).filter((f) => f.endsWith(".ts")).map((f) => read(`src/lib/campaigns/${f}`)).join("\n");
  assert.doesNotMatch(builders, /catalog/i);
  assert.match(words(USE_CASES[0]), /doesn't build catalogue/);
  assert.match(words(USE_CASES[2]), /doesn't connect to your booking system/);
  // The booking tools named are ones MAIRO recognises on a website.
  const detect = read("src/lib/website/detect.ts");
  for (const p of ["Calendly", "Acuity", "Fresha", "Booksy"]) assert.ok(detect.includes(`provider: "${p}`), p);
});
check("Meta only: other networks appear only as not supported", () => {
  for (const u of USE_CASES) {
    const all = words(u);
    for (const net of ["TikTok", "Google Ads"]) if (all.includes(net)) assert.ok(u.notDone.some((n) => n.includes(net) && /\bnot\b/.test(n)), `${u.slug}: ${net}`);
  }
  assert.equal(capability("tiktok").status, "unavailable");
  assert.equal(capability("google-ads").status, "unavailable");
});
check("lead forms and lead outcomes, which the pages rely on, are working", () => {
  for (const id of ["lead-forms", "lead-outcomes", "results", "launch-approval"]) assert.equal(capability(id).status, "working", id);
});
check("no banned claims, no promised results", () => {
  const page = read("src/app/solutions/[slug]/page.tsx");
  for (const u of USE_CASES) for (const b of BANNED_CLAIMS) assert.doesNotMatch(words(u), b.pattern, `${u.slug}: ${b.why}`);
  for (const b of BANNED_CLAIMS) assert.doesNotMatch(page, b.pattern, b.why);
  assert.doesNotMatch(USE_CASES.map(words).join(" ") + page, /\bwill (increase|grow|double|boost)\b|\bguaranteed?\b/i);
});

console.log("\n— linked and labelled —");
check("help links resolve and the example is labelled as fictional sample data", () => {
  for (const u of USE_CASES) for (const h of u.help) assert.ok(helpArticle(h), `${u.slug}: ${h}`);
  const ex = read("src/components/solutions/example-plan.tsx");
  assert.match(ex, /is a fictional business · sample plan/);
  assert.match(ex, /<div inert>/);
  assert.match(read("src/app/solutions/[slug]/page.tsx"), /a fictional \{ex\.label\.toLowerCase\(\)\}/);
});
check("each page is linked from the homepage, the footer and the sitemap", () => {
  const home = read("src/components/landing/console-home.tsx");
  const footer = read("src/components/landing/site-footer.tsx");
  for (const u of USE_CASES) {
    assert.ok(home.includes(`/solutions/${u.slug}`), `home ${u.slug}`);
    assert.ok(footer.includes(`/solutions/${u.slug}`), `footer ${u.slug}`);
  }
  assert.match(read("src/app/sitemap.ts"), /USE_CASES\.map/);
  assert.ok(statSync(join(root, "src/app/solutions/[slug]/page.tsx")).isFile());
});

console.log(`\nSolutions: ${passed} checks passed`);
