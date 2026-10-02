// Checks the Business Analyzer's page reading and the Business Brain's rules.
//
//   npm run check:business
//
// The promises: prices come from the page or not at all, colours are the
// page's own, a field the business edited by hand is never overwritten by a
// fresh scan, and nothing too long or malformed breaks a save.

import { findColors, findCtas, findKeyLinks, findPrices, findProducts, literalConversionIssues, readSiteFacts } from "@/lib/business/site-facts";
import { onlyShownPrices } from "@/lib/business/analyze";
import { EMPTY_PROFILE, mergeAnalysis, sanitizeProfile, brainFacts, newProduct } from "@/lib/business/brain";
import type { AiBusinessAnalysis } from "@/lib/ai/business-analyzer";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

const HTML = `<!doctype html><html><head>
<title>Stride Running Co | Premium running shoes</title>
<meta name="viewport" content="width=device-width">
<meta name="description" content="Lightweight running shoes for everyday runners.">
<meta property="og:site_name" content="Stride Running Co">
<meta name="theme-color" content="#ff5a1f">
<style>.btn{background:#ff5a1f;color:#ffffff}.x{color:#1b3a6b}.y{color:#1b3a6b}.g{color:#777777}</style>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Stride One","offers":{"@type":"Offer","price":"129.00","priceCurrency":"USD"}}</script>
<script>fbq('init','123')</script>
</head><body>
<h1>Run further, hurt less</h1>
<p>Stride One — $129.00. Free shipping over $100.</p>
<a class="btn btn-primary" href="/collections/all">Shop now</a>
<a href="/about">About us</a><a href="https://other.com/shop">x</a>
<button>Add to cart</button>
</body></html>`;

console.log("\n— reading a page —");
{
  const f = readSiteFacts(HTML, "https://stride.example/");
  ok("title", f.title === "Stride Running Co | Premium running shoes", f.title ?? "");
  ok("site name", f.siteName === "Stride Running Co");
  ok("description", f.description === "Lightweight running shoes for everyday runners.");
  ok("headings", f.headings.includes("Run further, hurt less"));
  ok("mobile ready", f.mobileReady);
  ok("Meta pixel seen", f.hasMetaPixel);
  ok("scripts aren't read as text", !f.text.includes("fbq"));
  ok("prices as written", f.prices.includes("$129.00") && f.prices.includes("$100"), f.prices.join());
  ok("structured-data product with price", f.products[0]?.name === "Stride One" && f.products[0]?.price === "$129.00", JSON.stringify(f.products));
  ok("theme colour first", f.colors[0] === "#ff5a1f", f.colors.join());
  ok("greys and white aren't brand colours", !f.colors.includes("#777777") && !f.colors.includes("#ffffff"));
  ok("button wording", f.ctas.includes("Shop now") && f.ctas.includes("Add to cart"), f.ctas.join());
  ok("only same-site shop/about links are followed", f.keyLinks.join() === "https://stride.example/collections/all,https://stride.example/about", f.keyLinks.join());
}

console.log("\n— extractors on their own —");
{
  ok("no prices when none are shown", findPrices("Call us for a quote").length === 0);
  ok("euro and pound prices", findPrices("€45 or £30.00").length === 2);
  ok("3-digit hex expands", findColors('<div style="color:#f60">').includes("#ff6600"));
  ok("buttons over 40 characters aren't calls to action", findCtas(`<button>${"x".repeat(60)}</button>`).length === 0);
  ok("malformed structured data is ignored", findProducts('<script type="application/ld+json">{nope</script>').length === 0);
  ok("a bad base URL gives no links", findKeyLinks('<a href="/shop">', "not a url").length === 0);
}

console.log("\n— conversion issues from the page itself —");
{
  const bare = readSiteFacts("<html><body>Hello</body></html>", "http://plain.example/");
  const issues = literalConversionIssues(bare, true);
  ok("no https is flagged", issues.some((i) => /secure/.test(i.issue)));
  ok("no phone layout is flagged, high impact", issues.some((i) => /phones/.test(i.issue) && i.severity === "high"));
  ok("no pixel is flagged", issues.some((i) => /pixel/i.test(i.issue)));
  ok("no button is flagged", issues.some((i) => /button/.test(i.issue)));
  ok("a shop with no prices is flagged", issues.some((i) => /prices/.test(i.issue)));
  const good = literalConversionIssues(readSiteFacts(HTML, "https://stride.example/"), true);
  ok("a well-set-up page has no literal issues", good.length === 0, good.map((i) => i.issue).join());
}

console.log("\n— prices are never invented —");
{
  const facts = [readSiteFacts(HTML, "https://stride.example/")];
  const ai = {
    products: [
      { name: "Stride One", price: "$129.00", category: null, notes: null },
      { name: "Stride Two", price: "$89", category: null, notes: null },
    ],
    averageOrderValue: "$120–$140",
  } as unknown as AiBusinessAnalysis;
  const checked = onlyShownPrices(ai, facts);
  ok("a price on the page is kept", checked.products[0].price === "$129.00");
  ok("a price the page never showed is dropped", checked.products[1].price === null);
  const noPrices = onlyShownPrices(ai, [readSiteFacts("<p>Hello</p>", "https://a.example/")]);
  ok("no average order value when the site shows no prices", noPrices.averageOrderValue === "");
}

console.log("\n— the Business Brain —");
{
  const current = { ...EMPTY_PROFILE, brandVoice: "Warm and plain", overview: "Old overview" };
  const merged = mergeAnalysis(current, { brandVoice: "Corporate", overview: "New overview", offers: [] }, ["brandVoice"]);
  ok("a hand-edited field survives a new analysis", merged.brandVoice === "Warm and plain");
  ok("other fields take the new value", merged.overview === "New overview");
  ok("an empty finding doesn't erase what was there", mergeAnalysis({ ...EMPTY_PROFILE, offers: ["Free shipping"] }, { offers: [] }, []).offers[0] === "Free shipping");

  const s = sanitizeProfile({ overview: "x".repeat(5000), brandColors: ["#fff", "red", "#12345"], products: [{ name: "A", price: 5 }], profitMarginPercent: 140 });
  ok("long text is trimmed, not refused", s.overview?.length === 2000);
  ok("invalid colours are dropped", s.brandColors?.join() === "#fff,#12345");
  ok("a non-text price becomes null", s.products?.[0].price === null);
  ok("margin is capped at 100", s.profitMarginPercent === 100);

  const facts = brainFacts({ ...EMPTY_PROFILE, overview: "Running shoes.", products: [newProduct({ name: "Stride One", price: "$129" })], offers: ["Free shipping over $100"] });
  ok("ad facts include products and offers", /Stride One \(\$129\)/.test(facts.offering) && /Free shipping/.test(facts.offering));
}

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
