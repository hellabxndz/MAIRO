import { brandCheck, NO_RULES, type BrandRules } from "@/lib/brain/brand-check";
import { ctaFor, ctaTypeFor, usesAvoided, type ConfirmedFacts } from "@/lib/suggested-ads/directions";

// The creative readiness check: how ready one ad is to run, in seven plain
// areas, each with what MAIRO looked at and what would make it better.
//
// A heuristic, not a forecast. It catches avoidable weaknesses — an opening
// line too long to read, a button that doesn't match the goal, an offer the
// owner confirmed but the ad leaves out, a picture missing for a placement,
// a pixel that can't see the result — and says nothing about how many sales
// or leads the ad will bring. Areas that don't apply are left out of the
// score, not counted as passes. Pure, so scripts/check-creative-readiness.ts
// pins every rule.

export type AreaKey = "message" | "offer" | "brand" | "cta" | "format" | "landing" | "tracking";
export type AreaState = "good" | "improve" | "fix" | "na";
export type Fix = { kind: "shorten-hook" | "match-cta" | "add-offer"; label: string };

export type Area = { key: AreaKey; label: string; state: AreaState; score: number | null; note: string; suggestion: string | null; fix: Fix | null };

export type ReadinessInput = {
  words: { hook: string; body: string; cta: string };
  facts: Pick<ConfirmedFacts, "offering" | "offer" | "goal" | "avoid" | "niche" | "website" | "businessName">;
  brand: BrandRules | null;
  /** The picture or video this ad would run with, if any. */
  media: { kind: "image" | "video" | "none"; aspect?: "9:16" | "4:5" | "1:1" | "16:9" | "original" | null };
  /** Can Meta see the result this goal counts? null = unknown. */
  tracking: { pixelSeesResult: boolean | null; leadFormReady?: boolean };
};

export type Readiness = { score: number; areas: Area[]; fixes: Fix[]; label: string };

export const READINESS_LABEL = "A readiness check, not a prediction: it looks for avoidable weaknesses before an ad runs. It can't tell you how many sales or leads the ad will bring.";

export const AREA_LABEL: Record<AreaKey, string> = {
  message: "Message clarity",
  offer: "Offer clarity",
  brand: "Brand consistency",
  cta: "Call to action",
  format: "Format readiness",
  landing: "Landing-page match",
  tracking: "Tracking readiness",
};

const WEIGHT: Record<AreaKey, number> = { message: 20, offer: 10, brand: 15, cta: 15, format: 15, landing: 15, tracking: 10 };
/** The highest score an ad with something to fix before running can get. */
export const BLOCKED_MAX = 49;
const HOOK_GOOD = 60;
const HOOK_MAX = 90;
/** What the feed shows before "See more". */
const FEED_FOLD = 125;

const words = (s: string) => s.toLowerCase().match(/[a-z]{4,}/g) ?? [];
const stem = (w: string) => w.replace(/(ing|ers|er|es|s|ed)$/, "");

function area(key: AreaKey, state: AreaState, note: string, suggestion: string | null = null, fix: Fix | null = null): Area {
  const score = state === "na" ? null : state === "good" ? 100 : state === "improve" ? 60 : 20;
  return { key, label: AREA_LABEL[key], state, score, note, suggestion, fix };
}

/** The first clause of a long opening line: what "shorten" offers. */
export function shortenedHook(hook: string): string {
  const t = hook.trim();
  if (t.length <= HOOK_GOOD) return t;
  const cut = t.slice(0, HOOK_MAX).split(/(?<=[.?!])\s|\s[—–-]\s|,\s/)[0].trim();
  if (cut.length >= 12 && cut.length <= HOOK_MAX) return cut.replace(/[,;:]$/, "") + (/[.?!]$/.test(cut) ? "" : ".");
  const soft = t.slice(0, HOOK_GOOD).replace(/\s+\S*$/, "");
  return `${soft}…`;
}

export function readiness(input: ReadinessInput): Readiness {
  const { words: w, facts: f } = input;
  const text = `${w.hook} ${w.body}`.trim();
  const areas: Area[] = [];

  // Message: one readable opening line, carried by the rest.
  const hookLen = w.hook.trim().length;
  if (hookLen < 4) areas.push(area("message", "fix", "There's no opening line.", "Write the one sentence you want people to read first."));
  else if (/^[^a-z]*[A-Z]{6,}[^a-z]*$/.test(w.hook)) areas.push(area("message", "improve", "The opening line is in capitals, which reads as shouting in a feed.", "Write it in normal case."));
  else if (hookLen > HOOK_MAX) areas.push(area("message", "improve", `The opening line is ${hookLen} characters; people read the first 60 or so as they scroll.`, "Shorten it to its first idea.", { kind: "shorten-hook", label: "Shorten the opening line" }));
  else if (hookLen > HOOK_GOOD) areas.push(area("message", "improve", `The opening line is ${hookLen} characters — readable, but tighter lands faster.`, "Shorten it to its first idea.", { kind: "shorten-hook", label: "Shorten the opening line" }));
  else areas.push(area("message", "good", "One short opening line people can read while scrolling."));

  // Offer: a confirmed offer, used; no offer confirmed is fine for a non-offer ad.
  const offer = (f.offer ?? "").trim();
  if (!offer) areas.push(area("offer", "na", "No standing offer confirmed — this ad doesn't need one. Add one in the Business Brain to use it."));
  else {
    const offerWords = words(offer).map(stem);
    const textWords = new Set(words(text).map(stem));
    const used = offerWords.length > 0 && offerWords.filter((x) => textWords.has(x)).length / offerWords.length >= 0.6;
    areas.push(used
      ? area("offer", "good", "Your confirmed offer is in the ad, in your words.")
      : area("offer", "improve", `You confirmed an offer — “${offer}” — and this ad doesn't mention it.`, "Add it as the last line, if it fits this direction.", { kind: "add-offer", label: "Add your offer" }));
  }

  // Brand: words to avoid stop it; unconfirmed claims are flagged.
  const avoided = usesAvoided(text, f.avoid ?? []);
  const findings = brandCheck(text, input.brand ?? NO_RULES);
  const problems = findings.filter((x) => x.level === "problem");
  if (avoided || problems.length) areas.push(area("brand", "fix", avoided ? `“${avoided}” is on your list of words to avoid.` : problems[0].text, "Change those words before this ad can run."));
  else if (findings.length) areas.push(area("brand", "improve", findings[0].text, "Confirm it in the Business Brain, or take it out."));
  else areas.push(area("brand", "good", input.brand ? "Nothing your brand rules rule out, and no unconfirmed claims." : "No words to avoid; no brand rules set yet."));

  // Button: it should ask for what the campaign is for.
  const expected = ctaFor(f);
  const type = ctaTypeFor(w.cta);
  if (!w.cta.trim()) areas.push(area("cta", "fix", "There's no button.", `Use “${expected}”.`, { kind: "match-cta", label: `Use “${expected}”` }));
  else if (type === ctaTypeFor(expected)) areas.push(area("cta", "good", `“${w.cta}” asks for what this campaign is for.`));
  else if (type === "LEARN_MORE") areas.push(area("cta", "improve", `“${w.cta}” is shown as Meta's “Learn more”, which asks for less than your goal.`, `Use “${expected}”.`, { kind: "match-cta", label: `Use “${expected}”` }));
  else areas.push(area("cta", "improve", `“${w.cta}” doesn't match the goal (${f.goal}).`, `Use “${expected}”.`, { kind: "match-cta", label: `Use “${expected}”` }));

  // Format: a picture or video, shaped for where it shows; the text before "See more".
  const m = input.media;
  if (m.kind === "none") areas.push(area("format", "fix", "No picture or video yet — the previews are illustrative only.", "Create the picture, or use your own video."));
  else if (m.kind === "video" && (m.aspect === "16:9" || m.aspect === "original")) areas.push(area("format", "improve", "A wide video shows small in Stories and Reels.", "Crop a 9:16 version in the video editor."));
  else if (text.length > FEED_FOLD * 2) areas.push(area("format", "improve", `The text is ${text.length} characters; the feed shows about ${FEED_FOLD} before “See more”.`, "Put the reason to act in the first two lines."));
  else areas.push(area("format", "good", m.kind === "video" ? "Your video, in a shape that fits the placements." : "A finished picture, and text that fits before “See more”."));

  // Landing: where the button sends people, and whether the ad says what that page is about.
  const site = (f.website ?? "").trim();
  if (f.goal === "sales" && !site) areas.push(area("landing", "fix", "A sales ad needs a website to send people to.", "Add your shop's address in the Business Brain."));
  else if (!site) areas.push(area("landing", "good", "People reply through a form inside the ad, so there's no page to match."));
  else {
    const offering = words(f.offering).map(stem);
    const textWords = new Set(words(text).map(stem));
    const mentions = offering.some((x) => textWords.has(x));
    areas.push(mentions
      ? area("landing", "good", `The ad names what people will find on ${site.replace(/^https?:\/\//, "")}.`)
      : area("landing", "improve", `The ad doesn't say what people will find when they reach ${site.replace(/^https?:\/\//, "")}.`, `Mention ${f.offering.replace(/[.!]+$/, "").toLowerCase()} so the page matches the promise.`));
  }

  // Tracking: can Meta see the result this campaign is for?
  const t = input.tracking;
  const sales = f.goal === "sales";
  if (!sales && (t.leadFormReady || !site)) areas.push(area("tracking", "good", "Leads from a form inside the ad are counted by Meta and MAIRO without a pixel."));
  else if (t.pixelSeesResult === true) areas.push(area("tracking", "good", `Your Meta pixel reports ${sales ? "purchases" : f.goal === "bookings" ? "bookings" : "enquiries"} from your website.`));
  else if (t.pixelSeesResult === false && sales) areas.push(area("tracking", "fix", "Meta can't see purchases on your website yet, so it can't learn who buys.", "Set up tracking before this ad runs."));
  // Not a blocker for leads or bookings: a form inside the ad is counted without a pixel.
  else if (t.pixelSeesResult === false) areas.push(area("tracking", "improve", `Meta can't see ${f.goal === "bookings" ? "bookings" : "enquiries"} on your website yet, so it can't learn who gets in touch there.`, "Set up tracking, or collect leads with a form inside the ad."));
  else areas.push(area("tracking", "improve", "MAIRO hasn't confirmed your pixel sees results yet.", "Check tracking."));

  const scored = areas.filter((a) => a.score !== null);
  const weight = scored.reduce((s, a) => s + WEIGHT[a.key], 0);
  const raw = weight ? Math.round(scored.reduce((s, a) => s + (a.score! * WEIGHT[a.key]) / weight, 0)) : 0;
  // Something to fix before running caps the score, so the number never reads "nearly ready" over a blocker.
  const score = areas.some((a) => a.state === "fix") ? Math.min(raw, BLOCKED_MAX) : raw;
  const fixes = areas.map((a) => a.fix).filter((x): x is Fix => Boolean(x));
  return { score, areas, fixes, label: READINESS_LABEL };
}

/** The words after MAIRO's own fixes — offered as a new version, never applied silently. */
export function applyFixes(w: { hook: string; body: string; cta: string }, fixes: Fix[], facts: Pick<ConfirmedFacts, "offer" | "goal" | "niche">): { hook: string; body: string; cta: string } {
  let { hook, body, cta } = w;
  for (const fix of fixes) {
    if (fix.kind === "shorten-hook") hook = shortenedHook(hook);
    if (fix.kind === "match-cta") cta = ctaFor(facts);
    if (fix.kind === "add-offer" && facts.offer) {
      const line = facts.offer.charAt(0).toUpperCase() + facts.offer.slice(1).replace(/[.!]+$/, "") + ".";
      if (!body.toLowerCase().includes(facts.offer.toLowerCase())) body = [body.trim(), line].filter(Boolean).join(" ");
    }
  }
  return { hook, body, cta };
}

/** The shape of a picture or video from its size, for the format check. */
export function aspectOf(width: number, height: number): "9:16" | "4:5" | "1:1" | "16:9" {
  const r = width / Math.max(1, height);
  if (r >= 1.3) return "16:9";
  if (r >= 0.9) return "1:1";
  if (r >= 0.7) return "4:5";
  return "9:16";
}
