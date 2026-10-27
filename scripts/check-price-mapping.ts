// Checks that everything that touches a plan's price agrees on which Stripe
// price that is:
//
//   - checkout charges, the webhook recognises, and the setup page's price
//     check reads the same STRIPE_PRICE_* variable for each plan sold;
//   - the price check passes only when Stripe's amount is exactly the one the
//     pricing page shows, monthly, and names the mismatch otherwise (the
//     $139.00-on-the-page vs $139.99-in-Stripe case is the one that happened);
//   - no surface shows a price the plans file doesn't: the pricing page and
//     every price in the copy come from plans.ts, and the PlanConfig table's
//     price column (which would override it) isn't displayed anywhere.
//
// SIMULATED: Stripe is an in-memory stub. Which amounts the real Stripe
// prices have is what /aios/setup on the deployment answers.
//
//   npm run check:price-mapping   (pure; no database, no network)

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PLANS, SOLD_TIERS } from "../src/lib/plans";
import { priceEnvFor, priceIdFor, purchasableTiers, stripe, tierForPriceId } from "../src/lib/stripe/client";
import { checkPrices } from "../src/lib/stripe/price-check";

// Test values only. No real key or price id.
process.env.STRIPE_SECRET_KEY = "sk_test_price_mapping_stub";
const IDS: Record<string, string> = { PRO: "price_map_pro", SCALE_V2: "price_map_scale" };
for (const plan of PLANS) process.env[priceEnvFor(plan.tier)] = IDS[plan.tier];

// What the stubbed Stripe charges, per price id; changed by each case below.
let stripeSide: Record<string, { unit_amount: number; interval: string }> = {};
const client = stripe();
(client.prices as { retrieve: unknown }).retrieve = async (id: string) => {
  const p = stripeSide[id];
  if (!p) throw new Error(`no stub for ${id}`);
  return { id, unit_amount: p.unit_amount, currency: "usd", recurring: { interval: p.interval } };
};
const cents = (dollars: number) => Math.round(dollars * 100);
const matching = () => Object.fromEntries(PLANS.map((p) => [IDS[p.tier], { unit_amount: cents(p.priceMonthly), interval: "month" }]));

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return e === "generated" ? [] : files(full);
    return /\.(ts|tsx)$/.test(e) ? [full] : [];
  });
}
async function main() {
  console.log("— one price per plan, everywhere —");
  await check("the plans sold are exactly MAIRO Pro and MAIRO Scale", () => {
    assert.deepEqual(PLANS.map((p) => p.tier), ["PRO", "SCALE_V2"]);
    assert.deepEqual([...SOLD_TIERS].sort(), ["PRO", "SCALE_V2"]);
  });
  await check("checkout, the webhook and the price check use the same variable for each plan", async () => {
    stripeSide = matching();
    const report = await checkPrices();
    for (const plan of PLANS) {
      const env = priceEnvFor(plan.tier);
      assert.equal(priceIdFor(plan.tier as "PRO" | "SCALE_V2"), process.env[env], `${plan.name}: checkout reads ${env}`);
      assert.equal(tierForPriceId(IDS[plan.tier]), plan.tier, `${plan.name}: the webhook maps its price back to ${plan.tier}`);
      assert.equal(report.find((r) => r.tier === plan.tier)?.envName, env, `${plan.name}: the price check reads ${env}`);
    }
    assert.deepEqual(purchasableTiers(), ["PRO", "SCALE_V2"]);
  });
  await check("the two plans' prices are distinct, so the webhook can't confuse them", () => {
    assert.notEqual(process.env[priceEnvFor("PRO")], process.env[priceEnvFor("SCALE_V2")]);
    assert.equal(tierForPriceId("price_nobody_configured"), null, "an unknown price grants nothing");
  });

  console.log("\n— the price check catches what the page and Stripe disagree on —");
  await check("Stripe charging exactly the advertised amount, monthly, passes", async () => {
    stripeSide = matching();
    const report = await checkPrices();
    for (const plan of PLANS) {
      const r = report.find((x) => x.tier === plan.tier)!;
      assert.equal(r.state, "ok", `${plan.name}: ${r.detail}`);
      assert.equal(r.stripeCents, r.advertisedCents);
    }
  });
  await check("a page at $139.00 against Stripe at $139.99 is flagged, with both amounts", async () => {
    stripeSide = matching();
    const pro = PLANS.find((p) => p.tier === "PRO")!;
    const off = cents(pro.priceMonthly) === 13999 ? 13900 : 13999;
    stripeSide[IDS.PRO] = { unit_amount: off, interval: "month" };
    const r = (await checkPrices()).find((x) => x.tier === "PRO")!;
    assert.equal(r.state, "amount_mismatch");
    assert.match(r.detail ?? "", /\$139\.00/);
    assert.match(r.detail ?? "", /\$139\.99/);
  });
  await check("a yearly price behind a monthly plan is flagged", async () => {
    stripeSide = matching();
    stripeSide[IDS.SCALE_V2] = { unit_amount: cents(PLANS[1].priceMonthly), interval: "year" };
    assert.equal((await checkPrices()).find((x) => x.tier === "SCALE_V2")!.state, "wrong_interval");
  });

  console.log("\n— what customers are shown comes from the plans file —");
  const src = files("src").map((f) => [f, readFileSync(f, "utf8")] as const);
  await check("no page shows the PlanConfig table's price, which nothing keeps in step with Stripe", () => {
    const readers = src.filter(([f, s]) => /planWithOverrides\(/.test(s) && !f.endsWith("entitlements.ts"));
    assert.deepEqual(readers.map(([f]) => f), []);
  });
  await check("every price written into the copy is one of the plans' own prices", () => {
    const allowed = new Set(PLANS.map((p) => p.priceMonthly.toFixed(2)));
    const pricey = /MAIRO (Pro|Scale)[^$\n]{0,40}\$(\d{3}(?:\.\d{2})?)/g;
    const wrong: string[] = [];
    for (const [f, s] of src) for (const m of s.matchAll(pricey)) if (!allowed.has(Number(m[2]).toFixed(2))) wrong.push(`${f}: ${m[0]}`);
    assert.deepEqual(wrong, []);
  });

  console.log(`\nPrice mapping: ${passed} checks passed. SIMULATED Stripe — the real amounts are on /aios/setup.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
