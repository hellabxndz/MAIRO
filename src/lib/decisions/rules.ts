import type { AdGoal, DecisionConfidence } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { resultsFor, resultWord, usd } from "@/lib/protection/rules";
import type {
  AdSnapshot,
  CampaignSnapshot,
  DataStatus,
  DecisionDraft,
  DecisionInput,
  DecisionRun,
  Evidence,
} from "./types";

// What Mairo Decisions notices, as rules over an account's own figures.
//
// Pure: no database, no network, no clock but the one passed in. Every rule
// is asserted in scripts/check-decisions.ts, which is what lets this file be
// trusted with somebody's advertising budget.
//
// Three commitments shape every rule:
//
//   It waits. Meta spends a campaign's first days learning who responds, and
//   judging it then has people change things that were about to work. Nothing
//   here fires before a campaign is past that (LEARNING_DAYS and
//   LEARNING_SPEND_CENTS, the same thresholds the campaign advice uses).
//
//   It compares the account with itself. No industry averages dressed up as
//   targets — a campaign is judged against its own last week, its sibling ads,
//   or the targets the customer set.
//
//   It says nothing rather than something weak. An account with nothing worth
//   changing gets no decisions, and the page says MAIRO is watching.

export const LEARNING_DAYS = 3;
export const LEARNING_SPEND_CENTS = 2000;
/** The smallest daily budget MAIRO will leave a campaign on. Meta's floor is lower; below this, learning stalls. */
export const MIN_CAMPAIGN_DAILY_CENTS = 500;
/** No more than this many at once. Five things to decide is already a lot. */
export const MAX_DECISIONS = 5;

const DAY = 86_400_000;

// --- figures -----------------------------------------------------------------

function results(objective: AdGoal, m: PlatformMetrics | null): number | null {
  return resultsFor(objective, m);
}

/** Cost per result in cents, when there were results to divide by. */
export function costPerResult(objective: AdGoal, m: PlatformMetrics | null): number | null {
  const r = results(objective, m);
  const spend = m?.spendCents ?? null;
  if (r === null || spend === null || r <= 0) return null;
  return Math.round(spend / r);
}

/** Clicks per impression, 0–1. Worked out here rather than trusting each network's unit. */
export function clickRate(m: PlatformMetrics | null): number | null {
  if (!m?.impressions || m.clicks === null) return null;
  return m.clicks / m.impressions;
}

/** How many times the average person saw it. */
export function frequency(m: PlatformMetrics | null): number | null {
  if (!m?.impressions || !m.reach) return null;
  return m.impressions / m.reach;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function daysLive(c: CampaignSnapshot, now: Date): number {
  return Math.floor((now.getTime() - c.liveSince.getTime()) / DAY);
}

/** Past the learning period, judged on the last week. */
export function pastLearning(c: CampaignSnapshot, now: Date): boolean {
  return (
    c.status === "ACTIVE" &&
    daysLive(c, now) >= LEARNING_DAYS &&
    (c.week?.spendCents ?? 0) >= LEARNING_SPEND_CENTS
  );
}

/**
 * How sure MAIRO can be, from how much it has seen.
 *
 * Results and spend together: twenty purchases on $100 is a pattern; two
 * purchases is an anecdote however much was spent getting them.
 */
export function confidenceFrom(resultCount: number, spendCents: number, days: number): DecisionConfidence {
  if (resultCount >= 20 && spendCents >= 10_000 && days >= 7) return "HIGH";
  if (resultCount >= 8 || spendCents >= 5_000) return "MEDIUM";
  return "EARLY";
}

/** ISO year-week, so a decision the customer turned down doesn't return the next morning. */
export function weekKey(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}w${week}`;
}

/** Whole dollars, in cents. Budgets MAIRO proposes are round numbers. */
function roundDollars(cents: number): number {
  return Math.round(cents / 100) * 100;
}

// --- the rules ---------------------------------------------------------------

type Rule = (c: CampaignSnapshot, input: DecisionInput) => DecisionDraft[];

/** Switched on for two days and nothing has been spent. */
const notSpending: Rule = (c, { now }) => {
  if (c.status !== "ACTIVE" || daysLive(c, now) < 2) return [];
  if ((c.week?.spendCents ?? 0) > 0) return [];
  return [
    {
      kind: "not-spending",
      category: "NEEDS_ATTENTION",
      urgent: true,
      mairoCampaignId: c.mairoCampaignId,
      platform: c.platform,
      title: `"${c.name}" is switched on but isn't spending`,
      noticed: `It has been on for ${daysLive(c, now)} days and nobody has been shown it yet.`,
      noticedAdvanced: `0 impressions and $0 spend over ${daysLive(c, now)} days while ACTIVE.`,
      whyItMatters:
        "Nothing is wrong with your money — none is being spent — but the campaign isn't doing anything either. The usual reasons are an ad still in Meta's review, a payment problem on the ad account, or an audience too small to reach.",
      recommendation: "Open the campaign. MAIRO shows Meta's review status and your payment status there.",
      impact: "Finding the blocker is what gets the campaign running at all.",
      risk: "LOW",
      confidence: "HIGH",
      evidence: [
        { label: "Days switched on", value: String(daysLive(c, now)) },
        { label: "Spent in the last week", value: "$0", advancedLabel: "Spend (7 days)" },
      ],
      changes: [{ type: "guide", label: "Open the campaign", href: `/dashboard/campaigns/${c.mairoCampaignId}` }],
      dedupeKey: `not-spending:${c.platformCampaignId}:${weekKey(now)}`,
      priority: 100,
    },
  ];
};

/** One ad spending without results while its siblings produce them. */
const pauseLoser: Rule = (c, { now }) => {
  if (!pastLearning(c, now) || !c.canPauseAd || c.ads.length < 2) return [];
  const word = resultWord(c.objective);
  const withResults = c.ads
    .map((ad) => ({ ad, results: results(c.objective, ad.week), spend: ad.week?.spendCents ?? 0 }))
    .filter((x) => x.results !== null);
  if (withResults.length < 2) return [];

  const producing = withResults.filter((x) => (x.results ?? 0) > 0);
  if (producing.length === 0) return [];
  const campaignCpr = costPerResult(c.objective, c.week);
  const best = producing.reduce((a, b) => (a.spend / (a.results ?? 1) <= b.spend / (b.results ?? 1) ? a : b));
  const bestCpr = best.spend / (best.results ?? 1);

  // The worst ad that is clearly worse, not just unlucky.
  const losers = withResults
    .filter((x) => x.ad !== best.ad)
    .filter((x) => {
      if ((x.results ?? 0) === 0) return x.spend >= Math.max(1500, 2 * (campaignCpr ?? bestCpr));
      return (best.results ?? 0) >= 3 && x.spend / (x.results ?? 1) >= 2 * bestCpr;
    })
    .sort((a, b) => b.spend - a.spend);
  const loser = losers[0];
  // Never switch off the last ad that is running.
  if (!loser || c.ads.length - 1 < 1) return [];

  const loserCpr = (loser.results ?? 0) > 0 ? loser.spend / (loser.results ?? 1) : null;
  const totalResults = producing.reduce((n, x) => n + (x.results ?? 0), 0);
  return [
    {
      kind: "pause-ad",
      category: "CREATIVE",
      urgent: (loser.results ?? 0) === 0,
      mairoCampaignId: c.mairoCampaignId,
      platform: c.platform,
      title: loserCpr === null
        ? `${loser.ad.label} in "${c.name}" has spent ${usd(loser.spend)} without a ${word}`
        : `${loser.ad.label} in "${c.name}" costs ${Math.round(loserCpr / bestCpr * 10) / 10}× as much per ${word}`,
      noticed: loserCpr === null
        ? `${loser.ad.label} has spent ${usd(loser.spend)} this week and brought in no ${word}s, while ${best.ad.label} brought in ${best.results}.`
        : `Each ${word} from ${loser.ad.label} costs ${usd(Math.round(loserCpr))}. From ${best.ad.label} it's ${usd(Math.round(bestCpr))}.`,
      noticedAdvanced: loserCpr === null
        ? `${loser.ad.label}: ${usd(loser.spend)} spend, 0 ${word}s (7d). ${best.ad.label}: ${best.results} ${word}s at ${usd(Math.round(bestCpr))} CPA.`
        : `${loser.ad.label} CPA ${usd(Math.round(loserCpr))} vs ${best.ad.label} CPA ${usd(Math.round(bestCpr))} (7d).`,
      whyItMatters: `Every dollar ${loser.ad.label} spends is a dollar ${best.ad.label} could have spent bringing in ${word}s more cheaply.`,
      recommendation: `Switch off ${loser.ad.label}. Meta moves its share of the budget to the other ads in the campaign by itself, so nothing else needs changing.`,
      impact: `More of this campaign's budget goes to the ads that are bringing in ${word}s. You can switch ${loser.ad.label} back on at any time.`,
      risk: "LOW",
      confidence: confidenceFrom(totalResults, c.week?.spendCents ?? 0, daysLive(c, now)),
      evidence: [
        { label: `${loser.ad.label} spent`, value: usd(loser.spend), advancedLabel: `${loser.ad.label} spend (7d)` },
        { label: `${loser.ad.label} ${word}s`, value: String(loser.results ?? 0) },
        { label: `${best.ad.label} ${word}s`, value: String(best.results ?? 0) },
        { label: `Cost per ${word}, ${best.ad.label}`, value: usd(Math.round(bestCpr)), advancedLabel: `${best.ad.label} CPA` },
      ],
      changes: [
        {
          type: "pause-ad",
          platform: c.platform,
          mairoCampaignId: c.mairoCampaignId,
          externalAdId: loser.ad.externalAdId,
          adLabel: loser.ad.label,
          campaignName: c.name,
        },
      ],
      dedupeKey: `pause-ad:${loser.ad.externalAdId}:${weekKey(now)}`,
      priority: 80,
    },
  ];
};

/** Fewer people clicking than last week, while the same people see it more. */
function fatigueOf(ad: Pick<AdSnapshot, "recent" | "prior" | "week">) {
  const recentCtr = clickRate(ad.recent);
  const priorCtr = clickRate(ad.prior);
  const freq = frequency(ad.week);
  if (recentCtr === null || priorCtr === null || freq === null || priorCtr === 0) return null;
  if ((ad.recent?.impressions ?? 0) < 1000 || (ad.prior?.impressions ?? 0) < 1000) return null;
  const drop = 1 - recentCtr / priorCtr;
  if (drop < 0.25 || freq < 3) return null;
  return { recentCtr, priorCtr, freq, drop };
}

const creativeFatigue: Rule = (c, { now }) => {
  if (!pastLearning(c, now)) return [];
  const out: DecisionDraft[] = [];
  for (const ad of c.ads) {
    const f = fatigueOf(ad);
    if (!f) continue;
    const canVary = Boolean(ad.campaignAdId) && (ad.kind === "IMAGE" || ad.kind === "VIDEO");
    const sure = (ad.recent?.impressions ?? 0) >= 5000 && (ad.prior?.impressions ?? 0) >= 5000;
    out.push({
      kind: "creative-fatigue",
      category: "CREATIVE",
      urgent: false,
      mairoCampaignId: c.mairoCampaignId,
      platform: c.platform,
      title: `${ad.label} in "${c.name}" is wearing out`,
      noticed: `People are seeing ${ad.label} too often, and fewer of them are clicking it — down ${pct(f.drop)} on the days before.`,
      noticedAdvanced: `CTR ${(f.recentCtr * 100).toFixed(2)}% (last 3d) vs ${(f.priorCtr * 100).toFixed(2)}% (prior 4d), −${pct(f.drop)}; frequency ${f.freq.toFixed(1)} (7d).`,
      whyItMatters: "An ad people have already seen several times stops working, and the platform keeps charging you to show it.",
      recommendation: canVary
        ? `Add a fresh version of ${ad.label}: same picture, new words written by MAIRO from what already works. It runs alongside the current one so Meta can compare them.`
        : `Make a fresh version of this ad in Creative Studio and add it to the campaign.`,
      impact: "A new version usually brings the click rate back up for a while. How much, and for how long, depends on the ad.",
      risk: "LOW",
      confidence: sure ? "HIGH" : "MEDIUM",
      evidence: [
        { label: "Clicks per 100 people, last 3 days", value: (f.recentCtr * 100).toFixed(2), advancedLabel: "CTR (3d)" },
        { label: "Clicks per 100 people, the 4 days before", value: (f.priorCtr * 100).toFixed(2), advancedLabel: "CTR (prior 4d)" },
        { label: "Times each person saw it, this week", value: f.freq.toFixed(1), advancedLabel: "Frequency (7d)" },
      ],
      changes: canVary
        ? [
            {
              type: "new-ad-variation",
              platform: c.platform,
              mairoCampaignId: c.mairoCampaignId,
              basedOnCampaignAdId: ad.campaignAdId!,
              basedOnLabel: ad.label,
              campaignName: c.name,
            },
          ]
        : [{ type: "guide", label: "Open Creative Studio", href: "/dashboard/creative-studio" }],
      dedupeKey: `fatigue:${ad.externalAdId}:${weekKey(now)}`,
      priority: 70,
    });
  }
  return out;
};

/** People click, but the page after the ad doesn't turn them into customers. */
const landingPage: Rule = (c, { now, landing }) => {
  if (!pastLearning(c, now)) return [];
  if (c.destinationType !== "WEBSITE" || (c.objective !== "SALES" && c.objective !== "LEADS")) return [];
  const clicks = c.week?.clicks ?? 0;
  const r = results(c.objective, c.week);
  if (clicks < 50 || r !== 0) return [];
  const word = resultWord(c.objective);
  const probe = landing[c.mairoCampaignId] ?? null;

  let finding = "MAIRO opened the page and it loads, so the problem is more likely what's on it: whether the next step is obvious, the price, or how long it takes on a phone.";
  let urgent = false;
  if (probe && !probe.ok) {
    finding = `MAIRO tried to open the page and couldn't: ${probe.message}`;
    urgent = true;
  } else if (probe && probe.ok && !probe.mobileReady) {
    finding = "MAIRO opened the page as a phone would and it isn't set up for phones — it likely shows zoomed out, which is where most of these clicks came from.";
    urgent = true;
  }

  return [
    {
      kind: "landing-page",
      category: "WEBSITE",
      urgent,
      mairoCampaignId: c.mairoCampaignId,
      platform: c.platform,
      title: `People click "${c.name}" but don't ${c.objective === "SALES" ? "buy" : "get in touch"}`,
      noticed: `${clicks} people clicked through this week and none became a ${word}.`,
      noticedAdvanced: `${clicks} link clicks, 0 ${word}s (7d). Conversion rate 0%.`,
      whyItMatters: `The ad is doing its job. Every click is paid for, and the page after it is where people stop. ${finding}`,
      recommendation: "Check the page on your phone, and let MAIRO's Business Analyzer look at it for what stops people.",
      impact: "Fixing the page makes every click you already pay for count for more.",
      risk: "LOW",
      confidence: clicks >= 150 ? "HIGH" : "MEDIUM",
      evidence: [
        { label: "Clicks this week", value: String(clicks), advancedLabel: "Link clicks (7d)" },
        { label: `${word[0].toUpperCase()}${word.slice(1)}s this week`, value: "0" },
        ...(c.destinationUrl ? [{ label: "Page", value: c.destinationUrl }] : []),
      ],
      changes: [{ type: "guide", label: "Analyze my website", href: "/dashboard/business" }],
      dedupeKey: `landing:${c.mairoCampaignId}:${weekKey(now)}`,
      priority: 65,
    },
  ];
};

/** The audience has been seen so often there's nobody new left to reach. */
const widenAudience: Rule = (c, { now }) => {
  if (!pastLearning(c, now) || !c.canChangeAudience || !c.externalAdGroupId) return [];
  if (c.audience.advantageAudience) return [];
  const freq = frequency(c.week);
  if (freq === null || freq < 3.5) return [];

  const from = { geoRadius: c.audience.geoRadius, ageMin: c.audience.ageMin, ageMax: c.audience.ageMax };
  let to = { ...from };
  let what = "";
  if (c.audience.geoKey && (c.audience.geoRadius ?? 10) < 40) {
    to = { ...from, geoRadius: Math.min(50, (c.audience.geoRadius ?? 10) + 10) };
    what = `reach ${to.geoRadius} miles around ${c.audience.geoLabel ?? "your area"} instead of ${from.geoRadius ?? 10}`;
  } else if (!c.audience.specialAdCategory && c.audience.ageMax - c.audience.ageMin < 30) {
    to = { ...from, ageMin: Math.max(18, from.ageMin - 5), ageMax: Math.min(65, from.ageMax + 5) };
    what = `include ages ${to.ageMin}–${to.ageMax} instead of ${from.ageMin}–${from.ageMax}`;
  } else {
    return [];
  }
  if (JSON.stringify(to) === JSON.stringify(from)) return [];

  return [
    {
      kind: "widen-audience",
      category: "AUDIENCE",
      urgent: false,
      mairoCampaignId: c.mairoCampaignId,
      platform: c.platform,
      title: `"${c.name}" is running out of new people`,
      noticed: `The same people have seen this campaign ${freq.toFixed(1)} times each this week.`,
      noticedAdvanced: `Frequency ${freq.toFixed(1)} (7d) on reach of ${c.week?.reach ?? "—"}.`,
      whyItMatters: "Once most of an audience has seen an ad several times, it gets more expensive to reach anyone who hasn't — and fewer people act on it.",
      recommendation: `Widen the audience slightly: ${what}.`,
      impact: "More new people to show the ad to. Meta re-learns for a few days after an audience change, so results can wobble before they settle.",
      risk: "MEDIUM",
      confidence: freq >= 5 ? "HIGH" : "MEDIUM",
      evidence: [
        { label: "Times each person saw it this week", value: freq.toFixed(1), advancedLabel: "Frequency (7d)" },
        { label: "People reached this week", value: String(c.week?.reach ?? "—"), advancedLabel: "Reach (7d)" },
      ],
      changes: [
        {
          type: "widen-audience",
          platform: c.platform,
          mairoCampaignId: c.mairoCampaignId,
          campaignName: c.name,
          from,
          to,
        },
      ],
      dedupeKey: `widen:${c.platformCampaignId}:${weekKey(now)}`,
      priority: 45,
    },
  ];
};

/** One ad has been doing well on its own; test a second version against it. */
const testVariation: Rule = (c, { now }) => {
  if (!pastLearning(c, now) || c.ads.length !== 1) return [];
  const ad = c.ads[0];
  if (!ad.campaignAdId || (ad.kind !== "IMAGE" && ad.kind !== "VIDEO")) return [];
  if (fatigueOf(ad)) return []; // The fatigue decision already covers it.
  const r = results(c.objective, c.week) ?? 0;
  if (r < 5) return [];
  const word = resultWord(c.objective);
  return [
    {
      kind: "test-variation",
      category: "TESTING",
      urgent: false,
      mairoCampaignId: c.mairoCampaignId,
      platform: c.platform,
      title: `Test a second version of "${c.name}"`,
      noticed: `This campaign runs one ad, and it brought in ${r} ${word}s this week.`,
      noticedAdvanced: `Single ad; ${r} ${word}s (7d). No live creative test.`,
      whyItMatters: "With only one version there's nothing to compare it with, and nothing ready when it starts to wear out.",
      recommendation: `Add a second version with new words written by MAIRO from ${ad.label}, same picture. Meta shows both and favours whichever does better.`,
      impact: "You find out whether different words do better, inside the same budget.",
      risk: "LOW",
      confidence: confidenceFrom(r, c.week?.spendCents ?? 0, daysLive(c, now)),
      evidence: [
        { label: `${word[0].toUpperCase()}${word.slice(1)}s this week`, value: String(r) },
        { label: "Ads in the campaign", value: "1" },
      ],
      changes: [
        {
          type: "new-ad-variation",
          platform: c.platform,
          mairoCampaignId: c.mairoCampaignId,
          basedOnCampaignAdId: ad.campaignAdId,
          basedOnLabel: ad.label,
          campaignName: c.name,
        },
      ],
      dedupeKey: `test:${c.platformCampaignId}:${weekKey(now)}`,
      priority: 30,
    },
  ];
};

// --- rules across campaigns ---------------------------------------------------

/** Two campaigns chasing the same result, one far cheaper: move some money. */
function shiftBudget(input: DecisionInput): DecisionDraft[] {
  const { now, guardrails: g } = input;
  const eligible = input.campaigns
    .filter((c) => pastLearning(c, now))
    .map((c) => ({ c, cpr: costPerResult(c.objective, c.week), r: results(c.objective, c.week) ?? 0 }))
    .filter((x) => x.cpr !== null);

  const out: DecisionDraft[] = [];
  const byGoal = new Map<AdGoal, typeof eligible>();
  for (const x of eligible) byGoal.set(x.c.objective, [...(byGoal.get(x.c.objective) ?? []), x]);

  for (const [goal, group] of byGoal) {
    if (group.length < 2) continue;
    const best = group.reduce((a, b) => (a.cpr! <= b.cpr! ? a : b));
    const worst = group.reduce((a, b) => (a.cpr! >= b.cpr! ? a : b));
    if (best === worst || best.r < 5) continue;
    if (worst.cpr! < best.cpr! * 1.4) continue;

    const limitPct = Math.min(g.maxBudgetShiftPercent, g.maxDailyDecreasePercent, 20) / 100;
    const raisePct = g.maxDailyIncreasePercent / 100;
    let move = Math.min(worst.c.dailyBudgetCents * limitPct, best.c.dailyBudgetCents * raisePct);
    move = roundDollars(Math.min(move, worst.c.dailyBudgetCents - MIN_CAMPAIGN_DAILY_CENTS));
    if (move < 100) continue;

    const word = resultWord(goal);
    const cheaper = 1 - best.cpr! / worst.cpr!;
    const crossNetwork = best.c.platform !== worst.c.platform;
    out.push({
      kind: "shift-budget",
      category: "BUDGET",
      urgent: false,
      mairoCampaignId: best.c.mairoCampaignId,
      platform: crossNetwork ? null : best.c.platform,
      title: `"${best.c.name}" is getting ${word}s ${pct(cheaper)} cheaper than "${worst.c.name}"`,
      noticed: `Each ${word} costs ${usd(best.cpr!)} on "${best.c.name}" and ${usd(worst.cpr!)} on "${worst.c.name}".`,
      noticedAdvanced: `CPA ${usd(best.cpr!)} vs ${usd(worst.cpr!)} (7d); ${best.r} vs ${worst.r} ${word}s.`,
      whyItMatters: `Both campaigns are after the same thing. Money spent on the more expensive one buys fewer ${word}s.`,
      recommendation: `Move ${usd(move)} a day from "${worst.c.name}" to "${best.c.name}". Your total daily budget stays the same.`,
      impact: `More of your budget goes where ${word}s have been cheaper. Costs can change as a campaign spends more, and MAIRO keeps watching after the move.`,
      risk: "MEDIUM",
      confidence: confidenceFrom(best.r + worst.r, (best.c.week?.spendCents ?? 0) + (worst.c.week?.spendCents ?? 0), Math.min(daysLive(best.c, now), daysLive(worst.c, now))),
      evidence: [
        { label: `Cost per ${word}, "${best.c.name}"`, value: usd(best.cpr!), advancedLabel: `CPA, ${best.c.name} (7d)` },
        { label: `Cost per ${word}, "${worst.c.name}"`, value: usd(worst.cpr!), advancedLabel: `CPA, ${worst.c.name} (7d)` },
        { label: `${word[0].toUpperCase()}${word.slice(1)}s this week`, value: `${best.r} and ${worst.r}` },
      ],
      changes: [
        {
          type: "set-budget",
          platform: worst.c.platform,
          mairoCampaignId: worst.c.mairoCampaignId,
          platformCampaignId: worst.c.platformCampaignId,
          externalCampaignId: worst.c.externalCampaignId,
          campaignName: worst.c.name,
          fromCents: worst.c.dailyBudgetCents,
          toCents: worst.c.dailyBudgetCents - move,
        },
        {
          type: "set-budget",
          platform: best.c.platform,
          mairoCampaignId: best.c.mairoCampaignId,
          platformCampaignId: best.c.platformCampaignId,
          externalCampaignId: best.c.externalCampaignId,
          campaignName: best.c.name,
          fromCents: best.c.dailyBudgetCents,
          toCents: best.c.dailyBudgetCents + move,
        },
      ],
      dedupeKey: `shift:${worst.c.platformCampaignId}>${best.c.platformCampaignId}:${weekKey(now)}`,
      priority: 60,
    });
  }
  return out;
}

/** A campaign paying for itself against the customer's own targets: offer more budget. */
function scaleWinners(input: DecisionInput): DecisionDraft[] {
  const { now, guardrails: g } = input;
  const out: DecisionDraft[] = [];
  const totalDaily = input.campaigns
    .filter((c) => c.status === "ACTIVE")
    .reduce((n, c) => n + c.dailyBudgetCents, 0);

  for (const c of input.campaigns) {
    if (!pastLearning(c, now)) continue;
    const r = results(c.objective, c.week) ?? 0;
    if (r < 10) continue;
    const cpr = costPerResult(c.objective, c.week);
    const roas = c.week?.roas ?? null;

    // Profitable against something the customer can stand behind: a return
    // they can see (revenue tracked) or the cost ceiling they set themselves.
    // "Cheaper than last week" alone is not a reason to spend more.
    const roasFloor = Math.max(g.minRoas ?? 2, 1.5);
    const byRoas = roas !== null && roas >= roasFloor;
    const byCpa = g.maxCpaCents !== null && cpr !== null && cpr <= g.maxCpaCents * 0.8;
    if (!byRoas && !byCpa) continue;
    // Only if it's actually using what it has.
    if ((c.week?.spendCents ?? 0) < c.dailyBudgetCents * 7 * 0.7) continue;

    let raise = roundDollars(c.dailyBudgetCents * Math.min(0.2, g.maxDailyIncreasePercent / 100));
    if (g.maxDailyBudgetCents !== null) raise = Math.min(raise, roundDollars(g.maxDailyBudgetCents - totalDaily));
    if (raise < 100) continue;

    const word = resultWord(c.objective);
    out.push({
      kind: "scale-winner",
      category: "GROWTH",
      urgent: false,
      mairoCampaignId: c.mairoCampaignId,
      platform: c.platform,
      title: `"${c.name}" is paying for itself — it could take more budget`,
      noticed: byRoas
        ? `Every $1 spent on it brought back $${roas!.toFixed(2)} this week, from ${r} ${word}s.`
        : `Each ${word} cost ${usd(cpr!)} this week — well under the ${usd(g.maxCpaCents!)} limit you set.`,
      noticedAdvanced: byRoas
        ? `ROAS ${roas!.toFixed(2)}x (7d), ${r} ${word}s, spend ${usd(c.week?.spendCents ?? 0)} of ${usd(c.dailyBudgetCents * 7)} available.`
        : `CPA ${usd(cpr!)} vs target ${usd(g.maxCpaCents!)} (7d), ${r} ${word}s.`,
      whyItMatters: "It's spending nearly all of its budget and returning more than it costs, so the budget may be what's holding it back.",
      recommendation: `Raise its daily budget from ${usd(c.dailyBudgetCents)} to ${usd(c.dailyBudgetCents + raise)}.`,
      impact: `More spend on a campaign that has been working. Results rarely grow in a straight line with budget — MAIRO watches the cost per ${word} after the change.`,
      risk: "MEDIUM",
      confidence: confidenceFrom(r, c.week?.spendCents ?? 0, daysLive(c, now)),
      evidence: [
        ...(byRoas ? [{ label: "Brought back per $1", value: `$${roas!.toFixed(2)}`, advancedLabel: "ROAS (7d)" }] : []),
        ...(cpr !== null ? [{ label: `Cost per ${word}`, value: usd(cpr), advancedLabel: "CPA (7d)" }] : []),
        { label: `${word[0].toUpperCase()}${word.slice(1)}s this week`, value: String(r) },
        { label: "Spent of what it could", value: `${usd(c.week?.spendCents ?? 0)} of ${usd(c.dailyBudgetCents * 7)}` },
      ],
      changes: [
        {
          type: "set-budget",
          platform: c.platform,
          mairoCampaignId: c.mairoCampaignId,
          platformCampaignId: c.platformCampaignId,
          externalCampaignId: c.externalCampaignId,
          campaignName: c.name,
          fromCents: c.dailyBudgetCents,
          toCents: c.dailyBudgetCents + raise,
        },
      ],
      dedupeKey: `scale:${c.platformCampaignId}:${weekKey(now)}`,
      priority: 50,
    });
  }
  return out;
}

const PER_CAMPAIGN: Rule[] = [notSpending, pauseLoser, creativeFatigue, landingPage, widenAudience, testVariation];

export function dataStatusOf(input: DecisionInput): DataStatus {
  const live = input.campaigns.filter((c) => c.status === "ACTIVE" || c.status === "PAUSED");
  if (live.length === 0) return "no-campaigns";
  return live.some((c) => pastLearning(c, input.now)) ? "enough" : "learning";
}

/**
 * Everything worth deciding about this account today, most important first.
 *
 * At most MAX_DECISIONS, and at most one per campaign per kind. An empty list
 * is a real answer.
 */
/**
 * Every finding the rules make, before the top few are picked as decisions.
 * Mairo Intelligence reads these too, so a finding is detected once and a
 * decision and an insight about it can never disagree.
 */
export function allDrafts(input: DecisionInput): DecisionDraft[] {
  return [
    ...input.campaigns.flatMap((c) => PER_CAMPAIGN.flatMap((rule) => rule(c, input))),
    ...shiftBudget(input),
    ...scaleWinners(input),
  ];
}

export function decide(input: DecisionInput): DecisionRun {
  const all = allDrafts(input);

  const seen = new Set<string>();
  const decisions = all
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.priority - a.priority)
    .filter((d) => {
      const key = `${d.kind}:${d.mairoCampaignId ?? "account"}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_DECISIONS);

  return { decisions, dataStatus: dataStatusOf(input) };
}

/** Figures shown next to a decision, in plain or advertising terms. */
export function evidenceLabel(e: Evidence, advanced: boolean): string {
  return advanced && e.advancedLabel ? e.advancedLabel : e.label;
}
