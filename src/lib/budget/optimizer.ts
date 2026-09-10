import type { AdPlatform } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { platformName } from "@/lib/ad-platforms/registry";
import { splitBudget, PLATFORM_MINIMUM_DAILY_CENTS, type Allocation } from "./allocation";

// Deciding that one network is doing better than another, and what to do about
// it.
//
// The rule this module exists to enforce is that MAIRO does not move a
// customer's money without permission. Everything here produces a *proposal*.
// Applying one is a separate, explicit act — a person clicking a button, or
// Auto Optimize running inside limits the customer set themselves. There is no
// path through this file that changes a live budget as a side effect of
// looking at the numbers.

/** One network's figures, as the optimizer needs them. */
export type PlatformPerformance = {
  platform: AdPlatform;
  metrics: PlatformMetrics;
  /** Current share of the campaign's budget, whole per cent. */
  currentPercent: number;
};

export type ShiftProposal = {
  platform: AdPlatform;
  fromPercent: number;
  toPercent: number;
};

export type Recommendation = {
  /** Plain language, shown to the customer as the headline. */
  headline: string;
  /** Why, in a sentence they can act on. */
  rationale: string;
  proposal: ShiftProposal[];
  /** The figures this was based on, stored so it can be explained later. */
  evidence: PlatformPerformance[];
  /** How much of a difference this is expected to make, roughly. */
  confidence: "low" | "medium" | "high";
};

/**
 * Below this, a platform has not earned an opinion.
 *
 * Two hundred clicks or twenty purchases is not a scientific threshold, it is
 * a practical one: under it, the difference between two platforms' cost per
 * purchase is mostly noise, and a recommendation built on noise will tell a
 * customer to move real money for no reason. Recommending nothing is a
 * perfectly good outcome and by far the most common one in a campaign's first
 * week.
 */
const MIN_CLICKS_FOR_SIGNAL = 200;
const MIN_PURCHASES_FOR_SIGNAL = 20;

function hasEnoughSignal(m: PlatformMetrics): boolean {
  return (
    (m.purchases ?? 0) >= MIN_PURCHASES_FOR_SIGNAL ||
    (m.clicks ?? 0) >= MIN_CLICKS_FOR_SIGNAL
  );
}

/**
 * How good a platform is, as one number.
 *
 * ROAS where revenue is being tracked, and the inverse of cost per acquisition
 * where it is not. Campaigns that measure neither get no score and are left
 * alone — MAIRO will not reallocate a budget on click-through rate, because a
 * cheap click that never buys anything is not a better click.
 */
function efficiency(m: PlatformMetrics): number | null {
  if (m.roas !== null && m.roas > 0) return m.roas;
  if (m.costPerPurchaseCents !== null && m.costPerPurchaseCents > 0) {
    return 100 / m.costPerPurchaseCents;
  }
  return null;
}

/** Relative difference between two numbers, as a fraction of the larger. */
function relativeGap(better: number, worse: number): number {
  if (better <= 0) return 0;
  return (better - worse) / better;
}

/**
 * The smallest gap worth telling someone about.
 *
 * A platform doing 8% better than another is inside the noise of a fortnight's
 * advertising. Twenty per cent is a real difference and worth a customer's
 * attention; below it, a notification is just an interruption.
 */
const MEANINGFUL_GAP = 0.2;

/** Never move more than this share of the budget in one recommendation. */
const MAX_SHIFT_PERCENT = 30;

/** Never starve a platform completely — a network at 0% cannot recover. */
const MIN_PLATFORM_PERCENT = 10;

/**
 * Compares platforms and proposes a reallocation, or returns null.
 *
 * Null is the normal answer. It means either that not enough has happened yet,
 * or that the platforms are performing similarly enough that moving money
 * between them is not obviously right — and in both cases the honest thing is
 * to say nothing rather than manufacture a suggestion.
 */
export function recommendReallocation(
  performances: PlatformPerformance[]
): Recommendation | null {
  if (performances.length < 2) return null;

  const scored = performances
    .map((p) => ({ ...p, score: efficiency(p.metrics), signal: hasEnoughSignal(p.metrics) }))
    .filter((p) => p.score !== null && p.signal) as (PlatformPerformance & {
    score: number;
    signal: boolean;
  })[];

  if (scored.length < 2) return null;

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  const gap = relativeGap(best.score, worst.score);
  if (gap < MEANINGFUL_GAP) return null;

  // Move an amount proportional to the size of the gap, capped. A platform
  // twice as efficient as another does not mean moving the whole budget: the
  // efficient one gets more expensive as it scales, and a campaign that has
  // been pushed onto one network has nothing to compare against next month.
  const shift = Math.min(
    MAX_SHIFT_PERCENT,
    Math.round(gap * 50),
    Math.max(0, worst.currentPercent - MIN_PLATFORM_PERCENT)
  );

  if (shift <= 0) return null;

  const proposal: ShiftProposal[] = performances.map((p) => {
    if (p.platform === best.platform) {
      return {
        platform: p.platform,
        fromPercent: p.currentPercent,
        toPercent: p.currentPercent + shift,
      };
    }
    if (p.platform === worst.platform) {
      return {
        platform: p.platform,
        fromPercent: p.currentPercent,
        toPercent: p.currentPercent - shift,
      };
    }
    return { platform: p.platform, fromPercent: p.currentPercent, toPercent: p.currentPercent };
  });

  const bestCpa = best.metrics.costPerPurchaseCents;
  const worstCpa = worst.metrics.costPerPurchaseCents;
  const cheaperBy =
    bestCpa !== null && worstCpa !== null && worstCpa > 0
      ? Math.round(((worstCpa - bestCpa) / worstCpa) * 100)
      : null;

  const rationale =
    cheaperBy !== null && cheaperBy > 0
      ? `${platformName(best.platform)} is generating purchases ${cheaperBy}% cheaper than ${platformName(
          worst.platform
        )}.`
      : `${platformName(best.platform)} is returning ${best.score.toFixed(
          1
        )}x against ${platformName(worst.platform)}'s ${worst.score.toFixed(1)}x.`;

  return {
    headline: "Optimization Opportunity",
    rationale,
    proposal,
    evidence: performances,
    confidence: gap > 0.5 ? "high" : gap > 0.3 ? "medium" : "low",
  };
}

// --- automatic application -------------------------------------------------

export type AutoOptimizeLimits = {
  enabled: boolean;
  maxDailyBudgetCents: number;
  maxDailyIncreasePercent: number;
  minRoas: number | null;
  maxCpaCents: number | null;
  platforms: AdPlatform[];
};

export type GuardrailVerdict =
  | { allowed: true; allocations: Allocation[] }
  | { allowed: false; reason: string };

/**
 * Decides whether MAIRO may apply a recommendation by itself.
 *
 * This is the safety layer, and it is deliberately paranoid. Every check is a
 * reason to refuse; there is no path that returns allowed on a technicality.
 * The customer's stated maximum is the one thing in this feature that must not
 * be advisory, because the failure mode is spending money they did not agree
 * to spend.
 *
 * It runs server-side on every automatic change. The UI showing the same
 * limits is a courtesy; this is the enforcement.
 */
export function checkGuardrails(input: {
  recommendation: Recommendation;
  limits: AutoOptimizeLimits;
  totalDailyBudgetCents: number;
  /** Current total across every platform in this organization, this campaign included. */
  currentTotalDailyBudgetCents: number;
}): GuardrailVerdict {
  const { recommendation, limits, totalDailyBudgetCents } = input;

  if (!limits.enabled) {
    return { allowed: false, reason: "Auto Optimize is off for this account." };
  }

  // Every platform being touched has to be one the customer allowed.
  const touched = recommendation.proposal
    .filter((p) => p.fromPercent !== p.toPercent)
    .map((p) => p.platform);
  const notPermitted = touched.filter((p) => !limits.platforms.includes(p));
  if (notPermitted.length > 0) {
    return {
      allowed: false,
      reason: `Auto Optimize isn't allowed to change ${notPermitted
        .map(platformName)
        .join(" or ")} on this account.`,
    };
  }

  // The total is not allowed to move at all here — this reallocates a fixed
  // budget between networks. A change that alters the total is a different
  // kind of change and does not belong on this path.
  if (totalDailyBudgetCents > limits.maxDailyBudgetCents) {
    return {
      allowed: false,
      reason: `This campaign's daily budget is above the ${(
        limits.maxDailyBudgetCents / 100
      ).toFixed(2)} ceiling set for Auto Optimize.`,
    };
  }

  const allocations = splitBudget(
    totalDailyBudgetCents,
    recommendation.proposal.map((p) => ({ platform: p.platform, percent: p.toPercent }))
  );

  const sum = allocations.reduce((total, a) => total + a.percent, 0);
  if (sum !== 100) {
    return { allowed: false, reason: "The proposed split doesn't add up to 100%." };
  }

  // A single platform's increase is capped as a share of what it had, so a run
  // of good days can't compound into a budget nobody chose.
  for (const shift of recommendation.proposal) {
    if (shift.toPercent <= shift.fromPercent) continue;
    if (shift.fromPercent === 0) continue;
    const increase = ((shift.toPercent - shift.fromPercent) / shift.fromPercent) * 100;
    if (increase > limits.maxDailyIncreasePercent) {
      return {
        allowed: false,
        reason: `Moving ${platformName(shift.platform)} from ${shift.fromPercent}% to ${
          shift.toPercent
        }% is a ${Math.round(increase)}% increase, above the ${
          limits.maxDailyIncreasePercent
        }% daily cap.`,
      };
    }
  }

  // Performance floors. Below them, MAIRO may only reduce spend — a campaign
  // that is losing money should not have more money moved into any part of it,
  // even the part that is losing it more slowly.
  const overall = aggregate(recommendation.evidence.map((e) => e.metrics));
  if (limits.minRoas !== null && overall.roas !== null && overall.roas < limits.minRoas) {
    return {
      allowed: false,
      reason: `This campaign is returning ${overall.roas.toFixed(
        2
      )}x, below the ${limits.minRoas}x minimum set for Auto Optimize. MAIRO won't move budget within a campaign that isn't meeting its target.`,
    };
  }
  if (
    limits.maxCpaCents !== null &&
    overall.costPerPurchaseCents !== null &&
    overall.costPerPurchaseCents > limits.maxCpaCents
  ) {
    return {
      allowed: false,
      reason: `Cost per purchase is $${(overall.costPerPurchaseCents / 100).toFixed(
        2
      )}, above the $${(limits.maxCpaCents / 100).toFixed(2)} ceiling set for Auto Optimize.`,
    };
  }

  // Finally, the platform floors — a split that a network would refuse is not
  // an improvement.
  for (const allocation of allocations) {
    const minimum = PLATFORM_MINIMUM_DAILY_CENTS[allocation.platform];
    if (minimum !== undefined && allocation.dailyBudgetCents > 0 && allocation.dailyBudgetCents < minimum) {
      return {
        allowed: false,
        reason: `The new split would put ${platformName(allocation.platform)} below its minimum daily budget.`,
      };
    }
  }

  return { allowed: true, allocations };
}

/**
 * Adds up metrics across platforms.
 *
 * Rates are recomputed from the totals rather than averaged from the parts.
 * Averaging two click-through rates gives the wrong answer whenever the
 * platforms had different impression counts, which is always.
 */
export function aggregate(all: PlatformMetrics[]): PlatformMetrics {
  const sum = (pick: (m: PlatformMetrics) => number | null): number | null => {
    const values = all.map(pick).filter((v): v is number => v !== null);
    return values.length === 0 ? null : values.reduce((a, b) => a + b, 0);
  };

  const spendCents = sum((m) => m.spendCents);
  const impressions = sum((m) => m.impressions);
  const clicks = sum((m) => m.clicks);
  const purchases = sum((m) => m.purchases);
  const revenueCents = sum((m) => m.revenueCents);

  return {
    spendCents,
    impressions,
    reach: sum((m) => m.reach),
    clicks,
    ctr: clicks !== null && impressions !== null && impressions > 0 ? clicks / impressions : null,
    cpcCents: spendCents !== null && clicks !== null && clicks > 0 ? Math.round(spendCents / clicks) : null,
    cpmCents:
      spendCents !== null && impressions !== null && impressions > 0
        ? Math.round((spendCents / impressions) * 1000)
        : null,
    conversions: sum((m) => m.conversions),
    purchases,
    costPerPurchaseCents:
      spendCents !== null && purchases !== null && purchases > 0
        ? Math.round(spendCents / purchases)
        : null,
    revenueCents,
    roas:
      revenueCents !== null && spendCents !== null && spendCents > 0
        ? revenueCents / spendCents
        : null,
    videoViews: sum((m) => m.videoViews),
    videoViews2s: sum((m) => m.videoViews2s),
    videoViews6s: sum((m) => m.videoViews6s),
    // An average watch time is only meaningful weighted by views, and only
    // TikTok reports it at all, so it passes through from whichever platform
    // has one rather than being blended with a platform that has none.
    averageWatchTimeSeconds: all.find((m) => m.averageWatchTimeSeconds !== null)?.averageWatchTimeSeconds ?? null,
    videoCompletionRate: all.find((m) => m.videoCompletionRate !== null)?.videoCompletionRate ?? null,
    profileVisits: sum((m) => m.profileVisits),
    followersGained: sum((m) => m.followersGained),
    likes: sum((m) => m.likes),
    comments: sum((m) => m.comments),
    shares: sum((m) => m.shares),
  };
}
