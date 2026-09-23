import type { AdDestination } from "@/generated/prisma/enums";
import { HEADLINE_MAX, PRIMARY_TEXT_MAX } from "@/lib/meta/creative-copy";

// The words of an ad, checked the way Meta will read them.
//
// Pure, so the wizard shows the same problems as you type that the server
// refuses at launch. Two levels again: a problem stops the ad (Meta rejects it,
// or it would say something about the reader Meta forbids); a note is advice.

export type AdCopyDraft = {
  /** The text above the picture. */
  primaryText: string;
  /** The bold line under it. */
  headline: string;
  /** Meta's button type, e.g. LEARN_MORE. */
  cta: string;
};

export type CopyOption = AdCopyDraft & {
  /** What this version leans on, in a few words ("The problem it solves"). */
  angle: string;
};

/** Past this the headline is cut off on most placements. */
export const HEADLINE_SHOWN = 40;
/** Past this the text folds behind "See more". */
export const PRIMARY_TEXT_SHOWN = 125;

/** The buttons a website ad can carry, in the customer's words. */
export const WEBSITE_CTAS: { value: string; label: string }[] = [
  { value: "LEARN_MORE", label: "Learn more" },
  { value: "SHOP_NOW", label: "Shop now" },
  { value: "ORDER_NOW", label: "Order now" },
  { value: "BOOK_TRAVEL", label: "Book now" },
  { value: "GET_QUOTE", label: "Get quote" },
  { value: "CONTACT_US", label: "Contact us" },
  { value: "SIGN_UP", label: "Sign up" },
  { value: "SUBSCRIBE", label: "Subscribe" },
  { value: "GET_OFFER", label: "Get offer" },
  { value: "APPLY_NOW", label: "Apply now" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "SEE_MENU", label: "See menu" },
];

/**
 * The button this destination gets. Only a website ad has a choice; every
 * other destination has exactly one button that works, and it's set for them.
 */
export function ctaChoicesFor(destination: AdDestination | null): { value: string; label: string }[] {
  switch (destination) {
    case "PHONE_CALL":
      return [{ value: "CALL_NOW", label: "Call now" }];
    case "DIRECT_MESSAGE":
      return [{ value: "MESSAGE_PAGE", label: "Send message" }];
    case "LEAD_FORM":
      return [{ value: "SIGN_UP", label: "Sign up" }];
    case "APP":
      return [{ value: "INSTALL_MOBILE_APP", label: "Install now" }];
    case "POST_ENGAGEMENT":
      return [{ value: "NO_BUTTON", label: "No button" }];
    default:
      return WEBSITE_CTAS;
  }
}

export function ctaLabel(value: string): string {
  return (
    [...WEBSITE_CTAS, { value: "CALL_NOW", label: "Call now" }, { value: "MESSAGE_PAGE", label: "Send message" },
      { value: "INSTALL_MOBILE_APP", label: "Install now" }, { value: "NO_BUTTON", label: "No button" }]
      .find((c) => c.value === value)?.label ?? value
  );
}

/** A CTA this destination can use, or its only option when it can't. */
export function fitCta(cta: string, destination: AdDestination | null): string {
  const choices = ctaChoicesFor(destination);
  return choices.some((c) => c.value === cta) ? cta : choices[0].value;
}

// Meta's personal-attributes rule: an ad may not imply it knows the reader's
// health, finances, religion, sexuality and so on. "Are you struggling with
// debt?" is refused; "Help with debt" is fine.
const ASKS_ABOUT_YOU = /\b(are you|you're|you are|do you (have|suffer|feel)|struggling with|tired of being|your (weight|debt|diagnosis|condition))\b/i;
const PERSONAL_ATTRIBUTE =
  /\b(overweight|obese|fat|diabet\w*|depress\w*|anxiety|anxious|bipolar|adhd|cancer|hiv|std|debt|bankrupt\w*|broke|divorc\w*|single|gay|lesbian|bisexual|transgender|christian|muslim|jewish|hindu|atheist|pregnan\w*|disabled|disabilit\w*|addict\w*|alcoholic|criminal record|immigra\w*)\b/i;

/** Claims people usually can't back up, which Meta and customers both distrust. */
const BIG_CLAIM = /\b(guarantee[sd]?|100%|best in (the )?(town|city|country|world)|#1|number one|miracle|cure[sd]?|risk[- ]free|instant results?)\b/i;

export type CopyFinding = { level: "problem" | "note"; text: string };

export function checkCopy(copy: AdCopyDraft, destination: AdDestination | null): CopyFinding[] {
  const out: CopyFinding[] = [];
  const primary = copy.primaryText.trim();
  const headline = copy.headline.trim();
  const noButton = destination === "POST_ENGAGEMENT";

  if (!primary) out.push({ level: "problem", text: "Add the text that runs above the ad." });
  if (!headline && !noButton) out.push({ level: "problem", text: "Add a headline." });
  if (primary.length > PRIMARY_TEXT_MAX) out.push({ level: "problem", text: `The text is over ${PRIMARY_TEXT_MAX} characters.` });
  if (headline.length > HEADLINE_MAX) out.push({ level: "problem", text: `The headline is over ${HEADLINE_MAX} characters.` });

  const all = `${headline}\n${primary}`;
  // Sentence by sentence, so "Are you in Austin? We fix debt problems" isn't
  // read as asking the reader about their debt.
  for (const sentence of all.split(/(?<=[.?!\n])\s*/)) {
    if (ASKS_ABOUT_YOU.test(sentence) && PERSONAL_ATTRIBUTE.test(sentence)) {
      out.push({
        level: "problem",
        text: `"${sentence.trim().slice(0, 80)}" suggests you know something personal about the reader. Meta rejects that — describe what you offer instead ("Help with debt", not "Are you in debt?").`,
      });
      break;
    }
  }

  if (BIG_CLAIM.test(all)) {
    out.push({ level: "note", text: "Claims like \"guaranteed\" or \"#1\" need to be provably true — Meta can ask for proof." });
  }
  const letters = all.replace(/[^A-Za-z]/g, "");
  const capitals = all.replace(/[^A-Z]/g, "");
  if (letters.length > 20 && capitals.length / letters.length > 0.5) {
    out.push({ level: "note", text: "Lots of capital letters reads as shouting and tends to perform worse." });
  }
  if (/[!?]{3,}/.test(all)) out.push({ level: "note", text: "Repeated !!! or ??? looks spammy to Meta's review." });
  if (headline.length > HEADLINE_SHOWN) out.push({ level: "note", text: `Headlines over ${HEADLINE_SHOWN} characters get cut off on most placements.` });
  if (primary.length > PRIMARY_TEXT_SHOWN) {
    out.push({ level: "note", text: `Only the first ${PRIMARY_TEXT_SHOWN} or so characters show before "See more" — put the point first.` });
  }
  return out;
}

/**
 * Numbers in the copy that don't appear in anything the business told MAIRO:
 * a price, a discount, a count of customers. The AI is told never to invent
 * these; this is how that's checked rather than trusted.
 */
export function unsupportedNumbers(text: string, facts: string): string[] {
  const found = text.match(/\$?\d[\d,.]*\s?%?/g) ?? [];
  const known = facts.replace(/,/g, "");
  return [...new Set(found.map((n) => n.trim()))].filter((n) => {
    const bare = n.replace(/[$,%\s]/g, "");
    return bare.length > 0 && !known.includes(bare);
  });
}

/**
 * How many ads a budget can test fairly. Each version needs enough delivery
 * to learn from — roughly $5 a day — or the test just splits too little money
 * into pieces too small to tell apart.
 */
export function maxTestAds(perDayCents: number): number {
  if (perDayCents >= 3000) return 3;
  if (perDayCents >= 1000) return 2;
  return 1;
}
