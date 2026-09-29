// Checks the rules behind Mairo Decisions and the guardrails around them.
//
//   npm run check:decisions
//
// These rules move people's advertising money, so the things asserted here
// are the promises: nothing fires during the learning period, nothing is
// invented to fill the page, budgets move rather than grow unless the
// customer approves, and the customer's limits hold even when they approve.

import { EMPTY_METRICS, type PlatformMetrics } from "@/lib/ad-platforms/types";
import { decide, pastLearning, weekKey, MAX_DECISIONS } from "@/lib/decisions/rules";
import { actionFor, limitProblem, mayAutoApply, describeChange } from "@/lib/decisions/guardrails";
import { editsAllowed } from "@/lib/decisions/apply";
import { DEFAULT_GUARDRAILS, windows } from "@/lib/decisions/gather";
import type { AdSnapshot, CampaignSnapshot, DecisionChange, DecisionInput } from "@/lib/decisions/types";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

const NOW = new Date("2026-09-29T12:00:00Z");
const DAY = 86_400_000;

function m(p: Partial<PlatformMetrics>): PlatformMetrics {
  return { ...EMPTY_METRICS, ...p };
}

function ad(i: number, p: Partial<AdSnapshot> = {}): AdSnapshot {
  return {
    label: `Creative #${i + 1}`,
    campaignAdId: `ad${i}`,
    kind: "IMAGE",
    externalAdId: `ext-ad-${i}`,
    headline: "H",
    primaryText: "T",
    recent: null,
    prior: null,
    week: null,
    ...p,
  };
}

function campaign(p: Partial<CampaignSnapshot> = {}): CampaignSnapshot {
  return {
    mairoCampaignId: "c1",
    name: "Spring sale",
    objective: "SALES",
    status: "ACTIVE",
    platform: "META",
    platformCampaignId: "pc1",
    externalCampaignId: "ext-c1",
    externalAdGroupId: "ext-g1",
    dailyBudgetCents: 4000,
    liveSince: new Date(NOW.getTime() - 14 * DAY),
    recent: null,
    prior: null,
    week: m({ spendCents: 28000, impressions: 20000, reach: 9000, clicks: 400, purchases: 12, conversions: 12 }),
    ads: [ad(0)],
    audience: { geoKey: null, geoLabel: null, geoRadius: null, ageMin: 18, ageMax: 65, specialAdCategory: null, advantageAudience: false },
    destinationType: "WEBSITE",
    destinationUrl: "https://example.com",
    canPauseAd: true,
    canChangeAudience: true,
    ...p,
  };
}

function input(campaigns: CampaignSnapshot[], p: Partial<DecisionInput> = {}): DecisionInput {
  return { now: NOW, campaigns, guardrails: DEFAULT_GUARDRAILS, landing: {}, ...p };
}

console.log("\n— it waits for enough data —");
{
  const young = campaign({ liveSince: new Date(NOW.getTime() - 1 * DAY) });
  ok("a 1-day-old campaign isn't past learning", !pastLearning(young, NOW));
  const cheap = campaign({ week: m({ spendCents: 1500 }) });
  ok("$15 spent isn't past learning", !pastLearning(cheap, NOW));
  ok("a paused campaign isn't judged", !pastLearning(campaign({ status: "PAUSED" }), NOW));

  const run = decide(input([young]));
  ok("a young campaign produces no decisions", run.decisions.length === 0);
  ok("and says it's still learning", run.dataStatus === "learning", run.dataStatus);
  ok("no campaigns says so", decide(input([])).dataStatus === "no-campaigns");
  const steady = decide(
    input([
      campaign({
        ads: [
          ad(0, { week: m({ spendCents: 14000, purchases: 6 }) }),
          ad(1, { week: m({ spendCents: 14000, purchases: 6 }) }),
        ],
      }),
    ]),
  );
  ok("a steady campaign with nothing wrong has nothing to decide", steady.decisions.length === 0, steady.decisions.map((d) => d.kind).join());
  const single = decide(input([campaign()]));
  ok("one ad doing well gets a test suggestion, nothing else", single.decisions.map((d) => d.kind).join() === "test-variation", single.decisions.map((d) => d.kind).join());
}

console.log("\n— not spending —");
{
  const idle = campaign({ liveSince: new Date(NOW.getTime() - 3 * DAY), week: m({ spendCents: 0 }) });
  const run = decide(input([idle]));
  const d = run.decisions.find((x) => x.kind === "not-spending");
  ok("a switched-on campaign spending nothing is flagged", Boolean(d));
  ok("it's urgent and needs attention", d?.urgent === true && d.category === "NEEDS_ATTENTION");
  ok("it changes nothing by itself", d?.changes.every((c) => c.type === "guide") === true);
}

console.log("\n— pausing an ad that spends without results —");
{
  const c = campaign({
    ads: [
      ad(0, { week: m({ spendCents: 18000, purchases: 10, conversions: 10 }) }),
      ad(1, { week: m({ spendCents: 6000, purchases: 0, conversions: 0 }) }),
    ],
  });
  const d = decide(input([c])).decisions.find((x) => x.kind === "pause-ad");
  ok("the ad with no purchases is recommended for pausing", Boolean(d));
  const change = d?.changes[0];
  ok("it pauses Creative #2, not the winner", change?.type === "pause-ad" && change.externalAdId === "ext-ad-1");
  ok("it's low risk (reversible)", d?.risk === "LOW");
  ok("it counts as pausing an underperformer", actionFor(d!.changes) === "pause-underperformer");

  const onlyOne = campaign({ ads: [ad(0, { week: m({ spendCents: 18000, purchases: 0 }) })] });
  ok("it never suggests pausing the only ad", !decide(input([onlyOne])).decisions.some((x) => x.kind === "pause-ad"));

  const unlucky = campaign({
    ads: [
      ad(0, { week: m({ spendCents: 18000, purchases: 10 }) }),
      ad(1, { week: m({ spendCents: 900, purchases: 0 }) }),
    ],
  });
  ok("an ad that has barely spent isn't judged", !decide(input([unlucky])).decisions.some((x) => x.kind === "pause-ad"));

  const noPause = campaign({ ...c, canPauseAd: false });
  ok("a network that can't pause single ads gets no pause decision", !decide(input([noPause])).decisions.some((x) => x.kind === "pause-ad"));
}

console.log("\n— creative fatigue —");
{
  const tired = ad(0, {
    recent: m({ impressions: 3000, clicks: 30 }), // 1.0%
    prior: m({ impressions: 4000, clicks: 80 }), // 2.0%
    week: m({ impressions: 7000, reach: 1800, clicks: 110 }), // freq 3.9
  });
  const d = decide(input([campaign({ ads: [tired] })])).decisions.find((x) => x.kind === "creative-fatigue");
  ok("a falling click rate with high frequency is flagged", Boolean(d));
  ok("it proposes a new version, not a pause", d?.changes[0]?.type === "new-ad-variation");
  ok("simple wording has no jargon", !/CTR|frequency/i.test(d?.noticed ?? ""), d?.noticed);
  ok("advanced wording names the metrics", /CTR/.test(d?.noticedAdvanced ?? "") && /frequency/i.test(d?.noticedAdvanced ?? ""));

  const fresh = ad(0, {
    recent: m({ impressions: 3000, clicks: 57 }),
    prior: m({ impressions: 4000, clicks: 80 }),
    week: m({ impressions: 7000, reach: 1800, clicks: 137 }),
  });
  ok("a small dip isn't fatigue", !decide(input([campaign({ ads: [fresh] })])).decisions.some((x) => x.kind === "creative-fatigue"));

  const existing = ad(0, { ...tired, kind: "EXISTING_AD" });
  const g = decide(input([campaign({ ads: [existing] })])).decisions.find((x) => x.kind === "creative-fatigue");
  ok("an existing ad (words can't change) gets a guide, not an automatic change", g?.changes[0]?.type === "guide");
}

console.log("\n— moving budget between campaigns —");
{
  const good = campaign({ mairoCampaignId: "good", platformCampaignId: "pg", externalCampaignId: "eg", name: "Good", dailyBudgetCents: 4000, week: m({ spendCents: 25000, purchases: 20 }) });
  const poor = campaign({ mairoCampaignId: "poor", platformCampaignId: "pp", externalCampaignId: "ep", name: "Poor", dailyBudgetCents: 4000, week: m({ spendCents: 25000, purchases: 6 }) });
  const d = decide(input([good, poor])).decisions.find((x) => x.kind === "shift-budget");
  ok("a much cheaper campaign gets budget from a dearer one", Boolean(d));
  const total = d?.changes.reduce((n, c) => (c.type === "set-budget" ? n + c.toCents - c.fromCents : n), 0);
  ok("the total daily budget doesn't change", total === 0, String(total));
  ok("it counts as a shift, not a raise", actionFor(d!.changes) === "shift-budget");
  const cut = d?.changes.find((c) => c.type === "set-budget" && c.campaignName === "Poor");
  ok("the move is inside the 15% shift limit", cut?.type === "set-budget" && cut.fromCents - cut.toCents <= 4000 * 0.15 + 1);
  ok("amounts are whole dollars", d!.changes.every((c) => c.type !== "set-budget" || c.toCents % 100 === 0));

  const close = campaign({ ...poor, week: m({ spendCents: 25000, purchases: 17 }) });
  ok("a small difference isn't worth moving money over", !decide(input([good, close])).decisions.some((x) => x.kind === "shift-budget"));
  const otherGoal = campaign({ ...poor, objective: "LEADS", week: m({ spendCents: 25000, conversions: 6 }) });
  ok("campaigns after different things aren't compared", !decide(input([good, otherGoal])).decisions.some((x) => x.kind === "shift-budget"));
}

console.log("\n— raising a winner's budget —");
{
  const winner = campaign({ dailyBudgetCents: 4000, week: m({ spendCents: 27000, purchases: 15, roas: 3.1 }) });
  const d = decide(input([winner])).decisions.find((x) => x.kind === "scale-winner");
  ok("a campaign returning $3 per $1 and using its budget is offered more", Boolean(d));
  ok("that's a raise, which always needs approval", actionFor(d!.changes) === "raise-total-budget");
  ok("never automatic, even on Full Autopilot", !mayAutoApply("AUTOPILOT", d!.changes, { requireApprovalNewCreatives: false, requireApprovalAudience: false, requireApprovalPlatformShift: false }));
  const raise = d?.changes[0];
  ok("the raise is 20% or less", raise?.type === "set-budget" && raise.toCents - raise.fromCents <= 800);

  const noRevenue = campaign({ week: m({ spendCents: 27000, purchases: 15 }) });
  ok("cheap results alone, with no return or target to judge by, don't earn more budget", !decide(input([noRevenue])).decisions.some((x) => x.kind === "scale-winner"));
  const capped = decide(input([winner], { guardrails: { ...DEFAULT_GUARDRAILS, maxDailyBudgetCents: 4000 } }));
  ok("the daily maximum stops a raise it would break", !capped.decisions.some((x) => x.kind === "scale-winner"));
}

console.log("\n— widening an audience —");
{
  const local = campaign({
    week: m({ spendCents: 28000, impressions: 40000, reach: 9000, purchases: 5 }),
    audience: { geoKey: "123", geoLabel: "Austin", geoRadius: 10, ageMin: 25, ageMax: 45, specialAdCategory: null, advantageAudience: false },
  });
  const d = decide(input([local])).decisions.find((x) => x.kind === "widen-audience");
  ok("a saturated local audience gets a wider radius", d?.changes[0]?.type === "widen-audience" && d.changes[0].to.geoRadius === 20);
  ok("it's medium risk (learning restarts)", d?.risk === "MEDIUM");
  const advantage = campaign({ ...local, audience: { ...local.audience, advantageAudience: true } });
  ok("not when Meta already widens it (Advantage+)", !decide(input([advantage])).decisions.some((x) => x.kind === "widen-audience"));
}

console.log("\n— people click but don't buy —");
{
  const leaky = campaign({ week: m({ spendCents: 9000, clicks: 120, purchases: 0 }) });
  const probe = { ok: true as const, status: 200, finalUrl: "https://example.com", mobileReady: false, hasMetaPixel: true, title: null };
  const d = decide(input([leaky], { landing: { c1: probe } })).decisions.find((x) => x.kind === "landing-page");
  ok("clicks with no purchases points at the page", d?.category === "WEBSITE");
  ok("a page not built for phones makes it urgent", d?.urgent === true && /phone/i.test(d.whyItMatters));
}

console.log("\n— the page never overflows —");
{
  const many = Array.from({ length: 8 }, (_, i) =>
    campaign({ mairoCampaignId: `c${i}`, platformCampaignId: `p${i}`, name: `C${i}`, liveSince: new Date(NOW.getTime() - 5 * DAY), week: m({ spendCents: 0 }) }),
  );
  const run = decide(input(many));
  ok(`at most ${MAX_DECISIONS} decisions`, run.decisions.length <= MAX_DECISIONS, String(run.decisions.length));
  ok("urgent ones first", run.decisions[0]?.urgent === true);
  ok("dedupe keys change week to week", weekKey(NOW) !== weekKey(new Date(NOW.getTime() + 7 * DAY)));
}

console.log("\n— guardrails —");
{
  const shift: DecisionChange[] = [
    { type: "set-budget", platform: "META", mairoCampaignId: "a", platformCampaignId: "pa", externalCampaignId: "ea", campaignName: "A", fromCents: 4000, toCents: 3400 },
    { type: "set-budget", platform: "META", mairoCampaignId: "b", platformCampaignId: "pb", externalCampaignId: "eb", campaignName: "B", fromCents: 4000, toCents: 4600 },
  ];
  const noHold = { requireApprovalNewCreatives: false, requireApprovalAudience: false, requireApprovalPlatformShift: false };
  ok("Manual never acts on its own", !mayAutoApply("MANUAL", shift, noHold));
  ok("AI Assist may move budget", mayAutoApply("ASSISTED", shift, noHold));
  const variation: DecisionChange[] = [{ type: "new-ad-variation", platform: "META", mairoCampaignId: "a", basedOnCampaignAdId: "x", basedOnLabel: "Creative #1", campaignName: "A" }];
  ok("a new creative waits when 'approve new creatives' is on", !mayAutoApply("AUTOPILOT", variation, { ...noHold, requireApprovalNewCreatives: true }));
  const audience: DecisionChange[] = [{ type: "widen-audience", platform: "META", mairoCampaignId: "a", campaignName: "A", from: { geoRadius: 10, ageMin: 18, ageMax: 65 }, to: { geoRadius: 20, ageMin: 18, ageMax: 65 } }];
  ok("AI Assist doesn't touch audiences", !mayAutoApply("ASSISTED", audience, noHold));
  ok("Full Autopilot may, unless held", mayAutoApply("AUTOPILOT", audience, noHold) && !mayAutoApply("AUTOPILOT", audience, { ...noHold, requireApprovalAudience: true }));
  ok("a guide is never 'applied' automatically", !mayAutoApply("AUTOPILOT", [{ type: "guide", label: "x", href: "/" }], noHold));

  ok("a move inside the limits is fine", limitProblem(shift, DEFAULT_GUARDRAILS, 8000) === null);
  const bigRaise: DecisionChange[] = [{ ...shift[1], type: "set-budget", toCents: 8000 } as DecisionChange];
  ok("a raise over the daily increase limit is refused even with approval", limitProblem(bigRaise, DEFAULT_GUARDRAILS, 8000) !== null);
  const smallRaise: DecisionChange[] = [{ ...shift[1], toCents: 4400 } as DecisionChange];
  ok("the account maximum holds", limitProblem(smallRaise, { ...DEFAULT_GUARDRAILS, maxDailyBudgetCents: 8200 }, 8000) !== null);
  const bigCut: DecisionChange[] = [{ ...shift[0], toCents: 1000 } as DecisionChange];
  ok("a cut past the decrease limit is refused", limitProblem(bigCut, DEFAULT_GUARDRAILS, 8000) !== null);

  ok("edits may change amounts", editsAllowed(shift, [shift[0], { ...shift[1], toCents: 4500 } as DecisionChange]));
  ok("edits may not change what is changed", !editsAllowed(shift, [shift[0], { ...shift[1], platformCampaignId: "other" } as DecisionChange]));
  ok("edits may not add a change", !editsAllowed(shift, [...shift, shift[0]]));
  ok("changes read as before and after", describeChange(shift[0]).before === "$40/day" && describeChange(shift[0]).after === "$34/day");
}

console.log("\n— the windows —");
{
  const w = windows(NOW);
  ok("the last window ends yesterday (today is partial)", w.recent.until.toISOString().slice(0, 10) === "2026-09-28");
  ok("recent is 3 days", (w.recent.until.getTime() - w.recent.since.getTime()) / DAY === 2);
  ok("prior ends the day before recent starts", w.prior.until.getTime() + DAY === w.recent.since.getTime());
}

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
