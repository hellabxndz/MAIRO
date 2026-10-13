import { MIN_DAILY, RETARGET_FROM, SLOW_BELOW, TEST_FROM } from "@/lib/strategy/plan-logic";
import { maxTestAds } from "@/lib/campaigns/ad-copy";
import { Inputs, type Result } from "./economics";

// What a daily ad budget can realistically test — with the same thresholds
// the free plan uses (lib/strategy/plan-logic.ts), so the public planner and
// the plan never disagree about what a budget is for.
//
// Meta's own guidance is that an ad set usually leaves its learning phase
// after about 50 optimisation events in 7 days. Whether a budget gets there
// depends on the cost of each event, which only the owner can estimate.

/** Meta's learning-phase guideline: roughly this many results in 7 days. */
export const LEARNING_EVENTS_PER_WEEK = 50;
export const DAYS_PER_MONTH = 30.4;

export type BudgetInput = {
  dailyBudget: number | null;
  /** The owner's estimate of what one result (lead, booking, purchase) costs. Optional. */
  costPerResult?: number | null;
};

export type BudgetPlan = {
  daily: number;
  monthly: number;
  /** How many ad versions the budget can test fairly at once. */
  adVersions: number;
  audiences: 1 | 2;
  retargeting: boolean;
  learnsSlowly: boolean;
  belowMinimum: boolean;
  /** With a cost-per-result estimate: results a week, and whether that reaches Meta's guideline. */
  learning: { resultsPerWeek: number; reachesGuideline: boolean; dailyForGuideline: number } | null;
  advice: string[];
};

export function planBudget(input: BudgetInput): Result<BudgetPlan> {
  const i = new Inputs();
  const daily = i.money("dailyBudget", "a daily budget", input.dailyBudget, { allowZero: false });
  const cpr = input.costPerResult == null ? null : i.money("costPerResult", "the cost per result", input.costPerResult, { required: false, allowZero: false });
  return i.done(() => {
    const advice: string[] = [];
    const belowMinimum = daily < MIN_DAILY;
    const learnsSlowly = daily < SLOW_BELOW;
    const audiences = daily >= TEST_FROM ? 2 : 1;
    const retargeting = daily >= RETARGET_FROM;
    const adVersions = maxTestAds(Math.round(daily * 100));
    if (belowMinimum) advice.push(`Meta needs at least about $${MIN_DAILY} a day for an ad set to deliver properly; below that, results are too few to learn from.`);
    else if (learnsSlowly) advice.push("At this level one ad set learns slowly. Keep everything in one campaign with one audience and give it two weeks before judging.");
    else if (audiences === 1) advice.push("Keep one campaign and one audience so every result counts toward the same test.");
    else advice.push("There's room to compare two audiences inside one campaign — still one test at a time.");
    advice.push(adVersions === 1 ? "Run one ad at a time; splitting the budget across more would leave each with too little to judge." : `Up to ${adVersions} ad versions can share this budget fairly.`);
    if (retargeting) advice.push("A small retargeting step — people who visited but didn't act — becomes worth adding once there's traffic.");
    let learning: BudgetPlan["learning"] = null;
    if (cpr) {
      const resultsPerWeek = (daily * 7) / cpr;
      const reaches = resultsPerWeek >= LEARNING_EVENTS_PER_WEEK;
      learning = { resultsPerWeek, reachesGuideline: reaches, dailyForGuideline: (LEARNING_EVENTS_PER_WEEK * cpr) / 7 };
      if (!reaches) advice.push("At your cost per result, this budget won't reach Meta's guideline of about 50 results a week, so delivery may stay in learning and results will swing. Optimising for a more frequent step (an enquiry rather than a sale) helps; more budget only helps if each result still pays for itself.");
    }
    return { daily, monthly: daily * DAYS_PER_MONTH, adVersions, audiences, retargeting, learnsSlowly, belowMinimum, learning, advice };
  });
}
