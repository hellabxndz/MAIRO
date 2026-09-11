import type { AdGoal } from "@/generated/prisma/enums";

// What counts as a conversion, per kind of business.
//
// "Set up conversion tracking" means something different for every business and
// the difference is the whole problem. A shop converts when somebody pays. A
// plumber converts when somebody taps the phone number — there is no checkout
// and never will be. A gym converts on a free trial signup that is worth
// nothing today and £600 over a year. Telling all three to "track Purchase" is
// how a business ends up with a pixel installed, zero conversions recorded,
// and an optimizer with nothing to optimize towards.
//
// So this is a catalogue of what to actually measure, per niche, and how to
// recognise it happening on a website without the owner writing any code. Each
// action names the Meta event and the TikTok event it maps to — the two
// networks disagree about the vocabulary, and picking the wrong name is not a
// cosmetic error: an event outside a network's standard list cannot be
// optimized towards and does not appear in the conversion column, so the
// campaign quietly optimizes for nothing.

/**
 * How a conversion is spotted in the browser.
 *
 * Deliberately limited to things that can be detected without the business
 * changing their website. Anything that needs a developer is a thing that
 * never gets done.
 */
export type DetectionKind =
  /** Landing on a page whose URL contains a phrase — a thank-you page. */
  | "url_contains"
  /** Any form on the site being submitted. */
  | "form_submit"
  /** A tap on a tel: link. The whole conversion story for a trades business. */
  | "phone_click"
  /** A tap on a mailto: link. */
  | "email_click"
  /** A click on anything matching a CSS selector. */
  | "click_selector"
  /** The site pushes a named event to the dataLayer itself. */
  | "datalayer_event";

export type ConversionAction = {
  /** Stable id, used in the GTM tag names and as the dataLayer event name. */
  id: string;
  /** What the business owner would call it. */
  label: string;
  /** Why it is worth tracking, in their terms. */
  why: string;
  /** Meta's standard event name. Must be one of Meta's exact list. */
  metaEvent: MetaStandardEvent;
  /** TikTok's standard event name. Must be one of TikTok's exact list. */
  tiktokEvent: TikTokStandardEvent;
  detection: DetectionKind;
  /** For url_contains and click_selector: the phrase or selector. */
  match?: string;
  /**
   * Whether this conversion carries a money value.
   *
   * False for most lead events and that is correct rather than lazy: a made-up
   * value on a phone call teaches the network to chase the wrong people, and a
   * business cannot tell that is happening from the dashboard.
   */
  hasValue: boolean;
  /** The one the campaign should optimize towards. Exactly one per niche. */
  primary?: boolean;
};

/** Meta's standard events. Anything outside this list is a custom event. */
export type MetaStandardEvent =
  | "Purchase"
  | "Lead"
  | "CompleteRegistration"
  | "Contact"
  | "Schedule"
  | "StartTrial"
  | "Subscribe"
  | "SubmitApplication"
  | "AddToCart"
  | "InitiateCheckout"
  | "ViewContent"
  | "FindLocation"
  | "Search"
  | "Donate";

/**
 * TikTok's standard web events.
 *
 * Shorter than Meta's, and the gaps matter. TikTok has no Lead and no
 * Schedule, so both land on SubmitForm or Contact — which is the closest true
 * thing, not a workaround.
 */
export type TikTokStandardEvent =
  | "CompletePayment"
  | "PlaceAnOrder"
  | "SubmitForm"
  | "Contact"
  | "CompleteRegistration"
  | "Subscribe"
  | "AddToCart"
  | "InitiateCheckout"
  | "ViewContent"
  | "Download"
  | "Search"
  | "ClickButton";

export type Niche = {
  id: string;
  label: string;
  /** Lowercase words that identify this niche in free-text industry input. */
  keywords: string[];
  /** One line on what this niche is actually measuring. */
  summary: string;
  actions: ConversionAction[];
};

// Actions that recur across niches, defined once so the same thing is called
// the same thing everywhere and a business that changes niche keeps its data
// comparable.

const phoneCall: ConversionAction = {
  id: "phone_call",
  label: "Someone taps your phone number",
  why: "For a business that gets booked over the phone, this is the sale. Nothing else on the site will ever record one.",
  metaEvent: "Contact",
  tiktokEvent: "Contact",
  detection: "phone_click",
  hasValue: false,
};

const contactForm: ConversionAction = {
  id: "contact_form",
  label: "Someone sends you an enquiry",
  why: "Any form on the site being submitted — a quote request, a callback, a contact form.",
  metaEvent: "Lead",
  tiktokEvent: "SubmitForm",
  detection: "form_submit",
  hasValue: false,
};

const emailClick: ConversionAction = {
  id: "email_click",
  label: "Someone taps your email address",
  why: "Smaller signal than a form, but it is a real person choosing to get in touch.",
  metaEvent: "Contact",
  tiktokEvent: "Contact",
  detection: "email_click",
  hasValue: false,
};

const purchase: ConversionAction = {
  id: "purchase",
  label: "Someone buys",
  why: "The order total is sent with it, which is what makes ROAS a real number rather than a count.",
  metaEvent: "Purchase",
  tiktokEvent: "CompletePayment",
  detection: "url_contains",
  match: "/thank-you",
  hasValue: true,
  primary: true,
};

const addToCart: ConversionAction = {
  id: "add_to_cart",
  label: "Someone adds something to the basket",
  why: "Far more common than a purchase, so the networks learn from it much faster in the first weeks.",
  metaEvent: "AddToCart",
  tiktokEvent: "AddToCart",
  detection: "datalayer_event",
  hasValue: true,
};

const beginCheckout: ConversionAction = {
  id: "begin_checkout",
  label: "Someone starts checking out",
  why: "The step before the sale. A big gap between this and Purchase is a checkout problem, not an ads problem.",
  metaEvent: "InitiateCheckout",
  tiktokEvent: "InitiateCheckout",
  detection: "url_contains",
  match: "/checkout",
  hasValue: true,
};

const booking: ConversionAction = {
  id: "booking",
  label: "Someone books an appointment",
  why: "The thing you actually want. Fires when they land on the booking confirmation page.",
  metaEvent: "Schedule",
  tiktokEvent: "SubmitForm",
  detection: "url_contains",
  match: "/booking-confirmed",
  hasValue: false,
  primary: true,
};

/**
 * The catalogue.
 *
 * Ordered most specific first, because classification takes the first match
 * and "dental practice" should find dentistry rather than the generic services
 * entry that also mentions "practice".
 */
export const NICHES: Niche[] = [
  {
    id: "ecommerce",
    label: "Online shop",
    keywords: [
      "ecommerce", "e-commerce", "online shop", "online store", "shopify",
      "retail", "clothing", "apparel", "fashion", "jewellery", "jewelry",
      "cosmetics", "skincare", "furniture", "homeware", "boutique", "merch",
      "dropship", "woocommerce", "candles", "supplement",
    ],
    summary: "Money changes hands on the website, so the whole funnel is measurable.",
    actions: [purchase, beginCheckout, addToCart],
  },
  {
    id: "restaurant",
    label: "Restaurant, café or takeaway",
    keywords: [
      "restaurant", "cafe", "café", "coffee shop", "takeaway", "takeout",
      "diner", "bistro", "pizzeria", "pub", "bar", "catering", "food truck",
      "bakery", "deli",
    ],
    summary:
      "Most of the value is a booking or a phone order, not a checkout — so those are what get tracked.",
    actions: [
      {
        id: "reservation",
        label: "Someone books a table",
        why: "Fires on the booking confirmation page, whichever booking system you use.",
        metaEvent: "Schedule",
        tiktokEvent: "SubmitForm",
        detection: "url_contains",
        match: "/reservation",
        hasValue: false,
        primary: true,
      },
      phoneCall,
      { ...purchase, primary: false, match: "/order-confirm", label: "Someone orders online" },
      {
        id: "menu_view",
        label: "Someone opens the menu",
        why: "Weak on its own, but it is the strongest early signal a restaurant site has.",
        metaEvent: "ViewContent",
        tiktokEvent: "ViewContent",
        detection: "url_contains",
        match: "/menu",
        hasValue: false,
      },
    ],
  },
  {
    id: "home_services",
    label: "Trades and home services",
    keywords: [
      "plumber", "plumbing", "electrician", "electrical", "hvac", "heating",
      "roofing", "roofer", "builder", "construction", "landscaping", "gardening",
      "cleaning", "pest control", "locksmith", "handyman", "painter",
      "decorator", "removals", "flooring", "glazing", "driveway",
    ],
    summary:
      "The job is won on the phone. Tapping the number is the conversion — there is nothing else to measure.",
    actions: [
      { ...phoneCall, primary: true },
      { ...contactForm, label: "Someone requests a quote" },
      emailClick,
    ],
  },
  {
    id: "health_clinic",
    label: "Dentist, doctor or clinic",
    keywords: [
      "dental", "dentist", "orthodont", "doctor", "medical", "clinic", "gp",
      "physio", "chiropract", "optician", "optometr", "podiatr", "veterinar",
      "vet", "therapy", "counsell", "psycholog", "aesthetic",
    ],
    summary: "Appointments, and the calls that become appointments.",
    actions: [
      { ...booking, label: "Someone books an appointment", match: "/appointment" },
      phoneCall,
      { ...contactForm, label: "Someone asks about treatment" },
    ],
  },
  {
    id: "beauty",
    label: "Salon, barber or spa",
    keywords: [
      "salon", "barber", "hair", "beauty", "spa", "nails", "nail", "lashes",
      "brows", "massage", "tattoo", "waxing", "tanning",
    ],
    summary: "Bookings, and the walk-ins that start as a phone call.",
    actions: [
      { ...booking, label: "Someone books in", match: "/booking" },
      phoneCall,
      {
        id: "find_location",
        label: "Someone looks up where you are",
        why: "A strong intent signal for a business people physically visit.",
        metaEvent: "FindLocation",
        tiktokEvent: "ClickButton",
        detection: "url_contains",
        match: "/find-us",
        hasValue: false,
      },
    ],
  },
  {
    id: "fitness",
    label: "Gym, studio or coach",
    keywords: [
      "gym", "fitness", "personal train", "pilates", "yoga", "crossfit",
      "bootcamp", "martial art", "boxing", "swim", "dance studio", "wellness",
      "nutrition coach",
    ],
    summary:
      "A free trial is worth nothing on the day and a lot over a year, so it is tracked without a value.",
    actions: [
      {
        id: "trial_signup",
        label: "Someone signs up for a trial",
        why: "The way nearly every membership starts. Tracked without a value — putting a guess on it teaches the networks to chase the wrong people.",
        metaEvent: "StartTrial",
        tiktokEvent: "CompleteRegistration",
        detection: "url_contains",
        match: "/trial",
        hasValue: false,
        primary: true,
      },
      {
        id: "membership",
        label: "Someone buys a membership",
        why: "Carries the real money, and confirms the trials are turning into members.",
        metaEvent: "Subscribe",
        tiktokEvent: "Subscribe",
        detection: "url_contains",
        match: "/welcome",
        hasValue: true,
      },
      { ...contactForm, label: "Someone asks about joining" },
      phoneCall,
    ],
  },
  {
    id: "professional",
    label: "Professional services",
    keywords: [
      "law", "legal", "solicitor", "lawyer", "attorney", "account", "bookkeep",
      "financial advis", "mortgage", "insurance", "consult", "agency",
      "architect", "surveyor", "recruit", "hr", "marketing",
    ],
    summary: "A consultation booked is the sale; everything else is the path to it.",
    actions: [
      {
        id: "consultation",
        label: "Someone books a consultation",
        why: "The highest-intent thing that happens on a professional services site.",
        metaEvent: "Schedule",
        tiktokEvent: "SubmitForm",
        detection: "url_contains",
        match: "/consultation",
        hasValue: false,
        primary: true,
      },
      { ...contactForm, label: "Someone sends an enquiry" },
      phoneCall,
      {
        id: "guide_download",
        label: "Someone downloads a guide",
        why: "Early interest. Useful for building an audience to advertise to later.",
        metaEvent: "Lead",
        tiktokEvent: "Download",
        detection: "click_selector",
        match: "a[href$='.pdf']",
        hasValue: false,
      },
    ],
  },
  {
    id: "real_estate",
    label: "Property and lettings",
    keywords: ["estate agent", "real estate", "property", "letting", "realtor", "rental"],
    summary: "Viewings and enquiries, with listing views as the early signal.",
    actions: [
      {
        id: "viewing",
        label: "Someone books a viewing",
        why: "The step that turns a browser into a buyer.",
        metaEvent: "Schedule",
        tiktokEvent: "SubmitForm",
        detection: "url_contains",
        match: "/viewing",
        hasValue: false,
        primary: true,
      },
      { ...contactForm, label: "Someone enquires about a property" },
      phoneCall,
      {
        id: "listing_view",
        label: "Someone looks at a property",
        why: "Common enough that the networks learn from it quickly.",
        metaEvent: "ViewContent",
        tiktokEvent: "ViewContent",
        detection: "url_contains",
        match: "/property",
        hasValue: false,
      },
    ],
  },
  {
    id: "education",
    label: "Courses and training",
    keywords: [
      "course", "training", "academy", "school", "tutor", "education",
      "college", "bootcamp", "driving instructor", "language",
    ],
    summary: "Enrolments, and the free thing people take first.",
    actions: [
      {
        id: "enrolment",
        label: "Someone enrols",
        why: "Carries the fee, so this is what ROAS is built from.",
        metaEvent: "CompleteRegistration",
        tiktokEvent: "CompleteRegistration",
        detection: "url_contains",
        match: "/enrolled",
        hasValue: true,
        primary: true,
      },
      { ...contactForm, label: "Someone asks about a course" },
      {
        id: "free_lesson",
        label: "Someone takes a free lesson",
        why: "The usual first step, and far more frequent than an enrolment.",
        metaEvent: "Lead",
        tiktokEvent: "SubmitForm",
        detection: "url_contains",
        match: "/free",
        hasValue: false,
      },
    ],
  },
  {
    id: "saas",
    label: "Software or app",
    keywords: ["saas", "software", "app", "platform", "startup", "tech", "tool"],
    summary: "Signups and demos, with paid conversion as the number that matters.",
    actions: [
      {
        id: "trial_start",
        label: "Someone starts a free trial",
        why: "The top of the funnel, and frequent enough for the networks to learn from.",
        metaEvent: "StartTrial",
        tiktokEvent: "CompleteRegistration",
        detection: "url_contains",
        match: "/welcome",
        hasValue: false,
        primary: true,
      },
      {
        id: "subscribe",
        label: "Someone subscribes",
        why: "The money. Sent with the plan value so ROAS is real.",
        metaEvent: "Subscribe",
        tiktokEvent: "Subscribe",
        detection: "url_contains",
        match: "/subscribed",
        hasValue: true,
      },
      { ...contactForm, label: "Someone requests a demo" },
    ],
  },
  {
    id: "automotive",
    label: "Garage or car sales",
    keywords: ["garage", "mot", "car", "auto", "vehicle", "tyre", "mechanic", "bodyshop", "dealership"],
    summary: "Bookings and quotes, most of which start with a phone call.",
    actions: [
      { ...booking, label: "Someone books the car in", match: "/booked" },
      { ...phoneCall, primary: false },
      { ...contactForm, label: "Someone asks for a quote" },
    ],
  },
  {
    id: "events",
    label: "Events and venues",
    keywords: ["event", "venue", "wedding", "conference", "festival", "ticket", "party", "hire"],
    summary: "Tickets sold, and enquiries for the things that are quoted rather than priced.",
    actions: [
      { ...purchase, label: "Someone buys a ticket", match: "/tickets/thank-you" },
      { ...contactForm, label: "Someone enquires about a date" },
      phoneCall,
    ],
  },
];

/**
 * The fallback, which has to be genuinely useful rather than empty.
 *
 * A business MAIRO cannot classify still gets the three things nearly every
 * business converts on. Better a correct general answer than a confident wrong
 * specific one.
 */
export const GENERAL_NICHE: Niche = {
  id: "general",
  label: "General business",
  keywords: [],
  summary: "The three things almost every business converts on, whatever it sells.",
  actions: [{ ...contactForm, primary: true }, phoneCall, emailClick],
};

/**
 * Whether a keyword appears in the text as its own word.
 *
 * Plain substring matching put "hair salon and barber" in the restaurant niche,
 * because "barber" starts with "bar". That is not a cosmetic mistake — it would
 * have given a barber shop a table-reservation trigger and no booking event,
 * and nothing in the product would have looked wrong.
 *
 * A leading boundary alone does not fix it, because "bar" is at the start of
 * "barber". So the trailing side is bounded too, with a short list of suffixes
 * allowed through — that is what lets one keyword cover a family of words
 * ("plumb" finds plumber and plumbing, "orthodont" finds orthodontist) without
 * letting it swallow an unrelated one.
 */
const SUFFIXES = "(?:s|es|ing|ings|er|ers|or|ors|ist|ists|ant|ants|ance|y|ies|ed)?";

function mentions(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}${SUFFIXES}(?![a-z0-9])`, "i").test(text);
}

/**
 * Works out a niche from whatever the customer typed as their industry.
 *
 * Keyword matching rather than anything cleverer, because it has to be
 * explainable and overridable: the page shows which niche it picked and lets
 * them change it. A classifier nobody can argue with is worse than a simple one
 * they can correct.
 */
export function classifyNiche(industry: string | null | undefined, goal?: AdGoal | null): Niche {
  const text = (industry ?? "").toLowerCase().trim();

  if (text.length > 0) {
    for (const niche of NICHES) {
      if (niche.keywords.some((k) => mentions(text, k))) return niche;
    }
  }

  // Nothing matched. The advertising goal is a weaker signal than the industry
  // but a real one — somebody optimizing for SALES is selling something.
  if (goal === "SALES") return NICHES.find((n) => n.id === "ecommerce") ?? GENERAL_NICHE;
  return GENERAL_NICHE;
}

export function nicheById(id: string): Niche {
  return NICHES.find((n) => n.id === id) ?? GENERAL_NICHE;
}

export function allNiches(): Niche[] {
  return [...NICHES, GENERAL_NICHE];
}

/** The action a campaign should be optimized towards, for this niche. */
export function primaryAction(niche: Niche): ConversionAction {
  return niche.actions.find((a) => a.primary) ?? niche.actions[0];
}
