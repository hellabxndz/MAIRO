import type { AdGoal } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { resultsFor, resultWord, usd } from "@/lib/protection/rules";

// What followed a change. Before and after, the same length of time, with
// enough results on both sides — and said as what happened afterwards, never
// as proof the change caused it: the season, competitors and other edits move
// results too. Pure; pinned by scripts/check-coach.ts.

export type Verdict = "IMPROVED" | "WORSENED" | "INCONCLUSIVE" | "NOT_MEASURABLE";

/** How far a figure has to move before "better" or "worse" is said. */
export const MEANINGFUL = 0.15;

export const NOT_PROOF = "Other things change at the same time — the season, competitors, other edits — so this shows what followed the change, not proof that it caused it.";

/** Compare one figure before and after. */
export function judge(before: number, after: number | null, betterWhen: "lower" | "higher", enough: boolean): Verdict {
  if (after === null || !enough || !Number.isFinite(before)) return "NOT_MEASURABLE";
  if (before === 0) {
    if (after === 0) return "INCONCLUSIVE";
    return betterWhen === "higher" ? "IMPROVED" : "WORSENED";
  }
  const ch = (after - before) / Math.abs(before);
  const good = betterWhen === "lower" ? ch <= -MEANINGFUL : ch >= MEANINGFUL;
  const bad = betterWhen === "lower" ? ch >= MEANINGFUL : ch <= -MEANINGFUL;
  return good ? "IMPROVED" : bad ? "WORSENED" : "INCONCLUSIVE";
}

/** The fewest results on each side before cost per result is compared. */
export const MIN_RESULTS_EACH_SIDE = 5;

/**
 * A change MAIRO carried out on a campaign: the cost per result over the same
 * number of days before and after.
 */
export function judgeChange(objective: AdGoal, before: PlatformMetrics | null, after: PlatformMetrics | null): { verdict: Verdict; note: string; figures: { before: number | null; after: number | null; resultsBefore: number | null; resultsAfter: number | null } } {
  const word = resultWord(objective);
  const rb = resultsFor(objective, before);
  const ra = resultsFor(objective, after);
  const cb = rb && before?.spendCents ? Math.round(before.spendCents / rb) : null;
  const ca = ra && after?.spendCents ? Math.round(after.spendCents / ra) : null;
  const figures = { before: cb, after: ca, resultsBefore: rb, resultsAfter: ra };
  if (cb === null || ca === null || (rb ?? 0) < MIN_RESULTS_EACH_SIDE || (ra ?? 0) < MIN_RESULTS_EACH_SIDE) {
    return { verdict: "NOT_MEASURABLE", note: `Not enough ${word}s before and after to compare fairly (at least ${MIN_RESULTS_EACH_SIDE} on each side are needed).`, figures };
  }
  const verdict = judge(cb, ca, "lower", true);
  const said = verdict === "IMPROVED" ? `Each ${word} cost less afterwards` : verdict === "WORSENED" ? `Each ${word} cost more afterwards` : `The cost per ${word} stayed about the same`;
  return { verdict, note: `${said}: ${usd(cb)} before, ${usd(ca)} after (${rb} and ${ra} ${word}s). ${NOT_PROOF}`, figures };
}

/** The sentence for an approved plan's figure. */
export function measureNote(verdict: Verdict, label: string, before: string, after: string | null): string {
  if (verdict === "NOT_MEASURABLE") return `Not enough new data yet to tell whether ${label} changed.`;
  const said = verdict === "IMPROVED" ? `${label} improved` : verdict === "WORSENED" ? `${label} got worse` : `${label} stayed about the same`;
  return `${said}: ${before} when MAIRO raised it, ${after} now. ${NOT_PROOF}`;
}

/** How long a change followed by worse results isn't suggested again for the same campaign. */
export const DONT_REPEAT_DAYS = 90;

/**
 * Leaves out a recommendation of the same kind, for the same campaign, as a
 * change that was followed by worse results lately — unless the business
 * asks again, MAIRO doesn't keep suggesting what didn't work for it.
 */
export function withoutRepeats<T extends { kind: string; mairoCampaignId: string | null }>(drafts: T[], worsened: { kind: string; mairoCampaignId: string | null; at: Date }[], now: Date): { kept: T[]; held: T[] } {
  const recent = worsened.filter((w) => now.getTime() - w.at.getTime() < DONT_REPEAT_DAYS * 86_400_000);
  const held = drafts.filter((d) => recent.some((w) => w.kind === d.kind && w.mairoCampaignId === d.mairoCampaignId));
  return { kept: drafts.filter((d) => !held.includes(d)), held };
}
