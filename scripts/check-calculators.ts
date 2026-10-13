// Checks the arithmetic behind MAIRO's calculators — the free tools and the
// dashboard share these functions — and the copy tools built on owner input:
// the reference examples, every denominator, and the edge cases (zero,
// negative contribution, invalid rates, refunds, missing inputs) where a
// calculator must say "there's no answer" rather than show a wrong one.
//
//   npm run check:calculators   (pure; no database, no network)

import assert from "node:assert/strict";
import { adScenario, breakEven, lifetimeContribution, marginMarkup, monthlyOperatingProfit, money, priceForMargin, priceForMarkup, saleEconomics, serviceEconomics, spreadScenario, type SaleEconomics } from "../src/lib/calc/economics";
import { LEARNING_EVENTS_PER_WEEK, planBudget } from "../src/lib/calc/budget";
import { compareShopifyPlans, DEFAULT_RATES, RATES_CHECKED, SOURCES } from "../src/lib/calc/shopify-fees";
import { buildUtm, tidyValue } from "../src/lib/calc/utm";
import { ANGLES, generateHooks, suggestedPair } from "../src/lib/creative/hooks";
import { buildBrief } from "../src/lib/creative/brief";
import { checkOfferClarity } from "../src/lib/creative/offer-clarity";
import { READINESS_ITEMS, scoreReadiness } from "../src/lib/tools/readiness";
import { adLibraryUrl, hypothesesFrom } from "../src/lib/tools/ad-library";
import { AD_EXAMPLES } from "../src/lib/tools/ad-examples";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}
const close = (a: number | null | undefined, b: number, eps = 1e-9) => assert.ok(a !== null && a !== undefined && Math.abs(a - b) < eps, `${a} ≠ ${b}`);
function ok<T>(r: { ok: true; value: T } | { ok: false; problems: unknown }): T {
  assert.equal(r.ok, true, JSON.stringify(r));
  return (r as { ok: true; value: T }).value;
}
const fields = (r: { ok: boolean; problems?: { field: string }[] }) => (r.ok ? [] : r.problems!.map((p) => p.field));

console.log("— the reference examples —");
check("$100 sale, $60 variable costs → $40 contribution → 2.5x break-even ROAS", () => {
  const sale = ok(saleEconomics({ price: 100, productCost: 60 }));
  close(sale.contribution, 40);
  close(breakEven(sale).breakEvenRoas, 2.5);
  close(breakEven(sale).breakEvenCpa, 40);
});
check("$400 contribution per job, 20% lead-to-sale → $80 break-even CPL; a $100 reserve → $60 target CPL", () => {
  const s = ok(serviceEconomics({ jobValue: 400, jobCost: 0, rates: { mode: "total", leadToSalePct: 20 }, reservePerJob: 100 }));
  close(s.breakEvenCpl, 80);
  close(s.targetCpl, 60);
});
check("a booking funnel multiplies the conditional rates: 50% book × 40% buy = 20% lead-to-sale", () => {
  const s = ok(serviceEconomics({ jobValue: 500, jobCost: 100, rates: { mode: "two-step", leadToBookingPct: 50, bookingToSalePct: 40 } }));
  close(s.leadToSale, 0.2);
  close(s.breakEvenCpl, 80);
  close(s.breakEvenCostPerBooking, 160);
  close(s.leadsPerJob, 5);
});

console.log("\n— margin and markup —");
check("margin divides by price, markup by cost", () => {
  const m = ok(marginMarkup({ cost: 60, price: 100 }));
  close(m.profit, 40);
  close(m.margin, 0.4);
  close(m.markup, 40 / 60);
});
check("a zero price has no margin, a zero cost has no markup — neither is Infinity", () => {
  const a = ok(marginMarkup({ cost: 10, price: 0 }));
  assert.equal(a.margin, null);
  const b = ok(marginMarkup({ cost: 0, price: 10 }));
  assert.equal(b.markup, null);
  close(b.margin, 1);
});
check("pricing for a margin or markup, and no price gives a 100% margin", () => {
  close(ok(priceForMargin({ cost: 60, marginPct: 40 })).price, 100);
  close(ok(priceForMarkup({ cost: 60, markupPct: 50 })).price, 90);
  assert.deepEqual(fields(priceForMargin({ cost: 60, marginPct: 100 })), ["marginPct"]);
});
check("negative and missing inputs are refused with the field named", () => {
  assert.deepEqual(fields(marginMarkup({ cost: -1, price: 10 })), ["cost"]);
  assert.deepEqual(fields(marginMarkup({ cost: null, price: null })), ["cost", "price"]);
  assert.deepEqual(fields(marginMarkup({ cost: Number.NaN, price: 10 })), ["cost"]);
});

console.log("\n— contribution, refunds and break-even —");
check("discount, refunds and payment fees come off before contribution", () => {
  const s = ok(saleEconomics({ price: 100, discountPct: 10, refundPct: 5, productCost: 30, fulfilmentCost: 5, paymentFeePct: 3, paymentFeeFixed: 0.3, otherVariableCost: 2 }));
  close(s.netRevenue, 90 * 0.95);
  close(s.variableCosts, 30 + 5 + 2 + 90 * 0.03 + 0.3);
  close(s.contribution, 85.5 - 40);
});
check("a sale that loses money has no break-even ROAS, and says budget can't fix it", () => {
  const r = saleEconomics({ price: 50, productCost: 60 });
  const sale = ok(r);
  const b = breakEven(sale);
  assert.equal(b.breakEvenRoas, null);
  assert.equal(b.breakEvenCpa, null);
  assert.ok(r.ok && r.notes.some((n) => /can't fix that/.test(n)));
});
check("zero contribution is treated as no threshold, not a division by zero", () => {
  const b = breakEven(ok(saleEconomics({ price: 50, productCost: 50 })));
  assert.equal(b.breakEvenRoas, null);
});
check("a reserve that uses up the contribution leaves no target", () => {
  const sale = ok(saleEconomics({ price: 100, productCost: 60 }));
  const b = breakEven(sale, 40);
  assert.equal(b.targetCpa, null);
  close(breakEven(sale, 10).targetCpa, 30);
  close(breakEven(sale, 10).targetRoas, 100 / 30);
});
check("percentages outside 0–100 are refused", () => {
  assert.deepEqual(fields(saleEconomics({ price: 100, productCost: 10, refundPct: 120 })), ["refundPct"]);
  assert.deepEqual(fields(saleEconomics({ price: 100, productCost: 10, discountPct: -5 })), ["discountPct"]);
});

console.log("\n— ad scenarios —");
const sale: SaleEconomics = ok(saleEconomics({ price: 100, productCost: 60 }));
check("modeled clicks = budget ÷ CPC; sales = clicks × rate; contribution after ads = sales × contribution − spend", () => {
  const s = ok(adScenario({ budget: 1000, cpc: 2, conversionPct: 2 }, sale));
  close(s.clicks, 500);
  close(s.sales, 10);
  close(s.revenue, 1000);
  close(s.contributionAfterAds, 10 * 40 - 1000);
  close(s.roas, 1);
  close(s.costPerSale, 100);
});
check("a zero CPC or budget is refused; a zero conversion rate gives no cost per sale", () => {
  assert.deepEqual(fields(adScenario({ budget: 100, cpc: 0, conversionPct: 2 }, sale)), ["cpc"]);
  assert.deepEqual(fields(adScenario({ budget: 0, cpc: 1, conversionPct: 2 }, sale)), ["budget"]);
  assert.equal(ok(adScenario({ budget: 100, cpc: 1, conversionPct: 0 }, sale)).costPerSale, null);
});
check("the scenario spread is the owner's base ± a stated percentage, conversion capped at 100%", () => {
  const s = spreadScenario({ cpc: 2, conversionPct: 90 }, 25);
  close(s.conservative.cpc, 2.5);
  close(s.conservative.conversionPct, 67.5);
  close(s.optimistic.cpc, 1.5);
  close(s.optimistic.conversionPct, 100);
});

console.log("\n— lifetime contribution —");
check("orders compound by retention within the horizon only", () => {
  const l = ok(lifetimeContribution({ contributionPerOrder: 20, ordersPerYear: 3, years: 3, retentionPct: 50, reserve: 10 }));
  close(l.expectedOrders, 3 + 1.5 + 0.75);
  close(l.lifetimeContribution, 20 * 5.25);
  close(l.maxAcquisitionCost, 105 - 10);
  assert.equal(l.byYear.length, 3);
});
check("100% retention is linear; a reserve above the lifetime leaves nothing affordable", () => {
  close(ok(lifetimeContribution({ contributionPerOrder: 10, ordersPerYear: 2, years: 2, retentionPct: 100 })).lifetimeContribution, 40);
  assert.equal(ok(lifetimeContribution({ contributionPerOrder: 10, ordersPerYear: 1, years: 1, retentionPct: 100, reserve: 50 })).maxAcquisitionCost, null);
  assert.deepEqual(fields(lifetimeContribution({ contributionPerOrder: 10, ordersPerYear: 1, years: 0, retentionPct: 50 })), ["years"]);
});

console.log("\n— monthly operating profit —");
check("contribution less ads, fixed costs and software; never called net profit", () => {
  const r = monthlyOperatingProfit({ revenue: 20000, variableCosts: 9000, adSpend: 3000, fixedCosts: 5000, softwareFees: 149.99 });
  const m = ok(r);
  close(m.contribution, 11000);
  close(m.operatingProfit, 11000 - 3000 - 5000 - 149.99, 1e-6);
  close(m.roas, 20000 / 3000);
  close(m.adSpendAtBreakEven, 11000 - 5000 - 149.99, 1e-6);
  assert.ok(r.ok && r.notes.some((n) => /isn't net profit/.test(n)));
});
check("no ad spend gives no ROAS rather than Infinity", () => {
  assert.equal(ok(monthlyOperatingProfit({ revenue: 100, variableCosts: 10, adSpend: 0, fixedCosts: 0, softwareFees: 0 })).roas, null);
});

console.log("\n— service economics edge cases —");
check("a job that loses money, or no leads converting, gives no CPL threshold", () => {
  const a = serviceEconomics({ jobValue: 100, jobCost: 150, rates: { mode: "total", leadToSalePct: 20 } });
  assert.equal(ok(a).breakEvenCpl, null);
  assert.ok(a.ok && a.notes.some((n) => /loses money/.test(n)));
  const b = serviceEconomics({ jobValue: 400, jobCost: 0, rates: { mode: "total", leadToSalePct: 0 } });
  assert.equal(ok(b).breakEvenCpl, null);
});
check("at a known CPL: ad cost per paid job and what's left of the job", () => {
  const s = ok(serviceEconomics({ jobValue: 400, jobCost: 0, rates: { mode: "total", leadToSalePct: 20 }, currentCpl: 50 }));
  close(s.atCurrentCpl!.costPerJob, 250);
  close(s.atCurrentCpl!.leftPerJob, 150);
});
check("rates must be the right kind: both conditional rates are required in two-step mode", () => {
  assert.deepEqual(fields(serviceEconomics({ jobValue: 400, jobCost: 0, rates: { mode: "two-step", leadToBookingPct: 50, bookingToSalePct: null } })), ["bookingToSalePct"]);
});

console.log("\n— budget planner —");
check("uses the plan's thresholds and Meta's learning guideline", () => {
  const low = ok(planBudget({ dailyBudget: 8 }));
  assert.equal(low.learnsSlowly, true);
  assert.equal(low.audiences, 1);
  assert.equal(low.adVersions, 1);
  const high = ok(planBudget({ dailyBudget: 60, costPerResult: 10 }));
  assert.equal(high.audiences, 2);
  assert.equal(high.retargeting, true);
  close(high.learning!.resultsPerWeek, 42);
  assert.equal(high.learning!.reachesGuideline, false);
  close(high.learning!.dailyForGuideline, (LEARNING_EVENTS_PER_WEEK * 10) / 7);
  assert.ok(high.advice.some((a) => /only helps if each result still pays/.test(a)));
});
check("below Meta's minimum is said plainly", () => {
  assert.equal(ok(planBudget({ dailyBudget: 3 })).belowMinimum, true);
});

console.log("\n— Shopify fees —");
check("rates carry a date and sources; shopify payments vs another provider add the right fees", () => {
  assert.ok(RATES_CHECKED && SOURCES.length >= 2);
  const r = ok(compareShopifyPlans({ monthlySales: 10000, orders: 200, billing: "monthly", payments: "shopify" }));
  const basic = r.plans.find((p) => p.id === "basic")!;
  close(basic.cardFees, 10000 * 0.029 + 200 * 0.3, 1e-6);
  assert.equal(basic.shopifyTransactionFees, 0);
  const other = ok(compareShopifyPlans({ monthlySales: 10000, orders: 200, billing: "yearly", payments: "other", providerPct: 2.5, providerFixed: 0.2 }));
  const grow = other.plans.find((p) => p.id === "grow")!;
  close(grow.subscription, DEFAULT_RATES.find((x) => x.id === "grow")!.yearly);
  close(grow.shopifyTransactionFees, 100);
  close(grow.cardFees, 250 + 40);
});
check("edited rates are validated", () => {
  assert.ok(fields(compareShopifyPlans({ monthlySales: 100, orders: 1, billing: "monthly", payments: "shopify" }, [{ ...DEFAULT_RATES[0], cardPct: 50 }])).includes("rates.0.cardPct"));
});

console.log("\n— UTM links —");
check("adds tags, keeps existing query and fragment, replaces old utm values, keeps Meta's dynamic values literal", () => {
  const r = buildUtm({ url: "shop.example.com/offer?ref=1&utm_source=old#form", source: "facebook", medium: "paid social", campaign: "{{campaign.name}}", content: "{{ad.name}}" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.url, "https://shop.example.com/offer?ref=1&utm_source=facebook&utm_medium=paid%20social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}#form");
  assert.deepEqual(r.replaced, ["utm_source"]);
  assert.equal(tidyValue("Spring Sale 2026!"), "spring-sale-2026");
});
check("refuses an address that isn't a web page, and missing required tags", () => {
  const r = buildUtm({ url: "javascript:alert(1)", source: "", medium: "x", campaign: "y" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(r.problems.map((p) => p.field), ["url", "source"]);
});

console.log("\n— hooks —");
const hookInput = { offering: "emergency plumbing", customer: "homeowners", problem: "a burst pipe", outcome: "your water back on today", location: "Leeds" };
check("one hook per supported angle, all different, built only from the inputs", () => {
  const set = generateHooks(hookInput);
  const angles = set.hooks.map((h) => h.angle);
  assert.equal(new Set(angles).size, angles.length);
  assert.equal(new Set(set.hooks.map((h) => h.text)).size, set.hooks.length);
  assert.ok(set.hooks.length >= 5);
  for (const h of set.hooks) assert.doesNotMatch(h.text, /\d+%|\$\d|guarantee|#1|best|reviews?/i, h.text);
});
check("angles without their ingredient are skipped and listed, never invented", () => {
  const set = generateHooks(hookInput);
  const skipped = set.skipped.map((s) => s.angle);
  for (const a of ["offer", "proof", "objection", "moment"] as const) assert.ok(skipped.includes(a), a);
  assert.equal(set.hooks.length + set.skipped.length, ANGLES.length);
  assert.equal(generateHooks({ offering: "" }).hooks.length, 0);
});
check("the alternative wording is a different sentence for the same angle", () => {
  const a = generateHooks(hookInput, 0).hooks.find((h) => h.angle === "problem")!;
  const b = generateHooks(hookInput, 1).hooks.find((h) => h.angle === "problem")!;
  assert.notEqual(a.text, b.text);
});
check("a hook Meta would read as personal about the reader is flagged", () => {
  const set = generateHooks({ offering: "debt advice", problem: "Are you in debt" });
  assert.ok(set.hooks.find((h) => h.angle === "problem")!.warnings.some((w) => /personal/.test(w)));
});
check("the suggested pair is two different, clean angles", () => {
  const pair = suggestedPair(generateHooks(hookInput))!;
  assert.notEqual(pair[0].angle, pair[1].angle);
});

console.log("\n— brief and first test —");
check("one variable, a written decision rule, a duration from the owner's estimates", () => {
  const b = buildBrief({ business: "Brightwater", offering: "plumbing", goal: "leads", customer: "homeowners", message: "Leak help today", cta: "Call now", format: "picture", placements: ["feed", "reels"], variable: "hook", versionA: "A", versionB: "B", dailyBudget: 20, costPerResult: 15, resultsEach: 20 });
  assert.equal(b.test.budgetEach, 10);
  assert.equal(b.test.days, 30);
  assert.ok(b.test.rule.some((r) => /at least 20/.test(r)));
  assert.ok(b.test.warnings.some((w) => /about 30 days/.test(w)));
  assert.ok(b.specs.find((s) => s.placement === "reels")!.safe.includes("35%"));
});
check("a budget too small for two versions says so; identical versions are flagged", () => {
  const b = buildBrief({ business: "x", offering: "x", goal: "sales", customer: "", message: "m", cta: "Shop now", format: "picture", placements: [], variable: "visual", versionA: "same", versionB: "same", dailyBudget: 6 });
  assert.equal(b.test.versionsFit, false);
  assert.equal(b.test.warnings.length, 2);
});

console.log("\n— offer clarity —");
check("quotes vague words, unproven claims and an undated deadline; leaves trust as not checked", () => {
  const r = checkOfferClarity({ headline: "Innovative solutions for all your needs — the best in town!", subheadline: "Limited time only", cta: "Submit", offering: "roof repairs", location: "Leeds" });
  const by = (id: string) => r.checks.find((c) => c.id === id)!;
  assert.equal(by("plain").status, "not met");
  assert.match(by("plain").evidence!, /innovative/);
  assert.equal(by("claims").status, "not met");
  assert.equal(by("urgency").status, "not met");
  assert.equal(by("cta").status, "not met");
  assert.equal(by("what").status, "not met");
  assert.equal(by("where").status, "not met");
  assert.equal(by("trust").status, "not checked");
  assert.ok(r.questions.includes("What will this cost me?"));
});
check("a clear offer passes, and suggestions use only what the owner gave", () => {
  const r = checkOfferClarity({ headline: "Roof repairs in Leeds", subheadline: "Free quote within 48 hours", cta: "Get a free quote", offering: "roof repairs", location: "Leeds", priceOrFirstStep: "Free quote" });
  assert.equal(r.checks.filter((c) => c.status === "not met").length, 0);
  assert.ok(r.suggestions.cta.includes("Get a free quote"));
  const noFree = checkOfferClarity({ headline: "x", offering: "roof repairs", priceOrFirstStep: "From $250" });
  assert.ok(!noFree.suggestions.cta.some((c) => /free/i.test(c)));
});

console.log("\n— readiness, research and examples —");
check("readiness is a checklist count with blockers apart, never a prediction", () => {
  const all = Object.fromEntries(READINESS_ITEMS.map((i) => [i.id, "yes" as const]));
  assert.equal(scoreReadiness(all).verdict, "ready");
  const r = scoreReadiness({ ...all, margin: "no", photos: "unsure" });
  assert.equal(r.verdict, "fix-blockers");
  assert.deepEqual(r.blockersOpen.map((i) => i.id), ["margin"]);
  assert.deepEqual(r.recommendedOpen.map((i) => i.id), ["photos"]);
  assert.equal(scoreReadiness({}).verdict, "incomplete");
});
check("the Ad Library link is Meta's public search; notes become original hypotheses", () => {
  const u = new URL(adLibraryUrl("Brightwater Plumbing", "GB")!);
  assert.equal(u.hostname, "www.facebook.com");
  assert.equal(u.searchParams.get("q"), "Brightwater Plumbing");
  assert.equal(u.searchParams.get("country"), "GB");
  assert.equal(adLibraryUrl("", "US"), null);
  const h = hypothesesFrom([{ hook: "Leak?", offer: "10% off", format: "video", since: "", notes: "" }], "plumbing");
  assert.ok(h.length >= 2 && h.every((x) => !/copy their/i.test(x)));
});
check("every example ad is marked as an invented business", () => {
  for (const e of AD_EXAMPLES) assert.match(e.name, /\(invented\)$/, e.id);
  assert.ok(AD_EXAMPLES.length >= 10);
});
check("money formats in the chosen currency and shows a dash for no value", () => {
  assert.equal(money(80, "USD"), "$80.00");
  assert.equal(money(1234.5, "GBP"), "£1,235");
  assert.equal(money(null), "—");
});

console.log(`\nCalculators: ${passed} checks passed.`);
