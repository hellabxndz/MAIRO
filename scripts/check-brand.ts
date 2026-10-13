// Checks the brand check every ad's words go through: words to avoid stop
// the ad; offers, prices and claims the business hasn't confirmed are flagged
// (not blocked); and confirmed offers, current promotions and confirmed proof
// are never flagged. Pure.
//
//   npm run check:brand

import assert from "node:assert/strict";
import { brandAllows, brandCheck, NO_RULES, type BrandRules } from "../src/lib/brain/brand-check";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const RULES: BrandRules = {
  avoid: ["cheap", "no call-out fee"],
  offers: ["Free call-out before 6pm"],
  promotions: ["20% off boiler servicing until Friday"],
  proof: ["A fixed price agreed before any work starts", "Gas Safe registered and fully insured"],
};
const levels = (t: string, r = RULES) => brandCheck(t, r).map((f) => f.level);

check("a word to avoid stops the ad — whole words only, any case", () => {
  assert.deepEqual(levels("Cheap plumbers near you"), ["problem"]);
  assert.equal(brandAllows("Cheap plumbers near you", RULES), false);
  assert.equal(brandAllows("Cheapside plumbers", RULES), true, "not part of another word");
  assert.equal(brandAllows("No call-out fee, ever", RULES), false, "phrases too");
});
check("confirmed offers and current promotions are never flagged", () => {
  assert.deepEqual(brandCheck("Free call-out before 6pm today.", RULES), []);
  assert.deepEqual(brandCheck("20% off boiler servicing this week.", RULES), []);
});
check("an offer or price that isn't confirmed is flagged, not blocked", () => {
  const f = brandCheck("Get 50% off your first repair, from $49.", RULES);
  assert.ok(f.length === 2 && f.every((x) => x.level === "warning"), JSON.stringify(f));
  assert.match(f[0].text, /“50% off” isn't one of your confirmed offers/);
  assert.match(f[1].text, /“\$49”/);
  assert.equal(brandAllows("Get 50% off", RULES), true);
  assert.match(brandCheck("Free quote in minutes", RULES)[0].text, /“Free quote”/);
});
check("claims need confirmed proof: guarantees, superlatives, #1, licensed", () => {
  for (const t of ["Guaranteed same-day repairs", "The best plumber in town", "Bristol's #1 plumber", "Award-winning service", "Five-star service"]) {
    assert.deepEqual(levels(t), ["warning"], t);
  }
  assert.deepEqual(brandCheck("Fully insured and Gas Safe registered", RULES), [], "insured is in the confirmed proof");
});
check("nothing to say about plain, true words", () => {
  assert.deepEqual(brandCheck("Water coming through the ceiling? We pick up.", RULES), []);
  assert.deepEqual(brandCheck("Anything at all, 100% off, the best", NO_RULES).filter((f) => f.level === "problem"), []);
});
check("each finding once, however often it appears", () => {
  assert.equal(brandCheck("The best. Truly the best.", RULES).length, 1);
});

console.log(`\nBrand check: ${passed} checks passed.`);
