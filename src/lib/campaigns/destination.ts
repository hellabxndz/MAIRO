import type { AdDestination } from "@/generated/prisma/enums";

// Where a click goes, and whether MAIRO has what it needs to send it there.
//
// This used to be one line in the launch path — the organization's website,
// taken without asking — and it produced two bad outcomes. A business with no
// website got no ad at all, discovered at launch as "the ad needs somewhere to
// send people". And a business with a website got every ad pointed at its
// homepage, including the plumber whose customers are trying to phone him.
//
// So it is asked, twice: once at signup for what the business normally wants,
// and again per campaign, because one business runs a booking page this month
// and a sale page the next. Neither question is optional, because there is no
// honest default — a destination cannot be guessed from anything MAIRO knows.

export type Destination =
  | { type: "WEBSITE"; url: string }
  | { type: "PHONE_CALL"; phone: string }
  /**
   * A conversation in Messenger with the Page that publishes the ad.
   *
   * Carries no value of its own, and that is the point: the Page is already
   * chosen on the Meta connection screen, so this is the one destination
   * MAIRO can offer without asking the business for anything at all.
   */
  | { type: "DIRECT_MESSAGE" };

// LEAD_FORM is not a third shape here on purpose. A form MAIRO hosts is a page
// with an address, so by the time an ad is built it IS a website destination —
// the difference is only who wrote the page. Resolving it to WEBSITE means the
// creative builder, the checks and Meta all stay unaware of it.

export type DestinationSource = {
  type: AdDestination;
  url?: string | null;
  phone?: string | null;
  /** The public address of the MAIRO-hosted form, when there is one. */
  formUrl?: string | null;
};

/**
 * The destination a campaign should use, preferring its own over the business's.
 *
 * Falling back to the organization is what makes the campaign field optional:
 * somebody who answered at signup and has nothing different to say for this
 * campaign should not have to answer twice.
 */
export function resolveDestination(
  campaign: DestinationSource,
  organization: DestinationSource
): Destination | null {
  // The campaign's type decides, always. The business's answer is a default
  // for the *values* below — its website, its number — not a type that can
  // override the campaign's, because a campaign row always carries one and a
  // fallback here would be dead code pretending otherwise. Where the business
  // default really applies is the campaign form, which pre-fills from it.
  const type = campaign.type;

  if (type === "DIRECT_MESSAGE") return { type: "DIRECT_MESSAGE" };

  if (type === "LEAD_FORM") {
    const url = campaign.formUrl ?? organization.formUrl ?? null;
    return url ? { type: "WEBSITE", url } : null;
  }

  if (type === "PHONE_CALL") {
    const phone = normalizePhone(campaign.phone ?? organization.phone ?? "");
    return phone ? { type: "PHONE_CALL", phone } : null;
  }

  const url = normalizeUrl(campaign.url ?? organization.url ?? "");
  return url ? { type: "WEBSITE", url } : null;
}

/**
 * A URL Meta will accept, or null.
 *
 * Bare domains are the common case — people type "myshop.com", not the scheme —
 * and refusing those would be pedantry dressed up as validation. Anything that
 * still is not a URL after that is rejected here rather than at launch, where
 * the customer has already waited and the message comes from Meta.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  // A hostname with no dot is a typo or an intranet name, and Meta refuses
  // both — "localhost" and "myshop" alike.
  if (!parsed.hostname.includes(".")) return null;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  return parsed.toString();
}

/**
 * A phone number in the shape Meta's tap-to-call button wants.
 *
 * E.164: a plus, a country code, digits, nothing else. People type brackets,
 * spaces and dashes, so those are stripped rather than refused. A ten-digit
 * number with no country code is assumed North American, which is where this
 * product's customers are; a wrong guess is visible in the field afterwards,
 * whereas refusing the format most Americans write their number in is not
 * something they would get past.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;

  if (hadPlus) {
    // 7 is the shortest a real international number gets; 15 is E.164's limit.
    return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
  }

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return null;
}

/** What to tell somebody who has not given MAIRO anywhere to send a click. */
export function describeMissing(type: AdDestination): string {
  if (type === "PHONE_CALL") {
    return "This campaign rings your phone, but there's no number on it yet. Add one and MAIRO can build the ad.";
  }
  if (type === "LEAD_FORM") {
    return "This campaign opens an enquiry form, but MAIRO hasn't written one for this business yet.";
  }
  return "This campaign sends people to your website, but there's no address on it yet. Add the page you want them to land on.";
}
