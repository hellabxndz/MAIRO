import type { CampaignPlan } from "@/lib/campaigns/plan";
import { LOW_DAILY_CENTS, contextOf, hasOwnWords, plannedSpend, runningCopy } from "@/lib/campaigns/plan";
import type { Finding, ReviewFacts } from "@/lib/campaigns/review-rules";
import { fitCta, HEADLINE_SHOWN, PRIMARY_TEXT_SHOWN, type CopyOption } from "@/lib/campaigns/ad-copy";

// The Pre-Launch Ad Score: one number from 0 to 100 for how ready a campaign
// is, the parts it's made of, and what to fix.
//
// Pure, so every rule is asserted in scripts/check-ad-score.ts. The facts come
// from the same review the campaign already gets (review.ts) plus an optional
// AI read of the words (src/lib/ai/ad-score.ts). Without the AI the words are
// scored by length and structure alone, and the card says so.
//
// What the score is not: a prediction. A high score means MAIRO reduced more
// avoidable weaknesses before launch — not that the ad will sell. The page
// says that too, and never treats 100 as the goal: a campaign can be
// legitimately strong at 88.
//
// The written explanation and the number must agree: the summary never says
// "nothing to improve" while points are missing. Every recommendation names
// its area, what MAIRO estimates that area would score after the change
// (labelled an estimate on the page), and — for setup — a plain-language
// title with the technical reason kept for Advanced view.

export type ScoreFactor =
  | "creative"
  | "hook"
  | "headline"
  | "primaryText"
  | "offer"
  | "cta"
  | "landing"
  | "audience"
  | "objective"
  | "budget"
  | "placements"
  | "retargeting"
  | "mobile"
  | "brand"
  | "readiness";

export const FACTOR_LABEL: Record<ScoreFactor, string> = {
  creative: "Ad creative",
  hook: "Hook (first line)",
  headline: "Headline",
  primaryText: "Main text",
  offer: "Offer",
  cta: "Button",
  landing: "Landing page",
  audience: "Audience",
  objective: "Campaign goal",
  budget: "Budget",
  placements: "Placements",
  retargeting: "Retargeting setup",
  mobile: "Works on phones",
  brand: "Brand consistency",
  readiness: "Overall readiness",
};

/** What the AI read of the words returns. Null fields: not judged. */
export type AiCopyScores = {
  creative: { score: number; reason: string } | null;
  hook: { score: number; reason: string };
  headline: { score: number; reason: string };
  primaryText: { score: number; reason: string };
  offer: { score: number; reason: string };
  brand: { score: number; reason: string } | null;
  /** Whether the offer is clear in the ad itself. */
  offerVisible: boolean;
};

/** What "Fix with AI" can do for a recommendation. */
export type FixKind =
  | "headline"
  | "primaryText"
  | "hook"
  | "cta"
  | "offer"
  | "variation"
  | "audience"
  | "placements"
  | "budget"
  | "landing";

/** The six areas the customer sees. */
export type GroupKey = "creative" | "hook" | "offer" | "audience" | "landing" | "setup";

/** Which area each check counts towards. */
export const FACTOR_GROUP: Record<ScoreFactor, GroupKey> = {
  creative: "creative",
  headline: "creative",
  primaryText: "creative",
  cta: "creative",
  brand: "creative",
  hook: "hook",
  offer: "offer",
  audience: "audience",
  landing: "landing",
  mobile: "landing",
  objective: "setup",
  budget: "setup",
  placements: "setup",
  retargeting: "setup",
  readiness: "setup",
};

export const GROUP_LABEL: Record<GroupKey, string> = {
  creative: "Creative",
  hook: "Hook",
  offer: "Offer",
  audience: "Audience",
  landing: "Landing Page",
  setup: "Campaign Setup",
};

export const GROUP_ORDER: GroupKey[] = ["creative", "hook", "offer", "audience", "landing", "setup"];

const GROUP_WEIGHT: Record<GroupKey, number> = { creative: 0.2, hook: 0.15, offer: 0.15, audience: 0.15, landing: 0.15, setup: 0.2 };

/** Used when a check couldn't be judged at all for this kind of ad. */
const GROUP_FALLBACK: Record<GroupKey, number> = { creative: 60, hook: 65, offer: 60, audience: 70, landing: 70, setup: 70 };

export type ScoreRecommendation = {
  id: string;
  factor: ScoreFactor;
  group: GroupKey;
  /** One sentence, in the customer's words. */
  title: string;
  /** "Show me why". */
  why: string;
  severity: "high" | "medium" | "low";
  /** Null when there's nothing MAIRO can change for them (e.g. their website). */
  fix: FixKind | null;
  fixLabel: string | null;
  /**
   * What MAIRO estimates the checks would score once this is changed. Feeds
   * "Estimated MAIRO score after change" — an estimate of preparation, never
   * of ad results. Empty when MAIRO can't estimate it honestly.
   */
  target: Partial<Record<ScoreFactor, number>>;
  /** Where the customer fixes it outside the wizard, e.g. Tracking. */
  link?: { href: string; label: string };
  /** The technical reason, for Advanced view. */
  technical?: string;
  /** "detected": MAIRO saw evidence of it. Everything here is detected; suggestions live in `checks`. */
  evidence: "detected";
};

/** Something worth checking that MAIRO has no evidence is wrong. Never lowers the score. */
export type SuggestedCheck = { group: GroupKey; text: string };

export type ScoreGroup = { key: GroupKey; label: string; score: number };

export type AdScore = {
  overall: number;
  verdict: string;
  summary: string;
  groups: ScoreGroup[];
  factors: { key: ScoreFactor; label: string; score: number | null; note: string }[];
  recommendations: ScoreRecommendation[];
  /** Things to check that MAIRO didn't detect as problems — kept apart from recommendations. */
  checks: SuggestedCheck[];
  /** Launch-blocking problems found by the review. The score never blocks a launch itself. */
  blocking: number;
  aiUsed: boolean;
};

export type ScoreInput = {
  plan: CampaignPlan;
  facts: ReviewFacts;
  findings: Finding[];
  ai: AiCopyScores | null;
  brain: { brandVoice: string; offers: string[] };
  now?: Date;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function avg(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** The six area scores from the individual checks. */
export function groupsFrom(f: Record<ScoreFactor, number | null>): ScoreGroup[] {
  const of = (key: GroupKey, value: number | null): ScoreGroup => ({ key, label: GROUP_LABEL[key], score: clamp(value ?? GROUP_FALLBACK[key]) });
  return [
    of("creative", avg([f.creative, f.headline, f.primaryText, f.cta, f.brand])),
    of("hook", f.hook),
    of("offer", f.offer),
    of("audience", f.audience),
    of("landing", avg([f.landing, f.mobile])),
    of("setup", avg([f.objective, f.budget, f.placements, f.retargeting, f.readiness])),
  ];
}

/** The overall score from the areas. Something that stops the launch caps it. */
export function overallFrom(groups: ScoreGroup[], blocking: number): number {
  const overall = clamp(groups.reduce((n, g) => n + g.score * GROUP_WEIGHT[g.key], 0));
  // A campaign that can't run is not a strong campaign however good its words are.
  return blocking > 0 ? Math.min(overall, 45) : overall;
}

export type ScoreBand = { key: "excellent" | "strong" | "good" | "needs" | "major"; title: string; line: string; short: string };

/** The same words for the same range, everywhere the score is shown. */
export function scoreBand(overall: number): ScoreBand {
  if (overall >= 90) return { key: "excellent", title: "Excellent Preparation", line: "Your campaign is well prepared for launch.", short: "Excellent campaign" };
  if (overall >= 80) return { key: "strong", title: "Strong Preparation", line: "Your campaign looks strong, with a few opportunities to improve.", short: "Strong campaign" };
  if (overall >= 70) return { key: "good", title: "Good Preparation", line: "Your campaign is ready, but MAIRO identified several ways to strengthen it.", short: "Good campaign" };
  if (overall >= 60) return { key: "needs", title: "Needs Improvement", line: "MAIRO recommends improving a few important areas before spending money.", short: "This campaign needs some work" };
  return { key: "major", title: "Major Improvements Recommended", line: "MAIRO found several campaign weaknesses worth addressing before launch.", short: "This campaign needs work" };
}

/** Said when the score is below 100 but MAIRO has nothing specific to recommend. */
export const PASSED_KEY_CHECKS =
  "Your campaign passed MAIRO's key preparation checks. Some score differences reflect uncertainty or limited available data rather than a specific problem.";

/**
 * The sentence under the score. It always agrees with the number: points
 * missing with recommendations names them; points missing without any says
 * the difference is uncertainty, not a problem; only 100 says everything passed.
 */
export function scoreSummary(overall: number, recommendations: number, blocking: number): string {
  if (blocking > 0) return `Setup required — ${blocking === 1 ? "one thing must" : `${blocking} things must`} be fixed before this campaign can launch.`;
  if (recommendations > 0) {
    const band = scoreBand(overall);
    const ways = recommendations === 1 ? "one way" : recommendations <= 3 ? "a few ways" : "several ways";
    return overall >= 70 ? `${band.short} — but MAIRO found ${ways} to make it stronger.` : `${band.short} — ${band.line}`;
  }
  return overall >= 100 ? "Your campaign passed every MAIRO preparation check." : PASSED_KEY_CHECKS;
}

/** Offers a business can make without discounting: what MAIRO suggests first, by kind of business. */
export function offerIdeas(category: string): string[] {
  const ideas: Record<string, string[]> = {
    trades: ["A free estimate", "A workmanship guarantee", "Financing or payment plans"],
    services: ["A free consultation", "A clear first-session package", "A satisfaction guarantee"],
    health: ["A free consultation", "A new-patient visit", "Flexible payment options"],
    retail: ["Free shipping over an amount", "A bundle", "Limited stock or a new drop"],
    food: ["A dish of the week", "A weekday special", "A bonus item with an order"],
    beauty_fitness: ["A first-visit offer", "A package of sessions", "A free class or trial"],
    software: ["A free trial", "A live demo", "A money-back guarantee"],
    auto: ["A package (wash + protection)", "A maintenance plan", "A free inspection"],
    realestate: ["A free home valuation", "Exclusive early access to listings", "A free buyer consultation"],
  };
  return ideas[category] ?? ["A free consultation or quote", "A bundle or bonus", "A guarantee that removes the risk"];
}

// Offers written into an ad that a page should repeat, and how to find them.
const OFFER_TOKENS: { re: RegExp; label: (m: RegExpMatchArray) => string; onPage: (m: RegExpMatchArray) => RegExp }[] = [
  { re: /(\d{1,2})\s?%\s?off/i, label: (m) => `${m[1]}% off`, onPage: (m) => new RegExp(`${m[1]}\\s?%`, "i") },
  { re: /\$(\d+)\s?off/i, label: (m) => `$${m[1]} off`, onPage: (m) => new RegExp(`\\$\\s?${m[1]}`, "i") },
  { re: /free (shipping|delivery)/i, label: (m) => `free ${m[1].toLowerCase()}`, onPage: () => /free\s+(shipping|delivery)/i },
  { re: /free (estimate|quote|consultation|trial)/i, label: (m) => `free ${m[1].toLowerCase()}`, onPage: (m) => new RegExp(`free\\s+${m[1]}`, "i") },
  { re: /buy one,? get one|\bbogo\b/i, label: () => "buy one, get one", onPage: () => /buy one,? get one|\bbogo\b/i },
];

/** The offers the ad states that the page doesn't. Empty when the page text wasn't readable. */
export function offersMissingFromPage(adWords: string, pageText: string | undefined): string[] {
  if (!pageText || pageText.length < 200) return [];
  const missing: string[] = [];
  for (const t of OFFER_TOKENS) {
    const m = adWords.match(t.re);
    if (m && !t.onPage(m).test(pageText)) missing.push(t.label(m));
  }
  return missing;
}

/** The first sentence of the main text: what people read before scrolling on. */
export function hookOf(text: string): string {
  const t = text.trim();
  const m = t.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (m ? m[0] : t.split("\n")[0]).trim();
}

const WEAK_OPENERS = /^(we are|we're|at [a-z0-9' ]+,? we|introducing|welcome to|check out|hello|hi\b|our company|this is)/i;
const OFFER_WORDS = /\b(free|off|discount|save|deal|offer|% ?off|\$\d|bundle|trial|bonus|gift|limited|new)\b/i;

function scoreHookText(hook: string): { score: number; note: string } {
  if (!hook) return { score: 30, note: "There's no opening line." };
  if (WEAK_OPENERS.test(hook)) return { score: 50, note: "It opens by talking about the business, which people scroll past." };
  if (hook.length > 110) return { score: 58, note: "The first line is long — most people read only the start." };
  if (/\?$/.test(hook) || /^\d|^you\b|^your\b/i.test(hook)) return { score: 84, note: "Opens with a question, a number or the reader — good for stopping the scroll." };
  return { score: 72, note: "A reasonable opening." };
}

function scoreHeadline(h: string): { score: number; note: string } {
  const t = h.trim();
  if (!t) return { score: 30, note: "There's no headline." };
  if (t.length > HEADLINE_SHOWN) return { score: 58, note: `Longer than ${HEADLINE_SHOWN} characters, so it's cut off on most placements.` };
  if (t.length < 8) return { score: 62, note: "Very short — it may not say enough." };
  return { score: 82, note: "A clear length for every placement." };
}

function scorePrimary(t: string): { score: number; note: string } {
  const text = t.trim();
  if (!text) return { score: 30, note: "There's no main text." };
  if (text.length < 25) return { score: 58, note: "Very short — it may not give people a reason to tap." };
  if (text.length > 300) return { score: 60, note: "Long — most people only see the first line before \"See more\"." };
  if (hookOf(text).length <= PRIMARY_TEXT_SHOWN) return { score: 82, note: "The point comes before \"See more\"." };
  return { score: 70, note: "The first sentence runs past what's shown before \"See more\"." };
}

export function scoreCampaign(input: ScoreInput): AdScore {
  const { plan, facts, findings, ai, brain } = input;
  const now = input.now ?? new Date();
  const recs: ScoreRecommendation[] = [];
  const checks: SuggestedCheck[] = [];
  const rec = (r: Omit<ScoreRecommendation, "group" | "evidence" | "target"> & { target?: ScoreRecommendation["target"] }) =>
    recs.push({ ...r, group: FACTOR_GROUP[r.factor], evidence: "detected", target: r.target ?? {} });
  const context = contextOf(plan);
  const blocking = findings.filter((f) => f.severity === "blocking");
  const own = hasOwnWords(plan);
  const copy: CopyOption | null = own ? (runningCopy(plan)[0] ?? null) : null;
  const postText = (plan.adChoice === "FACEBOOK_POST" || plan.adChoice === "INSTAGRAM_POST") ? plan.selectedPost?.message ?? null : null;
  const words = copy ? copy.primaryText : postText;

  // --- creative -------------------------------------------------------------
  const visual =
    plan.adChoice === "attached" || plan.adChoice === "images" || plan.adChoice === "video"
      ? true
      : plan.adChoice === "EXISTING_AD" || plan.adChoice === "FACEBOOK_POST" || plan.adChoice === "INSTAGRAM_POST"
        ? Boolean(plan.existingAd || plan.selectedPost)
        : facts.hasApprovedCreative;
  let creative = visual ? 78 : 40;
  let creativeNote = visual ? "A picture or video is ready." : "There's no picture or video for the ad yet.";
  if (ai?.creative) {
    creative = ai.creative.score;
    creativeNote = ai.creative.reason;
  }
  if (findings.some((f) => f.id === "cropped")) {
    creative -= 10;
    creativeNote += " It may be cropped in Stories and Reels.";
  }
  if (!visual) {
    rec({ id: "creative-missing", factor: "creative", severity: "high", title: "Your ad has no picture or video yet.", why: "Ads without a strong visual are scrolled past. Add one in the Advertisement step, or make one in Creative Studio.", fix: null, fixLabel: null, target: { creative: 78 } });
  } else if (own && creative < 72) {
    rec({ id: "creative-variation", factor: "creative", severity: "medium", title: ai?.creative?.reason ?? "Your creative could be stronger.", why: "Testing a second version of the words lets Meta show whichever works better.", fix: "variation", fixLabel: "Generate another version" });
  }

  // --- words ---------------------------------------------------------------
  const hookH = words ? scoreHookText(hookOf(words)) : null;
  const hook = ai ? ai.hook.score : (hookH?.score ?? null);
  const hookNote = ai ? ai.hook.reason : (hookH?.note ?? "MAIRO can't read the words of this ad.");
  const headH = copy ? scoreHeadline(copy.headline) : null;
  const headline = ai ? ai.headline.score : (headH?.score ?? null);
  const primH = words ? scorePrimary(words) : null;
  const primaryText = ai ? ai.primaryText.score : (primH?.score ?? null);

  if (own && hook !== null && hook < 70) {
    rec({ id: "hook", factor: "hook", severity: hook < 55 ? "high" : "medium", title: "Your first line may not stop enough people from scrolling.", why: `${hookNote} The first few words decide whether anyone reads on.`, fix: "hook", fixLabel: "Generate a stronger hook", target: { hook: 82 } });
  } else if (own && hook !== null && hook < 80) {
    // Not a problem, but improvable — said, so the summary and the page agree.
    rec({ id: "hook-sharpen", factor: "hook", severity: "low", title: "Your opening line could give a sharper reason to stop scrolling.", why: `${hookNote} Leading with the customer's problem or the result they get usually stops more people.`, fix: "hook", fixLabel: "Generate a stronger hook", target: { hook: 82 } });
  }
  if (own && headline !== null && headline < 70) {
    rec({ id: "headline", factor: "headline", severity: "medium", title: "Your headline could work harder.", why: ai ? ai.headline.reason : (headH?.note ?? ""), fix: "headline", fixLabel: "Rewrite headline", target: { headline: 82 } });
  }
  if (own && primaryText !== null && primaryText < 70) {
    rec({ id: "primary", factor: "primaryText", severity: "medium", title: "Your main text could be clearer.", why: ai ? ai.primaryText.reason : (primH?.note ?? ""), fix: "primaryText", fixLabel: "Rewrite main text", target: { primaryText: 82 } });
  }

  // --- offer -----------------------------------------------------------------
  // A promotion the owner gave for this campaign is as real as a standing one.
  const knownOffer = brain.offers.length > 0 || Boolean(context.promotion.trim()) || OFFER_WORDS.test(`${plan.offering} ${plan.promotesDetail}`);
  const offerShown = ai ? ai.offerVisible : Boolean(words && OFFER_WORDS.test(words));
  let offer = ai ? ai.offer.score : knownOffer ? (offerShown ? 82 : 60) : 55;
  if (!words) offer = knownOffer ? 70 : 55;
  if (own && knownOffer && !offerShown) {
    rec({ id: "offer-hidden", factor: "offer", severity: "medium", title: "Your offer isn't clearly visible in the ad.", why: "People decide in a second. If the offer you have isn't in the words, most won't find out about it.", fix: "offer", fixLabel: "Make the offer clear", target: { offer: 82 } });
  } else if (!knownOffer) {
    rec({ id: "offer-none", factor: "offer", severity: "low", title: "The reason to act now could be stronger.", why: "Your campaign tells customers what you're selling, but there's no specific offer yet. An offer doesn't have to be a discount — a free estimate, a guarantee, a bundle or limited stock all count. MAIRO can suggest ideas, but only you can say which are real.", fix: "offer", fixLabel: "Suggest a stronger offer", target: { offer: 82 } });
  }

  // --- button ------------------------------------------------------------------
  let cta: number | null = null;
  if (copy) {
    cta = fitCta(copy.cta, plan.destinationType) === copy.cta ? 88 : 55;
    if (cta < 70) rec({ id: "cta", factor: "cta", severity: "medium", title: "The button doesn't match where people go.", why: "A button that promises one thing and does another loses the click.", fix: "cta", fixLabel: "Improve the button", target: { cta: 88 } });
  }

  // --- landing page and phones -----------------------------------------------------
  const website = plan.destinationType === "WEBSITE";
  const probe = facts.landing;
  let landing = 85;
  let landingNote = website ? "Your page loads." : "People act inside the ad, so there's no page to check.";
  let mobile = 85;
  if (website && !probe) {
    landing = 60;
    landingNote = "MAIRO couldn't check the page.";
  } else if (website && probe && !probe.ok) {
    landing = probe.reason === "error_status" ? 15 : 45;
    landingNote = probe.message;
    rec({ id: "landing-broken", factor: "landing", severity: "high", title: "Your landing page didn't load for MAIRO.", why: `${probe.message} People who click the ad would land on the same thing.`, fix: "landing", fixLabel: "Check my website", target: { landing: 85 } });
  } else if (website && probe && probe.ok && !probe.mobileReady) {
    landing = 58;
    mobile = 40;
    landingNote = "It isn't set up for phones.";
    rec({ id: "landing-mobile", factor: "mobile", severity: "high", title: "Your landing page may not work well on phones.", why: "It has no mobile layout, so it likely opens zoomed out — and almost everyone who taps an ad is on a phone.", fix: "landing", fixLabel: "Check my website", target: { landing: 85, mobile: 85 } });
  }
  // Detected: only when the page's own words were read and the offer isn't in them.
  const pageText = website && probe && probe.ok ? probe.text : undefined;
  const missingOffers = words ? offersMissingFromPage(`${words} ${copy?.headline ?? ""}`, pageText) : [];
  if (missingOffers.length > 0) {
    landing = Math.min(landing, 68);
    landingNote = `The ad mentions ${missingOffers[0]}, but the page doesn't.`;
    rec({ id: "landing-offer", factor: "landing", severity: "medium", title: `The ad says ${missingOffers[0]}, but that isn't visible on the page people land on.`, why: "When the page doesn't repeat what the ad promised, people wonder if they're in the right place and leave. Show the same offer near the top of the page, or change the ad to match.", fix: null, fixLabel: null, target: { landing: 85 } });
  }
  if (website && probe && probe.ok) {
    // Suggestions: worth a look, but MAIRO has no evidence they're wrong.
    checks.push({ group: "landing", text: "Make sure the button people should press is easy to find without scrolling on a phone." });
    checks.push({ group: "landing", text: "Make sure checking out or getting in touch takes as few steps as possible on mobile." });
    if (words && !pageText) checks.push({ group: "landing", text: "Make sure the page shows the same offer and product as the ad — MAIRO couldn't read its words to compare." });
    if (facts.metaPixelActive && !probe.hasMetaPixel) checks.push({ group: "setup", text: "MAIRO didn't see Meta's pixel in this page's code. If it's added by a tag manager that's fine — otherwise purchases on this page may not be counted." });
    checks.push({ group: "landing", text: "Reviews, guarantees or contact details near the button help people trust the page." });
  }

  // --- audience ----------------------------------------------------------------
  let audience = plan.audienceMode === "ai" ? 86 : 80;
  let audienceNote = plan.audienceMode === "ai" ? "Meta finds the people most likely to respond." : "Your own targeting.";
  if (findings.some((f) => f.id === "local-nationwide")) {
    audience = 50;
    audienceNote = "It would run across the whole country.";
    rec({ id: "audience-local", factor: "audience", severity: "high", title: "Your ad would run across the whole country.", why: "For a business people visit or call, most of that budget reaches people too far away. Add your town in the Audience step.", fix: "audience", fixLabel: "Recommend an audience fix", target: { audience: 80 } });
  } else if (findings.some((f) => f.id === "narrow")) {
    audience = 55;
    audienceNote = "It may be too narrow for this budget.";
    rec({ id: "audience-narrow", factor: "audience", severity: "medium", title: "Your audience may be too narrow for this budget.", why: "A small area and a narrow age range leave Meta few people to show the ad to, which makes each result dearer.", fix: "audience", fixLabel: "Widen the audience", target: { audience: 80 } });
  }

  // --- goal ------------------------------------------------------------------------
  let objective = plan.goal ? 86 : 20;
  if (findings.some((f) => f.id === "traffic-vs-sales")) {
    objective = 60;
    rec({ id: "objective", factor: "objective", severity: "medium", title: "You're paying for visits, not purchases.", why: "Your tracking works, so a Sales campaign lets Meta look for buyers rather than clickers. Change it in the Goal step.", fix: null, fixLabel: null, target: { objective: 86 }, technical: "Objective is Traffic while an active pixel could support OUTCOME_SALES with a purchase optimization event." });
  } else if (plan.goal === "SALES" && !facts.metaPixelActive) {
    objective = 66;
    if (website) {
      rec({ id: "tracking", factor: "objective", severity: "medium", title: "MAIRO may not be able to measure purchases correctly yet.", why: "Without working sales tracking on your website, Meta can't tell which people bought — so it can't look for more buyers, and MAIRO can't show you sales from this campaign. Setting it up takes a few minutes.", fix: null, fixLabel: null, link: { href: "/dashboard/tracking", label: "Fix Tracking" }, target: { objective: 86, retargeting: 86 }, technical: "No active Meta pixel/dataset is sending Purchase events, so the campaign can't optimize for the Purchase conversion event and conversions won't be attributed. Retargeting audiences from site visitors are also unavailable." });
    }
  }

  // --- budget ------------------------------------------------------------------------
  const perDay = plannedSpend(plan, now).perDayCents;
  let budget = 84;
  if (findings.some((f) => f.id === "budget-too-low")) budget = 15;
  else if (perDay < LOW_DAILY_CENTS) budget = 52;
  else if (plan.goal === "SALES" && perDay < 2000) budget = 66;
  if (findings.some((f) => f.id === "test-too-big")) budget = Math.min(budget, 50);
  if (budget < 70 && budget > 15) {
    rec({ id: "budget", factor: "budget", severity: "medium", title: plan.goal === "SALES" ? "Your budget is on the low side for a sales campaign." : "Your budget is on the small side.", why: "Meta needs enough results each week to learn who responds. Too little budget and learning takes much longer.", fix: "budget", fixLabel: "Recommend a budget", target: { budget: 84 } });
  }

  // --- placements -------------------------------------------------------------------
  let placements = plan.choosingPlacements ? (plan.placements.length >= 3 ? 75 : 58) : 88;
  if (plan.choosingPlacements && plan.placements.length < 3) {
    rec({ id: "placements", factor: "placements", severity: "low", title: "Your ad is limited to a few placements.", why: "Letting Meta choose placements usually finds cheaper results, because it can show the ad wherever it's working best.", fix: "placements", fixLabel: "Let Meta choose placements", target: { placements: 88 } });
  }
  if (findings.some((f) => f.id === "cropped")) placements -= 8;

  // --- retargeting --------------------------------------------------------------------
  const retargeting = facts.metaPixelActive ? 86 : 45;
  // For a sales campaign the tracking recommendation above already covers this.
  if (!facts.metaPixelActive && website && !recs.some((r) => r.id === "tracking")) {
    rec({ id: "retargeting", factor: "retargeting", severity: "low", title: "Visitors from this ad can't be reminded about you later.", why: "Without sales tracking on your site, nobody who visits can be shown a reminder ad afterwards — and MAIRO can't measure what they buy.", fix: null, fixLabel: null, link: { href: "/dashboard/tracking", label: "Fix Tracking" }, target: { retargeting: 86 }, technical: "No active Meta pixel, so website custom audiences for retargeting can't be built." });
  }

  // --- brand --------------------------------------------------------------------------
  let brand: number | null = 72;
  let brandNote = "Add your brand voice in Business Brain so MAIRO can check the ad sounds like you.";
  if (ai?.brand) {
    brand = ai.brand.score;
    brandNote = ai.brand.reason;
  } else if (!own) {
    brand = null;
    brandNote = "Not judged for an existing ad or post.";
  }

  // --- readiness ----------------------------------------------------------------------
  const suggestions = findings.filter((f) => f.severity === "recommendation").length;
  const readiness = blocking.length > 0 ? 20 : Math.max(60, 94 - suggestions * 5);

  const factors: AdScore["factors"] = [
    { key: "creative", label: FACTOR_LABEL.creative, score: clamp(creative), note: creativeNote },
    { key: "hook", label: FACTOR_LABEL.hook, score: hook === null ? null : clamp(hook), note: hookNote },
    { key: "headline", label: FACTOR_LABEL.headline, score: headline === null ? null : clamp(headline), note: ai ? ai.headline.reason : (headH?.note ?? "Not judged for this kind of ad.") },
    { key: "primaryText", label: FACTOR_LABEL.primaryText, score: primaryText === null ? null : clamp(primaryText), note: ai ? ai.primaryText.reason : (primH?.note ?? "Not judged for this kind of ad.") },
    { key: "offer", label: FACTOR_LABEL.offer, score: clamp(offer), note: ai ? ai.offer.reason : knownOffer ? (offerShown ? "Your offer is in the ad." : "You have an offer, but it isn't in the words.") : "No specific offer." },
    { key: "cta", label: FACTOR_LABEL.cta, score: cta, note: cta === null ? "Not judged for this kind of ad." : cta >= 70 ? "Matches where people go." : "Doesn't match where people go." },
    { key: "landing", label: FACTOR_LABEL.landing, score: clamp(landing), note: landingNote },
    { key: "audience", label: FACTOR_LABEL.audience, score: clamp(audience), note: audienceNote },
    { key: "objective", label: FACTOR_LABEL.objective, score: clamp(objective), note: plan.goal ? "Fits what you're advertising." : "No goal chosen." },
    { key: "budget", label: FACTOR_LABEL.budget, score: clamp(budget), note: `$${(perDay / 100).toFixed(0)} a day.` },
    { key: "placements", label: FACTOR_LABEL.placements, score: clamp(placements), note: plan.choosingPlacements ? `${plan.placements.length} chosen by you.` : "Meta chooses (recommended)." },
    { key: "retargeting", label: FACTOR_LABEL.retargeting, score: retargeting, note: facts.metaPixelActive ? "Your pixel is working." : "Your pixel isn't sending events yet." },
    { key: "mobile", label: FACTOR_LABEL.mobile, score: clamp(mobile), note: mobile >= 70 ? "Fine on phones." : "Not set up for phones." },
    { key: "brand", label: FACTOR_LABEL.brand, score: brand === null ? null : clamp(brand), note: brandNote },
    { key: "readiness", label: FACTOR_LABEL.readiness, score: readiness, note: blocking.length ? `${blocking.length} thing${blocking.length === 1 ? "" : "s"} must be fixed first.` : "Nothing blocking launch." },
  ];
  const f = Object.fromEntries(factors.map((x) => [x.key, x.score])) as Record<ScoreFactor, number | null>;

  const groups = groupsFrom(f);
  const overall = overallFrom(groups, blocking.length);

  const order = { high: 0, medium: 1, low: 2 };
  recs.sort((a, b) => order[a.severity] - order[b.severity]);

  const verdict = blocking.length > 0 ? "Setup required" : scoreBand(overall).title;
  const summary = scoreSummary(overall, recs.length, blocking.length);

  return { overall, verdict, summary, groups, factors, recommendations: recs, checks, blocking: blocking.length, aiUsed: ai !== null };
}
