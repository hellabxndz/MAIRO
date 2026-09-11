import { createHash } from "node:crypto";

// Turning a customer's details into something the ad networks can match on
// without MAIRO ever holding the details.
//
// Both Meta and TikTok match server-side conversions to the people who saw an
// ad by comparing SHA-256 hashes of normalized identifiers. The normalization
// is not a formality: a hash of "  Alex@Example.COM " and a hash of
// "alex@example.com" share nothing, so getting it wrong does not produce worse
// matching, it produces none at all — and no error either, just a conversion
// silently attributed to nobody. That failure is invisible from both ends,
// which is why every rule the networks publish is written down here.
//
// Nothing in this file is reversible and nothing that passes through it is
// stored in the clear. The order row keeps the hash; the email the store sent
// is used once, hashed, and dropped.

/** SHA-256, lowercase hex — the encoding both networks expect. */
function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * An email, as both networks want it.
 *
 * Lowercased and trimmed. Deliberately does NOT strip dots or +tags from Gmail
 * addresses: Meta's own guidance is to send the address as the customer gave
 * it, and the advertiser's site will have sent the same unmodified string from
 * the browser — so "normalizing" further here would stop the browser and
 * server copies of one conversion from matching each other.
 */
export function hashEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value.includes("@") || value.length < 3) return null;
  return sha256(value);
}

/**
 * A phone number in E.164 without the plus, which is what both ask for.
 *
 * Everything that isn't a digit goes, including the leading +. A number with
 * no country code cannot be normalized reliably — 07700 900123 is a UK mobile
 * and also a plausible fragment of a dozen other countries' numbering plans —
 * so a default is applied only when one is given, and otherwise the number is
 * dropped rather than guessed at. A wrong country code matches nobody while
 * looking exactly like a right one.
 */
export function hashPhone(
  raw: string | null | undefined,
  defaultCountryCode?: string | null
): string | null {
  if (!raw) return null;

  const hadPlus = raw.trim().startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;

  if (!hadPlus) {
    const cc = (defaultCountryCode ?? "").replace(/\D/g, "");
    if (!cc) return null;
    // A national number written with a trunk prefix — 0 in most of Europe —
    // loses it when the country code goes on the front.
    const national = digits.replace(/^0+/, "");
    if (national.length === 0) return null;
    digits = digits.startsWith(cc) && digits.length > cc.length ? digits : `${cc}${national}`;
  }

  // Shorter than this is not a phone number anywhere; longer than 15 is
  // outside E.164 entirely.
  if (digits.length < 8 || digits.length > 15) return null;
  return sha256(digits);
}

/** A name: lowercase, letters only, no spaces or punctuation. */
export function hashName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    // Accents are stripped rather than kept, because the networks do the same
    // and a "josé" that stays accented matches a "jose" that didn't.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
  return value.length > 0 ? sha256(value) : null;
}

/** A two-letter lowercase ISO country code. */
export function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return /^[a-z]{2}$/.test(value) ? value : null;
}

/** A postcode: lowercase, no spaces. US ZIP+4 is cut back to the first five. */
export function hashZip(raw: string | null | undefined, country?: string | null): string | null {
  if (!raw) return null;
  let value = raw.trim().toLowerCase().replace(/\s/g, "");
  if (normalizeCountry(country) === "us") value = value.split("-")[0].slice(0, 5);
  return value.length > 0 ? sha256(value) : null;
}

/**
 * The id that stops one sale being counted twice.
 *
 * A conversion usually reaches a network twice: once from the browser when the
 * shopper lands on the thank-you page, and once from here when the store tells
 * MAIRO about the order. Both networks collapse those into one sale if — and
 * only if — the two carry an identical event id.
 *
 * Two consequences shape this function. It is derived rather than generated,
 * because a random id would differ on every retry and would turn Shopify's
 * ordinary webhook redelivery into double-counted revenue — and a doubled ROAS
 * is worse than a missing one, because the customer spends more on the
 * strength of it.
 *
 * And it is derived by a rule a browser can reproduce in one line, which is
 * why it is not a hash. The snippet on the thank-you page has the order id and
 * no crypto; if the two halves cannot arrive at the same string independently,
 * deduplication silently never happens. The id only has to be unique within
 * one pixel, and a pixel belongs to one business, so the order id alone
 * carries enough.
 */
export function deriveEventId(externalOrderId: string): string {
  // Kept to what both networks accept in an event id, and to what the
  // equivalent expression in the snippet produces from the same input.
  const safe = String(externalOrderId).trim().replace(/[^A-Za-z0-9_-]/g, "");
  return `mairo_${safe}`;
}

/** How many identifiers were actually usable, for reporting match quality. */
export function countMatchFields(fields: Record<string, unknown>): number {
  return Object.values(fields).filter((v) => v !== null && v !== undefined && v !== "").length;
}
