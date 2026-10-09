// Checks how MAIRO counts what became of the people who got in touch.
//
//   npm run check:lead-outcomes
//
// A form filled in is a reported lead and nothing more until the business
// says otherwise; later steps include earlier ones (a customer was booked and
// was a good lead); spam isn't a lead; nothing is counted as revenue unless
// the business gave a value; costs are never "$0 per customer"; and anything
// unmarked is said to be unmarked rather than looking like a zero.

import assert from "node:assert/strict";
import { costPer, leadFunnel, outcomeSummary } from "../src/lib/leads/outcomes";
import type { LeadStatus } from "../src/generated/prisma/enums";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const rows = (...s: [LeadStatus, number?][]) => s.map(([status, valueCents]) => ({ status, valueCents: valueCents ?? null }));

check("every lead starts as reported only", () => {
  const f = leadFunnel(rows(["NEW"], ["NEW"], ["NEW"]));
  assert.deepEqual([f.reported, f.real, f.qualified, f.booked, f.won, f.unmarked], [3, 3, 0, 0, 0, 3]);
  assert.equal(f.wonValueCents, null);
});

check("later steps include earlier ones; spam isn't a lead; not-a-fit isn't progress", () => {
  const f = leadFunnel(rows(["QUALIFIED"], ["BOOKED"], ["WON", 120_000], ["LOST"], ["SPAM"], ["NEW"]));
  assert.equal(f.reported, 6);
  assert.equal(f.spam, 1);
  assert.equal(f.real, 5);
  assert.equal(f.qualified, 3);
  assert.equal(f.booked, 2);
  assert.equal(f.won, 1);
  assert.equal(f.lost, 1);
  assert.equal(f.unmarked, 1);
  assert.equal(f.wonValueCents, 120_000);
});

check("a customer with no value given adds nothing to revenue", () => {
  assert.equal(leadFunnel(rows(["WON"], ["WON"])).wonValueCents, null);
  assert.equal(leadFunnel(rows(["WON", 50_000], ["WON"])).wonValueCents, 50_000);
});

check("cost per result is never made up", () => {
  assert.equal(costPer(10_000, 4), 2_500);
  assert.equal(costPer(10_000, 0), null);
  assert.equal(costPer(null, 4), null);
  assert.equal(costPer(0, 4), null);
});

check("the summary says what came in, what's marked, and what isn't", () => {
  assert.equal(outcomeSummary(leadFunnel([]), 10_000), null);
  const s = outcomeSummary(leadFunnel(rows(["QUALIFIED"], ["BOOKED"], ["WON", 90_000], ["NEW"], ["SPAM"])), 30_000)!;
  assert.equal(s.headline, "4 enquiries came in · 3 good, 2 booked, 1 customer.");
  assert.match(s.detail!, /\$300\.00 in ads per customer/);
  assert.match(s.detail!, /\$900\.00 in jobs you recorded/);
  assert.match(s.detail!, /1 enquiry not marked yet/);
});

check("with nothing marked, no cost per customer is claimed", () => {
  const s = outcomeSummary(leadFunnel(rows(["NEW"], ["NEW"])), 20_000)!;
  assert.equal(s.headline, "2 enquiries came in.");
  assert.doesNotMatch(s.detail ?? "", /per customer|per booking|per good lead/);
  assert.match(s.detail!, /2 enquiries not marked yet/);
});

check("the cost shown is for the furthest step reached", () => {
  assert.match(outcomeSummary(leadFunnel(rows(["QUALIFIED"], ["QUALIFIED"])), 10_000)!.detail!, /\$50\.00 per good lead/);
  assert.match(outcomeSummary(leadFunnel(rows(["QUALIFIED"], ["BOOKED"])), 10_000)!.detail!, /\$100\.00 per booking/);
});

console.log(`\n${passed} checks passed.\n`);
