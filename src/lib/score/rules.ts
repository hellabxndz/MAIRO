import type { CampaignPlan } from "@/lib/campaigns/plan";
import { LOW_DAILY_CENTS, hasOwnWords, plannedSpend, runningCopy } from "@/lib/campaigns/plan";
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
// What the score is not: a prediction. A high score means nothing avoidable
// is in the way — not that the ad will sell. The card says that too.

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

export type ScoreRecommendation = {
  id: string;
  factor: ScoreFactor;
  /** One sentence, in the customer's words. */
  title: string;
  /** "Show me why". */
  why: string;
  severity: "high" | "medium" | "low";
  /** Null when there's nothing MAIRO can change for them (e.g. their website). */
  fix: FixKind | null;
  fixLabel: string | null;
};

export type ScoreGroup = { key: "creative" | "hook" | "offer" | "audience" | "landing" | "setup"; label: string; score: number };

export type AdScore = {
  overall: number;
  verdict: string;
  summary: string;
  groups: ScoreGroup[];
  factors: { key: ScoreFactor; label: string; score: number | null; note: string }[];
  recommendations: ScoreRecommendation[];
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
  const rec = (r: ScoreRecommendation) => recs.push(r);
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
    rec({ id: "creative-missing", factor: "creative", severity: "high", title: "Your ad has no picture or video yet.", why: "Ads without a strong visual are scrolled past. Add one in the Advertisement step, or make one in Creative Studio.", fix: null, fixLabel: null });
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
    rec({ id: "hook", factor: "hook", severity: hook < 55 ? "high" : "medium", title: "Your first line may not stop enough people from scrolling.", why: `${hookNote} The first few words decide whether anyone reads on.`, fix: "hook", fixLabel: "Generate a stronger hook" });
  }
  if (own && headline !== null && headline < 70) {
    rec({ id: "headline", factor: "headline", severity: "medium", title: "Your headline could work harder.", why: ai ? ai.headline.reason : (headH?.note ?? ""), fix: "headline", fixLabel: "Rewrite headline" });
  }
  if (own && primaryText !== null && primaryText < 70) {
    rec({ id: "primary", factor: "primaryText", severity: "medium", title: "Your main text could be clearer.", why: ai ? ai.primaryText.reason : (primH?.note ?? ""), fix: "primaryText", fixLabel: "Rewrite main text" });
  }

  // --- offer -----------------------------------------------------------------
  const knownOffer = brain.offers.length > 0 || OFFER_WORDS.test(`${plan.offering} ${plan.promotesDetail}`);
  const offerShown = ai ? ai.offerVisible : Boolean(words && OFFER_WORDS.test(words));
  let offer = ai ? ai.offer.score : knownOffer ? (offerShown ? 82 : 60) : 55;
  if (!words) offer = knownOffer ? 70 : 55;
  if (own && knownOffer && !offerShown) {
    rec({ id: "offer-hidden", factor: "offer", severity: "medium", title: "Your offer isn't clearly visible in the ad.", why: "People decide in a second. If the offer you have isn't in the words, most won't find out about it.", fix: "offer", fixLabel: "Make the offer clear" });
  } else if (!knownOffer) {
    rec({ id: "offer-none", factor: "offer", severity: "low", title: "There's no specific offer in this campaign.", why: "A concrete reason to act now — free delivery, a first-order discount, a free consultation — usually helps. MAIRO can suggest ideas, but only you can say which are real.", fix: "offer", fixLabel: "Suggest a stronger offer" });
  }

  // --- button ------------------------------------------------------------------
  let cta: number | null = null;
  if (copy) {
    cta = fitCta(copy.cta, plan.destinationType) === copy.cta ? 88 : 55;
    if (cta < 70) rec({ id: "cta", factor: "cta", severity: "medium", title: "The button doesn't match where people go.", why: "A button that promises one thing and does another loses the click.", fix: "cta", fixLabel: "Improve the button" });
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
    rec({ id: "landing-broken", factor: "landing", severity: "high", title: "Your landing page didn't load for MAIRO.", why: `${probe.message} People who click the ad would land on the same thing.`, fix: "landing", fixLabel: "Check my website" });
  } else if (website && probe && probe.ok && !probe.mobileReady) {
    landing = 58;
    mobile = 40;
    landingNote = "It isn't set up for phones.";
    rec({ id: "landing-mobile", factor: "mobile", severity: "high", title: "Your landing page may not work well on phones.", why: "It has no mobile layout, so it likely opens zoomed out — and almost everyone who taps an ad is on a phone.", fix: "landing", fixLabel: "Check my website" });
  }

  // --- audience ----------------------------------------------------------------
  let audience = plan.audienceMode === "ai" ? 86 : 80;
  let audienceNote = plan.audienceMode === "ai" ? "Meta finds the people most likely to respond." : "Your own targeting.";
  if (findings.some((f) => f.id === "local-nationwide")) {
    audience = 50;
    audienceNote = "It would run across the whole country.";
    rec({ id: "audience-local", factor: "audience", severity: "high", title: "Your ad would run across the whole country.", why: "For a business people visit or call, most of that budget reaches people too far away. Add your town in the Audience step.", fix: "audience", fixLabel: "Recommend an audience fix" });
  } else if (findings.some((f) => f.id === "narrow")) {
    audience = 55;
    audienceNote = "It may be too narrow for this budget.";
    rec({ id: "audience-narrow", factor: "audience", severity: "medium", title: "Your audience may be too narrow for this budget.", why: "A small area and a narrow age range leave Meta few people to show the ad to, which makes each result dearer.", fix: "audience", fixLabel: "Widen the audience" });
  }

  // --- goal ------------------------------------------------------------------------
  let objective = plan.goal ? 86 : 20;
  if (findings.some((f) => f.id === "traffic-vs-sales")) {
    objective = 60;
    rec({ id: "objective", factor: "objective", severity: "medium", title: "You're paying for visits, not purchases.", why: "Your tracking works, so a Sales campaign lets Meta look for buyers rather than clickers. Change it in the Goal step.", fix: null, fixLabel: null });
  } else if (plan.goal === "SALES" && !facts.metaPixelActive) {
    objective = 66;
  }

  // --- budget ------------------------------------------------------------------------
  const perDay = plannedSpend(plan, now).perDayCents;
  let budget = 84;
  if (findings.some((f) => f.id === "budget-too-low")) budget = 15;
  else if (perDay < LOW_DAILY_CENTS) budget = 52;
  else if (plan.goal === "SALES" && perDay < 2000) budget = 66;
  if (findings.some((f) => f.id === "test-too-big")) budget = Math.min(budget, 50);
  if (budget < 70 && budget > 15) {
    rec({ id: "budget", factor: "budget", severity: "medium", title: plan.goal === "SALES" ? "Your budget is on the low side for a sales campaign." : "Your budget is on the small side.", why: "Meta needs enough results each week to learn who responds. Too little budget and learning takes much longer.", fix: "budget", fixLabel: "Recommend a budget" });
  }

  // --- placements -------------------------------------------------------------------
  let placements = plan.choosingPlacements ? (plan.placements.length >= 3 ? 75 : 58) : 88;
  if (plan.choosingPlacements && plan.placements.length < 3) {
    rec({ id: "placements", factor: "placements", severity: "low", title: "Your ad is limited to a few placements.", why: "Letting Meta choose placements usually finds cheaper results, because it can show the ad wherever it's working best.", fix: "placements", fixLabel: "Let Meta choose placements" });
  }
  if (findings.some((f) => f.id === "cropped")) placements -= 8;

  // --- retargeting --------------------------------------------------------------------
  const retargeting = facts.metaPixelActive ? 86 : 45;
  if (!facts.metaPixelActive && website) {
    rec({ id: "retargeting", factor: "retargeting", severity: "low", title: "Visitors from this ad can't be retargeted later.", why: "Without Meta's pixel on your site, nobody who visits can be shown a reminder ad afterwards — and MAIRO can't measure what they buy. Set it up under Tracking.", fix: null, fixLabel: null });
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

  const groups: ScoreGroup[] = [
    { key: "creative", label: "Creative", score: clamp(avg([f.creative, f.headline, f.primaryText, f.cta, f.brand]) ?? 60) },
    { key: "hook", label: "Hook", score: clamp(f.hook ?? 65) },
    { key: "offer", label: "Offer", score: clamp(f.offer ?? 60) },
    { key: "audience", label: "Audience", score: clamp(f.audience ?? 70) },
    { key: "landing", label: "Landing Page", score: clamp(avg([f.landing, f.mobile]) ?? 70) },
    { key: "setup", label: "Campaign Setup", score: clamp(avg([f.objective, f.budget, f.placements, f.retargeting, f.readiness]) ?? 70) },
  ];
  const weights: Record<ScoreGroup["key"], number> = { creative: 0.2, hook: 0.15, offer: 0.15, audience: 0.15, landing: 0.15, setup: 0.2 };
  let overall = clamp(groups.reduce((n, g) => n + g.score * weights[g.key], 0));
  // Something that stops the launch caps the score: a campaign that can't run
  // is not a strong campaign however good its words are.
  if (blocking.length > 0) overall = Math.min(overall, 45);

  const order = { high: 0, medium: 1, low: 2 };
  recs.sort((a, b) => order[a.severity] - order[b.severity]);

  const verdict =
    blocking.length > 0 ? "Setup required" : overall >= 85 ? "Excellent campaign" : overall >= 70 ? "Strong campaign" : overall >= 55 ? "Good start" : "Needs work";
  const summary =
    recs.length === 0
      ? `${verdict} — Mairo found nothing to improve before launch.`
      : `${verdict} — Mairo found ${recs.length} improvement${recs.length === 1 ? "" : "s"} before launch.`;

  return { overall, verdict, summary, groups, factors, recommendations: recs, aiUsed: ai !== null };
}
