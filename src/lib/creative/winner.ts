import type { CampaignSnapshot, AdSnapshot } from "@/lib/decisions/types";
import { resultsFor, resultWord, usd } from "@/lib/protection/rules";
import { LEARNING_DAYS, LEARNING_SPEND_CENTS, pastLearning } from "@/lib/decisions/learning";

// Which ad is working, said the way a good account manager would: the ad, the
// evidence behind it in plain English, how much data that evidence rests on,
// and — when there isn't enough yet — exactly what MAIRO still needs to see
// before it calls a winner. Pure: the Results page, the next-test rule
// (decisions/rules.ts) and check:creative-loop share it, so the screen and
// the recommendation can never disagree about which ad won.
//
// Figures are Meta's, for the last 7 days. The last day or two can still
// change as Meta finishes attributing, which is said rather than hidden.

/** A winner needs at least this many results of its own… */
export const WINNER_MIN_RESULTS = 5;
/** …and to cost at most this share of the runner-up's cost per result. */
export const WINNER_MAX_COST_SHARE = 0.75;

export type AdLine = {
  label: string;
  headline: string | null;
  campaignAdId: string | null;
  kind: AdSnapshot["kind"];
  spendCents: number | null;
  results: number | null;
  costPerResultCents: number | null;
  clickRate: number | null;
};

export type CreativeVerdict =
  /** One ad is clearly cheaper per result, on enough results. */
  | "winner"
  /** One ad leads, but not on enough to be sure. */
  | "leading"
  /** A single ad: nothing to compare it with yet. */
  | "only-one"
  /** Still in Meta's learning period, or not enough spend to judge. */
  | "too-early"
  /** Meta hasn't reported anything for these ads. */
  | "no-data";

export type CreativeReport = {
  mairoCampaignId: string;
  campaign: string;
  word: string;
  ads: AdLine[];
  best: AdLine | null;
  runnerUp: AdLine | null;
  verdict: CreativeVerdict;
  /** One or two plain sentences: what the figures show. */
  evidence: string;
  /** What MAIRO still needs before acting, when it can't yet. */
  needs: string | null;
  /** How much the evidence rests on. */
  basis: { spendCents: number; results: number; days: 7 };
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function line(c: CampaignSnapshot, ad: AdSnapshot): AdLine {
  const r = resultsFor(c.objective, ad.week);
  const spend = ad.week?.spendCents ?? null;
  return {
    label: ad.label,
    headline: ad.headline,
    campaignAdId: ad.campaignAdId,
    kind: ad.kind,
    spendCents: spend,
    results: r,
    costPerResultCents: r && r > 0 && spend !== null ? Math.round(spend / r) : null,
    clickRate: ad.week?.impressions && ad.week.clicks !== null ? ad.week.clicks / ad.week.impressions : null,
  };
}

const name = (a: AdLine) => (a.headline ? `“${a.headline}”` : a.label);

export function creativeReport(c: CampaignSnapshot, now: Date): CreativeReport {
  const word = resultWord(c.objective);
  const ads = c.ads.map((a) => line(c, a));
  const reported = ads.filter((a) => a.spendCents !== null && a.spendCents > 0);
  const spendCents = reported.reduce((n, a) => n + (a.spendCents ?? 0), 0);
  const total = reported.reduce((n, a) => n + (a.results ?? 0), 0);
  const basis = { spendCents, results: total, days: 7 as const };
  const base = { mairoCampaignId: c.mairoCampaignId, campaign: c.name, word, ads, basis };

  if (reported.length === 0) {
    return { ...base, best: null, runnerUp: null, verdict: "no-data", evidence: "Meta hasn't reported spend or results for these ads in the last 7 days.", needs: "MAIRO needs the ads to deliver first. Figures usually appear a few hours after an ad starts running." };
  }
  if (!pastLearning(c, now)) {
    return {
      ...base,
      best: null,
      runnerUp: null,
      verdict: "too-early",
      evidence: `So far: ${usd(spendCents)} spent and ${plural(total, word)} in the last 7 days.`,
      needs: `Meta is still learning who responds. MAIRO compares ads after at least ${LEARNING_DAYS} days of delivery and ${usd(LEARNING_SPEND_CENTS)} spent, so a lucky first day doesn't decide it.`,
    };
  }

  const ranked = reported
    .filter((a) => (a.results ?? 0) > 0)
    .sort((a, b) => (a.costPerResultCents ?? Infinity) - (b.costPerResultCents ?? Infinity));

  if (ads.length === 1) {
    const a = ads[0];
    return {
      ...base,
      best: a,
      runnerUp: null,
      verdict: "only-one",
      evidence: `${name(a)} is the only ad running: ${usd(a.spendCents ?? 0)} spent for ${plural(a.results ?? 0, word)}${a.costPerResultCents ? ` at ${usd(a.costPerResultCents)} each` : ""} in the last 7 days.`,
      needs: (a.results ?? 0) >= WINNER_MIN_RESULTS ? null : `With one ad there's nothing to compare. MAIRO proposes a second version once this one has ${WINNER_MIN_RESULTS} ${word}s — ${WINNER_MIN_RESULTS - (a.results ?? 0)} to go.`,
    };
  }

  if (ranked.length === 0) {
    return { ...base, best: null, runnerUp: null, verdict: "leading", evidence: `${usd(spendCents)} spent across ${ads.length} ads and no ${word}s reported yet in the last 7 days.`, needs: `MAIRO needs ${word}s to compare. Meta can take a day or two to attribute them.` };
  }

  const best = ranked[0];
  const runnerUp = reported.filter((a) => a !== best).sort((a, b) => (a.costPerResultCents ?? Infinity) - (b.costPerResultCents ?? Infinity))[0] ?? null;
  const bestResults = best.results ?? 0;
  const cheaper =
    runnerUp === null ||
    (runnerUp.costPerResultCents === null
      ? (runnerUp.spendCents ?? 0) >= 2 * (best.costPerResultCents ?? 0)
      : (best.costPerResultCents ?? Infinity) <= WINNER_MAX_COST_SHARE * runnerUp.costPerResultCents);
  const compare =
    runnerUp === null
      ? ""
      : runnerUp.costPerResultCents === null
        ? ` ${name(runnerUp)} spent ${usd(runnerUp.spendCents ?? 0)} without one.`
        : ` ${name(runnerUp)} brought ${plural(runnerUp.results ?? 0, word)} at ${usd(runnerUp.costPerResultCents)} each.`;
  const evidence = `${name(best)} brought ${plural(bestResults, word)} at ${usd(best.costPerResultCents ?? 0)} each in the last 7 days.${compare}`;

  if (bestResults >= WINNER_MIN_RESULTS && cheaper) {
    return { ...base, best, runnerUp, verdict: "winner", evidence, needs: null };
  }
  const short = Math.max(0, WINNER_MIN_RESULTS - bestResults);
  return {
    ...base,
    best,
    runnerUp,
    verdict: "leading",
    evidence,
    needs:
      short > 0
        ? `It's ahead, but on ${plural(bestResults, word)} that could be luck. MAIRO calls a winner at ${WINNER_MIN_RESULTS} ${word}s — ${short} to go.`
        : `It's ahead, but not by enough to be sure: MAIRO calls a winner when one ad costs at most ${Math.round(WINNER_MAX_COST_SHARE * 100)}% of the next one's cost per ${word}.`,
  };
}
