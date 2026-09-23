import type { AdGoal } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { resultsFor, resultWord, usd } from "@/lib/protection/rules";

// What MAIRO recommends for a running campaign, in plain English.
//
// It waits for enough data before judging. Meta spends the first days of a
// campaign learning who responds, and results in that window swing wildly —
// advice drawn from them would have people changing things that were about to
// work, which resets the learning and costs more. So until a campaign has run
// a few days and spent a meaningful amount, the only advice is to leave it.
//
// Every figure comes from the campaign's own numbers. No industry averages.
// Advice is advice: nothing here changes a campaign.

export type Advice = {
  tone: "wait" | "good" | "fix" | "idea";
  title: string;
  detail: string;
  /** Where acting on it happens, when MAIRO has a screen for it. */
  href?: string;
  hrefLabel?: string;
};

/** Days of delivery before judging. */
export const LEARNING_DAYS = 3;
/** Spend before judging, whatever the days. */
export const LEARNING_SPEND_CENTS = 2000;

const DAY = 24 * 60 * 60 * 1000;

export function campaignAdvice(input: {
  objective: AdGoal;
  metrics: PlatformMetrics | null;
  /** When the campaign started delivering (or was created, if unknown). */
  liveSince: Date;
  live: boolean;
  dailyBudgetCents: number;
  now?: Date;
}): Advice[] {
  const now = input.now ?? new Date();
  const days = Math.floor((now.getTime() - input.liveSince.getTime()) / DAY);
  const m = input.metrics;
  if (!input.live) return [];

  const spend = m?.spendCents ?? null;

  // Live a while, and nothing spent: it isn't being shown at all.
  if (days >= 2 && (spend === null || spend === 0)) {
    return [{
      tone: "fix",
      title: "It isn't spending",
      detail: "It's been switched on for two days without delivering. The usual reasons are an ad still in Meta's review, a payment problem, or an audience too small to reach.",
      href: "/dashboard/settings",
      hrefLabel: "Check payment",
    }];
  }

  if (days < LEARNING_DAYS || spend === null || spend < LEARNING_SPEND_CENTS) {
    return [{
      tone: "wait",
      title: "Too early to judge — leave it running",
      detail: `Meta spends the first few days learning who responds, and the numbers jump around. MAIRO starts judging after ${LEARNING_DAYS} days and ${usd(LEARNING_SPEND_CENTS)} spent. Changing things now restarts that learning.`,
    }];
  }

  const out: Advice[] = [];
  const results = resultsFor(input.objective, m);
  const word = resultWord(input.objective);
  const impressions = m?.impressions ?? null;
  const clicks = m?.clicks ?? null;
  const ctr = impressions && clicks !== null ? clicks / impressions : null;
  const frequency = impressions && m?.reach ? impressions / m.reach : null;

  if (results !== null && results > 0) {
    const cost = Math.round(spend / results);
    out.push({
      tone: "good",
      title: `It's working — ${results} ${word}${results === 1 ? "" : "s"} at ${usd(cost)} each`,
      detail:
        m?.roas && m.roas >= 1
          ? `Every $1 spent has brought back ${m.roas.toFixed(2)}. If that holds for another week, raising the budget by about 20% is a safe next step — MAIRO won't do it without you.`
          : "Keep it steady for a week before changing anything, so you can see whether that cost holds.",
    });
  }

  if (ctr !== null && impressions !== null && impressions >= 1000 && ctr < 0.005) {
    out.push({
      tone: "fix",
      title: "People scroll past the ad",
      detail: `Fewer than 1 in 200 people who see it click (${(ctr * 100).toFixed(2)}%). A different picture or opening line usually matters more than anything else here.`,
      href: "/dashboard/create",
      hrefLabel: "Make a new ad",
    });
  }

  if (results === 0 && clicks !== null && clicks >= 50 && input.objective !== "TRAFFIC" && input.objective !== "ENGAGEMENT") {
    out.push({
      tone: "fix",
      title: `People click, but don't ${input.objective === "SALES" ? "buy" : "get in touch"}`,
      detail: `${clicks} clicks and no ${word}s yet. The ad is doing its job; the page after it is where people stop. Check it loads fast on a phone and makes the next step obvious.`,
    });
  }

  if (frequency !== null && frequency >= 3.5) {
    out.push({
      tone: "idea",
      title: "The same people are seeing it a lot",
      detail: `On average each person has seen it ${frequency.toFixed(1)} times. A fresh ad, or a wider audience, keeps it from wearing out.`,
      href: "/dashboard/create",
      hrefLabel: "Make a new ad",
    });
  }

  if (out.length === 0) {
    out.push({
      tone: "wait",
      title: "Nothing to change yet",
      detail: "The numbers are steady and nothing stands out. MAIRO keeps watching and will say when something does.",
    });
  }
  return out;
}
