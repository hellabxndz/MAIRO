// Checks the parts of conversion tracking that would silently produce wrong
// money. No database and no network — these are the pure decisions.
//
//   npm run check:tracking
//
// Three of these guard against failures that are invisible from both ends.
//
// The event id has to be reproducible by a browser from the same order id, or
// deduplication never happens and every online sale counts twice. A ROAS that
// is double the truth is worse than a missing one, because the customer
// increases their budget on the strength of it.
//
// The hashing has to match the networks' normalization exactly. A hash that is
// wrong in any detail does not match worse — it matches nobody, and no error is
// raised at either end.
//
// And the ROAS comparison has to be honest about which of two different
// numbers it is showing, including refusing to add up currencies it has no
// rate for.

import {
  deriveEventId,
  hashEmail,
  hashPhone,
  hashName,
  hashZip,
  normalizeCountry,
  countMatchFields,
} from "@/lib/tracking/hash";
import { compareRoas, explainReading, type MeasuredSales } from "@/lib/tracking/roas";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

/** What the snippet on the customer's thank-you page computes. */
function browserEventId(orderId: string | number): string {
  return "mairo_" + String(orderId).replace(/[^A-Za-z0-9_-]/g, "");
}

console.log("\n— the id that stops a sale counting twice —");
{
  // If these two ever disagree, deduplication stops happening and nothing
  // anywhere reports an error. This is the single most important check here.
  for (const id of ["1234", "gid://shopify/Order/99", "ORD-2026-001", 5550123, "#1042"]) {
    ok(
      `browser and server agree on ${JSON.stringify(id)}`,
      deriveEventId(String(id)) === browserEventId(id),
      `${deriveEventId(String(id))} vs ${browserEventId(id)}`
    );
  }
  ok("the same order always derives the same id", deriveEventId("1234") === deriveEventId("1234"));
  ok("different orders derive different ids", deriveEventId("1234") !== deriveEventId("1235"));
  ok("whitespace doesn't change it", deriveEventId(" 1234 ") === deriveEventId("1234"));
}

console.log("\n— email normalization —");
{
  const canonical = hashEmail("alex@example.com");
  ok("case is ignored", hashEmail("Alex@Example.COM") === canonical);
  ok("surrounding space is ignored", hashEmail("  alex@example.com  ") === canonical);
  ok("a different address hashes differently", hashEmail("sam@example.com") !== canonical);
  ok("nothing in means nothing out", hashEmail("") === null && hashEmail(null) === null);
  ok("a non-address is refused", hashEmail("not-an-email") === null);
  ok("it is irreversible", !String(canonical).includes("alex"));
  ok("it is a sha-256 hex digest", /^[0-9a-f]{64}$/.test(String(canonical)));
  // Gmail dots and +tags are deliberately NOT stripped: the browser sends the
  // address as typed, and normalizing further here would stop the two copies
  // of one conversion from matching each other.
  ok("a +tag is preserved", hashEmail("alex+shop@example.com") !== canonical);
}

console.log("\n— phone normalization —");
{
  const us = hashPhone("+1 (555) 012-3456");
  ok("punctuation is ignored", hashPhone("+15550123456") === us);
  ok("a national number needs a country to be usable", hashPhone("5550123456") === null);
  ok("with a country hint it resolves", hashPhone("555 012 3456", "1") === us);
  ok(
    "a UK trunk zero is dropped, not kept",
    hashPhone("07700 900123", "44") === hashPhone("+447700900123")
  );
  ok("too short is refused", hashPhone("+1234") === null);
  ok("too long for E.164 is refused", hashPhone("+1234567890123456") === null);
  ok("letters alone are refused", hashPhone("call me") === null);
}

console.log("\n— names, countries, postcodes —");
{
  ok("a name loses its accents", hashName("José") === hashName("jose"));
  ok("a name loses its spaces", hashName("Mary Anne") === hashName("maryanne"));
  ok("a country becomes two lowercase letters", normalizeCountry("US") === "us");
  ok("a bad country is dropped", normalizeCountry("USA") === null);
  ok("a UK postcode loses its space", hashZip("SW1A 1AA") === hashZip("sw1a1aa"));
  ok("a US ZIP+4 is cut to five", hashZip("94107-1234", "US") === hashZip("94107", "us"));
  ok("a non-US postcode keeps its shape", hashZip("94107-1234", "ca") !== hashZip("94107", "ca"));
}

console.log("\n— counting what a network has to match on —");
{
  ok(
    "empty and missing fields don't count",
    countMatchFields({ em: "x", ph: null, ip: undefined, ua: "" }) === 1
  );
  ok("nothing to match on is zero", countMatchFields({ a: null, b: undefined }) === 0);
}

console.log("\n— the two ROAS numbers —");
{
  const sales = (over: Partial<MeasuredSales> = {}): MeasuredSales => ({
    orderCount: 10,
    revenueCents: 100_000,
    currency: "USD",
    mixedCurrency: false,
    matchedCount: 10,
    unmatchedCount: 0,
    firstOrderAt: null,
    lastOrderAt: null,
    ...over,
  });

  const agreeing = compareRoas({
    spendCents: 25_000,
    attributedRevenueCents: 95_000,
    measured: sales(),
  });
  ok("measured ROAS is revenue over spend", agreeing.measuredRoas === 4);
  ok("attributed ROAS uses the network's own revenue", agreeing.attributedRoas === 3.8);
  ok("close enough figures are reported as agreeing", agreeing.reading === "agrees");

  const under = compareRoas({
    spendCents: 25_000,
    attributedRevenueCents: 30_000,
    measured: sales({ unmatchedCount: 4 }),
  });
  ok("a network seeing far less is under-reporting", under.reading === "under_reporting");
  ok(
    "and the explanation names the unmatched orders",
    explainReading(under.reading, under.unmatchedCount).includes("4 of your orders")
  );

  const over = compareRoas({
    spendCents: 25_000,
    attributedRevenueCents: 250_000,
    measured: sales(),
  });
  ok("a network claiming far more is over-claiming", over.reading === "over_claiming");
  ok(
    "and the explanation points at the event id",
    /event id/i.test(explainReading(over.reading, 0))
  );

  // Division by zero is the classic way a dashboard shows Infinity to a
  // customer. Both ROAS figures must be null, not NaN and not Infinity.
  const noSpend = compareRoas({
    spendCents: 0,
    attributedRevenueCents: 5_000,
    measured: sales(),
  });
  ok("no spend means no ROAS, not infinity", noSpend.measuredRoas === null && noSpend.attributedRoas === null);
  ok("and it is reported as no spend", noSpend.reading === "no_spend");

  const noOrders = compareRoas({
    spendCents: 25_000,
    attributedRevenueCents: 0,
    measured: sales({ orderCount: 0, revenueCents: 0 }),
  });
  ok("no orders is its own reading", noOrders.reading === "no_orders");
  ok("and measured ROAS is zero, not null", noOrders.measuredRoas === 0);

  const noAttribution = compareRoas({
    spendCents: 25_000,
    attributedRevenueCents: null,
    measured: sales(),
  });
  ok("a network reporting nothing is not treated as zero", noAttribution.attributedRoas === null);
  ok("and it is called out as missing attribution", noAttribution.reading === "no_attribution");
  ok(
    "the explanation blames the pixel, which is usually right",
    /pixel/i.test(explainReading(noAttribution.reading, 0))
  );

  // Mixed currency must survive the comparison as a flag rather than being
  // quietly summed — MAIRO holds no exchange rates.
  const mixed = compareRoas({
    spendCents: 25_000,
    attributedRevenueCents: 95_000,
    measured: sales({ mixedCurrency: true, currency: "GBP" }),
  });
  ok("mixed currency is carried through", mixed.mixedCurrency && mixed.currency === "GBP");
}

console.log("\n— money conversion —");
{
  // Both networks take whole currency units. Sending cents is a hundredfold
  // revenue error, which is the kind of bug that looks like a great week.
  const toUnits = (cents: number) => Number((cents / 100).toFixed(2));
  ok("4999 cents is 49.99", toUnits(4999) === 49.99);
  ok("1999 cents is 19.99, not 19.98", toUnits(1999) === 19.99);
  ok("a round number stays round", toUnits(5000) === 50);
  ok("zero stays zero", toUnits(0) === 0);

  // And the reverse, which the webhook does on the way in.
  const toCents = (units: number) => Math.round(units * 100);
  ok("19.99 is 1999 cents, not 1998", toCents(19.99) === 1999);
  ok("0.07 is 7 cents", toCents(0.07) === 7);
  ok("a big order survives the round trip", toUnits(toCents(12345.67)) === 12345.67);
}

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
