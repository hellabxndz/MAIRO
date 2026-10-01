import type { AdDestination, AdGoal } from "@/generated/prisma/enums";
import { businessCategory, type Category, type GoalKey as SocialGoalKey } from "@/lib/social/goals";

// The MAIRO mission: the business says what it wants; MAIRO decides how.
//
// Everything here is pure — goals, what each goal asks customers to do, how
// that maps to an ad, what to post for each kind of business, how results
// are measured for each goal, and reading a plain-English request — so
// scripts/check-mission.ts can check every rule.

export { businessCategory, type Category };

// --- Goals --------------------------------------------------------------------

/** What the business wants customers to do. Asked instead of "campaign objective". */
export const CUSTOMER_ACTIONS = [
  { key: "BUY", label: "Buy something" },
  { key: "CONTACT", label: "Contact me" },
  { key: "BOOK", label: "Book an appointment" },
  { key: "CALL", label: "Call me" },
  { key: "VISIT_WEBSITE", label: "Visit my website" },
  { key: "VISIT_LOCATION", label: "Visit my location" },
  { key: "DISCOVER", label: "Get to know my business" },
  { key: "FOLLOW", label: "Follow us on social" },
] as const;
export type CustomerAction = (typeof CUSTOMER_ACTIONS)[number]["key"];

/** How results are measured for a goal. */
export type MetricFamily = "sales" | "leads" | "bookings" | "calls" | "traffic" | "awareness" | "social" | "visits";

export const MISSION_GOALS = [
  { key: "INCREASE_SALES", label: "Increase sales", title: "Sell More", sentence: "MAIRO is focused on turning interest into purchases.", action: "BUY", metrics: "sales", social: "INCREASE_SALES" },
  { key: "GENERATE_LEADS", label: "Generate leads", title: "Get More Leads", sentence: "MAIRO is focused on getting potential customers to contact you.", action: "CONTACT", metrics: "leads", social: "GENERATE_LEADS" },
  { key: "GET_BOOKINGS", label: "Get more appointments", title: "Get More Appointments", sentence: "MAIRO is focused on increasing appointment requests for your business.", action: "BOOK", metrics: "bookings", social: "GET_BOOKINGS" },
  { key: "GET_CALLS", label: "Get more calls", title: "Get More Calls", sentence: "MAIRO is focused on getting people to pick up the phone and call you.", action: "CALL", metrics: "calls", social: "GENERATE_LEADS" },
  { key: "WEBSITE_TRAFFIC", label: "Increase website traffic", title: "Bring People to Your Website", sentence: "MAIRO is focused on sending interested people to your website.", action: "VISIT_WEBSITE", metrics: "traffic", social: "WEBSITE_TRAFFIC" },
  { key: "NEW_PRODUCT", label: "Promote a new product", title: "Launch Your New Product", sentence: "MAIRO is building awareness and purchase intent around your new product.", action: "BUY", metrics: "sales", social: "NEW_PRODUCT" },
  { key: "NEW_SERVICE", label: "Promote a service", title: "Launch Your New Service", sentence: "MAIRO is introducing your new service to the people most likely to want it.", action: "BOOK", metrics: "bookings", social: "NEW_SERVICE" },
  { key: "BRAND_AWARENESS", label: "Increase brand awareness", title: "Get Your Business Known", sentence: "MAIRO is focused on putting your business in front of the right local people.", action: "DISCOVER", metrics: "awareness", social: "BRAND_AWARENESS" },
  { key: "GROW_SOCIAL", label: "Grow social media", title: "Grow Your Social Following", sentence: "MAIRO is focused on content people follow, save and share.", action: "FOLLOW", metrics: "social", social: "GROW_FOLLOWERS" },
  { key: "PROMOTE_SALE", label: "Promote a sale", title: "Promote Your Sale", sentence: "MAIRO is making sure the right people hear about your sale before it ends.", action: "BUY", metrics: "sales", social: "PROMOTE_SALE" },
  { key: "PROMOTE_EVENT", label: "Promote an event", title: "Fill Your Event", sentence: "MAIRO is building attendance for your event.", action: "CONTACT", metrics: "awareness", social: "PROMOTE_EVENT" },
  { key: "FOOT_TRAFFIC", label: "Bring people into my location", title: "Bring People Through the Door", sentence: "MAIRO is focused on getting local people to come in.", action: "VISIT_LOCATION", metrics: "visits", social: "BRAND_AWARENESS" },
  { key: "REPEAT_CUSTOMERS", label: "Increase repeat customers", title: "Bring Customers Back", sentence: "MAIRO is focused on bringing past customers back again.", action: "BUY", metrics: "sales", social: "REPEAT_CUSTOMERS" },
  { key: "RECOMMEND", label: "Let MAIRO recommend", title: "MAIRO's Recommendation", sentence: "MAIRO chose the goal that fits your business best.", action: "BUY", metrics: "sales", social: "RECOMMEND" },
] as const satisfies readonly { key: string; label: string; title: string; sentence: string; action: CustomerAction; metrics: MetricFamily; social: SocialGoalKey }[];

export type MissionGoal = (typeof MISSION_GOALS)[number]["key"];
export const MISSION_GOAL_KEYS = MISSION_GOALS.map((g) => g.key) as [MissionGoal, ...MissionGoal[]];

export function missionGoal(key: string) {
  return MISSION_GOALS.find((g) => g.key === key) ?? MISSION_GOALS[0];
}

const GERUND: Record<string, string> = { Increase: "increasing", Generate: "generating", Get: "getting", Promote: "promoting", Grow: "growing", Bring: "bringing", Let: "letting" };

/** "Get more bookings" → "getting more bookings"; "my location" → "your location". */
export function goalPhrase(key: string): string {
  const label = missionGoal(key).label.replace(/\bmy\b/g, "your");
  const [first, ...rest] = label.split(" ");
  return [GERUND[first] ?? first.toLowerCase(), ...rest].join(" ");
}

/** "Let MAIRO recommend", resolved from the kind of business. */
export function recommendMissionGoal(category: Category, hasPricedProducts: boolean): Exclude<MissionGoal, "RECOMMEND"> {
  switch (category) {
    case "beauty_fitness":
    case "auto":
      return "GET_BOOKINGS";
    case "health":
    case "trades":
    case "services":
    case "realestate":
      return "GENERATE_LEADS";
    case "food":
      return "FOOT_TRAFFIC";
    case "retail":
      return "INCREASE_SALES";
    default:
      return hasPricedProducts ? "INCREASE_SALES" : "BRAND_AWARENESS";
  }
}

/** The ad set-up for a customer action. MAIRO decides; the Create wizard shows it, prefilled. */
export function adSetupFor(action: CustomerAction, opts: { hasWebsite: boolean; hasPhone: boolean; pixelActive: boolean }): { goal: AdGoal; destination: AdDestination | null; note: string } {
  switch (action) {
    case "BUY":
      return opts.hasWebsite
        ? { goal: "SALES", destination: "WEBSITE", note: opts.pixelActive ? "Optimized for purchases on your website." : "Optimized for website visits until your site's tracking can report purchases." }
        : { goal: "LEADS", destination: "DIRECT_MESSAGE", note: "No website to buy on, so people message you to order." };
    case "CONTACT":
      return { goal: "LEADS", destination: "LEAD_FORM", note: "A quick form inside the ad, so people can reach you without leaving Facebook or Instagram." };
    case "BOOK":
      return opts.hasWebsite
        ? { goal: "LEADS", destination: "WEBSITE", note: "Sends people to book on your website." }
        : { goal: "LEADS", destination: "DIRECT_MESSAGE", note: "People message you to book." };
    case "CALL":
      return opts.hasPhone
        ? { goal: "LEADS", destination: "PHONE_CALL", note: "A call button that rings your business." }
        : { goal: "LEADS", destination: "DIRECT_MESSAGE", note: "No phone number on file, so people message you instead." };
    case "VISIT_WEBSITE":
      return { goal: "TRAFFIC", destination: "WEBSITE", note: "Optimized for people who actually load your page, not just click." };
    case "VISIT_LOCATION":
      return { goal: "AWARENESS", destination: null, note: "Reaches people near your location again and again, so you're who they think of." };
    case "FOLLOW":
      return { goal: "ENGAGEMENT", destination: "POST_ENGAGEMENT", note: "Grows engagement with your posts." };
    case "DISCOVER":
    default:
      return { goal: "AWARENESS", destination: null, note: "Reaches as many of the right people as the budget allows." };
  }
}

// --- What every marketing item is for ----------------------------------------

export const MARKETING_OBJECTIVES = [
  "Awareness",
  "Education",
  "Trust",
  "Consideration",
  "Lead generation",
  "Conversion",
  "Booking",
  "Retention",
  "Promotion",
  "Product launch",
] as const;
export type MarketingObjective = (typeof MARKETING_OBJECTIVES)[number];

/** The objective a piece of content serves, from what it is. Never "random". */
export function objectiveFor(input: { contentType: string; promotional?: boolean; step?: string | null; goal?: string | null }): MarketingObjective {
  const t = `${input.contentType} ${input.step ?? ""}`.toLowerCase();
  if (input.step && /teaser|reveal|launch|introduction|just landed/.test(t) && /PRODUCT|SERVICE|LAUNCH/.test(input.goal ?? "")) return "Product launch";
  if (/sale|offer|discount|last chance|ending|holiday|deal|special|promo/.test(t)) return "Promotion";
  if (/book|slot|availab|opening|appointment|reserv/.test(t)) return "Booking";
  if (/estimate|consult|dm |message|quote|free inspection|valuation|enquir/.test(t)) return "Lead generation";
  if (/testimonial|review|proof|case study|before and after|before\/after|result|transformation|customer/.test(t)) return "Trust";
  if (/tip|faq|explained|how it works|myth|signs|guide|question|educat|what to expect/.test(t)) return "Education";
  if (/loyal|returning|appreciation|come back|repeat/.test(t)) return "Retention";
  if (/demo|benefit|detail|close-up|showcase|what's included|feature|new arrivals|product/.test(t)) return input.promotional ? "Conversion" : "Consideration";
  if (/shop|buy|order|purchase/.test(t)) return "Conversion";
  return "Awareness";
}

// --- The playbook: by goal, and by kind of business -----------------------

export type Playbook = {
  /** What MAIRO will focus on, in plain words. */
  focus: string[];
  /** Ad creative angles, each with its objective. */
  creative: { angle: string; objective: MarketingObjective; format: "IMAGE" | "CAROUSEL" | "VIDEO" }[];
  cta: string;
  audience: string;
  messaging: string;
};

const GOAL_PLAYS: Record<MetricFamily, Omit<Playbook, "audience">> = {
  sales: {
    focus: ["Product benefits", "Demonstration", "Customer proof", "Answering objections", "Your offer", "Strong purchase call to action"],
    creative: [
      { angle: "Product demonstration", objective: "Consideration", format: "VIDEO" },
      { angle: "Customer proof", objective: "Trust", format: "IMAGE" },
      { angle: "Benefits and offer", objective: "Conversion", format: "CAROUSEL" },
    ],
    cta: "Shop now",
    messaging: "What it does for them, proof it works, and a clear reason to buy now.",
  },
  leads: {
    focus: ["The problems your customers have", "Education", "Proof", "A free estimate or consultation", "Easy contact"],
    creative: [
      { angle: "Common problem explained", objective: "Education", format: "CAROUSEL" },
      { angle: "Before and after / case study", objective: "Trust", format: "IMAGE" },
      { angle: "Free estimate or consultation", objective: "Lead generation", format: "IMAGE" },
    ],
    cta: "Get a free quote",
    messaging: "Name the problem, show you've solved it for people like them, make reaching out easy.",
  },
  bookings: {
    focus: ["Results", "The service in action", "Trust", "Availability", "Booking call to action"],
    creative: [
      { angle: "Result / transformation", objective: "Trust", format: "VIDEO" },
      { angle: "The service in action", objective: "Consideration", format: "VIDEO" },
      { angle: "Openings this week", objective: "Booking", format: "IMAGE" },
    ],
    cta: "Book now",
    messaging: "Show the outcome, remove the uncertainty, make booking the obvious next step.",
  },
  calls: {
    focus: ["Why call you", "Fast response", "Proof", "Tap-to-call"],
    creative: [
      { angle: "Why people call us", objective: "Trust", format: "IMAGE" },
      { angle: "Problem solved fast", objective: "Education", format: "VIDEO" },
      { angle: "Call now", objective: "Lead generation", format: "IMAGE" },
    ],
    cta: "Call now",
    messaging: "Reassurance, speed, and a number that's one tap away.",
  },
  traffic: {
    focus: ["A reason to click", "Useful content on your site", "Featured products or pages"],
    creative: [
      { angle: "Guide teaser", objective: "Education", format: "CAROUSEL" },
      { angle: "Featured page or product", objective: "Consideration", format: "IMAGE" },
      { angle: "What's new on the site", objective: "Awareness", format: "IMAGE" },
    ],
    cta: "Learn more",
    messaging: "Give part of the answer and send them to your site for the rest.",
  },
  awareness: {
    focus: ["Who you are", "What makes you different", "Behind the scenes", "Local reach"],
    creative: [
      { angle: "Brand story", objective: "Awareness", format: "VIDEO" },
      { angle: "What makes us different", objective: "Awareness", format: "IMAGE" },
      { angle: "Behind the scenes", objective: "Trust", format: "VIDEO" },
    ],
    cta: "Learn more",
    messaging: "One memorable reason to choose you, shown again and again to the right people.",
  },
  social: {
    focus: ["Shareable tips", "Behind the scenes", "Reels", "Community"],
    creative: [
      { angle: "Shareable tip", objective: "Education", format: "CAROUSEL" },
      { angle: "Behind the scenes Reel", objective: "Awareness", format: "VIDEO" },
      { angle: "Customer spotlight", objective: "Trust", format: "IMAGE" },
    ],
    cta: "Follow for more",
    messaging: "Content worth following — without taking attention away from your main goal.",
  },
  visits: {
    focus: ["What's waiting when they come in", "Local offers", "Reviews", "Directions and opening hours"],
    creative: [
      { angle: "Signature item", objective: "Consideration", format: "VIDEO" },
      { angle: "Local offer this week", objective: "Promotion", format: "IMAGE" },
      { angle: "What regulars say", objective: "Trust", format: "IMAGE" },
    ],
    cta: "Visit us",
    messaging: "Make them want to come in today, and make it easy to find you.",
  },
};

const INDUSTRY: Partial<Record<Category, { focus: string[]; creative: Playbook["creative"]; audience: string }>> = {
  retail: {
    focus: ["Lifestyle creative", "Product drops", "Customer photos (UGC)", "Product details", "Offers"],
    creative: [
      { angle: "Styled lifestyle", objective: "Consideration", format: "IMAGE" },
      { angle: "New drop", objective: "Product launch", format: "CAROUSEL" },
      { angle: "Customer photo", objective: "Trust", format: "IMAGE" },
    ],
    audience: "People with a taste for your style, plus past site visitors and look-alikes of your customers.",
  },
  food: {
    focus: ["Food videos", "Local offers", "Menu highlights", "Reviews", "Local targeting"],
    creative: [
      { angle: "Food close-up video", objective: "Consideration", format: "VIDEO" },
      { angle: "Menu highlight", objective: "Consideration", format: "CAROUSEL" },
      { angle: "Guest review", objective: "Trust", format: "IMAGE" },
    ],
    audience: "Local people within a short drive, at the times they decide where to eat.",
  },
  trades: {
    focus: ["Before and after", "Education", "Testimonials", "Free estimate call to action", "Local leads"],
    creative: [
      { angle: "Before and after", objective: "Trust", format: "CAROUSEL" },
      { angle: "Warning signs to look for", objective: "Education", format: "CAROUSEL" },
      { angle: "Free estimate", objective: "Lead generation", format: "IMAGE" },
    ],
    audience: "Homeowners in your service area.",
  },
  auto: {
    focus: ["Before and after transformations", "Customer proof", "Service benefits", "Local targeting", "Booking call to action"],
    creative: [
      { angle: "Transformation video", objective: "Trust", format: "VIDEO" },
      { angle: "Why it's worth it", objective: "Education", format: "CAROUSEL" },
      { angle: "Book your spot", objective: "Booking", format: "IMAGE" },
    ],
    audience: "Car owners in your area, especially owners of newer or premium vehicles.",
  },
  beauty_fitness: {
    focus: ["Transformations", "Availability", "Style examples", "Booking call to action"],
    creative: [
      { angle: "Transformation", objective: "Trust", format: "CAROUSEL" },
      { angle: "Style examples", objective: "Consideration", format: "VIDEO" },
      { angle: "Openings this week", objective: "Booking", format: "IMAGE" },
    ],
    audience: "Local people who match your clientele, within easy reach of you.",
  },
  realestate: {
    focus: ["Property content", "Neighborhood content", "Buyer and seller education", "Lead generation"],
    creative: [
      { angle: "Featured property", objective: "Consideration", format: "CAROUSEL" },
      { angle: "Neighborhood guide", objective: "Education", format: "VIDEO" },
      { angle: "Free home valuation", objective: "Lead generation", format: "IMAGE" },
    ],
    audience: "People looking to buy or sell in your area.",
  },
  health: {
    focus: ["Treatments explained", "Patient trust", "Testimonials", "Consultation call to action"],
    creative: [
      { angle: "Treatment explained", objective: "Education", format: "VIDEO" },
      { angle: "Patient testimonial", objective: "Trust", format: "IMAGE" },
      { angle: "Book a consultation", objective: "Booking", format: "IMAGE" },
    ],
    audience: "Local people likely to need what you offer.",
  },
  services: {
    focus: ["Case studies", "Expertise", "Testimonials", "Consultation call to action"],
    creative: [
      { angle: "Client result", objective: "Trust", format: "CAROUSEL" },
      { angle: "Expert tip", objective: "Education", format: "VIDEO" },
      { angle: "Free consultation", objective: "Lead generation", format: "IMAGE" },
    ],
    audience: "Decision-makers who match your best clients.",
  },
};

/** MAIRO's starting playbook for this goal and this kind of business. */
export function playbookFor(goal: Exclude<MissionGoal, "RECOMMEND">, category: Category): Playbook {
  const g = missionGoal(goal);
  const base = GOAL_PLAYS[g.metrics];
  const industry = INDUSTRY[category];
  // A launch always runs its sequence, whatever the industry.
  if (goal === "NEW_PRODUCT" || goal === "NEW_SERVICE") {
    return {
      focus: ["Teaser", "Reveal", "Benefits", "Demonstration", "Proof", goal === "NEW_PRODUCT" ? "Purchase call to action" : "Booking call to action", "Urgency when it fits"],
      creative: [
        { angle: "Teaser", objective: "Product launch", format: "VIDEO" },
        { angle: "Reveal and benefits", objective: "Product launch", format: "CAROUSEL" },
        { angle: goal === "NEW_PRODUCT" ? "Buy now" : "Book now", objective: goal === "NEW_PRODUCT" ? "Conversion" : "Booking", format: "IMAGE" },
      ],
      cta: goal === "NEW_PRODUCT" ? "Shop now" : "Book now",
      audience: industry?.audience ?? "People most likely to want it, plus your existing customers and site visitors.",
      messaging: "Build curiosity, reveal it, show why it matters, then make it easy to get.",
    };
  }
  if (!industry) return { ...base, audience: "People most like your best customers, in your area when location matters." };
  // The goal decides the call to action; the industry decides what the content looks like.
  // Three concepts, each doing a different job: the industry's look, the goal's purpose.
  const creative: Playbook["creative"] = [];
  for (const c of [...industry.creative.filter((c) => base.creative.some((b) => b.objective === c.objective)), ...base.creative, ...industry.creative]) {
    if (creative.length < 3 && !creative.some((x) => x.objective === c.objective)) creative.push(c);
  }
  const focus = [...new Set([...industry.focus.slice(0, 4), ...base.focus.slice(-2)])];
  return { focus, creative, cta: base.cta, audience: industry.audience, messaging: base.messaging };
}

// --- Results that match the goal -------------------------------------------

export type ResultFigures = {
  spendCents: number | null;
  purchases: number | null;
  revenueCents: number | null;
  costPerPurchaseCents: number | null;
  roas: number | null;
  leads?: number | null;
  bookings?: number | null;
  contacts?: number | null;
  landingPageViews?: number | null;
  conversions?: number | null;
  engagement?: number | null;
  clicks: number | null;
  reach: number | null;
  impressions: number | null;
  videoViews: number | null;
};

export type ResultTile = { label: string; value: string | null; hint: string };

const money = (c: number | null) => (c === null ? null : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`);
const n = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v).toLocaleString("en-US"));
const per = (spend: number | null, count: number | null | undefined) => (spend !== null && count ? Math.round(spend / count) : null);

/**
 * The results shown for a goal. A figure that isn't tracked stays null
 * ("Not tracked yet") rather than being filled with a different metric —
 * clicks are never shown as leads, and engagement is never shown as sales.
 */
export function resultsForGoal(family: MetricFamily, m: ResultFigures, social?: { likes: number; comments: number; posts: number } | null): ResultTile[] {
  const spend: ResultTile = { label: "Ad spend", value: money(m.spendCents), hint: "Spent on ads in this period." };
  switch (family) {
    case "sales":
      return [
        { label: "Revenue tracked", value: money(m.revenueCents), hint: "Sales Meta tracked back to your ads." },
        { label: "Purchases", value: n(m.purchases), hint: "Purchases tracked from your ads." },
        { label: "Cost per purchase", value: money(m.costPerPurchaseCents), hint: "Ad spend for each purchase, on average." },
        { label: "ROAS", value: m.roas === null ? null : `${m.roas.toFixed(2)}x`, hint: "Revenue for every $1 of ad spend." },
      ];
    case "leads":
      return [
        { label: "Leads", value: n(m.leads), hint: "Forms and lead events tracked from your ads." },
        { label: "Cost per lead", value: money(per(m.spendCents, m.leads)), hint: "Ad spend for each lead." },
        { label: "Contact actions", value: n(m.contacts), hint: "Calls, messages and Contact events, when Meta can track them." },
        spend,
      ];
    case "bookings":
      return [
        { label: "Booking actions", value: n(m.bookings), hint: "Bookings your website's tracking reported (Meta's Schedule event)." },
        { label: "Appointment leads", value: n((m.leads ?? 0) + (m.contacts ?? 0) || null), hint: "People who asked about an appointment by form, call or message, when tracked." },
        { label: "Cost per booking", value: money(per(m.spendCents, m.bookings)), hint: "Ad spend for each tracked booking." },
        spend,
      ];
    case "calls":
      return [
        { label: "Calls and messages", value: n(m.contacts), hint: "Taps to call and conversations started, when Meta can track them." },
        { label: "Cost per contact", value: money(per(m.spendCents, m.contacts)), hint: "Ad spend for each." },
        { label: "Leads", value: n(m.leads), hint: "Forms tracked from your ads." },
        spend,
      ];
    case "traffic":
      return [
        { label: "Landing page views", value: n(m.landingPageViews), hint: "People whose browser actually loaded your page — not just clicks." },
        { label: "Cost per visit", value: money(per(m.spendCents, m.landingPageViews)), hint: "Ad spend for each landing page view." },
        { label: "Conversion activity", value: n(m.conversions), hint: "Purchases, leads and other events your site reported after the visit." },
        spend,
      ];
    case "visits":
      return [
        { label: "Local reach", value: n(m.reach), hint: "People who saw your ads. Store visits can't be measured from ads, so MAIRO doesn't guess them." },
        { label: "Impressions", value: n(m.impressions), hint: "Times your ads were shown." },
        { label: "Calls and messages", value: n(m.contacts), hint: "When tracked." },
        spend,
      ];
    case "social":
      return [
        { label: "Likes and comments", value: social ? n(social.likes + social.comments) : null, hint: "On posts MAIRO published (Scale). Engagement, not sales." },
        { label: "Posts published", value: social ? n(social.posts) : null, hint: "By Social Manager." },
        { label: "Reach from ads", value: n(m.reach), hint: "People who saw your ads." },
        { label: "Video views", value: n(m.videoViews), hint: "From your ads." },
      ];
    case "awareness":
    default:
      return [
        { label: "Reach", value: n(m.reach), hint: "People who saw your ads." },
        { label: "Impressions", value: n(m.impressions), hint: "Times your ads were shown." },
        { label: "Video views", value: n(m.videoViews), hint: "From your ads." },
        { label: "Engagement", value: n(m.engagement), hint: "Reactions, comments, shares and clicks on your ads. Attention, not sales." },
      ];
  }
}

// --- Reading what the business says ---------------------------------------

export type Understood = {
  intent: "goal" | "promotion" | "launch" | "unavailable" | "info";
  goal: MissionGoal | null;
  /** The specific thing, e.g. "ceramic coating", "blue hoodie". */
  item: string | null;
  price: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  endDate: string | null;
  discount: string | null;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}
function dow(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** "Friday" → the next Friday (today counts if it's Friday); "tomorrow"; "this weekend". */
export function dateIn(text: string, today: string): { start: string | null; end: string | null } {
  const t = text.toLowerCase();
  if (/\btoday\b|\btonight\b/.test(t)) return { start: today, end: null };
  if (/\btomorrow\b/.test(t)) return { start: addDays(today, 1), end: null };
  if (/this weekend|the weekend/.test(t)) {
    const toSat = (6 - dow(today) + 7) % 7;
    const sat = addDays(today, dow(today) === 0 ? -1 : toSat);
    return { start: dow(today) === 0 ? today : sat, end: addDays(sat, 1) };
  }
  if (/this week\b/.test(t)) return { start: today, end: addDays(today, (7 - dow(today)) % 7) };
  const iso = t.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return { start: iso[1], end: null };
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(t)) {
      const ahead = (i - dow(today) + 7) % 7;
      return { start: addDays(today, /next /.test(t) && ahead === 0 ? 7 : ahead), end: null };
    }
  }
  return { start: null, end: null };
}

const clean = (s: string | undefined) => (s ? s.replace(/\s+/g, " ").replace(/[.,!]+$/, "").trim() : null);

/**
 * A rule-based reading of what the business said. The AI version does this
 * better; this is what runs without it, and what the checks pin down.
 */
export function readRequest(text: string, today: string): Understood {
  const t = text.trim();
  const low = t.toLowerCase();
  const price = t.match(/\$\s?\d[\d,]*(\.\d{2})?/)?.[0]?.replace(/\s/g, "") ?? null;
  const discount = t.match(/\b\d{1,2}\s?%\s?off\b|\b\d{1,2}\s?percent off\b|\bbogo\b|buy one get one/i)?.[0] ?? null;
  const when = dateIn(t, today);
  const base: Understood = { intent: "goal", goal: null, item: null, price, date: when.start, endDate: when.end, discount };

  // Something they can't sell any more.
  const soldOut = low.match(/(?:sold out of|out of stock (?:of|on)|no longer (?:sell|offer|have|do)|discontinued|ran out of|stopped selling)\s+(?:the |our |all )?([^.,!]+)/);
  if (soldOut || /\b(sold out|out of stock)\b/.test(low)) {
    const item = soldOut?.[1] ?? low.match(/(?:the |our )?([^.,!]+?)\s+(?:is|are) (?:sold out|out of stock)/)?.[1];
    return { ...base, intent: "unavailable", item: clean(item) };
  }

  // Launching something.
  const launch = low.match(/(?:launch(?:ing)?|releas(?:e|ing)|dropping|introduc(?:e|ing)|opening)\s+(?:a |an |our |my |the )?(?:new )?([^.,!$]+?)(?=\s+(?:on |this |next |for |at |tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|[.,!$]|$)/);
  if (launch) {
    const named = clean(launch[1]);
    // "a new product" names nothing; MAIRO asks what it is.
    const item = named && !/^(product|service|thing|something|line|item|offer)s?$/.test(named) ? named : null;
    const service = /service|class|treatment|package|program|course|membership/.test(item ?? "");
    return { ...base, intent: "launch", goal: service ? "NEW_SERVICE" : "NEW_PRODUCT", item };
  }

  // A promotion running now or soon.
  if (discount || /\b(sale|promo|promotion|special offer|deal|discount|black friday|cyber monday|clearance)\b/.test(low)) {
    if (!/\b(more sales|increase sales|sales up|our sales)\b/.test(low)) {
      const item = low.match(/\b(?:on|off)\s+(?:all |our |the |every )?(?!this\b|next\b|today|tomorrow|until|the weekend)([a-z][^.,!]+?)(?=\s+(?:this|next|until|through|for|today|tomorrow|ends|on \w+day)|[.,!]|$)/)?.[1];
      // "until Sunday" is when it ends, and it's running now.
      const untilEnd = /\b(until|till|through|thru|ends?|ending)\b/.test(low) && base.date && !base.endDate;
      return { ...base, intent: "promotion", goal: "PROMOTE_SALE", item: clean(item), ...(untilEnd ? { date: today, endDate: base.date } : {}) };
    }
  }

  // A goal.
  const focus = clean(low.match(/more\s+([a-z][a-z \-]{2,40}?)\s+(?:bookings|appointments|sales|orders|leads|enquiries|customers)/)?.[1]);
  const goal: MissionGoal | null =
    /\bevent\b|workshop|grand opening|open house|concert|tasting/.test(low) ? "PROMOTE_EVENT"
    : /appointment|booking|\bbook\b|reservations?|bookings/.test(low) ? "GET_BOOKINGS"
    : /\bcalls?\b|phone ring|ringing/.test(low) ? "GET_CALLS"
    : /\bleads?\b|enquir|inquir|quotes?\b|estimates?\b|consultations?/.test(low) ? "GENERATE_LEADS"
    : /website traffic|website visit|traffic to (my|our) (site|website)|more visitors|to (my|our) website/.test(low) ? "WEBSITE_TRAFFIC"
    : /coming (in|into)|come in|foot traffic|walk-?ins?|through the door|visit (my|our|the) (store|shop|restaurant|location|cafe|salon)|into (my|our) (restaurant|store|shop|cafe|bar)/.test(low) ? "FOOT_TRAFFIC"
    : /repeat|come back|returning customers|loyal/.test(low) ? "REPEAT_CUSTOMERS"
    : /followers|instagram|social media|grow (my|our) (page|account|social)/.test(low) ? "GROW_SOCIAL"
    : /awareness|known|get (my|our) name out|recogni/.test(low) ? "BRAND_AWARENESS"
    : /\bsales\b|\bsell\b|revenue|orders|purchases/.test(low) ? "INCREASE_SALES"
    : /customers|clients|business/.test(low) ? "RECOMMEND"
    : null;
  if (goal) return { ...base, intent: "goal", goal, item: focus };
  return { ...base, intent: "info" };
}

/** Questions MAIRO still needs answered — as few as possible, at most two. */
export function missingQuestions(input: {
  goal: MissionGoal;
  sells: boolean;
  location: boolean;
  launch?: { item: string | null; date: string | null; price: string | null } | null;
}): { key: string; question: string; placeholder: string }[] {
  const out: { key: string; question: string; placeholder: string }[] = [];
  if (!input.sells) out.push({ key: "sells", question: "In a sentence, what does your business sell?", placeholder: "e.g. Ceramic coating and full detailing for cars" });
  if ((input.goal === "NEW_PRODUCT" || input.goal === "NEW_SERVICE") && input.launch) {
    if (!input.launch.item) out.push({ key: "item", question: `What are you launching?`, placeholder: "e.g. The Harbor hoodie" });
    else if (!input.launch.date) out.push({ key: "date", question: `When does ${input.launch.item} launch?`, placeholder: "e.g. Friday, or 2026-10-16" });
  }
  if (["FOOT_TRAFFIC", "GET_BOOKINGS", "GET_CALLS", "GENERATE_LEADS"].includes(input.goal) && !input.location) {
    out.push({ key: "location", question: "Where are your customers — your city or service area?", placeholder: "e.g. Austin, TX and 20 miles around" });
  }
  return out.slice(0, 2);
}
