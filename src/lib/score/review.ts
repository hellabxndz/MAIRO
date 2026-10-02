import type { ReviewStep } from "@/lib/campaigns/review-rules";
import {
  FACTOR_GROUP,
  GROUP_LABEL,
  GROUP_ORDER,
  groupsFrom,
  offerIdeas,
  overallFrom,
  scoreBand,
  type AdScore,
  type FixKind,
  type GroupKey,
  type ScoreFactor,
  type ScoreRecommendation,
  type SuggestedCheck,
} from "@/lib/score/rules";

// The Campaign Review, made actionable: for each of the six areas, what's
// working, what could improve, why the score is lower, what MAIRO recommends
// and what the area would score after the change — an estimate of campaign
// preparation, never of ad results. Then which areas to improve first (the
// lowest, at most three at a time), a "Before you launch" checklist, and the
// before/after when the campaign is checked again.
//
// Pure: everything here is asserted in scripts/check-ad-score.ts. Nothing in
// this file raises a score — estimates are shown as estimates, and the real
// number only moves when the campaign itself is checked again.

type Copy = {
  /** Shown in "MAIRO recommends", e.g. "Strengthen Your Hook". */
  action: string;
  whyLower: string;
  recommend: string;
  /** For a 70–79 check with nothing specific wrong. */
  couldImprove: string;
  strong: string;
  weak: string;
  /** "Your campaign improved" line when this area went up. */
  improved: string;
  step: ReviewStep;
};

const COPY: Record<GroupKey, Copy> = {
  creative: {
    action: "Add More Creative Proof",
    whyLower: "Your picture and words work, but they could show the product's benefit and the next step more clearly.",
    recommend: "Show the main product benefit earlier and make the customer action more obvious.",
    couldImprove: "The creative could show proof — a real result, a customer, the product in use — more strongly.",
    strong: "Creative looks strong",
    weak: "Creative could be stronger",
    improved: "Stronger creative",
    step: "ad",
  },
  hook: {
    action: "Strengthen Your Hook",
    whyLower: "Your opening message explains the product, but it doesn't immediately give customers a strong reason to stop scrolling.",
    recommend: "Open with the customer's problem or the result they get, in the first few words.",
    couldImprove: "The opening line is reasonable, but it could give a sharper reason to stop scrolling.",
    strong: "Hook is strong",
    weak: "Hook could be stronger",
    improved: "Stronger hook",
    step: "ad",
  },
  offer: {
    action: "Clarify Your Offer",
    whyLower: "Your campaign tells customers what you're selling, but the reason to act now could be stronger.",
    recommend: "Give people a clear, real reason to act now — it doesn't have to be a discount.",
    couldImprove: "The offer is there, but it could be clearer or closer to the start of the ad.",
    strong: "Offer is clear",
    weak: "Offer could be clearer",
    improved: "More complete offer",
    step: "ad",
  },
  audience: {
    action: "Sharpen Your Audience",
    whyLower: "Part of the audience setup could make it harder for Meta to reach the right people for this budget.",
    recommend: "Tell MAIRO who buys from you. MAIRO uses it to write for the right people — it won't narrow your targeting just to raise the score.",
    couldImprove: "MAIRO knows little about who your best customers are, so it relies on Meta to find them.",
    strong: "Audience looks strong",
    weak: "Audience could improve",
    improved: "Better audience fit",
    step: "audience",
  },
  landing: {
    action: "Improve Your Landing Page",
    whyLower: "MAIRO found something about the page people land on that could lose customers after they click.",
    recommend: "Make the page match the ad and make the next step obvious on a phone.",
    couldImprove: "MAIRO couldn't check everything about the page, so part of this score reflects what it couldn't see.",
    strong: "Landing page matches campaign",
    weak: "Landing page needs a look",
    improved: "Better landing page match",
    step: "goal",
  },
  setup: {
    action: "Finish Your Campaign Setup",
    whyLower: "Part of the setup could make it harder for Meta to find the right people, or for MAIRO to measure results.",
    recommend: "Fix the setup item below so Meta can optimize for your goal and MAIRO can measure it.",
    couldImprove: "The setup works; a few settings could give Meta more room to learn.",
    strong: "Campaign setup looks good",
    weak: "Campaign setup could improve",
    improved: "Better campaign setup",
    step: "budget",
  },
};

export function areaCopy(key: GroupKey): Copy {
  return COPY[key];
}

/** Below this an area is worth a look; a campaign can still be strong without reaching 100. */
const GOOD_ENOUGH = 80;

/**
 * Areas MAIRO can improve on its own when nothing specific was flagged —
 * a rewrite of the words. The estimate is what MAIRO's own rules give a
 * well-formed version, shown as "~82", never a promise.
 */
const AREA_TARGET: Partial<Record<GroupKey, { factor: ScoreFactor; to: number; fix: FixKind }>> = {
  hook: { factor: "hook", to: 82, fix: "hook" },
};

export type AreaDetail = {
  key: GroupKey;
  label: string;
  score: number;
  action: string;
  /** Null when the area is strong enough that there's nothing to explain. */
  whyLower: string | null;
  working: string[];
  improve: string[];
  /** Landing page: issues MAIRO saw evidence of… */
  detected: string[];
  /** …kept apart from things worth checking that it didn't detect. */
  toCheck: string[];
  recommendation: string | null;
  recommendations: ScoreRecommendation[];
  /** What "Let MAIRO Improve It" does here, if anything. */
  fix: FixKind | null;
  /** Where "I'll Edit It" goes. */
  step: ReviewStep;
  /** Estimated MAIRO score for this area after the recommended change; null when it can't be estimated. */
  estimate: number | null;
  actionable: boolean;
  kept: boolean;
};

type Opts = { kept?: string[]; category?: string; hasOwnWords?: boolean };

function factorMap(score: AdScore): Record<ScoreFactor, number | null> {
  return Object.fromEntries(score.factors.map((f) => [f.key, f.score])) as Record<ScoreFactor, number | null>;
}

/** The factors after the given recommendations (and area rewrites) are applied. Never lowers anything. */
function withTargets(score: AdScore, areas: GroupKey[], opts: Opts): Record<ScoreFactor, number | null> {
  const f = { ...factorMap(score) };
  const raise = (k: ScoreFactor, to: number) => {
    if (f[k] === null || (f[k] as number) < to) f[k] = to;
  };
  for (const r of score.recommendations) {
    if (!areas.includes(r.group)) continue;
    for (const [k, v] of Object.entries(r.target) as [ScoreFactor, number][]) raise(k, v);
  }
  for (const key of areas) {
    const t = AREA_TARGET[key];
    if (t && opts.hasOwnWords && !score.recommendations.some((r) => r.group === key)) {
      const current = f[t.factor];
      if (current !== null && current < GOOD_ENOUGH) raise(t.factor, t.to);
    }
  }
  return f;
}

function groupScore(f: Record<ScoreFactor, number | null>, key: GroupKey): number {
  return groupsFrom(f).find((g) => g.key === key)!.score;
}

const unique = (xs: string[]) => [...new Set(xs.filter(Boolean))];

export function areaDetail(score: AdScore, key: GroupKey, opts: Opts = {}): AreaDetail {
  const copy = COPY[key];
  const group = score.groups.find((g) => g.key === key)!;
  const recs = score.recommendations.filter((r) => r.group === key);
  const factors = score.factors.filter((f) => FACTOR_GROUP[f.key] === key && f.score !== null);
  const checks: SuggestedCheck[] = score.checks.filter((c) => c.group === key);
  const kept = (opts.kept ?? []).includes(key);

  const working = unique(factors.filter((f) => (f.score as number) >= GOOD_ENOUGH).map((f) => f.note));
  const flagged = recs.map((r) => r.title);
  const weakNotes = factors.filter((f) => (f.score as number) < 70 && !recs.some((r) => r.factor === f.key)).map((f) => f.note);
  const improve = unique([...flagged, ...weakNotes]);
  if (improve.length === 0 && group.score < GOOD_ENOUGH) improve.push(copy.couldImprove);

  const area = AREA_TARGET[key];
  const fix = recs.find((r) => r.fix)?.fix ?? (area && opts.hasOwnWords && group.score < GOOD_ENOUGH ? area.fix : null);
  const after = groupScore(withTargets(score, [key], opts), key);
  const estimate = after > group.score ? after : null;
  const actionable = recs.length > 0 || estimate !== null;

  let recommendation: string | null = actionable ? copy.recommend : null;
  if (key === "offer" && recs.some((r) => r.id === "offer-none")) {
    recommendation = `Give people a real reason to act now. It doesn't have to be a discount — for a business like yours: ${offerIdeas(opts.category ?? "general").join(", ").toLowerCase()}. Only offers you confirm go in the ad.`;
  } else if (key === "offer" && recs.some((r) => r.id === "offer-hidden")) {
    recommendation = "Put the offer you already have in the first line of the ad, where people will see it.";
  } else if ((key === "setup" || key === "landing") && recs[0]) {
    recommendation = recs[0].why;
  }

  return {
    key,
    label: GROUP_LABEL[key],
    score: group.score,
    action: copy.action,
    whyLower: group.score >= 90 ? null : recs[0] && key !== "offer" && key !== "hook" ? recs[0].why : copy.whyLower,
    working,
    improve,
    detected: key === "landing" ? flagged : [],
    toCheck: checks.map((c) => c.text),
    recommendation,
    recommendations: recs,
    fix,
    step: COPY[key].step,
    estimate,
    actionable,
    kept,
  };
}

export type ReviewOverview = {
  /** Areas to improve first: lowest score first, at most three shown at a time. */
  priorities: AreaDetail[];
  /** Other areas MAIRO could improve, for later — never shown as "looking strong". */
  more: AreaDetail[];
  /** Areas with nothing specific to improve (or kept as they are), with their scores. */
  strong: AreaDetail[];
  /** How many areas MAIRO could improve in total. */
  areasToImprove: number;
  /** Estimated overall MAIRO score if every recommended change were made. */
  estimatedOverall: number;
  /** Estimated points available — preparation, not results. */
  potential: number;
};

export function reviewOverview(score: AdScore, opts: Opts = {}): ReviewOverview {
  const details = GROUP_ORDER.map((k) => areaDetail(score, k, opts));
  const worth = (d: AreaDetail) =>
    !d.kept && d.actionable && (d.score < GOOD_ENOUGH || d.recommendations.some((r) => r.severity !== "low"));
  const all = details.filter(worth).sort((a, b) => a.score - b.score || GROUP_ORDER.indexOf(a.key) - GROUP_ORDER.indexOf(b.key));
  const priorities = all.slice(0, 3);
  const more = all.slice(3);
  const strong = details.filter((d) => !all.includes(d)).sort((a, b) => b.score - a.score);
  const estimatedOverall = overallFrom(groupsFrom(withTargets(score, all.map((d) => d.key), opts)), score.blocking);
  return { priorities, more, strong, areasToImprove: all.length, estimatedOverall, potential: Math.max(0, estimatedOverall - score.overall) };
}

export type ChecklistItem = { key: string; ok: boolean; blocking?: boolean; text: string };

/** "Before you launch": one line per area, plus tracking and anything blocking. */
export function launchChecklist(score: AdScore, opts: Opts & { website?: boolean } = {}): { items: ChecklistItem[]; remaining: number } {
  const { priorities, more } = reviewOverview(score, opts);
  const toImprove = [...priorities, ...more];
  const items: ChecklistItem[] = [];
  const score_ = (k: GroupKey) => score.groups.find((g) => g.key === k)?.score ?? 0;
  if (score.blocking > 0) {
    items.push({ key: "blocking", ok: false, blocking: true, text: `${score.blocking === 1 ? "One thing must" : `${score.blocking} things must`} be fixed before launch` });
  }
  if (opts.website) {
    const tracking = score.recommendations.some((r) => r.id === "tracking" || r.id === "retargeting");
    items.push({ key: "tracking", ok: !tracking, text: tracking ? "Sales tracking isn't ready yet" : "Tracking ready" });
  }
  for (const key of GROUP_ORDER) {
    if ((opts.kept ?? []).includes(key)) {
      items.push({ key, ok: true, text: `${GROUP_LABEL[key]} — kept as it is` });
      continue;
    }
    const weak = toImprove.some((p) => p.key === key);
    const score = score_(key);
    items.push({ key, ok: !weak, text: weak ? COPY[key].weak : score >= GOOD_ENOUGH ? COPY[key].strong : `${GROUP_LABEL[key]} — no specific issue found` });
  }
  // The tracking line is the setup area's own recommendation, so it isn't counted twice.
  return { items, remaining: items.filter((i) => !i.ok && !i.blocking && i.key !== "tracking").length };
}

export type Comparison = {
  from: number;
  to: number;
  delta: number;
  /** "Stronger hook", "More complete offer"… for areas that went up. */
  improved: string[];
  /** Areas that went down, by name. */
  lower: string[];
  /** The next thing MAIRO still recommends, if any. */
  still: string | null;
  headline: string;
};

/** What changed between two checks of the same campaign. */
export function compareScores(before: AdScore, after: AdScore, opts: Opts = {}): Comparison {
  const delta = after.overall - before.overall;
  const by = (s: AdScore, k: GroupKey) => s.groups.find((g) => g.key === k)?.score ?? 0;
  const improved = GROUP_ORDER.filter((k) => by(after, k) - by(before, k) >= 2).map((k) => COPY[k].improved);
  const lower = GROUP_ORDER.filter((k) => by(before, k) - by(after, k) >= 2).map((k) => GROUP_LABEL[k]);
  const next = reviewOverview(after, opts).priorities[0];
  const headline =
    delta > 0
      ? "Your campaign improved"
      : delta < 0
        ? "Your score went down"
        : improved.length > 0
          ? "Some areas improved"
          : "No change to the score";
  return { from: before.overall, to: after.overall, delta, improved, lower, still: next ? next.action : null, headline };
}

/** "Good Preparation", and the line under it — re-exported for the page. */
export { scoreBand };

/**
 * The kind of creative MAIRO recommends for the goal, from what the business
 * said it has. Prefers real material it already owns; suggests generating a
 * creative only when there's nothing real to use.
 */
export function creativeAdvice(input: { goal: string | null; category: string; assets: string[] }): string {
  const has = (re: RegExp) => input.assets.some((a) => re.test(a));
  const bookingLike = ["beauty_fitness", "health", "auto", "trades"].includes(input.category);
  if (bookingLike && has(/before\/after/i)) return "Use your before/after photos — they show the result people are paying for better than anything else.";
  if (input.goal === "SALES" && has(/demonstration/i)) return "Use a short product demonstration video — seeing it in use builds purchase intent.";
  if (has(/customer videos|ugc/i)) return "Use a customer video or customer-made content — real people are more believable than polished ads.";
  if (has(/testimonial/i)) return "Pair a real product photo with a short customer quote — proof makes the offer easier to trust.";
  if (has(/product photos/i)) return "Use your real product photos — they look more trustworthy than stock pictures.";
  if (input.category === "food") return "A close-up photo of the dish you want to promote usually works best — upload one, or generate one with MAIRO.";
  if (input.category === "software") return "A short screen recording of the product solving the main problem usually works best.";
  return "Upload a real photo of what you sell if you have one — otherwise MAIRO can generate a creative for you.";
}
