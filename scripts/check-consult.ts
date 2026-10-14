// Checks the free plan's consultation sections say only what's known:
//
//   - the business overview shows only facts given or read, each with where
//     it came from; MAIRO's own starting point is labelled as a suggestion;
//   - opportunities and growth actions follow from the facts, name only
//     things MAIRO does, and promise no results;
//   - three to five growth actions, each with a priority and what MAIRO does;
//   - each analysis step's result is that step's real output.
//
//   npm run check:consult   (pure)

import assert from "node:assert/strict";
import { buildPreview, emptyFacts, type PreviewFacts } from "../src/lib/preview/build";
import { exampleFacts } from "../src/lib/preview/example";
import { analysisSteps, businessOverview, growthActions, opportunities } from "../src/lib/preview/consult";
import { BANNED_CLAIMS } from "../src/lib/capabilities";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const typed = (patch: Partial<PreviewFacts>): PreviewFacts => {
  const f = { ...emptyFacts(null), ...patch, sources: {} as PreviewFacts["sources"] };
  for (const k of ["name", "offering", "customer", "location", "offer", "proof", "problem"] as const) if (f[k]) f.sources[k] = { from: "you" };
  return f;
};
const nova = typed({ name: "Nova Clothing", offering: "Premium streetwear clothing for young adults", location: "Ships across the US", businessType: "ecommerce", typeFrom: "you", goal: "sales" });
const plan = buildPreview(nova)!;
const all = [exampleFacts("shop"), exampleFacts("service"), exampleFacts("appointments"), nova];
const text = (f: PreviewFacts) => {
  const p = buildPreview(f)!;
  return JSON.stringify([businessOverview(f, p), opportunities(f, p, [], "novaclothing"), growthActions(f, p, [])]);
};

console.log("— business overview —");
check("only facts given or read appear, each with its source", () => {
  const o = businessOverview(nova, plan);
  assert.deepEqual(o.find((x) => x.label === "Business name"), { label: "Business name", value: "Nova Clothing", source: "You told MAIRO" });
  assert.ok(!o.some((x) => x.label === "A current offer"), "no offer was given, so none is shown");
  const who = o.find((x) => x.label === "Who it's for")!;
  assert.equal(who.source, "MAIRO's suggestion");
  assert.match(who.value, /starting point until you say more/);
  for (const x of businessOverview(exampleFacts("service"), buildPreview(exampleFacts("service"))!)) if (x.label !== "Main advertising objective") assert.equal(x.source, "Example", x.label);
});

console.log("\n— opportunities and growth actions —");
check("opportunities follow from what's missing, and invent nothing", () => {
  const opps = opportunities(nova, plan, [], null);
  assert.ok(opps.some((o) => o.area === "Offer" && /never invents a discount/.test(o.detail)));
  assert.ok(opps.some((o) => o.area === "Trust"));
  assert.ok(opps.some((o) => o.area === "Website" && /didn't read a website/.test(o.detail)));
  assert.ok(!opps.some((o) => o.area === "Social"), "no Instagram, no Instagram opportunity");
  assert.ok(opportunities(nova, plan, [], "novaclothing").some((o) => o.area === "Social" && /@novaclothing/.test(o.detail)));
  const withOffer = typed({ ...nova, offer: "Free shipping over $80", proof: "Designed in Austin" });
  const o2 = opportunities(withOffer, buildPreview(withOffer)!, [], null);
  assert.ok(o2.some((o) => o.area === "Offer" && /Free shipping over \$80/.test(o.detail)));
  assert.ok(!o2.some((o) => o.area === "Trust"));
});
check("three to five growth actions, most important first, each saying what MAIRO does", () => {
  for (const f of all) {
    const a = growthActions(f, buildPreview(f)!, []);
    assert.ok(a.length >= 3 && a.length <= 5, `${f.name}: ${a.length}`);
    assert.equal(a[0].priority, "High");
    const rank = { High: 0, Medium: 1, Low: 2 };
    for (let i = 1; i < a.length; i++) assert.ok(rank[a[i].priority] >= rank[a[i - 1].priority] || a[i - 1].priority === "Medium", `${f.name}: order`);
    for (const x of a) assert.ok(x.title && x.why && x.mairo, x.title);
  }
  assert.match(growthActions(nova, plan, [])[0].mairo, /switched off, and launches only when you approve/);
});
check("no forecasts, guarantees or unsupported networks", () => {
  for (const f of all) {
    const t = text(f);
    for (const b of BANNED_CLAIMS) assert.doesNotMatch(t, b.pattern, `${f.name}: ${b.why}`);
    assert.doesNotMatch(t, /\bwill (increase|grow|double|boost|bring)\b|\bguarantee|\bROAS of\b|\d+%\s+more|TikTok|Google Ads/i, f.name);
  }
});

console.log("\n— analysis steps —");
check("five steps, each result the real output of that step", () => {
  const opps = opportunities(nova, plan, [], null);
  const acts = growthActions(nova, plan, []);
  const s = analysisSteps(nova, plan, opps, acts);
  assert.deepEqual(s.map((x) => x.label), ["Understanding your business", "Identifying your ideal customers", "Exploring advertising opportunities", "Developing creative recommendations", "Building your personalized MAIRO growth plan"]);
  assert.equal(s[0].result, "Nova Clothing — Premium streetwear clothing for young adults. From what you told MAIRO.");
  assert.equal(s[1].result, plan.plan.audience);
  assert.match(s[2].result, new RegExp(`^${opps.length} found`));
  const n = plan.directions.length;
  assert.equal(s[3].result, `${n} ad concept${n === 1 ? "" : "s"} — ${plan.directions.map((d) => d.label.toLowerCase()).join(", ")}`);
  // With a customer, an offer and proof, all three concepts can be written.
  const rich = typed({ ...nova, customer: "Young adults into streetwear", offer: "Free shipping over $80", proof: "Designed in Austin" });
  const rp = buildPreview(rich)!;
  assert.equal(rp.directions.length, 3);
  assert.match(analysisSteps(rich, rp, opportunities(rich, rp, [], null), growthActions(rich, rp, []))[3].result, /^3 ad concepts — /);
  assert.match(s[4].result, new RegExp(`^${acts.length} recommended actions`));
  assert.match(analysisSteps(exampleFacts("shop"), buildPreview(exampleFacts("shop"))!, opps, acts)[0].result, /From the example business\.$/);
});

console.log(`\nConsult: ${passed} checks passed`);
