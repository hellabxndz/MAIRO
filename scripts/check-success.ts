// Checks the first-30-days journey.
//
//   npm run check:success
//
// Stages come in order and the first unfinished one is "current"; tracking is
// recommended, never required; a payment method Meta couldn't confirm is
// neither done nor "missing"; week 2 doesn't nag a business whose results
// haven't given MAIRO anything to change; the card goes away after the month
// or once everything's done; and an account stuck in a stage that started
// days ago is flagged for the MAIRO team.

import assert from "node:assert/strict";
import { successJourney, type JourneyFacts } from "../src/lib/success/journey";
import { accountHealth, programMetrics, type HealthInput } from "../src/lib/success/health";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const start = new Date("2026-10-01T09:00:00Z");
const at = (day: number) => new Date(start.getTime() + (day - 1) * 86_400_000 + 3_600_000);
const base: JourneyFacts = {
  startedAt: start,
  now: at(1),
  setupDone: true,
  metaConnected: false,
  subscribed: false,
  fundingConfirmed: null,
  trackingReady: false,
  campaignApproved: false,
  live: false,
  delivering: false,
  problems: 0,
  decisionsMade: 0,
  decisionsAnswered: 0,
  weeklyReports: 0,
  pulseAnswered: false,
};
const f = (over: Partial<JourneyFacts>) => ({ ...base, ...over });
const set = { metaConnected: true, subscribed: true, fundingConfirmed: true, campaignApproved: true } as const;

check("day 1: setup is current, and the next step is the first thing left", () => {
  const j = successJourney(base);
  assert.equal(j.day, 1);
  assert.equal(j.stages[0].state, "current");
  assert.deepEqual(j.stages.slice(1).map((s) => s.state), ["upcoming", "upcoming", "upcoming", "upcoming"]);
  assert.equal(j.next?.label, "Connect your Meta ad account");
  assert.ok(j.show);
});

check("tracking is recommended, never required", () => {
  const j = successJourney(f({ ...set }));
  assert.equal(j.stages[0].state, "done");
  assert.equal(j.stages[0].items.find((i) => i.label.includes("tracking"))!.optional, true);
});

check("a payment method Meta couldn't confirm isn't done, and says why", () => {
  const j = successJourney(f({ ...set, fundingConfirmed: null }));
  const item = j.stages[0].items.find((i) => i.label.includes("Payment"))!;
  assert.equal(item.done, false);
  assert.match(item.note!, /couldn't confirm/);
});

check("week 1: live, delivering, nothing blocking", () => {
  const j = successJourney(f({ ...set, now: at(4), live: true, delivering: false }));
  assert.equal(j.stages[1].state, "current");
  assert.equal(j.next?.label, "Ads are being shown and spending");
  assert.match(j.stages[1].note, /no conclusions|not conclusions/);
  const problems = successJourney(f({ ...set, now: at(4), live: true, delivering: true, problems: 2 }));
  assert.equal(problems.next?.label, "No problems blocking your ads");
});

check("week 2 doesn't nag when there's been nothing worth changing", () => {
  const early = successJourney(f({ ...set, now: at(10), live: true, delivering: true }));
  assert.equal(early.stages[2].state, "current");
  const later = successJourney(f({ ...set, now: at(15), live: true, delivering: true }));
  assert.equal(later.stages[2].state, "done");
  assert.match(later.stages[2].note, /hasn't seen anything worth changing/);
});

check("week 4: monthly results and the pulse question", () => {
  const j = successJourney(f({ ...set, now: at(29), live: true, delivering: true, decisionsMade: 2, decisionsAnswered: 1, weeklyReports: 3 }));
  assert.equal(j.stages[4].state, "current");
  assert.equal(j.next?.label, "Tell MAIRO how it's going");
  const all = successJourney(f({ ...set, now: at(29), live: true, delivering: true, decisionsMade: 2, decisionsAnswered: 1, weeklyReports: 3, pulseAnswered: true }));
  assert.equal(all.done, all.total);
  assert.equal(all.show, false, "a finished journey isn't shown");
});

check("after five weeks the card is gone whatever is left", () => {
  assert.equal(successJourney(f({ now: at(36) })).show, false);
});

check("stuck in a stage that started days ago is flagged for the team", () => {
  assert.equal(successJourney(f({ now: at(3) })).behind, false);
  assert.equal(successJourney(f({ now: at(8) })).behind, true);
});

const healthy: HealthInput = {
  journey: successJourney(f({ ...set, now: at(10), live: true, delivering: true, decisionsMade: 1, decisionsAnswered: 1 })),
  now: at(10),
  subscriptionStatus: "active",
  canceledAt: null,
  lastActiveAt: at(9),
  campaignProblems: 0,
  openProblems: 0,
  latestPulse: null,
  daysToFirstCampaign: 2,
  paid: true,
};

check("a business doing fine is on track, with nothing to say", () => {
  assert.deepEqual(accountHealth(healthy), { level: "healthy", flags: [] });
});

check("struggling says why, in sentences", () => {
  const h = accountHealth({ ...healthy, subscriptionStatus: "past_due", latestPulse: "NO", openProblems: 1, campaignProblems: 2 });
  assert.equal(h.level, "struggling");
  assert.deepEqual(h.flags, ["Payment is failing", "Said MAIRO isn't making advertising easier", "1 open problem report", "2 campaigns have an error or a rejected ad"]);
});

check("paid a week ago and nothing approved is struggling", () => {
  const h = accountHealth({ ...healthy, daysToFirstCampaign: null, journey: successJourney(f({ metaConnected: true, subscribed: true, now: at(9) })) });
  assert.equal(h.level, "struggling");
  assert.ok(h.flags.some((x) => /no campaign approved yet/.test(x)));
});

check("going quiet: watch at 10 days, struggling at 21", () => {
  assert.equal(accountHealth({ ...healthy, now: at(22), lastActiveAt: at(10) }).level, "watch");
  assert.equal(accountHealth({ ...healthy, now: at(33), lastActiveAt: at(10) }).level, "struggling");
});

check("a lukewarm answer is worth watching", () => {
  assert.equal(accountHealth({ ...healthy, latestPulse: "SOMEWHAT" }).level, "watch");
});

check("cancelled is its own state", () => {
  assert.equal(accountHealth({ ...healthy, canceledAt: at(5) }).level, "cancelled");
});

check("program numbers: activation, median time to first campaign, retention, the pulse", () => {
  const h = (level: "healthy" | "watch" | "struggling" | "cancelled") => ({ level, flags: [] });
  const m = programMetrics([
    { health: h("healthy"), activated: true, daysToFirstCampaign: 1, paid: true, payingNow: true, activeLast7: true, latestPulse: "YES" },
    { health: h("struggling"), activated: false, daysToFirstCampaign: null, paid: true, payingNow: true, activeLast7: false, latestPulse: "NO" },
    { health: h("healthy"), activated: true, daysToFirstCampaign: 5, paid: true, payingNow: true, activeLast7: true, latestPulse: null },
    { health: h("cancelled"), activated: true, daysToFirstCampaign: 3, paid: true, payingNow: false, activeLast7: false, latestPulse: "SOMEWHAT" },
  ]);
  assert.equal(m.accounts, 4);
  assert.equal(m.activatedPct, 75);
  assert.equal(m.medianDaysToFirstCampaign, 3);
  assert.equal(m.retainedPct, 75);
  assert.equal(m.activeLast7Pct, 50);
  assert.equal(m.easierPct, 33);
  assert.equal(m.pulseAnswers, 3);
  assert.equal(m.struggling, 1);
  assert.equal(m.cancelled, 1);
});

check("no answers is no number, not 0%", () => {
  const m = programMetrics([]);
  assert.equal(m.activatedPct, null);
  assert.equal(m.easierPct, null);
  assert.equal(m.medianDaysToFirstCampaign, null);
});

console.log(`\n${passed} checks passed.\n`);
