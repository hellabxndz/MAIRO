// MAIRO Social Manager: the goals a business can choose, what kinds of posts
// serve each goal for each kind of business, and how a promotion or launch is
// sequenced. Pure, so scripts/check-social-manager.ts can check every rule.
//
// Nothing here is random. Every post MAIRO plans comes from a goal, and the
// mix of posts depends on what the business is: a clothing shop selling more
// doesn't post like a dentist looking for new patients.

export const GOALS = [
  { key: "INCREASE_SALES", label: "Increase sales", objective: "Sales" },
  { key: "GENERATE_LEADS", label: "Generate more leads", objective: "Leads" },
  { key: "GET_BOOKINGS", label: "Get more appointments", objective: "Bookings" },
  { key: "NEW_PRODUCT", label: "Promote a new product", objective: "Product launch" },
  { key: "NEW_SERVICE", label: "Promote a new service", objective: "Service launch" },
  { key: "GROW_FOLLOWERS", label: "Grow followers", objective: "Followers" },
  { key: "BRAND_AWARENESS", label: "Increase brand awareness", objective: "Awareness" },
  { key: "WEBSITE_TRAFFIC", label: "Increase website traffic", objective: "Website traffic" },
  { key: "PROMOTE_SALE", label: "Promote a sale", objective: "Sale" },
  { key: "PROMOTE_EVENT", label: "Promote an event", objective: "Event" },
  { key: "REPEAT_CUSTOMERS", label: "Increase repeat customers", objective: "Repeat customers" },
  { key: "LAUNCH", label: "Launch something new", objective: "Launch" },
  { key: "RECOMMEND", label: "Let MAIRO recommend", objective: "Recommended by MAIRO" },
] as const;

export type GoalKey = (typeof GOALS)[number]["key"];
export const GOAL_KEYS = GOALS.map((g) => g.key) as [GoalKey, ...GoalKey[]];

export function goalInfo(key: string) {
  return GOALS.find((g) => g.key === key) ?? GOALS[0];
}

/** Goals that need details before MAIRO can plan, and which promotion they become. */
export const GOAL_PROMOTION: Partial<Record<GoalKey, PromotionKind>> = {
  NEW_PRODUCT: "NEW_PRODUCT",
  NEW_SERVICE: "NEW_SERVICE",
  LAUNCH: "NEW_PRODUCT",
  PROMOTE_SALE: "SALE",
  PROMOTE_EVENT: "EVENT",
};

// --- What's happening at the business ------------------------------------

export const PROMOTION_KINDS = [
  { key: "SALE", label: "Running a sale" },
  { key: "NEW_PRODUCT", label: "New product" },
  { key: "NEW_SERVICE", label: "New service" },
  { key: "EVENT", label: "Upcoming event" },
  { key: "NEW_INVENTORY", label: "New inventory" },
  { key: "HOLIDAY", label: "Holiday promotion" },
  { key: "ANNOUNCEMENT", label: "Announcement" },
] as const;

export type PromotionKind = (typeof PROMOTION_KINDS)[number]["key"];
export const PROMOTION_KEYS = PROMOTION_KINDS.map((k) => k.key) as [PromotionKind, ...PromotionKind[]];

export function promotionLabel(kind: string): string {
  return PROMOTION_KINDS.find((k) => k.key === kind)?.label ?? "Promotion";
}

/** The questions MAIRO asks for each kind, in order. Keys are stored as given. */
export const PROMOTION_FIELDS: Record<PromotionKind, { key: string; label: string; type?: "date" | "textarea"; required?: boolean; placeholder?: string }[]> = {
  SALE: [
    { key: "offer", label: "What is the offer?", required: true, placeholder: "e.g. Fall sale on all jackets" },
    { key: "discount", label: "Discount amount", placeholder: "e.g. 25% off" },
    { key: "items", label: "Products or services included", placeholder: "e.g. Every jacket and coat" },
    { key: "code", label: "Promo code", placeholder: "Leave empty if none" },
    { key: "start", label: "Start date", type: "date", required: true },
    { key: "end", label: "End date", type: "date", required: true },
    { key: "restrictions", label: "Any restrictions", type: "textarea", placeholder: "e.g. In store only, while stocks last" },
  ],
  NEW_PRODUCT: [
    { key: "name", label: "Product name", required: true },
    { key: "description", label: "Product description", type: "textarea", required: true },
    { key: "price", label: "Price", placeholder: "e.g. $89" },
    { key: "audience", label: "Who it's for", placeholder: "e.g. Runners training for their first marathon" },
    { key: "benefits", label: "Main benefits", type: "textarea" },
    { key: "different", label: "What makes it different", type: "textarea" },
    { key: "start", label: "Launch date", type: "date", required: true },
    { key: "promotion", label: "Launch promotion", placeholder: "e.g. 15% off the first week — leave empty if none" },
    { key: "end", label: "Promotion end date", type: "date" },
    { key: "inventory", label: "Inventory", placeholder: "e.g. Limited run of 200" },
  ],
  NEW_SERVICE: [
    { key: "name", label: "Service name", required: true },
    { key: "description", label: "What the service is", type: "textarea", required: true },
    { key: "price", label: "Price", placeholder: "e.g. From $120" },
    { key: "audience", label: "Who it's for" },
    { key: "benefits", label: "Main benefits", type: "textarea" },
    { key: "different", label: "What makes it different", type: "textarea" },
    { key: "start", label: "Available from", type: "date", required: true },
    { key: "promotion", label: "Introductory offer", placeholder: "Leave empty if none" },
    { key: "end", label: "Offer end date", type: "date" },
  ],
  EVENT: [
    { key: "name", label: "Event name", required: true },
    { key: "description", label: "What's happening", type: "textarea", required: true },
    { key: "start", label: "Event date", type: "date", required: true },
    { key: "location", label: "Where", placeholder: "e.g. Our Main Street shop" },
    { key: "tickets", label: "Tickets or RSVP", placeholder: "e.g. Free, RSVP by DM" },
  ],
  NEW_INVENTORY: [
    { key: "name", label: "What's new", required: true, placeholder: "e.g. 40 new spring dresses" },
    { key: "description", label: "Details", type: "textarea" },
    { key: "start", label: "Available from", type: "date", required: true },
  ],
  HOLIDAY: [
    { key: "holiday", label: "Which holiday", required: true, placeholder: "e.g. Black Friday" },
    { key: "offer", label: "The offer", required: true },
    { key: "code", label: "Promo code", placeholder: "Leave empty if none" },
    { key: "start", label: "Start date", type: "date", required: true },
    { key: "end", label: "End date", type: "date", required: true },
    { key: "restrictions", label: "Any restrictions", type: "textarea" },
  ],
  ANNOUNCEMENT: [
    { key: "headline", label: "What are you announcing?", required: true },
    { key: "description", label: "Details", type: "textarea" },
    { key: "start", label: "Announce on", type: "date", required: true },
  ],
};

/** Field values as the business typed them. */
export type PromotionDetails = Record<string, string>;

export function missingPromotionFields(kind: PromotionKind, details: PromotionDetails): string[] {
  return PROMOTION_FIELDS[kind].filter((f) => f.required && !details[f.key]?.trim()).map((f) => f.label);
}

export function promotionTitle(kind: PromotionKind, d: PromotionDetails): string {
  const first = d.name || d.offer || d.holiday || d.headline || promotionLabel(kind);
  return first.trim().slice(0, 120);
}

// --- The kind of business ------------------------------------------------

export const CATEGORIES = ["retail", "food", "health", "trades", "auto", "realestate", "beauty_fitness", "services", "general"] as const;
export type Category = (typeof CATEGORIES)[number];

const CATEGORY_WORDS: [Category, RegExp][] = [
  ["auto", /\bauto\b|automotive|car (detail|wash|care|repair)|detailing|mechanic|ceramic coat|tyre|tire shop|vehicle|window tint|body shop/i],
  ["food", /restaurant|caf[eé]|coffee|bakery|food|pizza|bar\b|grill|kitchen|catering|brew|deli|diner|bistro/i],
  ["health", /dent|clinic|doctor|medical|chiro|physio|therap|optom|veterin|vet\b|health|orthodont|pharma/i],
  ["trades", /roof|plumb|electric|contract|hvac|landscap|clean|construct|repair|remodel|paint|handyman|pest|moving|solar|garage/i],
  ["realestate", /real estate|realtor|property|homes? for|mortgage|broker/i],
  ["beauty_fitness", /salon|spa\b|beauty|nail|barber|lash|brow|fitness|gym|yoga|pilates|personal train|crossfit|tattoo/i],
  ["retail", /cloth|apparel|fashion|boutique|shop|store|jewel|e-?commerce|retail|shoe|furniture|gift|cosmetic|skincare|candle/i],
  ["services", /consult|agency|law|legal|account|insurance|coach|tutor|design|marketing|photograph|financial|software|saas/i],
];

/** Best guess at the kind of business, from what it said about itself. */
export function businessCategory(text: string): Category {
  for (const [category, words] of CATEGORY_WORDS) if (words.test(text)) return category;
  return "general";
}

// --- What to post for a goal ---------------------------------------------

export type ContentIdea = {
  /** Shown on the card, e.g. "Product demonstration". */
  type: string;
  /** Why this kind of post serves the goal; feeds the "why" on each card. */
  purpose: string;
  /** Selling something directly. Kept to a minority of posts. */
  promotional?: boolean;
  /** The format it works best in. */
  format?: "IMAGE" | "CAROUSEL" | "REEL";
};

const c = (type: string, purpose: string, extra: Partial<ContentIdea> = {}): ContentIdea => ({ type, purpose, ...extra });

const SALES_BASE: ContentIdea[] = [
  c("Product demonstration", "shows the product in use, which builds purchase intent", { format: "REEL" }),
  c("Benefits", "makes the reason to buy obvious"),
  c("Customer testimonial", "lets a real customer do the persuading"),
  c("Lifestyle", "shows who the product is for and how it fits their life"),
  c("Offer", "gives followers a reason to buy now", { promotional: true }),
];

/** The playbook: per goal, with the business's category changing the mix. */
const PLAYBOOK: Record<Exclude<GoalKey, "RECOMMEND">, { base: ContentIdea[]; byCategory?: Partial<Record<Category, ContentIdea[]>> }> = {
  INCREASE_SALES: {
    base: SALES_BASE,
    byCategory: {
      retail: [
        c("New arrivals", "puts fresh stock in front of people ready to buy", { format: "CAROUSEL" }),
        c("Product demonstration", "shows fit, feel and detail the way a shop window can't", { format: "REEL" }),
        c("Styled lifestyle", "helps followers picture themselves wearing or using it"),
        c("Customer photo / social proof", "shows real customers love it"),
        c("Shop-now offer", "turns interest into orders with a clear purchase CTA", { promotional: true }),
      ],
      food: [
        c("Signature dish close-up", "makes people hungry for the thing you're known for"),
        c("Behind the scenes", "shows the care that goes into the food", { format: "REEL" }),
        c("Customer favourite", "social proof from what regulars order"),
        c("Limited-time special", "gives a reason to visit or order this week", { promotional: true }),
        c("Order / visit reminder", "a direct nudge to order or come in", { promotional: true }),
      ],
      health: [
        c("Treatment explained", "removes the fear and uncertainty that stops people booking"),
        c("Patient testimonial", "builds trust from people like them"),
        c("Meet the team", "puts faces to the practice"),
        c("Book-now offer", "a clear next step to book", { promotional: true }),
      ],
      trades: [
        c("Before and after", "proves the quality of the work", { format: "CAROUSEL" }),
        c("Job walkthrough", "shows the process and professionalism", { format: "REEL" }),
        c("Customer review", "social proof from local customers"),
        c("Quote offer", "a direct way to get a price", { promotional: true }),
      ],
      services: [
        c("Client result / case study", "shows the outcome clients get", { format: "CAROUSEL" }),
        c("How it works", "makes buying feel simple and low-risk"),
        c("Testimonial", "trust from a satisfied client"),
        c("Package offer", "a clear way to buy", { promotional: true }),
      ],
    },
  },
  GENERATE_LEADS: {
    base: [
      c("Educational tip", "helps first and earns the right to ask"),
      c("Common customer problem", "names the problem your customers have, so they recognise themselves"),
      c("Case study", "shows the result someone like them got", { format: "CAROUSEL" }),
      c("Testimonial", "builds trust before they get in touch"),
      c("FAQ", "answers the question that stops people enquiring"),
      c("Free consultation", "a low-risk reason to get in touch now", { promotional: true }),
    ],
    byCategory: {
      trades: [
        c("Warning signs", "e.g. \"3 signs your roof may need repairs\" — helps people spot the problem", { format: "CAROUSEL" }),
        c("Before and after", "proves the quality of the work", { format: "CAROUSEL" }),
        c("Customer review", "social proof from local customers"),
        c("FAQ", "answers the question that stops people calling"),
        c("Free estimate", "a direct, no-risk next step: message for a free inspection or estimate", { promotional: true }),
      ],
      health: [
        c("Myth vs fact", "corrects what people wrongly believe and builds authority", { format: "CAROUSEL" }),
        c("Patient question answered", "answers what patients ask most"),
        c("Patient testimonial", "trust from people like them"),
        c("Free consultation", "a low-risk first appointment", { promotional: true }),
      ],
      realestate: [
        c("Market update", "positions you as the local expert"),
        c("Just sold / case study", "proof you get results", { format: "CAROUSEL" }),
        c("Buyer or seller tip", "useful advice that earns trust"),
        c("Free home valuation", "a reason for owners to get in touch", { promotional: true }),
      ],
      services: [
        c("Expert tip", "shows expertise by giving something useful away"),
        c("Client problem solved", "names the problem and shows the way out", { format: "CAROUSEL" }),
        c("Testimonial", "trust from a satisfied client"),
        c("DM for a free call", "a simple, direct way to start a conversation", { promotional: true }),
      ],
    },
  },
  GET_BOOKINGS: {
    base: [
      c("Available slots this week", "creates a timely reason to book", { promotional: true }),
      c("What to expect", "removes the uncertainty that stops first bookings"),
      c("Client result", "shows the result of booking", { format: "CAROUSEL" }),
      c("Testimonial", "trust from people who booked"),
      c("Meet the team", "puts faces to the business"),
    ],
    byCategory: {
      beauty_fitness: [
        c("Transformation / before and after", "shows the result clients get", { format: "CAROUSEL" }),
        c("Session or treatment in action", "lets people see what it's like", { format: "REEL" }),
        c("Client testimonial", "trust from real clients"),
        c("Book-now slots", "a timely reason to book this week", { promotional: true }),
      ],
      food: [
        c("Table / event booking reminder", "nudges people to reserve", { promotional: true }),
        c("Atmosphere and space", "shows the experience of being there", { format: "REEL" }),
        c("Signature dish", "the reason to come"),
        c("Guest review", "social proof from diners"),
      ],
    },
  },
  NEW_PRODUCT: { base: SALES_BASE },
  NEW_SERVICE: {
    base: [
      c("How it works", "makes the service easy to understand"),
      c("Who it's for", "helps the right people recognise themselves"),
      c("Result / proof", "shows what it delivers", { format: "CAROUSEL" }),
      c("Book or enquire", "a clear next step", { promotional: true }),
    ],
  },
  GROW_FOLLOWERS: {
    base: [
      c("Shareable tip", "useful enough that people save and share it", { format: "CAROUSEL" }),
      c("Behind the scenes", "the personal side people follow accounts for", { format: "REEL" }),
      c("Question for followers", "starts conversation and lifts reach"),
      c("Trend / Reel", "short video that reaches people who don't follow you yet", { format: "REEL" }),
      c("Community spotlight", "features customers so they share it"),
    ],
  },
  BRAND_AWARENESS: {
    base: [
      c("Brand story", "tells people who you are and why you do it"),
      c("Behind the scenes", "makes the business recognisable and human", { format: "REEL" }),
      c("What makes us different", "the one thing people should remember"),
      c("Customer story", "shows the brand through someone else's eyes"),
      c("Local / community", "connects the brand to where people live"),
    ],
  },
  WEBSITE_TRAFFIC: {
    base: [
      c("Guide teaser", "gives part of the answer and sends people to the website for the rest", { format: "CAROUSEL" }),
      c("Featured product or page", "a clear reason to click through"),
      c("New on the website", "fresh content worth visiting for"),
      c("Link-in-bio offer", "a direct reason to visit now", { promotional: true }),
    ],
  },
  PROMOTE_SALE: { base: SALES_BASE },
  PROMOTE_EVENT: {
    base: [
      c("Event announcement", "puts the date in people's diaries", { promotional: true }),
      c("What to expect", "makes people want to be there"),
      c("Behind the scenes prep", "builds anticipation", { format: "REEL" }),
      c("Last year / past event", "proof it's worth coming"),
    ],
  },
  REPEAT_CUSTOMERS: {
    base: [
      c("Customer appreciation", "thanks customers and makes them feel part of it"),
      c("How to get more from it", "helps customers use what they bought, so they come back"),
      c("Loyalty or returning-customer offer", "a reason to come back", { promotional: true }),
      c("What's new since your last visit", "gives past customers a reason to return"),
      c("Customer spotlight", "features regulars"),
    ],
  },
  LAUNCH: { base: SALES_BASE },
};

/** The content mix for a goal and kind of business. Never empty. */
export function contentMix(goal: GoalKey, category: Category): ContentIdea[] {
  const key = goal === "RECOMMEND" ? "INCREASE_SALES" : goal;
  const entry = PLAYBOOK[key];
  return entry.byCategory?.[category] ?? entry.base;
}

/**
 * "Let MAIRO recommend": the goal that fits what the business told MAIRO.
 * Shops and restaurants want sales; appointment businesses want bookings;
 * trades, clinics and professional services want enquiries.
 */
export function recommendGoal(category: Category, hasPricedProducts: boolean): Exclude<GoalKey, "RECOMMEND"> {
  if (category === "beauty_fitness") return "GET_BOOKINGS";
  if (category === "health" || category === "trades" || category === "services" || category === "realestate") return "GENERATE_LEADS";
  if (category === "retail" || category === "food" || hasPricedProducts) return "INCREASE_SALES";
  return "BRAND_AWARENESS";
}

// --- Promotions and launches, in order -----------------------------------

export type SequenceStep = {
  /** "Teaser", "Launch", "Last chance"… */
  step: string;
  contentType: string;
  /** Days from the start (negative = before it). Relative to the end when fromEnd. */
  offset: number;
  fromEnd?: boolean;
  /** Higher survives when there are too many promotional posts. */
  priority: number;
  /** Selling directly, vs. useful or trust-building. */
  promotional: boolean;
  format?: "IMAGE" | "CAROUSEL" | "REEL";
};

const s = (step: string, contentType: string, offset: number, priority: number, promotional: boolean, extra: Partial<SequenceStep> = {}): SequenceStep => ({ step, contentType, offset, priority, promotional, ...extra });

export const SEQUENCES: Record<PromotionKind, SequenceStep[]> = {
  SALE: [
    s("Teaser", "Sale teaser", -2, 2, true),
    s("Launch", "Sale launch", 0, 5, true),
    s("Showcase", "What's included", 1, 1, true, { format: "CAROUSEL" }),
    s("Reminder", "Sale reminder", 3, 1, true),
    s("Ending soon", "Ending soon", -1, 3, true, { fromEnd: true }),
    s("Last chance", "Last chance", 0, 4, true, { fromEnd: true }),
  ],
  HOLIDAY: [
    s("Teaser", "Holiday teaser", -3, 2, true),
    s("Launch", "Holiday offer launch", 0, 5, true),
    s("Gift ideas", "Gift ideas", 1, 2, false, { format: "CAROUSEL" }),
    s("Reminder", "Holiday reminder", 3, 1, true),
    s("Last chance", "Last chance", 0, 4, true, { fromEnd: true }),
  ],
  NEW_PRODUCT: [
    s("Teaser", "Teaser", -3, 3, false),
    s("Product reveal", "Product reveal", 0, 5, true, { format: "REEL" }),
    s("Benefits", "Product benefits", 1, 3, false, { format: "CAROUSEL" }),
    s("Demonstration", "Demonstration", 3, 3, false, { format: "REEL" }),
    s("Lifestyle", "Lifestyle", 5, 2, false),
    s("Social proof", "Social proof", 7, 2, false),
    s("Buy now", "Purchase-focused", 9, 4, true),
    s("Last chance", "Last chance", 0, 3, true, { fromEnd: true }),
  ],
  NEW_SERVICE: [
    s("Teaser", "Teaser", -3, 2, false),
    s("Introduction", "Service introduction", 0, 5, true),
    s("Who it's for", "Who it's for", 2, 3, false),
    s("How it works", "How it works", 4, 3, false, { format: "CAROUSEL" }),
    s("Proof", "Result / testimonial", 6, 2, false),
    s("Book now", "Book now", 8, 4, true),
    s("Last chance", "Offer ending", 0, 3, true, { fromEnd: true }),
  ],
  EVENT: [
    s("Announcement", "Event announcement", -14, 5, true),
    s("What to expect", "What to expect", -9, 3, false, { format: "CAROUSEL" }),
    s("Reminder", "Event reminder", -5, 3, true),
    s("Behind the scenes", "Event prep", -2, 2, false, { format: "REEL" }),
    s("Tomorrow", "See you tomorrow", -1, 4, true),
    s("Today", "It's today", 0, 4, true),
  ],
  NEW_INVENTORY: [
    s("Just landed", "New arrivals", 0, 5, true, { format: "CAROUSEL" }),
    s("Close-up", "Product close-up", 2, 3, false, { format: "REEL" }),
    s("Styled", "Lifestyle", 4, 2, false),
  ],
  ANNOUNCEMENT: [
    s("Announcement", "Announcement", 0, 5, false),
    s("Follow-up", "Questions answered", 3, 2, false),
  ],
};

const DAY = 86_400_000;
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

export type DatedStep = SequenceStep & { date: string };

/**
 * A promotion's posts on real dates. Steps that would fall before today are
 * left out; "from end" steps need an end date; a step that would land on the
 * same day as a more important one, or outside the promotion, is dropped.
 */
export function promotionSequence(kind: PromotionKind, opts: { start: string; end?: string | null; today: string }): DatedStep[] {
  const out: DatedStep[] = [];
  const end = opts.end && opts.end >= opts.start ? opts.end : null;
  for (const step of SEQUENCES[kind]) {
    if (step.fromEnd && !end) continue;
    const date = step.fromEnd ? addDays(end!, step.offset) : addDays(opts.start, step.offset);
    if (date < opts.today) continue;
    // During-promotion steps stay inside the promotion.
    if (!step.fromEnd && step.offset > 0 && end && date > end) continue;
    if (step.fromEnd && date < opts.start) continue;
    out.push({ ...step, date });
  }
  // One post per day: keep the more important step.
  const byDay = new Map<string, DatedStep>();
  for (const st of out) {
    const have = byDay.get(st.date);
    if (!have || st.priority > have.priority) byDay.set(st.date, st);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// --- The calendar ----------------------------------------------------------

/** Day offsets within a week for a number of posts, spread out. */
export function weekPattern(postsPerWeek: number): number[] {
  const n = Math.min(7, Math.max(1, Math.round(postsPerWeek)));
  const patterns: Record<number, number[]> = { 1: [2], 2: [1, 4], 3: [0, 2, 4], 4: [0, 2, 4, 6], 5: [0, 1, 3, 4, 6], 6: [0, 1, 2, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };
  return patterns[n];
}

export type Slot = {
  date: string;
  kind: "promo" | "value";
  contentType: string;
  purpose: string;
  promotional: boolean;
  format?: "IMAGE" | "CAROUSEL" | "REEL";
  /** For promotion slots. */
  promotionId?: string;
  step?: string;
};

/** No more than this share of a week's posts sell directly. */
export const MAX_PROMO_SHARE = 0.6;

/**
 * The posting calendar for a period: promotion steps on their dates, the
 * goal's content mix on the other posting days, and never a week that's
 * mostly selling. Days that already have a post are left alone.
 */
export function planSchedule(input: {
  start: string;
  days: number;
  postsPerWeek: number;
  mix: ContentIdea[];
  promotions: { id: string; steps: DatedStep[] }[];
  /** Dates that already have a post. */
  taken?: string[];
  /** Promotion steps already planned, as `${promotionId}:${step}`. */
  done?: string[];
  /** Where in the mix to start, so consecutive plans don't repeat. */
  mixOffset?: number;
}): Slot[] {
  const end = addDays(input.start, input.days - 1);
  const taken = new Set(input.taken ?? []);
  const done = new Set(input.done ?? []);
  const pattern = weekPattern(input.postsPerWeek);

  const slots: Slot[] = [];
  for (const p of input.promotions) {
    for (const st of p.steps) {
      if (st.date < input.start || st.date > end || done.has(`${p.id}:${st.step}`)) continue;
      slots.push({ date: st.date, kind: "promo", contentType: st.contentType, purpose: st.step, promotional: st.promotional, format: st.format, promotionId: p.id, step: st.step });
    }
  }

  // Per week: cap the selling posts, then fill the rest with the goal's mix.
  const priorityOf = (sl: Slot) =>
    input.promotions.find((p) => p.id === sl.promotionId)?.steps.find((st) => st.step === sl.step)?.priority ?? 0;
  const out: Slot[] = [];
  let mixAt = input.mixOffset ?? 0;
  for (let week = 0; week * 7 < input.days; week++) {
    const wStart = addDays(input.start, week * 7);
    const wEnd = addDays(wStart, 6) > end ? end : addDays(wStart, 6);
    const weekDays = daysBetween(wStart, wEnd) + 1;
    const target = Math.max(1, Math.round((input.postsPerWeek * weekDays) / 7));

    const promos = slots.filter((sl) => sl.date >= wStart && sl.date <= wEnd && !taken.has(sl.date));
    const weekTotal = Math.max(target, Math.min(promos.length, weekDays));
    const maxSelling = Math.max(1, Math.floor(weekTotal * MAX_PROMO_SHARE));
    const selling = promos.filter((p) => p.promotional).sort((a, b) => priorityOf(b) - priorityOf(a)).slice(0, maxSelling);
    const kept = [...promos.filter((p) => !p.promotional), ...selling];
    const used = new Set(kept.map((k) => k.date));
    let sellingCount = selling.length;
    // Posts already on the calendar this week count toward the week's total.
    const already = [...taken].filter((d) => d >= wStart && d <= wEnd).length;
    let count = kept.length + already;
    out.push(...kept);

    // Posting days: the spread-out pattern first, then any free day.
    const offsets = [...pattern, ...[0, 1, 2, 3, 4, 5, 6].filter((d) => !pattern.includes(d))];
    for (const offset of offsets) {
      if (count >= weekTotal) break;
      const date = addDays(wStart, offset);
      if (date > wEnd || used.has(date) || taken.has(date)) continue;
      let idea = input.mix[mixAt % input.mix.length];
      mixAt++;
      if (idea.promotional && sellingCount >= maxSelling) {
        const next = input.mix.find((m, k) => !m.promotional && k >= mixAt % input.mix.length) ?? input.mix.find((m) => !m.promotional);
        if (next) idea = next;
      }
      if (idea.promotional) sellingCount++;
      used.add(date);
      count++;
      out.push({ date, kind: "value", contentType: idea.type, purpose: idea.purpose, promotional: Boolean(idea.promotional), format: idea.format });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// --- Approval ---------------------------------------------------------------

export const APPROVAL_MODES = [
  { key: "APPROVAL_REQUIRED", label: "Approval required", text: "MAIRO creates content. You approve each post. MAIRO publishes after approval." },
  { key: "WEEKLY", label: "Weekly approval", text: "MAIRO plans the upcoming week. You approve the whole week at once. MAIRO posts it." },
  { key: "AUTOPILOT", label: "Autopilot", text: "MAIRO generates, schedules and publishes content on its own, following the goal, strategy and posts you've already approved." },
] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number]["key"];

/** Autopilot only after the business has shown MAIRO what it approves. */
export const AUTOPILOT_MIN_APPROVED = 3;

// --- Calendar status labels ----------------------------------------------

export function calendarStatus(p: { status: string; scheduledFor: Date | null }): { label: string; tone: "muted" | "attention" | "good" | "info" | "bad" } {
  switch (p.status) {
    case "DRAFT":
      return { label: "Draft", tone: "muted" };
    case "SUGGESTED":
      return { label: "Awaiting approval", tone: "attention" };
    case "SCHEDULED":
      return p.scheduledFor ? { label: "Scheduled", tone: "info" } : { label: "Approved", tone: "info" };
    case "CREATED":
      return { label: "Publishing", tone: "info" };
    case "PUBLISHED":
      return { label: "Published", tone: "good" };
    case "SKIPPED":
      return { label: "Skipped", tone: "muted" };
    case "PAUSED":
      return { label: "Paused", tone: "bad" };
    default:
      return { label: "Failed", tone: "bad" };
  }
}

// --- Learning from results ---------------------------------------------------

export type ResultRow = { contentType: string | null; objective: string | null; status: string; likeCount: number | null; commentCount: number | null };

export type Learnings = {
  measured: number;
  byType: { type: string; posts: number; avgEngagement: number }[];
  best: string | null;
  weakest: string | null;
  skippedTypes: string[];
  /** Plain sentences for the business and for MAIRO's own planning. */
  notes: string[];
};

/**
 * What MAIRO has learned from this business's own posts: which kinds of
 * content got the most likes and comments, and which kinds the business keeps
 * skipping. Nothing is concluded from fewer than two posts of a kind.
 */
export function learningsFrom(rows: ResultRow[]): Learnings {
  const measured = rows.filter((r) => r.status === "PUBLISHED" && r.likeCount !== null && r.contentType);
  const groups = new Map<string, number[]>();
  for (const r of measured) {
    const list = groups.get(r.contentType!) ?? [];
    list.push((r.likeCount ?? 0) + (r.commentCount ?? 0));
    groups.set(r.contentType!, list);
  }
  const byType = [...groups.entries()]
    .map(([type, list]) => ({ type, posts: list.length, avgEngagement: Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);
  const comparable = byType.filter((t) => t.posts >= 2);
  const best = comparable.length >= 2 ? comparable[0].type : null;
  const weakest = comparable.length >= 2 ? comparable[comparable.length - 1].type : null;

  const skips = new Map<string, number>();
  for (const r of rows) if (r.status === "SKIPPED" && r.contentType) skips.set(r.contentType, (skips.get(r.contentType) ?? 0) + 1);
  const skippedTypes = [...skips.entries()].filter(([, n]) => n >= 2).map(([t]) => t);

  const notes: string[] = [];
  if (best && weakest && best !== weakest) {
    const top = comparable[0];
    const low = comparable[comparable.length - 1];
    notes.push(`${top.type} posts get the most engagement (${top.avgEngagement} likes and comments on average); ${low.type} posts get the least (${low.avgEngagement}). MAIRO plans more of the first.`);
  }
  for (const t of skippedTypes) notes.push(`You've skipped ${t} posts more than once, so MAIRO plans fewer of them.`);
  if (measured.length < 4) notes.push("Not enough published posts with results yet to draw conclusions. MAIRO keeps measuring.");
  return { measured: measured.length, byType, best, weakest, skippedTypes, notes };
}

/** The content mix, adjusted by what has worked and what the business skips. */
export function adjustMix(mix: ContentIdea[], learnings: Learnings): ContentIdea[] {
  const skipped = new Set(learnings.skippedTypes);
  const kept = mix.filter((m) => !skipped.has(m.type));
  const base = kept.length ? kept : mix;
  if (!learnings.best) return base;
  const best = base.find((m) => m.type === learnings.best);
  return best ? [best, ...base] : base;
}
