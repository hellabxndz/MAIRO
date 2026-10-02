import { BRAIN_FIELDS, CONFIRMING_SOURCES, FIELD_BY_KEY, type FactMeta, type FactSource } from "./catalog";

// The Business Brain's rules. Pure, so scripts/check-brain.ts can pin each
// one: who may overwrite what, when a fact is worth re-checking, how much
// MAIRO understands, how a lesson may be worded, when a promotion is over,
// and which unknown matters most for the current goal.

const DAY = 86_400_000;

type ProfileLike = Record<string, unknown> & { products?: { name: string; status?: string | null; priority?: string | null }[] };

export function hasValue(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim() !== "";
  return v !== null && v !== undefined;
}

export function displayValue(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : (x as { name?: string }).name ?? "")).filter(Boolean).join(", ");
  return typeof v === "string" ? v : "";
}

// --- Sources and precedence ------------------------------------------------------------

export function newMeta(source: FactSource, now: Date): FactMeta {
  const at = now.toISOString();
  return { source, status: CONFIRMING_SOURCES.includes(source) ? "confirmed" : "inferred", updatedAt: at, verifiedAt: at };
}

/**
 * Where a fact came from when no record was kept (facts saved before the
 * Business Brain tracked sources): a field the business edited is theirs;
 * anything else with a value came from the website analysis if there was one,
 * otherwise from the business's own sign-up answers.
 */
export function metaFor(key: string, meta: Record<string, FactMeta>, legacy: { edited: string[]; analyzedAt: Date | null; updatedAt: Date }): FactMeta {
  if (meta[key]) return meta[key];
  if (legacy.edited.includes(key)) return { source: "customer", status: "confirmed", updatedAt: legacy.updatedAt.toISOString(), verifiedAt: legacy.updatedAt.toISOString() };
  if (legacy.analyzedAt) return { source: "website", status: "inferred", updatedAt: legacy.analyzedAt.toISOString(), verifiedAt: legacy.analyzedAt.toISOString() };
  return { source: "customer", status: "confirmed", updatedAt: legacy.updatedAt.toISOString(), verifiedAt: legacy.updatedAt.toISOString() };
}

/** The customer's word wins: an inference never overwrites something they told or confirmed. */
export function mayReplace(current: FactMeta | undefined, incoming: FactSource): boolean {
  if (!current) return true;
  if (CONFIRMING_SOURCES.includes(incoming)) return true;
  return current.status !== "confirmed";
}

// --- Staleness and conflicts ------------------------------------------------------------

/** How long an important fact goes unconfirmed before MAIRO checks it's still true. */
export const STALE_AFTER_DAYS = 180;

export type Verification = { key: string; label: string; value: string; question: string; reason: "stale" | "conflict" };

/**
 * One fact worth re-checking, or none. Conflicts first (the focus product is
 * now marked sold out), then the important fact unconfirmed the longest. Only
 * ever one at a time, so MAIRO doesn't keep asking.
 */
export function factToVerify(profile: ProfileLike, meta: (key: string) => FactMeta, now: Date, days = STALE_AFTER_DAYS): Verification | null {
  const focus = displayValue(profile.focusItem);
  if (focus) {
    const sold = profile.products?.find((p) => p.status === "unavailable" && focus.toLowerCase().includes(p.name.toLowerCase()));
    if (sold) return { key: "focusItem", label: FIELD_BY_KEY.focusItem.label, value: focus, question: `${sold.name} is marked as unavailable. Is “${focus}” still what you want to sell more of?`, reason: "conflict" };
  }
  const due = BRAIN_FIELDS.filter((d) => d.important && hasValue(profile[d.key]))
    .map((d) => ({ d, age: now.getTime() - Date.parse(meta(d.key).verifiedAt) }))
    .filter((x) => x.age > days * DAY)
    .sort((a, b) => b.age - a.age)[0];
  if (!due) return null;
  const value = displayValue(profile[due.d.key]);
  return { key: due.d.key, label: due.d.label, value, question: `Is “${value.length > 80 ? `${value.slice(0, 77)}…` : value}” still right for “${due.d.label.toLowerCase()}”?`, reason: "stale" };
}

// --- How much MAIRO understands --------------------------------------------------------

export type UnderstandingArea = { key: "business" | "customer" | "offer" | "brand" | "products" | "performance"; label: string; percent: number; missing: string[] };

const AREAS: { key: UnderstandingArea["key"]; label: string; fields: string[][] }[] = [
  // Each inner list is one thing to know; any field in it counts.
  { key: "business", label: "Business", fields: [["industry"], ["overview"], ["location", "serviceArea", "presence"]] },
  { key: "customer", label: "Customer", fields: [["targetCustomer", "customerTypes"], ["painPoints", "desires"], ["objections", "purchaseConsiderations"]] },
  { key: "offer", label: "Offer", fields: [["usps"], ["offers", "successfulOffers"], ["customerResults", "customerPraise"]] },
  { key: "brand", label: "Brand", fields: [["brandVoice"], ["brandStyle", "creativeStyle", "brandColors"], ["creativeAssets"]] },
  { key: "products", label: "Products", fields: [["products"], ["focusItem", "bestProducts"], ["mostProfitable"]] },
];

export type Understanding = { percent: number; areas: UnderstandingArea[]; message: string; enoughToRun: boolean };

/**
 * "MAIRO knows your business: 78%" — never a game, never required to be 100.
 * Performance counts what MAIRO has learned from results: nothing yet, early
 * signs, or patterns it has seen more than once.
 */
export function understanding(profile: ProfileLike, learnings: { confidence: string }[], questionsAvailable: number): Understanding {
  const areas: UnderstandingArea[] = AREAS.map((a) => {
    const missing = a.fields.filter((alts) => !alts.some((k) => hasValue(profile[k]))).map((alts) => FIELD_BY_KEY[alts[0]]?.label ?? "Products and services");
    return { key: a.key, label: a.label, percent: Math.round(((a.fields.length - missing.length) / a.fields.length) * 100), missing };
  });
  const strong = learnings.filter((l) => l.confidence === "HIGH" || l.confidence === "MEDIUM").length;
  const performance = learnings.length === 0 ? 0 : strong >= 3 ? 100 : strong >= 1 ? 66 : 33;
  areas.push({ key: "performance", label: "Performance data", percent: performance, missing: performance < 100 ? ["Results from more campaigns"] : [] });
  const percent = Math.round(areas.reduce((n, a) => n + a.percent, 0) / areas.length);
  const enoughToRun = hasValue(profile.overview) || hasValue(profile.products) || hasValue(profile.industry);
  const q = questionsAvailable;
  const more = q > 0 ? `answering ${q} more question${q === 1 ? "" : "s"} may improve its recommendations` : "it keeps learning from your results";
  const message = enoughToRun
    ? `MAIRO has enough information to run your campaigns, but ${more}.`
    : `MAIRO can start with what you've told it — ${q > 0 ? `answering ${q} quick question${q === 1 ? "" : "s"} will make its recommendations specific to your business` : "it keeps learning as you use it"}.`;
  return { percent, areas, message, enoughToRun };
}

// --- How a lesson may be said ------------------------------------------------------------

/** Simple, honest words for how sure MAIRO is. */
export function confidenceWords(confidence: string): string {
  if (confidence === "HIGH") return "MAIRO has consistently found";
  if (confidence === "MEDIUM") return "MAIRO has noticed";
  return "MAIRO is starting to notice";
}

/** 🔥 for a pattern MAIRO is confident in, 💡 for one it's still learning. */
export function insightMark(confidence: string): string {
  return confidence === "HIGH" || confidence === "MEDIUM" ? "🔥" : "💡";
}

const CAUSAL: [RegExp, string][] = [
  [/\b(caused|causes|cause)\b/gi, "went with"],
  [/\b(led to|leads to|lead to)\b/gi, "came with"],
  [/\b(drove|drives|drive)\b/gi, "came with"],
  [/\bbecause of\b/gi, "alongside"],
  [/\bproves?\b/gi, "suggests"],
];

/** True when a sentence claims cause rather than what was observed. */
export function claimsCause(text: string): boolean {
  return CAUSAL.some(([re]) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/**
 * Never confuse correlation with certainty: "Video caused more sales" is said
 * as "Video went with more sales". Results describe what happened in this
 * business's campaigns, not why.
 */
export function carefulWording(text: string): string {
  return CAUSAL.reduce((t, [re, to]) => t.replace(re, to), text);
}

/** Lessons from very little data are kept, but never stated as a pattern. */
export function minimumEvidence(sampleSize: number | null): "too-little" | "early" | "enough" {
  if (sampleSize === null) return "early";
  if (sampleSize < 2) return "too-little";
  return sampleSize < 4 ? "early" : "enough";
}

// --- Temporary information ---------------------------------------------------------------

export type PromoState = "scheduled" | "active" | "ended";

/** Promotions expire on their own; an ended one is history, never a business fact. */
export function promoState(startsAt: Date | null, endsAt: Date | null, now: Date): PromoState {
  if (endsAt && endsAt.getTime() < now.getTime()) return "ended";
  if (startsAt && startsAt.getTime() > now.getTime()) return "scheduled";
  return "active";
}

export function promoCode(text: string): string | null {
  return text.match(/\b(?:promo code|discount code|coupon|code)[:\s]+([A-Z0-9][A-Z0-9_-]{2,19})\b/i)?.[1]?.toUpperCase() ?? null;
}

// --- Which unknown matters most now ------------------------------------------------------

/**
 * For the current goal, the questions whose answers would most improve the
 * strategy — a leads goal asks about the offer, the problem and objections
 * before anything about branding.
 */
export const GOAL_PRIORITY: Record<string, string[]> = {
  leads: ["offer-standing", "hook-problem", "land-objection", "hook-why-us", "aud-who"],
  calls: ["offer-standing", "hook-problem", "aud-where", "hook-why-us"],
  bookings: ["brain-focus", "hook-why-us", "land-objection", "offer-standing", "cre-assets"],
  sales: ["brain-focus", "cre-best", "hook-why-us", "offer-standing", "land-objection"],
  traffic: ["aud-who", "hook-why-us", "brain-focus"],
  awareness: ["hook-why-us", "aud-where", "cre-praise"],
  visits: ["aud-where", "hook-why-us", "offer-standing"],
  social: ["cre-assets", "cre-praise", "aud-who", "hook-why-us"],
};
