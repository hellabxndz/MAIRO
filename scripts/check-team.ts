// Checks the MAIRO AI Team's promises.
//
//   npm run check:team
//
// Eight specialties, each saying only what really happened: "Working" only
// while a run is in progress, "Monitoring" only after a recent check with
// something live (and called once-a-day, never continuous), failures shown
// as errors not hidden, approvals waiting shown as waiting; each decision
// belongs to the specialty that noticed it; the review's sentences say
// "too early" and "nothing to change" as plainly as a finding; and the
// Budget Guardian holds any change that goes over the customer's limits.

import assert from "node:assert/strict";
import { AGENTS, agentForDecision } from "../src/lib/team/agents";
import { agentStatus, DAILY_REVIEW_UTC, nextScheduledReview, STATE_LABEL, STUCK_AFTER_MS, teamWelcome, type AgentFacts } from "../src/lib/team/status";
import { readFileSync } from "node:fs";
import { guardianCheck, nothingToChange, proposalsByAgent, reviewSummary } from "../src/lib/team/review";
import type { DecisionDraft, Guardrails } from "../src/lib/decisions/types";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const now = new Date("2026-10-09T15:00:00");
const ago = (mins: number) => new Date(now.getTime() - mins * 60_000);
const base = (over: Partial<AgentFacts> = {}): AgentFacts => ({ role: "OPTIMIZER", now, metaConnected: true, liveCampaigns: 1, runs: [], pending: 0, waitingFor: null, attention: null, ...over });
const run = (status: "RUNNING" | "DONE" | "NOTHING" | "FAILED", mins: number, summary = "Looked at your results.") => ({ task: "x", status, summary, startedAt: ago(mins + 1), finishedAt: status === "RUNNING" ? null : ago(mins) });

check("eight specialties, each saying what it may do and what waits for you", () => {
  assert.equal(AGENTS.length, 8);
  assert.deepEqual(AGENTS.map((a) => a.role), ["STRATEGIST", "AUDIENCE", "CREATIVE", "ARCHITECT", "OPTIMIZER", "GUARDIAN", "ANALYST", "GROWTH"]);
  for (const a of AGENTS) assert.ok(a.does.length > 0 && a.runsOn.length > 0, a.role);
  assert.ok(AGENTS.find((a) => a.role === "ARCHITECT")!.asks.some((x) => /launch/i.test(x)));
  assert.ok(AGENTS.find((a) => a.role === "GUARDIAN")!.asks.some((x) => /increase/i.test(x)));
});

check("each decision belongs to the specialty that noticed it", () => {
  assert.equal(agentForDecision("widen-audience", "AUDIENCE"), "AUDIENCE");
  assert.equal(agentForDecision("test-variation", "CREATIVE"), "CREATIVE");
  assert.equal(agentForDecision("shift-budget", "BUDGET"), "OPTIMIZER");
  assert.equal(agentForDecision("scale-winner", "GROWTH"), "GROWTH");
  assert.equal(agentForDecision("not-spending", "NEEDS_ATTENTION"), "GUARDIAN");
  assert.equal(agentForDecision("strategy-promotion-urgency", "GROWTH"), "STRATEGIST");
  assert.equal(agentForDecision("something-new", "WEBSITE"), "ANALYST");
});

check("no Meta account: the agents that need it say so", () => {
  assert.equal(agentStatus(base({ metaConnected: false })).state, "CONNECT");
  assert.notEqual(agentStatus(base({ role: "STRATEGIST", metaConnected: false })).state, "CONNECT");
});

check("Working only while a run is genuinely in progress", () => {
  const s = agentStatus(base({ runs: [run("RUNNING", 2)] }));
  assert.equal(s.state, "WORKING");
  assert.ok(s.current);
  const stuck = agentStatus(base({ runs: [{ ...run("RUNNING", 0), startedAt: new Date(now.getTime() - STUCK_AFTER_MS - 60_000) }] }));
  assert.equal(stuck.state, "ERROR", "a run that never finished isn't 'working' forever");
});

check("a failure after the last success is shown as an error", () => {
  assert.equal(agentStatus(base({ runs: [run("FAILED", 10), run("DONE", 600)] })).state, "ERROR");
  assert.notEqual(agentStatus(base({ runs: [run("DONE", 10), run("FAILED", 600)] })).state, "ERROR");
});

check("waiting for approval when its recommendations are waiting", () => {
  const s = agentStatus(base({ pending: 2, runs: [run("DONE", 30)] }));
  assert.equal(s.state, "WAITING");
  assert.match(s.line, /2 recommendations waiting/);
});

check("monitoring scheduled: only after a recent check, with something live, and with its next check", () => {
  const s = agentStatus(base({ runs: [run("NOTHING", 60)] }));
  assert.equal(s.state, "MONITORING");
  assert.equal(s.label, "Monitoring scheduled");
  assert.match(s.line, /Next scheduled check/);
  assert.equal(s.nextCheck?.getTime(), nextScheduledReview(now).getTime());
  assert.doesNotMatch(s.line, /continuous|24\/7|constantly/i);
  assert.equal(agentStatus(base({ liveCampaigns: 0, runs: [run("NOTHING", 60)] })).state, "COMPLETED");
  assert.equal(agentStatus(base({ runs: [run("DONE", 60 * 48)] })).state, "COMPLETED");
});

check("the eight states carry the owner's words", () => {
  assert.deepEqual(Object.values(STATE_LABEL).sort(), ["Completed", "Connection required", "Failed", "Idle", "Monitoring scheduled", "Needs attention", "Waiting for approval", "Working"].sort());
});

check("the next scheduled check is the daily review in vercel.json", () => {
  const cron = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] }).crons.find((c) => c.path === "/api/cron/review")!;
  const [minute, hour] = cron.schedule.split(" ").map(Number);
  assert.deepEqual({ hour, minute }, { ...DAILY_REVIEW_UTC });
  assert.equal(nextScheduledReview(new Date("2026-10-09T08:00:00Z")).toISOString(), "2026-10-09T09:30:00.000Z");
  assert.equal(nextScheduledReview(new Date("2026-10-09T09:30:00Z")).toISOString(), "2026-10-10T09:30:00.000Z");
});

check("a failure says what failed, from its record", () => {
  const s = agentStatus(base({ runs: [{ ...run("FAILED", 10), summary: "Couldn't read your results from Meta this time." }] }));
  assert.equal(s.label, "Failed");
  assert.match(s.line, /Couldn't read your results from Meta/);
});

check("working shows the task in words, and never a spinner's promise", () => {
  const s = agentStatus(base({ runs: [{ ...run("RUNNING", 2), task: "read-results", summary: null }] }));
  assert.equal(s.current, "Reading your latest results");
  assert.match(s.line, /only while the task is actually running/);
});

check("times are in the business's own timezone", () => {
  const s = agentStatus(base({ timeZone: "America/Los_Angeles", runs: [{ ...run("DONE", 0), finishedAt: new Date("2026-10-09T16:00:00Z") }], now: new Date("2026-10-09T17:00:00Z") }));
  assert.match(s.line, /9:00 AM/, s.line);
});

check("recent history is the specialty's own finished runs, newest first", () => {
  const s = agentStatus(base({ runs: [run("RUNNING", 1), run("DONE", 30), run("FAILED", 60), run("NOTHING", 90), run("DONE", 120)] }));
  assert.equal(s.recent.length, 3);
  assert.deepEqual(s.recent.map((r) => r.status), ["DONE", "FAILED", "NOTHING"]);
});

check("idle when nothing has happened — never pretends", () => {
  const s = agentStatus(base({ runs: [], liveCampaigns: 0 }));
  assert.equal(s.state, "IDLE");
  assert.equal(s.lastDone, null);
  assert.equal(s.current, null);
});

check("needs attention when there's an urgent problem in its area", () => {
  assert.equal(agentStatus(base({ role: "GUARDIAN", attention: "There's no payment method on your Meta account." })).state, "ATTENTION");
});

const draft = (kind: string, category: DecisionDraft["category"], changes: DecisionDraft["changes"] = []): DecisionDraft => ({
  kind, category, urgent: false, mairoCampaignId: "c1", platform: "META", title: `Do ${kind}`, noticed: "n", noticedAdvanced: "n", whyItMatters: "w", recommendation: "r", impact: "i", risk: "LOW", confidence: "MEDIUM", evidence: [], changes, dedupeKey: kind, priority: 1,
});
const budget = (from: number, to: number) => ({ type: "set-budget" as const, platform: "META" as const, mairoCampaignId: "c1", platformCampaignId: "p1", externalCampaignId: "e1", campaignName: "Roof leads", fromCents: from, toCents: to });
const limits: Guardrails = { maxDailyBudgetCents: 5_000, maxDailyIncreasePercent: 20, maxDailyDecreasePercent: 50, maxBudgetShiftPercent: 20, minRoas: null, maxCpaCents: null };

check("proposals are grouped by who made them", () => {
  const g = proposalsByAgent([draft("widen-audience", "AUDIENCE"), draft("shift-budget", "BUDGET"), draft("pause-ad", "CREATIVE")]);
  assert.deepEqual([...g.keys()].sort(), ["AUDIENCE", "OPTIMIZER"]);
  assert.equal(g.get("OPTIMIZER")!.length, 2);
});

check("the Budget Guardian checks every budget change and holds the ones over your limits", () => {
  assert.equal(guardianCheck([draft("widen-audience", "AUDIENCE")], limits, 3_000).status, "NOTHING");
  const ok = guardianCheck([draft("shift-budget", "BUDGET", [budget(2_000, 2_200)])], limits, 3_000);
  assert.match(ok.summary, /within them/);
  const over = guardianCheck([draft("scale-winner", "GROWTH", [budget(2_000, 4_000)])], limits, 3_000);
  assert.match(over.summary, /over your limits/);
  assert.ok(over.detail);
});

check("too early and nothing to change are said plainly", () => {
  assert.match(nothingToChange("learning").summary, /still learning/);
  assert.match(nothingToChange("enough").summary, /found none right now/);
  assert.match(reviewSummary({ campaigns: 2, proposals: 0, autoApplied: 0, dataStatus: "enough" }).summary, /nothing needed changing/);
  assert.equal(reviewSummary({ campaigns: 2, proposals: 1, autoApplied: 0, dataStatus: "enough" }).summary, "Coordinated the daily review of 2 campaigns — 1 recommendation for you.");
});

check("the welcome line counts only what really happened", () => {
  const statuses = [agentStatus(base({ runs: [run("DONE", 30)] })), agentStatus(base({ role: "ANALYST", runs: [run("DONE", 40)] })), agentStatus(base({ role: "GROWTH", runs: [] }))];
  assert.equal(teamWelcome({ now, statuses, pending: 1, lastReviewAt: ago(30) }), "Your MAIRO AI Team last reviewed your campaigns today at 2:30 PM. 2 specialists finished work today, and 1 recommendation is waiting for your approval.");
  assert.match(teamWelcome({ now, statuses: [], pending: 0, lastReviewAt: null }), /ready\. It starts reviewing results once a campaign is live\./);
  assert.match(teamWelcome({ now, statuses: [], pending: 0, lastReviewAt: ago(30) }), /Nothing needs you right now/);
});

console.log(`\n${passed} checks passed.\n`);
