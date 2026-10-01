import type { AdGoal } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import type { CampaignSnapshot, Evidence } from "@/lib/decisions/types";
import { resultsFor, resultWord, usd } from "@/lib/protection/rules";
import type { EngineInsight } from "./core";

// The Strategy Engine's learning loop: which formats, hooks, offers,
// audiences and CTAs bring this business its results, from its own ads.
//
// Pure, like the decision rules. It compares the account with itself and
// stays quiet below the thresholds — two ads and a few dollars prove
// nothing, and a strategy that swings on them would be worse than none.

/** At least this many ads on each side of a comparison. */
export const MIN_ADS_PER_GROUP = 2;
/** At least this much spend on each side ($50). */
export const MIN_SPEND_CENTS = 5_000;
/** The better side needs at least this many results. */
export const MIN_RESULTS = 5;
/** And it has to be at least this much cheaper per result. */
export const MIN_DIFFERENCE = 0.2;

type Item = { spend: number; results: number };
type Group = { name: string; items: Item[] };

const OFFER = /\d+\s?%|% off|\boff\b|discount|\bsale\b|\bdeal\b|\bfree\b|save \$|coupon|promo code|\bcode\b/i;

export function hasOffer(text: string): boolean {
  return OFFER.test(text);
}

export function hookStyle(headline: string): string {
  if (/\?\s*$/.test(headline.trim())) return "Question headlines";
  if (/\d/.test(headline)) return "Headlines with a number";
  return "Plain statement headlines";
}

const ADJUST: Record<EngineInsight["attribute"], (winner: string) => string> = {
  format: (w) => `MAIRO leads with ${w.toLowerCase().replace(/ ads$/, "")} in your next creatives.`,
  hook: (w) => `MAIRO writes more ${w.toLowerCase()} in new ads.`,
  offer: (w) => (/without/i.test(w) ? "MAIRO keeps offers out of most ads and saves them for real promotions." : "MAIRO features your offer more in new ads — without making every ad a sale."),
  audience: (w) => `MAIRO favours ${w} when it sets up or adjusts audiences.`,
  cta: (w) => `MAIRO uses "${w}" as the main button in new ads.`,
  "meta-feature": (w) => (/^without /i.test(w) ? `MAIRO leaves ${w.replace(/^without /i, "")} off in your next campaigns.` : `MAIRO keeps using ${w.replace(/^with /i, "")} in your next campaigns.`),
};

function sum(items: Item[]) {
  return items.reduce((a, b) => ({ spend: a.spend + b.spend, results: a.results + b.results }), { spend: 0, results: 0 });
}

export type MeasuredInsight = EngineInsight & { evidence: Evidence[]; key: string; /** Exact keys this lesson replaces (default: every other lesson about the same attribute). */ retires?: string[] };

/** Meta's optional automation tools whose effect is compared per business. */
export const COMPARED_META_FEATURES: { featureKey: string; name: string }[] = [
  { featureKey: "advantage_plus.audience", name: "Advantage+ audience" },
  { featureKey: "advantage_plus.placements", name: "Advantage+ placements" },
];

const slug = (s: string) => s.replace(/[^a-z0-9]+/g, "-");

/** Best-against-worst for one attribute, or nothing if the data can't support it. */
export function compareGroups(attribute: EngineInsight["attribute"], groups: Group[], word: string, opts: { minItems?: number } = {}): MeasuredInsight | null {
  const minItems = opts.minItems ?? MIN_ADS_PER_GROUP;
  const eligible = groups
    .map((g) => ({ name: g.name, n: g.items.length, ...sum(g.items) }))
    .filter((g) => g.n >= minItems && g.spend >= MIN_SPEND_CENTS);
  if (eligible.length < 2) return null;
  const cpr = (g: { spend: number; results: number }) => (g.results > 0 ? g.spend / g.results : Infinity);
  const sorted = [...eligible].sort((a, b) => cpr(a) - cpr(b));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best.results < MIN_RESULTS) return null;
  const improvement = worst.results === 0 ? 1 : 1 - cpr(best) / cpr(worst);
  if (improvement < MIN_DIFFERENCE) return null;

  // High only with clearly more than the minimum behind it.
  const strong = best.results >= MIN_RESULTS * 4 && best.spend >= MIN_SPEND_CENTS * 4 && worst.spend >= MIN_SPEND_CENTS * 4;
  const pct = Math.round(improvement * 100);
  const statement = worst.results === 0
    ? `${best.name} brought in ${best.results} ${word}s; ${worst.name.toLowerCase()} spent ${usd(worst.spend)} without one.`
    : `${best.name} brought in ${word}s about ${pct}% cheaper than ${worst.name.toLowerCase()}.`;
  return {
    key: `engine:${attribute}:${best.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    attribute,
    winner: best.name,
    loser: worst.name,
    metric: `cost per ${word}`,
    improvement: Math.min(1, improvement),
    confidence: strong ? "HIGH" : "MEDIUM",
    statement,
    adjustment: ADJUST[attribute](best.name),
    evidence: [
      { label: `${best.name}: spent`, value: usd(best.spend) },
      { label: `${best.name}: ${word}s`, value: String(best.results) },
      { label: `${worst.name}: spent`, value: usd(worst.spend) },
      { label: `${worst.name}: ${word}s`, value: String(worst.results) },
    ],
  };
}

function item(objective: AdGoal, m: PlatformMetrics | null): Item | null {
  const r = resultsFor(objective, m);
  if (r === null || !m) return null;
  return { spend: m.spendCents ?? 0, results: r };
}

function group(entries: [string, Item][]): Group[] {
  const map = new Map<string, Item[]>();
  for (const [name, it] of entries) map.set(name, [...(map.get(name) ?? []), it]);
  return [...map.entries()].map(([name, items]) => ({ name, items }));
}

/**
 * Everything the account's own ads can teach the strategy right now.
 * Campaigns are compared only with campaigns chasing the same result, and
 * `objective`, when given, picks the result that matters for the goal.
 */
export function engineInsights(campaigns: CampaignSnapshot[], objective?: AdGoal | null): MeasuredInsight[] {
  const byGoal = new Map<AdGoal, CampaignSnapshot[]>();
  for (const c of campaigns) {
    if (c.objective === "AWARENESS") continue; // Nothing to count as a result.
    byGoal.set(c.objective, [...(byGoal.get(c.objective) ?? []), c]);
  }
  const goals = [...byGoal.keys()].sort((a, b) => (a === objective ? -1 : b === objective ? 1 : 0));
  const out: MeasuredInsight[] = [];
  const seen = new Set<string>();

  for (const goal of goals) {
    const list = byGoal.get(goal)!;
    const word = resultWord(goal);
    const ads = list.flatMap((c) => c.ads.map((ad) => ({ ad, it: item(goal, ad.week) }))).filter((x): x is { ad: (typeof x)["ad"]; it: Item } => x.it !== null);

    const candidates = [
      compareGroups("format", group(ads.filter((x) => x.ad.kind === "IMAGE" || x.ad.kind === "VIDEO").map((x) => [x.ad.kind === "VIDEO" ? "Video ads" : "Image ads", x.it])), word),
      compareGroups("offer", group(ads.filter((x) => x.ad.headline || x.ad.primaryText).map((x) => [hasOffer(`${x.ad.headline ?? ""} ${x.ad.primaryText ?? ""}`) ? "Ads with an offer" : "Ads without an offer", x.it])), word),
      compareGroups("hook", group(ads.filter((x) => x.ad.headline).map((x) => [hookStyle(x.ad.headline!), x.it])), word),
      compareGroups("cta", group(ads.filter((x) => x.ad.callToAction).map((x) => [humanCta(x.ad.callToAction!), x.it])), word),
      // Audiences are set per campaign, so one campaign per side is enough.
      compareGroups("audience", group(list.map((c) => [`people aged ${c.audience.ageMin}–${c.audience.ageMax}${c.audience.ageMax >= 65 ? "+" : ""}`, item(goal, c.week)] as [string, Item | null]).filter((e): e is [string, Item] => e[1] !== null)), word, { minItems: 1 }),
    ];
    // Meta tools: campaigns built with a tool against campaigns without it, for
    // this business. A tool that helps one business can hurt another.
    for (const f of COMPARED_META_FEATURES) {
      const camp = list.filter((c) => Array.isArray(c.metaFeatures));
      const m = compareGroups(
        "meta-feature",
        group(camp.map((c) => [c.metaFeatures!.includes(f.featureKey) ? `With ${f.name}` : `Without ${f.name}`, item(goal, c.week)] as [string, Item | null]).filter((e): e is [string, Item] => e[1] !== null)),
        word,
        { minItems: 1 },
      );
      if (m && !seen.has(`meta-feature:${f.featureKey}`)) {
        seen.add(`meta-feature:${f.featureKey}`);
        const side = /^with /i.test(m.winner) ? "with" : "without";
        out.push({ ...m, key: `engine:meta-feature:${side}-${slug(f.featureKey)}`, retires: [`engine:meta-feature:${side === "with" ? "without" : "with"}-${slug(f.featureKey)}`] });
      }
    }
    for (const c of candidates) {
      // The goal's own result speaks first; another objective doesn't overrule it.
      if (c && !seen.has(c.attribute)) {
        seen.add(c.attribute);
        out.push(c);
      }
    }
  }
  return out;
}

function humanCta(raw: string): string {
  return raw.toLowerCase().split(/[_\s]+/).map((w, i) => (i === 0 ? w[0]?.toUpperCase() + w.slice(1) : w)).join(" ");
}
