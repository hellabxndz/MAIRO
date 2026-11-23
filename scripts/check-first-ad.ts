// Checks the path from the homepage to a business's first ad:
//
//   - "See my first ad" sends the website with generate=1, so the ad is made
//     at once — no form in between — and is never sent back to a form or
//     a plan page in a loop.
//   - A website-only start asks only what the site couldn't answer.
//   - The result leads with the ad: who it's for, why, the first test.
//   - The ad's picture is the business's own (its share image), https only,
//     shown as theirs; a picture that fails falls back to the written concept.
//   - A "now serving: our winter menu" sentence is never read as a place.
//   - A shop with no description is described by its listed products.
//
//   npm run check:first-ad   (pure; no database, no network)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { placeFromSentence } from "@/lib/website/detect";
import { shareImage } from "@/lib/business/site-facts";
import { savedPlanSchema } from "@/lib/preview/saved-plan";
import { factsFromScan } from "@/lib/preview/build";
import type { ScanResult } from "@/lib/website/scan";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

console.log("— the homepage's one action —");
{
  const start = read("src/components/cinematic/home/website-start.tsx");
  ok("the button says what the visitor gets", /label = "See my first ad"/.test(start));
  ok("it sends the website and generate=1 to /preview", /action="\/preview"/.test(start) && /name="generate" value="1"/.test(start) && /name="website"/.test(start));
  ok("the click is counted (no URL, no text)", /track\(\{ name: "hero_cta", props: \{ cta: "first_ad"/.test(start));
  const page = read("src/app/preview/page.tsx");
  ok("/preview with generate=1 runs the generator, not the older flow", /const legacy = generate !== "1" &&/.test(page) && /autostart: generate === "1"/.test(page));
  const gen = read("src/components/plan-generator/plan-generator.tsx");
  ok("a website-only start reads the site and makes the ad without the form", /if \(initial\.autostart && initial\.website && normalize\(initial\.website\)\)/.test(gen) && /void generate\(\{ website: read\.url, sells:/.test(gen));
  ok("only what the site couldn't answer is asked", /setOnlyAsk\(/.test(gen) && /data-only-ask/.test(gen));
  ok("what MAIRO assumed is said on the result", /setAssumed\(notes\)/.test(gen) && /assumed=\{assumed\}/.test(gen));
  const nav = read("src/components/cinematic/home/nav.tsx") + read("src/components/cinematic/home/live.tsx") + read("src/components/cinematic/home/scenes.tsx");
  ok("every homepage 'See my first ad' leads to the website box, not another form", !/href="\/preview"[^>]*>\s*(Start free|Build my free plan|Start with a free plan)/.test(nav) && (nav.match(/#hero-website/g) ?? []).length >= 3);
}

console.log("\n— the result leads with the ad —");
{
  const report = read("src/components/plan-generator/plan-report.tsx");
  ok("the first ad comes before the strategy", report.indexOf("<FirstAd ") > 0 && report.indexOf("<FirstAd ") < report.indexOf("<AtAGlance r={r} />"));
  ok("who it's for, why it might work, and the first test", /Who it&rsquo;s for/.test(report) && /Why it might work/.test(report) && /The first test MAIRO would run/.test(report));
  ok("one next action, and another idea on request", /I like it — get started/.test(report) && /Show me another idea/.test(report));
  ok("the picture is labelled as the business's own", /imageLabel=\{`From \$\{domain \?\? "your website"\}`\}/.test(report));
  ok("a picture that won't load falls back to the written concept", /onFail=\{\(\) => setPictureFailed\(true\)\}/.test(report));
}

console.log("\n— the website's own picture —");
ok("og:image is read as an absolute https address", shareImage('<meta property="og:image" content="/img/hero.jpg">', "https://shop.example/") === "https://shop.example/img/hero.jpg");
ok("content-first attribute order works too", shareImage('<meta content="https://cdn.example/a.png" property="og:image">', "https://shop.example/") === "https://cdn.example/a.png");
ok("http is upgraded to https", shareImage('<meta property="og:image" content="http://cdn.example/a.png">', "https://shop.example/") === "https://cdn.example/a.png");
ok("an SVG isn't used as an ad picture", shareImage('<meta property="og:image" content="https://cdn.example/logo.svg">', "https://shop.example/") === null);
ok("a data URL isn't used", shareImage('<meta property="og:image" content="data:image/png;base64,AAAA">', "https://shop.example/") === null);
ok("twitter:image is the fallback", shareImage('<meta name="twitter:image" content="https://cdn.example/t.jpg">', "https://shop.example/") === "https://cdn.example/t.jpg");
ok("no picture, no claim", shareImage("<html></html>", "https://shop.example/") === null);
{
  const base = { inputs: { website: "https://shop.example", sells: "Coffee beans", goal: "sales", monthly: 500 }, facts: {}, written: null, source: { by: "templates", why: "off" } };
  ok("a saved plan keeps an https picture", savedPlanSchema.safeParse({ ...base, site: { url: "https://shop.example", pagesRead: 3, image: "https://shop.example/a.jpg" } }).success);
  ok("and refuses anything else", !savedPlanSchema.safeParse({ ...base, site: { url: "https://shop.example", pagesRead: 3, image: "javascript:alert(1)" } }).success);
  const old = savedPlanSchema.safeParse({ ...base, site: { url: "https://shop.example", pagesRead: 3 } });
  ok("plans saved before pictures still open", old.success && old.data.site?.image === null);
}

console.log("\n— reading the place right —");
ok("“now serving: our winter menu” isn't a place", placeFromSentence("now serving: our winter menu") === null);
ok("“Proudly serving Portland, OR and nearby” → Portland, OR", placeFromSentence("Proudly serving Portland, OR and nearby towns") === "Portland, OR", String(placeFromSentence("Proudly serving Portland, OR and nearby towns")));
ok("“Based in Austin” → Austin", placeFromSentence("We're a small team based in Austin.") === "Austin");
ok("“Serving our customers since 1998” isn't a place", placeFromSentence("Serving our customers since 1998") === null);
ok("“We serve Brooklyn and Queens” → both", placeFromSentence("We serve Brooklyn and Queens") === "Brooklyn and Queens", String(placeFromSentence("We serve Brooklyn and Queens")));

console.log("\n— what a shop sells, from its own pages —");
{
  const scan = {
    finalUrl: "https://shop.example/",
    requestedUrl: "https://shop.example",
    facts: [
      { field: "name", label: "", value: "Kiln & Co", evidenceUrl: null, kind: "found" },
      { field: "offering", label: "", value: null, evidenceUrl: null, kind: "not found" },
      { field: "products", label: "", value: "Sage mug ($28.00), Rust bowl ($34.00), Gift set ($60.00), Cream mug", evidenceUrl: null, kind: "found" },
      { field: "location", label: "", value: null, evidenceUrl: null, kind: "not found" },
    ],
    offers: [],
    trust: [],
    destinations: { booking: [], forms: [], phoneLinks: [], checkout: true, cart: true },
    tracking: { metaPixelIds: [], metaPixelScript: false },
    business: { types: [] },
    kind: "shop",
    platform: null,
  } as unknown as ScanResult;
  const f = factsFromScan(scan);
  ok("no description: the listed products describe it", f.offering === "Sage mug, Rust bowl, Gift set and more", f.offering);
  ok("and it's marked as from the website", f.sources.offering?.from === "website");
}

if (bad) {
  console.log(`\n${bad} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll first-ad checks passed.");
