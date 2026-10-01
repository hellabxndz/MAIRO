import type { AdGoal } from "@/generated/prisma/enums";
import type { MetricFamily } from "@/lib/mission/goals";
import { costPerResult, MAX_DECISIONS, MIN_CAMPAIGN_DAILY_CENTS, pastLearning, weekKey } from "@/lib/decisions/rules";
import { resultsFor, resultWord, usd } from "@/lib/protection/rules";
import type { CampaignSnapshot, DecisionDraft, DecisionInput } from "@/lib/decisions/types";
import type { EngineInsight } from "./core";
import { MIN_RESULTS } from "./learning";

// What the Strategy Engine recommends on top of the daily decision rules:
// moves that line the account up with the business's goal. Each one answers
// "what business objective is this helping accomplish?" in its whyItMatters,
// and goes through the same Approve / Edit / Dismiss as every decision —
// nothing here changes anything on its own unless the owner's automation
// level already allows that kind of change.
//
// Pure. Asserted in scripts/check-engine.ts.

/** The ad objectives that produce each goal's result. */
export const ALIGNED_AD_GOALS: Record<MetricFamily, AdGoal[]> = {
  sales: ["SALES", "LEADS"],
  leads: ["LEADS"],
  bookings: ["LEADS"],
  calls: ["LEADS"],
  traffic: ["TRAFFIC"],
  awareness: ["AWARENESS"],
  social: ["ENGAGEMENT"],
  visits: ["AWARENESS"],
};

const DIRECT: MetricFamily[] = ["sales", "leads", "bookings", "calls"];

export type EngineContext = {
  family: MetricFamily;
  /** e.g. "Generate leads". */
  goalLabel: string;
  insights: EngineInsight[];
  promotions: { id: string; title: string; end: string | null }[];
  promotionsLast30Days: number;
  today: string;
};

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** A campaign that doesn't produce the goal's result, beside one that does: move some money over. */
function shiftTowardGoal(input: DecisionInput, ctx: EngineContext): DecisionDraft[] {
  if (!DIRECT.includes(ctx.family)) return [];
  const aligned = ALIGNED_AD_GOALS[ctx.family];
  const live = input.campaigns.filter((c) => pastLearning(c, input.now));
  const targets = live
    .filter((c) => aligned.includes(c.objective))
    .map((c) => ({ c, r: resultsFor(c.objective, c.week) ?? 0, cpr: costPerResult(c.objective, c.week) }))
    .filter((x) => x.r >= MIN_RESULTS && (x.c.week?.spendCents ?? 0) >= x.c.dailyBudgetCents * 7 * 0.7);
  const sources = live.filter((c) => !aligned.includes(c.objective) && c.dailyBudgetCents > MIN_CAMPAIGN_DAILY_CENTS);
  if (!targets.length || !sources.length) return [];
  const best = targets.reduce((a, b) => ((a.cpr ?? Infinity) <= (b.cpr ?? Infinity) ? a : b));
  const from = sources.reduce((a, b) => (a.dailyBudgetCents >= b.dailyBudgetCents ? a : b));

  const g = input.guardrails;
  const limit = Math.min(g.maxBudgetShiftPercent, g.maxDailyDecreasePercent, 20) / 100;
  let move = Math.min(from.dailyBudgetCents * limit, best.c.dailyBudgetCents * (g.maxDailyIncreasePercent / 100));
  move = Math.round(Math.min(move, from.dailyBudgetCents - MIN_CAMPAIGN_DAILY_CENTS) / 100) * 100;
  if (move < 100) return [];

  const word = resultWord(best.c.objective);
  return [
    {
      kind: "strategy-shift-budget",
      category: "BUDGET",
      urgent: false,
      mairoCampaignId: best.c.mairoCampaignId,
      platform: best.c.platform,
      title: `Put more of your budget behind your goal: ${ctx.goalLabel.toLowerCase()}`,
      noticed: `"${from.name}" is set up for ${from.objective.toLowerCase()}, which doesn't bring in ${word}s. "${best.c.name}" brought in ${best.r} ${word}s this week${best.cpr !== null ? ` at ${usd(best.cpr)} each` : ""}.`,
      noticedAdvanced: `${from.name}: objective ${from.objective}, ${usd(from.dailyBudgetCents)}/day. ${best.c.name}: ${best.r} ${word}s (7d)${best.cpr !== null ? `, CPA ${usd(best.cpr)}` : ""}, spending ${usd(best.c.week?.spendCents ?? 0)} of ${usd(best.c.dailyBudgetCents * 7)}.`,
      whyItMatters: `Your goal is to ${ctx.goalLabel.toLowerCase()}. Spend on a campaign that can't produce ${word}s works against it, and "${best.c.name}" is already using all of its budget.`,
      recommendation: `Move ${usd(move)} a day from "${from.name}" to "${best.c.name}". Your total daily budget stays the same.`,
      impact: `Expected purpose: more of your spend goes to the campaign producing ${word}s. It's not a guarantee — costs can change as a campaign spends more, and MAIRO keeps watching.`,
      risk: "MEDIUM",
      confidence: best.r >= MIN_RESULTS * 4 ? "HIGH" : "MEDIUM",
      evidence: [
        { label: `${word[0].toUpperCase()}${word.slice(1)}s this week, "${best.c.name}"`, value: String(best.r) },
        { label: `"${from.name}" is set up for`, value: from.objective.toLowerCase(), advancedLabel: "Objective" },
        { label: "Moved per day", value: usd(move) },
      ],
      changes: [
        { type: "set-budget", platform: from.platform, mairoCampaignId: from.mairoCampaignId, platformCampaignId: from.platformCampaignId, externalCampaignId: from.externalCampaignId, campaignName: from.name, fromCents: from.dailyBudgetCents, toCents: from.dailyBudgetCents - move },
        { type: "set-budget", platform: best.c.platform, mairoCampaignId: best.c.mairoCampaignId, platformCampaignId: best.c.platformCampaignId, externalCampaignId: best.c.externalCampaignId, campaignName: best.c.name, fromCents: best.c.dailyBudgetCents, toCents: best.c.dailyBudgetCents + move },
      ],
      dedupeKey: `strategy-shift:${from.platformCampaignId}>${best.c.platformCampaignId}:${weekKey(input.now)}`,
      priority: 55,
    },
  ];
}

/** A format clearly wins for this business: make another ad from the best one of it. */
function moreOfWinner(input: DecisionInput, ctx: EngineContext): DecisionDraft[] {
  const win = ctx.insights.find((i) => i.attribute === "format");
  if (!win) return [];
  const kind = /video/i.test(win.winner) ? "VIDEO" : /image/i.test(win.winner) ? "IMAGE" : null;
  if (!kind) return [];
  const aligned = ALIGNED_AD_GOALS[ctx.family];
  let pick: { c: CampaignSnapshot; ad: CampaignSnapshot["ads"][number]; r: number; cpr: number } | null = null;
  for (const c of input.campaigns) {
    // One-ad campaigns get the test-variation decision already.
    if (!pastLearning(c, input.now) || c.ads.length < 2 || !aligned.includes(c.objective)) continue;
    for (const ad of c.ads) {
      if (ad.kind !== kind || !ad.campaignAdId) continue;
      const r = resultsFor(c.objective, ad.week) ?? 0;
      if (r < MIN_RESULTS) continue;
      const cpr = (ad.week?.spendCents ?? 0) / r;
      if (!pick || cpr < pick.cpr) pick = { c, ad, r, cpr };
    }
  }
  if (!pick) return [];
  const word = resultWord(pick.c.objective);
  const format = kind === "VIDEO" ? "video" : "image";
  return [
    {
      kind: "strategy-more-of-winner",
      category: "CREATIVE",
      urgent: false,
      mairoCampaignId: pick.c.mairoCampaignId,
      platform: pick.c.platform,
      title: `Make another ${format} ad like ${pick.ad.label}`,
      noticed: `${win.statement} ${pick.ad.label} in "${pick.c.name}" is your best ${format} ad: ${pick.r} ${word}s this week.`,
      noticedAdvanced: `${win.winner} vs ${win.loser}: ${Math.round(win.improvement * 100)}% lower ${win.metric}. ${pick.ad.label}: ${pick.r} ${word}s, CPA ${usd(Math.round(pick.cpr))} (7d).`,
      whyItMatters: `Your goal is to ${ctx.goalLabel.toLowerCase()}. ${format[0].toUpperCase()}${format.slice(1)} has been bringing in ${word}s more cheaply for you, so more of it should help.`,
      recommendation: `Add a new version of ${pick.ad.label} with fresh words written by MAIRO, keeping the same ${format}.`,
      impact: "Expected purpose: test whether a second ad in your strongest format brings in more results inside the same budget. Not a guarantee.",
      risk: "LOW",
      confidence: win.confidence === "HIGH" ? "HIGH" : "MEDIUM",
      evidence: [
        { label: `${pick.ad.label}: ${word}s this week`, value: String(pick.r) },
        { label: "What MAIRO learned", value: win.statement },
      ],
      changes: [{ type: "new-ad-variation", platform: pick.c.platform, mairoCampaignId: pick.c.mairoCampaignId, basedOnCampaignAdId: pick.ad.campaignAdId!, basedOnLabel: pick.ad.label, campaignName: pick.c.name }],
      dedupeKey: `strategy-winner:${pick.ad.externalAdId}:${weekKey(input.now)}`,
      priority: 35,
    },
  ];
}

/** A promotion ends in the next day or so, with ads running: say so, once. */
function promotionUrgency(input: DecisionInput, ctx: EngineContext): DecisionDraft[] {
  const running = input.campaigns.filter((c) => c.status === "ACTIVE");
  if (!running.length) return [];
  return ctx.promotions
    .filter((p) => p.end && days(ctx.today, p.end) >= 0 && days(ctx.today, p.end) <= 1)
    .slice(0, 1)
    .map((p) => {
      const left = days(ctx.today, p.end!);
      const c = running[0];
      return {
        kind: "strategy-promotion-urgency",
        category: "GROWTH",
        urgent: false,
        mairoCampaignId: c.mairoCampaignId,
        platform: c.platform,
        title: `"${p.title}" ends ${left === 0 ? "today" : "tomorrow"} — tell people`,
        noticed: `Your promotion "${p.title}" ends ${left === 0 ? "today" : "tomorrow"} and ${running.length === 1 ? "an ad is" : `${running.length} ads are`} running.`,
        noticedAdvanced: `Promotion end ${p.end}; ${running.length} active campaign(s).`,
        whyItMatters: `A real deadline is the one time urgency is honest. Mentioning it now helps your goal — ${ctx.goalLabel.toLowerCase()} — without training customers to wait for sales.`,
        recommendation: `Update your ad text to say the offer ends ${left === 0 ? "today" : "tomorrow"}. MAIRO won't repeat the countdown after it ends.`,
        impact: "Expected purpose: people who were thinking about it act before the offer ends. Not a guarantee.",
        risk: "LOW",
        confidence: "MEDIUM",
        evidence: [{ label: "Promotion ends", value: p.end! }],
        changes: [{ type: "guide", label: "Update the ad text", href: `/dashboard/campaigns/${c.mairoCampaignId}` }],
        dedupeKey: `strategy-promo-urgency:${p.id}:${p.end}`,
        priority: 65,
      } satisfies DecisionDraft;
    });
}

/** Discounts every week teach customers to wait. Suggest a rest. */
function discountFatigue(input: DecisionInput, ctx: EngineContext): DecisionDraft[] {
  if (ctx.promotionsLast30Days < 3 || ctx.promotions.length > 0) return [];
  const offerWins = ctx.insights.some((i) => i.attribute === "offer" && /with an offer/i.test(i.winner));
  if (offerWins) return [];
  return [
    {
      kind: "strategy-discount-rest",
      category: "GROWTH",
      urgent: false,
      mairoCampaignId: null,
      platform: null,
      title: "Give discounts a rest for a few weeks",
      noticed: `You've run ${ctx.promotionsLast30Days} promotions in the last 30 days.`,
      noticedAdvanced: `${ctx.promotionsLast30Days} promotions (30d); no offer advantage measured in your ads.`,
      whyItMatters: `Frequent discounts teach customers to wait for the next sale, which works against your goal — ${ctx.goalLabel.toLowerCase()} — at full price.`,
      recommendation: "Lead with proof, results and what makes you different for the next few weeks. MAIRO plans your ads and posts that way unless you tell it about a new promotion.",
      impact: "Expected purpose: protect your prices and margins. Not a guarantee of results.",
      risk: "LOW",
      confidence: "MEDIUM",
      evidence: [{ label: "Promotions in 30 days", value: String(ctx.promotionsLast30Days) }],
      changes: [{ type: "guide", label: "Review your mission", href: "/dashboard/mission" }],
      dedupeKey: `strategy-discount-rest:${ctx.today.slice(0, 7)}`,
      priority: 20,
    },
  ];
}

/** Everything the engine recommends today. Empty is a real answer. */
export function engineDrafts(input: DecisionInput, ctx: EngineContext): DecisionDraft[] {
  return [...promotionUrgency(input, ctx), ...shiftTowardGoal(input, ctx), ...moreOfWinner(input, ctx), ...discountFatigue(input, ctx)];
}

const touched = (d: DecisionDraft) =>
  d.changes.flatMap((c) => (c.type === "set-budget" || c.type === "new-ad-variation" || c.type === "pause-ad" || c.type === "widen-audience" ? [`${c.type === "set-budget" ? "budget" : c.type}:${c.mairoCampaignId}`] : []));

/**
 * The day's decisions with the engine's added. A rule's decision about the
 * same campaign's budget or ads wins, so two cards never pull one budget in
 * different directions; then the usual cap.
 */
export function mergeDrafts(rules: DecisionDraft[], engine: DecisionDraft[]): DecisionDraft[] {
  const taken = new Set(rules.flatMap(touched));
  const extra = engine.filter((d) => !touched(d).some((t) => taken.has(t)));
  return [...rules, ...extra].sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.priority - a.priority).slice(0, MAX_DECISIONS);
}
