// Judging a creative test: two (or three) ads in one campaign, the same
// picture and audience, different words. Pure, so every rule is pinned by
// scripts/check-experiments.ts.
//
// What counts is the business's goal — purchases, leads or bookings, as Meta
// reports them per ad — and what it cost. Meta doesn't split the budget
// evenly between ads in one ad set (it leans towards the one it expects to do
// better), so ads are compared by results per dollar, with each ad's spend as
// its exposure: if both cost the same per result, the results would fall in
// proportion to spend. The gap is called a win only when chance is an
// unlikely explanation (an exact binomial test, under 1 in 20, adjusted for
// the number of comparisons) and the evidence minimums are met. Otherwise the
// verdict says what's still missing — never a winner by default.

export const EVIDENCE = {
  /** A week covers every weekday and most of Meta's learning phase. */
  minDays: 7,
  /** After four weeks without a clear answer, the test ends and says so. */
  maxDays: 28,
  /** Results across the test before any call is made. */
  minResultsTotal: 20,
  /** The leading ad needs at least this many on its own. */
  minResultsLeader: 10,
  /** An ad Meta gave less than this share of the spend was never really tested. */
  minSpendShare: 0.1,
  /** …judged only once the test has spent this much in total. */
  minSpendForFairness: 5000,
  /** Chance explains a gap this size less than 1 time in 20. */
  significance: 0.05,
  /** With this many results and no significant gap, the ads are treated as equal. */
  tieAfterResults: 60,
  /** Within this, cost per result is "about the same" whatever the test says. */
  sameWithin: 0.15,
} as const;

export type VariantFigures = {
  label: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  /** Purchases, leads or bookings — whatever the campaign is for. */
  results: number;
};

/** "purchase", "lead"… — resultWord() for the campaign's goal. */
export type ResultWord = string;

export type Verdict =
  | { kind: "waiting"; final: false; headline: string; missing: string[] }
  | { kind: "winner"; final: true; winner: number; losers: number[]; headline: string; detail: string; pValue: number }
  | { kind: "no-difference"; final: true; headline: string; detail: string; pValue: number | null }
  | { kind: "unfair"; final: true; starved: number; headline: string; detail: string }
  | { kind: "inconclusive"; final: true; headline: string; detail: string };

// --- An exact binomial test -----------------------------------------------------

/** ln Γ(x), Lanczos approximation (g = 7), accurate to ~15 digits for x > 0. */
function lnGamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function binomPmf(k: number, n: number, p: number): number {
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

/**
 * Two-sided exact binomial p-value: how often a split at least this uneven
 * would happen by chance if both ads cost the same per result, given each
 * ad's share of the spend.
 */
export function binomialPValue(k: number, n: number, p: number): number {
  if (n === 0) return 1;
  const observed = binomPmf(k, n, p);
  let total = 0;
  for (let i = 0; i <= n; i++) {
    const q = binomPmf(i, n, p);
    if (q <= observed * (1 + 1e-7)) total += q;
  }
  return Math.min(1, total);
}

// --- The verdict -------------------------------------------------------------------

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function costPerResult(v: VariantFigures): number | null {
  return v.results > 0 ? v.spendCents / v.results : null;
}

export function judge(variants: VariantFigures[], days: number, word: ResultWord): Verdict {
  if (variants.length < 2) return { kind: "inconclusive", final: true, headline: "Nothing to compare", detail: "The campaign ran with one ad, so there's no second version to compare it with." };
  const totalSpend = variants.reduce((s, v) => s + v.spendCents, 0);
  const totalResults = variants.reduce((s, v) => s + v.results, 0);
  const missing: string[] = [];

  if (days < EVIDENCE.minDays) missing.push(`${plural(EVIDENCE.minDays - days, "more day")} — a test needs a full week`);

  // Meta starving one ad isn't evidence against it: it was never shown enough to tell.
  if (days >= EVIDENCE.minDays && totalSpend >= EVIDENCE.minSpendForFairness) {
    const starved = variants.findIndex((v) => v.spendCents / totalSpend < EVIDENCE.minSpendShare);
    if (starved >= 0) {
      const share = Math.round((variants[starved].spendCents / totalSpend) * 100);
      return {
        kind: "unfair",
        final: true,
        starved,
        headline: `${variants[starved].label} wasn't really tested`,
        detail: `Meta gave it only ${share}% of the money spent, so there isn't enough to judge it. Meta favours the ad it expects to do better, which is a hint but not proof. To compare them fairly, run ${variants[starved].label} as its own campaign with its own budget.`,
      };
    }
  }

  if (totalResults < EVIDENCE.minResultsTotal) missing.push(`${plural(EVIDENCE.minResultsTotal - totalResults, `more ${word}`)} across both ads (${totalResults} so far)`);

  // Order by cost per result: an ad with no results is last.
  const order = variants.map((v, i) => ({ i, cpr: costPerResult(v) })).sort((a, b) => (a.cpr ?? Infinity) - (b.cpr ?? Infinity));
  const leader = order[0].i;
  const lead = variants[leader];
  if (lead.results < EVIDENCE.minResultsLeader) missing.push(`${plural(EVIDENCE.minResultsLeader - lead.results, `more ${word}`)} for the leading ad`);

  if (missing.length) {
    if (days >= EVIDENCE.maxDays) {
      return { kind: "inconclusive", final: true, headline: "Not enough results to tell them apart", detail: `After ${days} days the ads brought in ${plural(totalResults, word)} between them — too few to say which works better. Keep the one you prefer, or try again with a bigger budget.` };
    }
    return { kind: "waiting", final: false, headline: "Still collecting evidence", missing };
  }

  // The leader against every other ad, each with the leader's results as the count.
  const comparisons = order.slice(1).map(({ i }) => {
    const other = variants[i];
    const n = lead.results + other.results;
    const p = lead.spendCents / (lead.spendCents + other.spendCents);
    return { i, pValue: binomialPValue(lead.results, n, p) };
  });
  const threshold = EVIDENCE.significance / comparisons.length;
  const worst = Math.max(...comparisons.map((c) => c.pValue));
  const leadCpr = costPerResult(lead)!;
  const runnerUp = variants[order[1].i];
  const runnerCpr = costPerResult(runnerUp);
  const close = runnerCpr !== null && runnerCpr <= leadCpr * (1 + EVIDENCE.sameWithin);

  if (worst < threshold && !close) {
    const ratio = runnerCpr === null ? null : Math.round((runnerCpr / leadCpr) * 10) / 10;
    return {
      kind: "winner",
      final: true,
      winner: leader,
      losers: comparisons.map((c) => c.i),
      pValue: worst,
      headline: `${lead.label} brings in ${word}s for less`,
      detail: `${lead.label}: ${plural(lead.results, word)} at ${dollars(Math.round(leadCpr))} each. ${runnerUp.label}: ${runnerCpr === null ? `no ${word}s from ${dollars(runnerUp.spendCents)}` : `${plural(runnerUp.results, word)} at ${dollars(Math.round(runnerCpr))} each${ratio ? ` (${ratio}× as much)` : ""}`}. A gap this size would happen by chance less than 1 time in 20.`,
    };
  }
  if (totalResults >= EVIDENCE.tieAfterResults || days >= EVIDENCE.maxDays || (close && totalResults >= EVIDENCE.minResultsTotal * 2)) {
    return {
      kind: "no-difference",
      final: true,
      pValue: worst,
      headline: "No clear difference",
      detail: `${plural(totalResults, word)} so far, and the ads cost about the same per ${word} once chance is allowed for. Either works — keep the one you prefer.`,
    };
  }
  return { kind: "waiting", final: false, headline: "Close so far", missing: [`more ${word}s — the gap could still be chance`] };
}
