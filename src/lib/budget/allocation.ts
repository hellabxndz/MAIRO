import type { AdGoal, AdPlatform } from "@/generated/prisma/enums";

// How one budget becomes several.
//
// The customer enters one number. MAIRO decides how much of it each network
// gets, shows them the split, and lets them change it. Everything about that
// is in this file, including the rule that keeps it honest: the parts always
// add up to the whole. Not approximately — exactly, to the cent, with the
// rounding error deliberately placed rather than left to fall where it may.

export type Allocation = {
  platform: AdPlatform;
  /** Whole per cent. Every allocation in a set sums to exactly 100. */
  percent: number;
  /** Derived from the percent and the total. The set sums to the total. */
  dailyBudgetCents: number;
};

/**
 * MAIRO's opening suggestion for how to split a budget.
 *
 * These weights are a starting position, not a claim about the market. They
 * reflect two things that are true for the businesses MAIRO is for: Meta is
 * the more predictable performer for direct response and for older audiences,
 * and TikTok rewards spend far more when the objective is discovery than when
 * it is a lead form. Once a campaign has run, the optimizer replaces this
 * guess with the customer's own numbers — that is the whole point of the
 * recommendation engine, and this function's job is only to be a sensible
 * first move.
 *
 * When only one network is selected it gets everything, and none of this
 * matters.
 */
const GOAL_WEIGHTS: Record<AdGoal, Partial<Record<AdPlatform, number>>> = {
  // Lead forms are Meta's strongest suit and TikTok's weakest.
  LEADS: { META: 70, TIKTOK: 30 },
  // Direct purchase. Close, with Meta ahead on retargeting maturity.
  SALES: { META: 60, TIKTOK: 40 },
  // Reach and discovery, where TikTok is cheap and Meta is not.
  AWARENESS: { META: 40, TIKTOK: 60 },
  TRAFFIC: { META: 55, TIKTOK: 45 },
  APP_PROMOTION: { META: 55, TIKTOK: 45 },
};

/** The default weight for a network with no opinion recorded for this goal. */
const NEUTRAL_WEIGHT = 50;

/**
 * Splits a budget across networks, exactly.
 *
 * The rounding is the interesting part. Percentages of a budget almost never
 * divide into whole cents, so naive rounding leaves the parts summing to a
 * cent or two either side of the total — which means a customer who set a
 * $1,000 daily budget is charged $1,000.01, every day, forever. So the last
 * platform receives the remainder rather than its own rounded share, which
 * makes the sum exact by construction.
 */
export function splitBudget(
  totalDailyBudgetCents: number,
  percents: { platform: AdPlatform; percent: number }[]
): Allocation[] {
  if (percents.length === 0) return [];

  const out: Allocation[] = [];
  let assigned = 0;

  percents.forEach((entry, index) => {
    const isLast = index === percents.length - 1;
    const cents = isLast
      ? totalDailyBudgetCents - assigned
      : Math.round((totalDailyBudgetCents * entry.percent) / 100);
    assigned += cents;
    out.push({
      platform: entry.platform,
      percent: entry.percent,
      dailyBudgetCents: cents,
    });
  });

  return out;
}

/**
 * MAIRO's recommended split for a set of networks and a goal.
 *
 * Percentages are whole numbers summing to 100, with the same
 * remainder-to-the-last trick as the money so the set is exact rather than
 * 99 or 101.
 */
export function recommendAllocation(
  platforms: AdPlatform[],
  goal: AdGoal,
  totalDailyBudgetCents: number
): Allocation[] {
  if (platforms.length === 0) return [];
  if (platforms.length === 1) {
    return splitBudget(totalDailyBudgetCents, [{ platform: platforms[0], percent: 100 }]);
  }

  const weights = GOAL_WEIGHTS[goal] ?? {};
  const raw = platforms.map((p) => ({ platform: p, weight: weights[p] ?? NEUTRAL_WEIGHT }));
  const totalWeight = raw.reduce((sum, r) => sum + r.weight, 0);

  let assignedPercent = 0;
  const percents = raw.map((r, index) => {
    const isLast = index === raw.length - 1;
    const percent = isLast
      ? 100 - assignedPercent
      : Math.round((r.weight / totalWeight) * 100);
    assignedPercent += percent;
    return { platform: r.platform, percent };
  });

  return splitBudget(totalDailyBudgetCents, percents);
}

export type AllocationProblem =
  | { kind: "empty"; message: string }
  | { kind: "sum"; message: string; actual: number }
  | { kind: "negative"; message: string }
  | { kind: "below_minimum"; message: string; platform: AdPlatform };

/**
 * Every network has a floor below which it will not run a campaign.
 *
 * Enforced here rather than discovered at the network, because "TikTok
 * rejected this campaign: budget too low" after a successful-looking submit is
 * a much worse experience than the slider refusing to go there. Both figures
 * are the published daily minimum for a standard campaign, in cents.
 */
export const PLATFORM_MINIMUM_DAILY_CENTS: Partial<Record<AdPlatform, number>> = {
  META: 100,
  TIKTOK: 2000,
};

/**
 * Checks a split before anything is created.
 *
 * Returns every problem rather than the first, so a form can show all of them
 * at once instead of making the customer fix them one at a time.
 */
export function validateAllocation(allocations: Allocation[]): AllocationProblem[] {
  const problems: AllocationProblem[] = [];

  if (allocations.length === 0) {
    problems.push({ kind: "empty", message: "Pick at least one place to advertise." });
    return problems;
  }

  const sum = allocations.reduce((total, a) => total + a.percent, 0);
  if (sum !== 100) {
    problems.push({
      kind: "sum",
      message: `The split has to add up to 100%. Right now it adds up to ${sum}%.`,
      actual: sum,
    });
  }

  if (allocations.some((a) => a.percent < 0 || a.dailyBudgetCents < 0)) {
    problems.push({ kind: "negative", message: "A share of the budget can't be negative." });
  }

  for (const allocation of allocations) {
    const minimum = PLATFORM_MINIMUM_DAILY_CENTS[allocation.platform];
    if (minimum !== undefined && allocation.dailyBudgetCents < minimum) {
      problems.push({
        kind: "below_minimum",
        platform: allocation.platform,
        message: `${allocation.platform === "TIKTOK" ? "TikTok" : "Meta"} needs at least $${(
          minimum / 100
        ).toFixed(2)} a day to run a campaign. Raise the total budget or give it a bigger share.`,
      });
    }
  }

  return problems;
}

/**
 * Rebalances a set of percentages after one of them is dragged.
 *
 * The other networks absorb the difference in proportion to what they already
 * had, which is what makes a two-platform slider feel like a slider and keeps
 * a three-platform one from lurching. The moved platform is pinned to exactly
 * what was asked for; everyone else shares the remainder, and the rounding
 * remainder lands on the largest of them so no network is nudged to zero by
 * arithmetic.
 */
export function rebalance(
  current: { platform: AdPlatform; percent: number }[],
  moved: AdPlatform,
  newPercent: number
): { platform: AdPlatform; percent: number }[] {
  const clamped = Math.max(0, Math.min(100, Math.round(newPercent)));
  const others = current.filter((c) => c.platform !== moved);
  if (others.length === 0) return [{ platform: moved, percent: 100 }];

  const remaining = 100 - clamped;
  const othersTotal = others.reduce((sum, o) => sum + o.percent, 0);

  const scaled = others.map((o) => ({
    platform: o.platform,
    // When the others are all at zero there is no ratio to preserve, so split
    // the remainder evenly rather than dividing by zero.
    percent:
      othersTotal === 0
        ? Math.round(remaining / others.length)
        : Math.round((o.percent / othersTotal) * remaining),
  }));

  const drift = remaining - scaled.reduce((sum, s) => sum + s.percent, 0);
  if (drift !== 0 && scaled.length > 0) {
    const largest = scaled.reduce((a, b) => (b.percent > a.percent ? b : a));
    largest.percent += drift;
  }

  // Rebuilt in the original order so the form's rows don't jump around.
  return current.map((c) =>
    c.platform === moved
      ? { platform: moved, percent: clamped }
      : { platform: c.platform, percent: scaled.find((s) => s.platform === c.platform)!.percent }
  );
}
