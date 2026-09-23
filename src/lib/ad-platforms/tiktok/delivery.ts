import type { AdGoal } from "@/generated/prisma/enums";

// How a MAIRO campaign becomes TikTok settings, kept free of the network so
// every mapping can be checked in a script. Enum names are TikTok Business API
// v1.3's, checked against the enum packages in TikTok's own SDK specs
// (github.com/tiktok/tiktok-business-api-sdk, yml_files/*).

/** TikTok's location id for the United States (a GeoNames id). */
export const US_LOCATION_ID = "6252001";

export type TikTokDelivery = {
  objective: "WEB_CONVERSIONS" | "TRAFFIC" | "REACH";
  optimizationGoal: "CONVERT" | "CLICK" | "REACH";
  billingEvent: "OCPM" | "CPC" | "CPM";
  /** Only for CONVERT: which pixel event to find people for. */
  optimizationEvent: string | null;
};

/**
 * MAIRO's standard pixel events, as TikTok's optimization_event names.
 * An event missing here isn't guessed at: the campaign runs for traffic.
 */
const PIXEL_EVENT: Record<string, string> = {
  CompletePayment: "SHOPPING",
  PlaceAnOrder: "ON_WEB_ORDER",
  SubmitForm: "FORM",
  Contact: "CONSULT",
  AddToCart: "ON_WEB_CART",
  InitiateCheckout: "INITIATE_ORDER",
  ViewContent: "ON_WEB_DETAIL",
  ClickButton: "BUTTON",
  CompleteRegistration: "ON_WEB_REGISTER",
  Subscribe: "ON_WEB_SUBSCRIBE",
  Download: "DOWNLOAD_START",
};

/**
 * The objective and optimisation for a goal. Sales and leads optimise for a
 * pixel event only when there's a working pixel with an event TikTok knows;
 * otherwise they run for website visits, which is honest and still delivers.
 */
export function tiktokDelivery(goal: AdGoal, conversion: { event: string } | null): TikTokDelivery {
  if (goal === "AWARENESS") {
    return { objective: "REACH", optimizationGoal: "REACH", billingEvent: "CPM", optimizationEvent: null };
  }
  const event = conversion ? PIXEL_EVENT[conversion.event] : undefined;
  if ((goal === "SALES" || goal === "LEADS") && event) {
    return { objective: "WEB_CONVERSIONS", optimizationGoal: "CONVERT", billingEvent: "OCPM", optimizationEvent: event };
  }
  return { objective: "TRAFFIC", optimizationGoal: "CLICK", billingEvent: "CPC", optimizationEvent: null };
}

const AGE_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: "AGE_18_24", min: 18, max: 24 },
  { key: "AGE_25_34", min: 25, max: 34 },
  { key: "AGE_35_44", min: 35, max: 44 },
  { key: "AGE_45_54", min: 45, max: 54 },
  { key: "AGE_55_100", min: 55, max: 100 },
];

/**
 * TikTok targets age in fixed bands, so a range becomes every band it
 * touches. Empty means all adults — TikTok's default, and never under 18.
 */
export function tiktokAgeGroups(ageMin: number, ageMax: number): string[] {
  const top = ageMax >= 65 ? 100 : ageMax;
  const bands = AGE_BUCKETS.filter((b) => b.max >= ageMin && b.min <= top).map((b) => b.key);
  return bands.length === AGE_BUCKETS.length ? [] : bands;
}

/** MAIRO's 0 everyone / 1 men / 2 women, as TikTok's names. */
export function tiktokGender(genders: number): "GENDER_UNLIMITED" | "GENDER_MALE" | "GENDER_FEMALE" {
  return genders === 1 ? "GENDER_MALE" : genders === 2 ? "GENDER_FEMALE" : "GENDER_UNLIMITED";
}

/** MAIRO's (Meta-named) buttons, as TikTok's. Anything else is Learn more. */
const CTA: Record<string, string> = {
  SHOP_NOW: "SHOP_NOW",
  ORDER_NOW: "ORDER_NOW",
  BOOK_TRAVEL: "BOOK_NOW",
  GET_QUOTE: "GET_QUOTE",
  CONTACT_US: "CONTACT_US",
  SIGN_UP: "SIGN_UP",
  SUBSCRIBE: "SUBSCRIBE",
  APPLY_NOW: "APPLY_NOW",
  DOWNLOAD: "DOWNLOAD_NOW",
  LEARN_MORE: "LEARN_MORE",
};

export function tiktokCta(cta: string | null | undefined): string {
  return (cta && CTA[cta]) || "LEARN_MORE";
}

/** TikTok's limit on an ad's text. */
export const TIKTOK_TEXT_MAX = 100;

/**
 * The ad's words as TikTok takes them: no emoji (TikTok refuses them in ad
 * text), at most 100 characters, cut at a word rather than mid-word.
 */
export function tiktokAdText(text: string): string {
  const clean = text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= TIKTOK_TEXT_MAX) return clean;
  const cut = clean.slice(0, TIKTOK_TEXT_MAX + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 60 ? cut.slice(0, space) : clean.slice(0, TIKTOK_TEXT_MAX)).replace(/[,;:\-–—\s]+$/, "");
}

/** A name TikTok accepts for the profile the ads appear under. */
export function tiktokDisplayName(name: string): string {
  return name.replace(/[\p{Extended_Pictographic}]/gu, "").trim().slice(0, 40) || "Our business";
}
