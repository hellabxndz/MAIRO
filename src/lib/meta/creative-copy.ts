// Pulling the ad copy out of the concept the Creative agent wrote.
//
// The concept is markdown, written to a fixed structure by the system prompt in
// src/lib/ai/creative.ts: **Headline**, **Primary text**, **Call to action**.
// A real Meta ad needs those three as separate fields, so they have to come
// back out again.
//
// The rule this file follows is that it never invents. A concept whose
// headline could not be found returns null for the headline, and the caller
// refuses to build the ad — because the alternative is an ad that runs on the
// customer's money with a placeholder in it, and nothing in the product would
// show that had happened. An LLM writing to a template is reliable enough to
// parse and not reliable enough to trust, which is exactly when a parser should
// be strict and loud.

export type AdCopy = {
  headline: string | null;
  primaryText: string | null;
  /** Meta's call_to_action type, e.g. SHOP_NOW. Null when not recognised. */
  callToAction: string | null;
};

/**
 * Meta's call-to-action buttons.
 *
 * The concept names one in English ("Shop now", "Get quote"), so it is matched
 * back to Meta's enum. An unrecognised one is null rather than a guess:
 * sending an invalid type is rejected by Meta with an error that names the
 * field and not the value, which is a slow thing to debug.
 */
const CTA_BY_PHRASE: [RegExp, string][] = [
  [/shop\s*now|buy\s*now/i, "SHOP_NOW"],
  [/order\s*now/i, "ORDER_NOW"],
  [/book\s*(now|a\s*table|an?\s*appointment)?/i, "BOOK_TRAVEL"],
  [/see\s*menu|view\s*menu/i, "SEE_MENU"],
  [/get\s*(a\s*)?quote/i, "GET_QUOTE"],
  [/call\s*now/i, "CALL_NOW"],
  [/contact\s*us/i, "CONTACT_US"],
  [/sign\s*up/i, "SIGN_UP"],
  [/subscribe/i, "SUBSCRIBE"],
  [/download/i, "DOWNLOAD"],
  [/apply\s*now/i, "APPLY_NOW"],
  [/get\s*offer/i, "GET_OFFER"],
  [/send\s*message/i, "MESSAGE_PAGE"],
  [/learn\s*more|find\s*out\s*more|read\s*more/i, "LEARN_MORE"],
];

/** Every value Meta accepts, so a mapped one can be checked before it is sent. */
export const META_CTA_TYPES = new Set([
  "SHOP_NOW", "ORDER_NOW", "BOOK_TRAVEL", "SEE_MENU", "GET_QUOTE", "CALL_NOW",
  "CONTACT_US", "SIGN_UP", "SUBSCRIBE", "DOWNLOAD", "APPLY_NOW", "GET_OFFER",
  "MESSAGE_PAGE", "LEARN_MORE", "NO_BUTTON",
]);

/** A heading is short. Anything longer is a sentence, not a section title. */
const MAX_HEADING_CHARS = 40;

/**
 * Strips the decoration off a line and says whether it is a heading.
 *
 * Written as steps rather than one regex because the regex version got it
 * quietly wrong: a lazy capture between optional `**` markers matched the two
 * shortest characters it could, so `**Headline**` parsed as the heading "he"
 * with "adline**" as its content, and every section came back null. Three
 * explicit cases are longer and can be checked by reading them.
 */
function headingOf(line: string): { heading: string; inline: string | null } | null {
  let rest = line.trim();
  if (rest.length === 0) return null;

  const hashes = /^#{1,3}\s+/.exec(rest);
  const bold = rest.startsWith("**");
  // A heading wears a marker. Without one this is body text, and treating it
  // as a heading would cut the previous section short.
  if (!hashes && !bold) return null;

  if (hashes) rest = rest.slice(hashes[0].length).trim();

  let heading: string;
  let inline: string | null = null;

  if (rest.startsWith("**")) {
    const close = rest.indexOf("**", 2);
    // An opening marker with no closing one is not a heading.
    if (close === -1) return null;
    heading = rest.slice(2, close);
    inline = rest.slice(close + 2).trim();
  } else {
    // `## Headline` — the whole remaining line is the heading.
    heading = rest;
  }

  // The colon can sit inside the markers (`**Headline:**`) or outside
  // (`**Headline**:`), and both mean the same thing.
  heading = heading.replace(/[:\s—-]+$/, "").trim();
  inline = (inline ?? "").replace(/^[:\s—-]+/, "").trim() || null;

  if (heading.length === 0 || heading.length > MAX_HEADING_CHARS) return null;
  if (!/^[A-Za-z][A-Za-z' ]*$/.test(heading)) return null;

  return { heading: heading.toLowerCase(), inline };
}

/**
 * Finds one section's body in the concept.
 *
 * A line scan rather than one regex over the whole document, deliberately:
 * the regex version used `\z` for end-of-string, which JavaScript does not
 * have — it matches a literal "z" — so the last section of every concept
 * silently failed to parse. A scanner is longer and can be reasoned about a
 * line at a time.
 */
function section(concept: string, heading: string): string | null {
  const want = heading.toLowerCase();
  const lines = concept.split("\n");

  let collecting = false;
  const body: string[] = [];

  for (const line of lines) {
    const head = headingOf(line);

    if (head && head.heading === want) {
      collecting = true;
      // `**Headline:** Clean in thirty seconds` — the content is on the same
      // line, so the section is that and nothing else.
      if (head.inline) return clean(head.inline);
      continue;
    }

    // Any other heading ends the section being collected.
    if (collecting && head) break;

    if (collecting) body.push(line);
  }

  const text = clean(body.join("\n"));
  return text.length > 0 ? text : null;
}

/** Strips the markdown the field itself must not carry. */
function clean(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/^[\s>*-]+/gm, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .replace(/^["“](.*)["”]$/, "$1")
    .trim();
}

/** Meta's own limits, so an over-long field is caught here and not by Meta. */
export const HEADLINE_MAX = 255;
export const PRIMARY_TEXT_MAX = 1000;

export function parseAdCopy(concept: string | null | undefined): AdCopy {
  if (!concept) return { headline: null, primaryText: null, callToAction: null };

  const headline = section(concept, "Headline");
  const primaryText = section(concept, "Primary text");
  const ctaText = section(concept, "Call to action");

  let callToAction: string | null = null;
  if (ctaText) {
    for (const [pattern, type] of CTA_BY_PHRASE) {
      if (pattern.test(ctaText)) {
        callToAction = type;
        break;
      }
    }
  }

  return {
    // Truncation rather than refusal: a headline four characters over Meta's
    // limit is a good headline, and losing the whole ad over it would be
    // worse than trimming it.
    headline: headline ? headline.slice(0, HEADLINE_MAX) : null,
    primaryText: primaryText ? primaryText.slice(0, PRIMARY_TEXT_MAX) : null,
    callToAction,
  };
}

/**
 * What is missing before this concept can become a real ad.
 *
 * Returns the list rather than a boolean so the customer is told which part to
 * fix, instead of being told no.
 */
export function missingForAd(copy: AdCopy): string[] {
  const missing: string[] = [];
  if (!copy.headline) missing.push("a headline");
  if (!copy.primaryText) missing.push("the text that runs above the ad");
  return missing;
}
