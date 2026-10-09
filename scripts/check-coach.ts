// Checks the MAIRO Performance Coach's promises.
//
//   npm run check:coach   (pure — no database, no network)
//
// The funnel keeps every number's source (Meta's lead count is never added
// to MAIRO's stored leads; an expected value is never revenue); rules stay
// quiet below their samples; each finding keeps what was observed apart from
// possible explanations and what's missing; a drop after the lead is never
// blamed on the ads; follow-up is judged only for a business that records it;
// a budget move keeps the total the same, stays inside the business's limits
// and isn't repeated after it was followed by worse results; dismissed
// situations aren't raised again; and a verdict says what followed a change,
// never that it caused it.

import assert from "node:assert/strict";
import { EMPTY_METRICS, type PlatformMetrics } from "../src/lib/ad-platforms/types";
import { DEFAULT_GUARDRAILS } from "../src/lib/decisions/gather";
import { diagnose, measureNow } from "../src/lib/coach/diagnose";
import { funnelFor } from "../src/lib/coach/funnel";
import { judge, judgeChange, NOT_PROOF, withoutRepeats } from "../src/lib/coach/verdict";
import type { CoachCampaign, CoachInput, CoachLead, Finding } from "../src/lib/coach/types";
import { cleanStageLabels, followUpOf, presetFor, stageLabels } from "../src/lib/leads/details";
import { tagFormUrl } from "../src/lib/leads/forms";
import type { LeadStatus } from "../src/generated/prisma/enums";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const DAY = 86_400_000;
const now = new Date("2026-10-20T15:00:00Z");
const day = (n: number) => new Date(Date.UTC(2026, 9, 20) - n * DAY);
const current = { since: day(14), until: day(1) };
const previous = { since: day(28), until: day(15) };
const m = (p: Partial<PlatformMetrics>): PlatformMetrics => ({ ...EMPTY_METRICS, ...p });
const labels = stageLabels(null, null);

const campaign = (p: Partial<CoachCampaign> = {}): CoachCampaign => ({
  mairoCampaignId: "c1",
  name: "Roof repair",
  objective: "LEADS",
  status: "ACTIVE",
  platform: "META",
  platformCampaignId: "pc1",
  externalCampaignId: "x1",
  dailyBudgetCents: 4000,
  liveSince: day(60),
  current: null,
  previous: null,
  ads: [],
  hostedForm: true,
  ...p,
});

let seq = 0;
const lead = (status: LeadStatus, daysAgo: number, p: Partial<CoachLead> = {}): CoachLead => ({
  id: `l${++seq}`,
  createdAt: new Date(now.getTime() - daysAgo * DAY),
  status,
  source: "MAIRO_FORM",
  mairoCampaignId: "c1",
  firstContactedAt: null,
  appointmentAt: null,
  nextFollowUpAt: null,
  statusChangedAt: null,
  estimatedValueCents: null,
  valueCents: null,
  lostReason: null,
  ...p,
});

const input = (p: Partial<CoachInput> = {}): CoachInput => ({
  now,
  current,
  previous,
  campaigns: [],
  leads: [],
  tracking: { pixel: "firing", pixelLastFiredAt: day(1), storeConnected: false },
  guardrails: DEFAULT_GUARDRAILS,
  labels,
  orders: null,
  history: { worsened: [], dismissedKeys: [] },
  ...p,
});

const words = (f: Finding) => [f.title, f.plain, f.noticed, f.recommendation, ...f.explanations.map((e) => e.text), ...f.steps.map((s) => `${s.title} ${s.detail} ${s.benefit}`)].join(" ");

console.log("— the illustrative roofing business (test data only) —");
// $500 spent, 60 clicks, 12 leads, 4 good, 2 booked estimates, 0 customers.
const roofLeads = [
  lead("ESTIMATE_SENT", 10, { estimatedValueCents: 900_000 }),
  lead("ESTIMATE_SENT", 9, { estimatedValueCents: 1_200_000 }),
  lead("QUALIFIED", 8),
  lead("QUALIFIED", 6),
  lead("LOST", 9, { lostReason: "outside-area" }),
  lead("LOST", 8, { lostReason: "outside-area" }),
  lead("LOST", 7, { lostReason: "outside-area" }),
  lead("LOST", 6, { lostReason: "price" }),
  lead("LOST", 5, { lostReason: "price" }),
  lead("LOST", 5),
  lead("LOST", 4),
  lead("LOST", 4),
];
const roof = input({ campaigns: [campaign({ current: m({ spendCents: 50_000, clicks: 60, impressions: 9_000, reach: 4_000, conversions: 12 }) })], leads: roofLeads });

check("the funnel keeps each number's source", () => {
  const f = funnelFor(roof, "current");
  assert.equal(f.spendCents, 50_000);
  assert.equal(f.clicks, 60);
  assert.equal(f.leads, 12, "the leads MAIRO stored");
  assert.equal(f.metaLeads, 12, "Meta's count, kept separately");
  assert.equal(f.qualified, 4);
  assert.equal(f.appointments, 2, "an estimate sent counts as having been booked");
  assert.equal(f.estimates, 2);
  assert.equal(f.customers, 0);
  assert.equal(f.costPerQualifiedCents, 12_500);
  assert.equal(f.cacCents, null, "no customers: no cost per customer, never $0");
  assert.equal(f.verifiedRevenueCents, null, "no confirmed sales: no revenue");
  assert.equal(f.estimatedValueCents, 2_100_000, "expected values are kept apart as estimates");
  assert.equal(f.roasVerified, null);
});

check("spam with a logged contact isn't counted as a contacted lead", () => {
  const contactedAt = new Date(now.getTime() - 3 * DAY);
  const f = funnelFor(input({ leads: [lead("SPAM", 4, { firstContactedAt: contactedAt }), lead("SPAM", 4, { firstContactedAt: contactedAt }), lead("NEW", 4, { firstContactedAt: contactedAt }), lead("QUALIFIED", 4)] }), "current");
  assert.equal(f.leads, 2);
  assert.equal(f.contacted, 2, "never more contacted than leads");
});

check("a roofer with mostly poor leads hears about lead quality, with the reasons it recorded", () => {
  const r = diagnose(roof);
  const q = r.findings.find((f) => f.key === "quality:low");
  assert.ok(q, JSON.stringify(r.findings.map((f) => f.key)));
  assert.ok(q.explanations.some((e) => e.basis === "evidence" && /3 of the 8 leads you marked not a fit were outside your service area/.test(e.text)));
  assert.ok(q.explanations.some((e) => e.basis === "evidence" && /stopped over price/.test(e.text)));
  assert.match(q.recommendation, /location/i);
  assert.ok(q.agents.includes("AUDIENCE") && q.agents.includes("STRATEGIST"));
  assert.ok(q.missing.some((x) => /why some leads weren't a fit/i.test(x)), "names the reasons it lacks");
});

check("60 clicks isn't enough to judge the click-to-lead step; 0 customers from 2 bookings isn't judged", () => {
  const r = diagnose(roof);
  assert.ok(!r.findings.some((f) => f.category === "CONVERSION"));
  assert.ok(!r.findings.some((f) => /customer/i.test(f.title)));
});

check("low sales are never blamed on the advertising", () => {
  const r = diagnose(roof);
  for (const f of r.findings) assert.doesNotMatch(words(f), /(because of|caused by|due to) (your|the) (ads|advertising)|the ads are the problem|poor advertising/i);
  assert.match(r.whereItDrops ?? "", /lead quality/i);
});

console.log("\n— staying quiet on small samples —");
check("a handful of leads produces no findings", () => {
  const r = diagnose(input({ campaigns: [campaign({ current: m({ spendCents: 3_000, clicks: 20, impressions: 900 }) })], leads: [lead("LOST", 5), lead("QUALIFIED", 4), lead("NEW", 1)] }));
  assert.equal(r.findings.length, 0, JSON.stringify(r.findings.map((f) => f.key)));
  assert.equal(r.whereItDrops, null);
});

console.log("\n— follow-up —");
check("leads waiting over a day are raised — for a business that marks its leads", () => {
  const leads = [lead("QUALIFIED", 10), lead("LOST", 9), lead("QUALIFIED", 8), lead("NEW", 3), lead("NEW", 2), lead("NEW", 0.2)];
  const r = diagnose(input({ leads }));
  const w = r.findings.find((f) => f.key === "followup:waiting");
  assert.ok(w);
  assert.match(w.title, /^2 leads haven't been contacted/);
  assert.equal(w.confidence, "STRONG");
});

check("…but a business that never marks leads isn't nagged — it's shown how to let MAIRO see", () => {
  const r = diagnose(input({ leads: [lead("NEW", 5), lead("NEW", 4), lead("NEW", 3), lead("NEW", 2)] }));
  assert.ok(!r.findings.some((f) => f.category === "FOLLOW_UP"));
  assert.ok(r.gaps.some((g) => g.key === "mark-leads"));
});

check("slower follow-up is measured only from contacts the business logged", () => {
  const contacted = (daysAgo: number, afterHours: number) => {
    const createdAt = new Date(now.getTime() - daysAgo * DAY);
    return lead("CONTACTED", daysAgo, { createdAt, firstContactedAt: new Date(createdAt.getTime() + afterHours * 3_600_000) });
  };
  const leads = [...[20, 21, 22, 23, 24].map((d) => contacted(d, 2)), ...[3, 4, 5, 6, 7].map((d) => contacted(d, 20))];
  const r = diagnose(input({ leads }));
  const s = r.findings.find((f) => f.key === "followup:slower");
  assert.ok(s);
  assert.match(s.noticed, /20 hours in the last two weeks, against 2 hours before/);
  assert.equal(s.measure?.metric, "medianResponseHours");
  assert.match(s.limitations, /contacts you logged/);
  // A lead marked good later is not a contact: no response time without a log.
  assert.equal(funnelFor(input({ leads: [lead("QUALIFIED", 5)] }), "current").responseSample, 0);
});

console.log("\n— cost and its parts —");
check("rising cost per good lead names the steps that moved — and holds off more budget", () => {
  const goodNow = Array.from({ length: 6 }, (_, i) => lead("QUALIFIED", 4 + i));
  const goodBefore = Array.from({ length: 10 }, (_, i) => lead("QUALIFIED", 16 + i));
  const r = diagnose(
    input({
      campaigns: [campaign({ current: m({ spendCents: 60_000, impressions: 20_000, clicks: 200, reach: 9000 }), previous: m({ spendCents: 50_000, impressions: 20_000, clicks: 300, reach: 9000 }) })],
      leads: [...goodNow, ...goodBefore],
    }),
  );
  const f = r.findings.find((x) => x.key === "cost:qualified-rising");
  assert.ok(f, JSON.stringify(r.findings.map((x) => x.key)));
  assert.ok(f.explanations.some((e) => e.basis === "evidence" && /clicked the ads 33% less often/.test(e.text)));
  assert.ok(f.steps.some((s) => /Hold off on more budget/.test(s.title)));
  assert.ok(f.agents.includes("CREATIVE") && f.agents.includes("GROWTH"));
  for (const s of f.steps) assert.doesNotMatch(s.benefit, /\d+\s?%|guarantee|will (increase|double|grow)/i, "benefits never promise a number");
});

check("Meta's lead count and MAIRO's stored leads are never added together", () => {
  const f = funnelFor(input({ campaigns: [campaign({ current: m({ spendCents: 10_000, conversions: 9 }) })], leads: [lead("NEW", 3), lead("NEW", 4)] }), "current");
  assert.equal(f.leads, 2);
  assert.equal(f.metaLeads, 9);
  assert.equal(f.costPerLeadCents, 5_000, "costed on the leads MAIRO can see, not 11");
});

console.log("\n— moving budget by good leads —");
const two = () => [
  campaign({ mairoCampaignId: "a", name: "Gutters", platformCampaignId: "pa", externalCampaignId: "xa", dailyBudgetCents: 5000, current: m({ spendCents: 30_000 }) }),
  campaign({ mairoCampaignId: "b", name: "Roofs", platformCampaignId: "pb", externalCampaignId: "xb", dailyBudgetCents: 5000, current: m({ spendCents: 30_000 }) }),
];
const goodFor = (id: string, k: number) => Array.from({ length: k }, (_, i) => lead("QUALIFIED", 4 + (i % 8), { mairoCampaignId: id }));

check("a move toward cheaper good leads keeps the total, stays in limits and waits for approval", () => {
  const r = diagnose(input({ campaigns: two(), leads: [...goodFor("a", 15), ...goodFor("b", 5)] }));
  const f = r.findings.find((x) => x.key.startsWith("budget:quality-shift"));
  assert.ok(f?.change, JSON.stringify(r.findings.map((x) => x.key)));
  const [from, to] = f.change.changes as { fromCents: number; toCents: number; mairoCampaignId: string }[];
  assert.equal(from.mairoCampaignId, "b");
  assert.equal(to.mairoCampaignId, "a");
  assert.equal(from.fromCents - from.toCents, to.toCents - to.fromCents, "total daily budget unchanged");
  assert.ok(to.toCents - to.fromCents <= 5000 * (DEFAULT_GUARDRAILS.maxDailyIncreasePercent / 100));
  assert.ok(f.steps.some((s) => s.kind === "meta-change" && /approval/i.test(s.approval)));
  assert.ok(f.agents.includes("GUARDIAN") && f.agents.includes("ARCHITECT"));
});

check("…and isn't proposed again after a similar move was followed by worse results", () => {
  const r = diagnose(input({ campaigns: two(), leads: [...goodFor("a", 15), ...goodFor("b", 5)], history: { worsened: [{ kind: "coach-shift-qualified", mairoCampaignId: "a", at: day(20) }], dismissedKeys: [] } }));
  assert.ok(!r.findings.some((x) => x.change));
});

check("a situation the business dismissed isn't raised again", () => {
  const leads = [lead("QUALIFIED", 10), lead("LOST", 9), lead("QUALIFIED", 8), lead("NEW", 3), lead("NEW", 2)];
  const r = diagnose(input({ leads, history: { worsened: [], dismissedKeys: ["followup:waiting"] } }));
  assert.ok(!r.findings.some((f) => f.key === "followup:waiting"));
});

console.log("\n— tracking —");
check("form leads Meta never counted are raised, with the missing pixel as evidence", () => {
  const r = diagnose(input({ campaigns: [campaign({ current: m({ spendCents: 20_000, clicks: 80, conversions: 0 }) })], leads: [lead("NEW", 2), lead("NEW", 3), lead("NEW", 4), lead("NEW", 5), lead("NEW", 6)], tracking: { pixel: "none", pixelLastFiredAt: null, storeConnected: false } }));
  const f = r.findings.find((x) => x.key === "tracking:form-leads-not-counted");
  assert.ok(f);
  assert.ok(f.explanations.every((e) => e.basis === "evidence"));
  assert.ok(r.gaps.some((g) => g.key === "no-pixel"));
});

console.log("\n— every finding —");
check("observed, explained, recommended, bounded — never a made-up confidence number", () => {
  const all = [roof, input({ campaigns: two(), leads: [...goodFor("a", 15), ...goodFor("b", 5)] })].flatMap((i) => diagnose(i).findings);
  assert.ok(all.length >= 2);
  for (const f of all) {
    assert.ok(f.noticed && f.recommendation && f.limitations, f.key);
    assert.ok(f.explanations.length > 0, f.key);
    assert.ok(["STRONG", "SOME", "EARLY"].includes(f.confidence));
    assert.ok(f.steps.length > 0 && f.steps.every((s) => s.approval && s.verify && s.benefit), f.key);
    assert.doesNotMatch(`${f.title} ${f.plain}`, /\d+% (confidence|sure|certain)/i);
  }
});

console.log("\n— what followed a change —");
check("a verdict needs enough on both sides, and says it isn't proof", () => {
  assert.equal(judge(100, 80, "lower", true), "IMPROVED");
  assert.equal(judge(100, 110, "lower", true), "INCONCLUSIVE");
  assert.equal(judge(100, 130, "lower", true), "WORSENED");
  assert.equal(judge(0.3, 0.2, "higher", true), "WORSENED");
  assert.equal(judge(100, 50, "lower", false), "NOT_MEASURABLE");
  const thin = judgeChange("LEADS", m({ spendCents: 10_000, conversions: 3 }), m({ spendCents: 10_000, conversions: 9 }));
  assert.equal(thin.verdict, "NOT_MEASURABLE");
  const ok = judgeChange("LEADS", m({ spendCents: 20_000, conversions: 10 }), m({ spendCents: 20_000, conversions: 16 }));
  assert.equal(ok.verdict, "IMPROVED");
  assert.ok(ok.note.includes(NOT_PROOF));
  assert.doesNotMatch(ok.note, /because of the change|the change caused|thanks to/i);
});

check("a recommendation like one followed by worse results isn't repeated for 90 days", () => {
  const drafts = [{ kind: "scale-winner", mairoCampaignId: "c1" }, { kind: "scale-winner", mairoCampaignId: "c2" }, { kind: "pause-ad", mairoCampaignId: "c1" }];
  const r = withoutRepeats(drafts, [{ kind: "scale-winner", mairoCampaignId: "c1", at: day(30) }, { kind: "pause-ad", mairoCampaignId: "c1", at: day(120) }], now);
  assert.deepEqual(r.kept.map((d) => `${d.kind}:${d.mairoCampaignId}`), ["scale-winner:c2", "pause-ad:c1"]);
  assert.equal(r.held.length, 1);
});

check("an approved plan's figure is re-measured the same way it was found", () => {
  const leads = [lead("QUALIFIED", 10), lead("LOST", 9), lead("QUALIFIED", 8), lead("NEW", 3), lead("NEW", 2)];
  const v = measureNow(input({ leads }), { metric: "waitingForContact", value: 5, betterWhen: "lower", campaignId: null });
  assert.deepEqual(v, { value: 2, enough: true });
});

console.log("\n— lead records —");
check("stage names: the business's own, then its trade's, then MAIRO's", () => {
  assert.equal(presetFor("Roofing contractor")?.labels.BOOKED, "Inspection booked");
  const l = stageLabels("Roofing", JSON.stringify({ WON: "  Signed   contract ", NEW: "ignored", BOGUS: "x" }));
  assert.equal(l.BOOKED, "Inspection booked");
  assert.equal(l.WON, "Signed contract");
  assert.equal(l.NEW, "New");
  assert.deepEqual(cleanStageLabels({ QUALIFIED: "", LOST: 5, SPAM: "x".repeat(60) }), { SPAM: "x".repeat(40) });
});

check("follow-up state comes from what was recorded", () => {
  const base = { createdAt: new Date(now.getTime() - 30 * 3_600_000), firstContactedAt: null, nextFollowUpAt: null };
  assert.equal(followUpOf({ ...base, status: "NEW" }, now).state, "not-contacted");
  assert.equal(followUpOf({ ...base, status: "QUALIFIED" }, now).state, "fine", "marked good means dealt with");
  assert.equal(followUpOf({ ...base, status: "WON" }, now).state, "closed");
  assert.equal(followUpOf({ ...base, status: "CONTACTED", nextFollowUpAt: new Date(now.getTime() - 1000) }, now).state, "due");
});

check("only MAIRO's own form links carry the campaign", () => {
  assert.equal(tagFormUrl("https://mairo.app/f/abc123", "c9"), "https://mairo.app/f/abc123?c=c9");
  assert.equal(tagFormUrl("https://shop.example/contact", "c9"), "https://shop.example/contact");
  assert.equal(tagFormUrl(null, "c9"), null);
});

console.log(`\nPerformance Coach: ${passed} checks passed`);
