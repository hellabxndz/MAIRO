// Checks how MAIRO reads the campaigns already on a Meta ad account.
//
//   npm run check:account-history
//
// Meta's objectives (current and legacy) map to MAIRO's goals; states are
// plain; running campaigns come first; the link opens the right campaign in
// Ads Manager; and the Business Brain's summary says what happened — per goal,
// never ranking a website visit against a sale — without claiming cause or
// passing the history off as MAIRO's own.

import assert from "node:assert/strict";
import { EMPTY_METRICS } from "../src/lib/ad-platforms/types";
import { adsManagerUrl, goalFromObjective, historyBrief, historyPoints, sortCampaigns, stateOf, type AccountCampaign } from "../src/lib/meta/account-history-rules";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const now = new Date("2026-10-07T12:00:00Z");
const camp = (over: Partial<AccountCampaign> & { spend?: number; purchases?: number; leads?: number; visits?: number }): AccountCampaign => ({
  id: over.id ?? "c",
  name: over.name ?? "Campaign",
  goal: over.goal ?? "SALES",
  state: over.state ?? "ended",
  startedAt: over.startedAt ?? null,
  endedAt: over.endedAt ?? null,
  metrics:
    over.metrics !== undefined
      ? over.metrics
      : { ...EMPTY_METRICS, spendCents: over.spend ?? 0, purchases: over.purchases ?? null, leads: over.leads ?? null, landingPageViews: over.visits ?? null },
});

check("current and legacy objectives map to MAIRO's goals", () => {
  assert.equal(goalFromObjective("OUTCOME_SALES"), "SALES");
  assert.equal(goalFromObjective("CONVERSIONS"), "SALES");
  assert.equal(goalFromObjective("LEAD_GENERATION"), "LEADS");
  assert.equal(goalFromObjective("LINK_CLICKS"), "TRAFFIC");
  assert.equal(goalFromObjective("REACH"), "AWARENESS");
  assert.equal(goalFromObjective("APP_INSTALLS"), "APP_PROMOTION");
  assert.equal(goalFromObjective("POST_ENGAGEMENT"), "ENGAGEMENT");
});

check("an unknown objective never claims to have chased sales", () => {
  assert.equal(goalFromObjective("SOMETHING_NEW"), "ENGAGEMENT");
  assert.equal(goalFromObjective(undefined), "ENGAGEMENT");
});

check("states are plain, and a past end date means ended whatever Meta's status says", () => {
  assert.equal(stateOf("ACTIVE", null, now), "running");
  assert.equal(stateOf("CAMPAIGN_PAUSED", null, now), "paused");
  assert.equal(stateOf("WITH_ISSUES", null, now), "issues");
  assert.equal(stateOf("ARCHIVED", null, now), "ended");
  assert.equal(stateOf("ACTIVE", new Date("2026-01-01"), now), "ended");
});

check("running campaigns first, then the most recent", () => {
  const list = sortCampaigns([
    camp({ id: "old", state: "ended", startedAt: new Date("2025-01-01") }),
    camp({ id: "new", state: "ended", startedAt: new Date("2026-05-01") }),
    camp({ id: "live", state: "running", startedAt: new Date("2024-01-01") }),
  ]);
  assert.deepEqual(list.map((c) => c.id), ["live", "new", "old"]);
});

check("the Ads Manager link names the account and the campaign", () => {
  const u = new URL(adsManagerUrl("act_123", "999"));
  assert.equal(u.hostname, "adsmanager.facebook.com");
  assert.equal(u.searchParams.get("act"), "123");
  assert.equal(u.searchParams.get("selected_campaign_ids"), "999");
});

check("nothing to say when nothing ever spent", () => {
  assert.equal(historyBrief([]), null);
  assert.equal(historyBrief([camp({ spend: 0 }), camp({ metrics: null })]), null);
});

check("the Brain's summary: total, best per goal, made outside MAIRO, no cause", () => {
  const brief = historyBrief([
    camp({ name: "Spring sale", goal: "SALES", spend: 40_000, purchases: 20 }),
    camp({ name: "Summer sale", goal: "SALES", spend: 30_000, purchases: 30 }),
    camp({ name: "Blog traffic", goal: "TRAFFIC", spend: 10_000, visits: 500 }),
  ])!;
  assert.match(brief, /ran 3 campaigns/);
  assert.match(brief, /\$800/);
  assert.match(brief, /outside MAIRO/);
  // Per goal: the cheaper sales campaign is named, the dearer one isn't.
  assert.match(brief, /"Summer sale" .* 30 sales, about \$10\.00 each/);
  assert.doesNotMatch(brief, /Spring sale/);
  assert.match(brief, /"Blog traffic" .* 500 website visits/);
  assert.doesNotMatch(brief, /\bcaused\b|\bbecause of\b|\bguarantee/i);
  assert.match(brief, /not as a promise/);
});

check("the Brain page's figures match the brief: count, spend, best per goal", () => {
  const h = historyPoints([
    camp({ name: "Spring sale", goal: "SALES", spend: 40_000, purchases: 20 }),
    camp({ name: "Summer sale", goal: "SALES", spend: 30_000, purchases: 30 }),
    camp({ name: "One lead", goal: "LEADS", spend: 1_500, leads: 1 }),
    camp({ name: "Never spent", goal: "SALES", spend: 0 }),
  ])!;
  assert.equal(h.count, 3);
  assert.equal(h.spentCents, 71_500);
  assert.deepEqual(h.best.map((b) => [b.name, b.results, b.noun, b.eachCents]), [["Summer sale", 30, "sales", 1_000], ["One lead", 1, "lead", 1_500]]);
  assert.equal(historyBrief(h), historyBrief([camp({ name: "Spring sale", goal: "SALES", spend: 40_000, purchases: 20 }), camp({ name: "Summer sale", goal: "SALES", spend: 30_000, purchases: 30 }), camp({ name: "One lead", goal: "LEADS", spend: 1_500, leads: 1 })]));
  assert.equal(historyBrief(null), null);
});

check("spend with nothing countable says so rather than inventing a cost per result", () => {
  const brief = historyBrief([camp({ goal: "AWARENESS", spend: 5_000 })])!;
  assert.match(brief, /no cost per result to compare/);
});

console.log(`\n${passed} checks passed.\n`);
