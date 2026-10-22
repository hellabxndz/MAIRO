// The fictional businesses the landing-page story, the walkthrough and the
// preview show. Every one is invented, uses a reserved .example address, and
// is shown under a persistent "Product demo — sample data" label. The numbers
// in their dashboards are sample figures that show *where* results appear —
// never evidence of what MAIRO achieves — and none is revenue, ROAS or a
// customer count.
//
// "brands" is the landing story's multi-brand team. It shows one of the
// team's brands (the salon), because MAIRO doesn't offer switching between
// brands or team sign-off in one account — so the story doesn't show either,
// and says so beside it.

export type ExampleType = "shop" | "service" | "appointments" | "brands";

export type Concept = {
  id: string;
  /** What the concept leads with. */
  angle: string;
  hook: string;
  body: string;
  cta: string;
  format: "Short video" | "Picture" | "Carousel";
  /** Which illustration and how it's framed. */
  art: "demo" | "problem" | "offer";
};

/** What the 24-second landing story shows for this business, scene by scene. */
export type StoryScript = {
  /** Understanding: what the website said, as three cards the owner confirms. */
  cards: { sell: string; serve: string; goal: string };
  /** Creatives: why the recommended concept is the first test, and what that rests on. */
  reason: string;
  basis: string[];
  /**
   * Editing: the owner's own clip and the one edit the video editor really
   * makes — trim the start so it opens on the demonstration, a caption burned
   * in, cropped to 9:16 — written to a new file, the original kept.
   */
  video: { lengthS: number; startsAtS: number; opening: string; demo: string; caption: string };
  /** Results: what happened after the ads, step by step, with where each figure comes from. */
  spend: string;
  journey: { label: string; value: string; source: string }[];
  recommendation: { title: string; why: string; evidence: string[]; approve: string };
};

export type DemoMetric = { label: string; value: string; note?: string; unavailable?: boolean };

export type Example = {
  type: ExampleType;
  /** The selector's label. */
  label: string;
  name: string;
  url: string;
  site: { headline: string; sub: string; nav: string[]; button: string; price?: string };
  profile: { offer: string; audience: string; location: string; style: string; swatches: string[] };
  /** The goal the owner picks in the longer walkthrough. */
  goal: string;
  /** Something the website didn't say, which MAIRO asks about instead of guessing. */
  unknown: { question: string; answer: string };
  concepts: [Concept, Concept, Concept];
  /** Index of the concept the owner selects. */
  selected: 0 | 1 | 2;
  /** The owner's edit to the selected hook, in the longer walkthrough. */
  editedHook: string;
  review: { budget: string; where: string; objective: string; destination: string };
  dashboard: { outcome: string; metrics: DemoMetric[]; lead: { name: string; from: string; to: string }; next: { title: string; why: string; when: string } };
  plan: { channel: string; objective: string; audience: string; why: string; budget: string };
  readiness: { label: string; state: "done" | "needed" | "optional" }[];
  colors: { a: string; b: string; c: string; ink: string; paper: string };
  story: StoryScript;
  /** Said beside the landing story when this example is chosen. */
  note?: string;
};

const BUSINESSES: Record<Exclude<ExampleType, "brands">, Example> = {
  shop: {
    type: "shop",
    label: "Online store",
    name: "Fernleaf Ceramics",
    url: "fernleaf-ceramics.example",
    site: { headline: "Handmade mugs for slow mornings", sub: "Stoneware, thrown and glazed in our studio.", nav: ["Shop", "About", "Journal"], button: "Shop now", price: "$34" },
    profile: { offer: "Handmade stoneware mugs, $34", audience: "Coffee lovers buying for themselves or as gifts", location: "Ships across the US", style: "Earthy, calm, handmade", swatches: ["#3f6b4f", "#e9dcc4", "#c2683f"] },
    goal: "Sell more online",
    unknown: { question: "Do you run an offer right now?", answer: "Free shipping over $60" },
    concepts: [
      { id: "s1", angle: "The product in use", hook: "Made by hand. Used every morning.", body: "Each mug is thrown in our studio, so no two are the same.", cta: "Shop now", format: "Short video", art: "demo" },
      { id: "s2", angle: "The problem it solves", hook: "Mugs that don't chip in a month.", body: "Fired twice, glazed thick, dishwasher safe.", cta: "Shop now", format: "Picture", art: "problem" },
      { id: "s3", angle: "The offer", hook: "Free shipping over $60.", body: "Two mugs and you're there.", cta: "Shop now", format: "Picture", art: "offer" },
    ],
    selected: 0,
    editedHook: "Made by hand. Yours every morning.",
    review: { budget: "$20 a day", where: "Facebook + Instagram", objective: "Sales — purchases on your website", destination: "fernleaf-ceramics.example/mugs" },
    dashboard: {
      outcome: "purchases",
      metrics: [
        { label: "Money spent", value: "$126" },
        { label: "Purchases", value: "4" },
        { label: "Cost per purchase", value: "$31.50" },
        { label: "Verified sales", value: "Connect your store", unavailable: true },
      ],
      lead: { name: "Order #1043", from: "Reported by Meta", to: "Matched to a store order" },
      next: { title: "Keep collecting data", why: "Four purchases can't tell the two ads apart yet. Changing now would restart Meta's learning.", when: "MAIRO checks again Friday" },
    },
    plan: { channel: "Meta — Facebook and Instagram, one campaign", objective: "Sales, optimised for purchases", audience: "Adults 25–54 across the US who like coffee and handmade homeware", why: "At $20 a day, one audience learns fastest.", budget: "$20 a day" },
    readiness: [
      { label: "Business profile confirmed", state: "done" },
      { label: "Meta ad account connected", state: "done" },
      { label: "Pixel sees purchases", state: "done" },
      { label: "Creative approved", state: "done" },
      { label: "Store orders connected", state: "optional" },
    ],
    colors: { a: "#3f6b4f", b: "#e9dcc4", c: "#c2683f", ink: "#24302a", paper: "#f6f1e8" },
    story: {
      cards: { sell: "Handmade stoneware mugs, $34", serve: "Coffee lovers, and people buying a gift", goal: "Sell more online" },
      reason: "Seeing a mug in use shows its size and glaze better than a still photo.",
      basis: ["Offer: handmade mugs, $34", "Goal: online sales"],
      video: { lengthS: 18, startsAtS: 6, opening: "The gift box on the shelf", demo: "Coffee poured into a mug", caption: "Made by hand. Used every morning." },
      spend: "$126",
      journey: [
        { label: "Purchases", value: "4", source: "Meta reported" },
        { label: "Confirmed order value", value: "$148", source: "Your store's orders" },
      ],
      recommendation: { title: "Test the free-shipping line next", why: "3 of the 4 orders were over $60, where your free shipping starts.", evidence: ["4 purchases — Meta", "3 orders over $60 — your store", "Free shipping over $60 — your website"], approve: "Approve test" },
    },
  },
  service: {
    type: "service",
    label: "Service business",
    name: "Brightwater Plumbing",
    url: "brightwater-plumbing.example",
    site: { headline: "Leak and drain repair in Eastfield", sub: "Family-run since 2009. Licensed and insured.", nav: ["Services", "Areas", "Contact"], button: "Get a quote" },
    profile: { offer: "Same-week leak and drain repair", audience: "Homeowners with a plumbing problem", location: "Eastfield and 15 miles around", style: "Clear, trustworthy, practical", swatches: ["#3f3f3f", "#d1d1d1", "#f5b83d"] },
    goal: "Get more qualified leads",
    unknown: { question: "How far do you travel for a job?", answer: "Within 15 miles" },
    concepts: [
      { id: "v1", angle: "The service in action", hook: "Leak under the sink? We'll find it.", body: "A licensed plumber at your door this week, with the price before we start.", cta: "Get quote", format: "Short video", art: "demo" },
      { id: "v2", angle: "Problem and solution", hook: "From drip to dry in one visit.", body: "We fix the cause, not just the drip, and tidy up after.", cta: "Get quote", format: "Picture", art: "problem" },
      { id: "v3", angle: "The offer", hook: "Free estimate on every job.", body: "Tell us what's wrong and we'll tell you what it costs.", cta: "Get quote", format: "Picture", art: "offer" },
    ],
    selected: 0,
    editedHook: "Leak under the sink? We'll find it — this week.",
    review: { budget: "$20 a day", where: "Facebook + Instagram", objective: "Leads — a quick form inside the ad", destination: "Meta lead form" },
    dashboard: {
      outcome: "leads and bookings",
      metrics: [
        { label: "Money spent", value: "$140" },
        { label: "New leads", value: "11" },
        { label: "Qualified", value: "6" },
        { label: "Booked", value: "2" },
      ],
      lead: { name: "Lead from Tue, 4:12pm", from: "Qualified", to: "Booked" },
      next: { title: "Keep collecting data", why: "Six qualified leads is too few to pick a winning ad. Booked jobs, not clicks, will decide.", when: "MAIRO checks again Friday" },
    },
    plan: { channel: "Meta — Facebook and Instagram, one campaign", objective: "Leads, with a form inside the ad", audience: "Homeowners within 15 miles of Eastfield", why: "Nearness decides who calls; one audience learns fastest at this budget.", budget: "$20 a day" },
    readiness: [
      { label: "Business profile confirmed", state: "done" },
      { label: "Meta ad account connected", state: "done" },
      { label: "Lead form ready", state: "done" },
      { label: "Creative approved", state: "done" },
      { label: "Pixel on your website", state: "optional" },
    ],
    colors: { a: "#3f3f3f", b: "#d1d1d1", c: "#f5b83d", ink: "#282828", paper: "#f3f7fc" },
    story: {
      cards: { sell: "Same-week leak and drain repair", serve: "Homeowners within 15 miles of Eastfield", goal: "More qualified leads" },
      reason: "A demonstration makes your service easier to understand.",
      basis: ["Offer: same-week repair", "Goal: qualified leads"],
      video: { lengthS: 20, startsAtS: 6, opening: "The van pulling up", demo: "Finding the leak under the sink", caption: "Leak under the sink? We'll find it." },
      spend: "$140",
      journey: [
        { label: "Leads", value: "11", source: "MAIRO counted" },
        { label: "Qualified", value: "6", source: "You marked" },
        { label: "Booked", value: "2", source: "You marked" },
      ],
      recommendation: { title: "Ask which area the job is in", why: "3 of the 5 leads you didn't qualify were outside your 15-mile area.", evidence: ["11 leads, 6 qualified — marked by you", "3 outside 15 miles — from the form", "Service area: 15 miles — confirmed by you"], approve: "Approve change" },
    },
  },
  appointments: {
    type: "appointments",
    label: "Appointment business",
    name: "Juniper Hair Studio",
    url: "juniper-hair.example",
    site: { headline: "Cuts that still look right in week six", sub: "Book online in a minute.", nav: ["Services", "Team", "Book"], button: "Book now" },
    profile: { offer: "Cut & finish, booked online", audience: "New clients within a short drive", location: "Riverside district", style: "Warm, modern, unhurried", swatches: ["#4b2142", "#e8b4bc", "#c9a227"] },
    goal: "Get more bookings",
    unknown: { question: "Any offer for new clients?", answer: "Free fringe trims between cuts" },
    concepts: [
      { id: "a1", angle: "The result", hook: "A cut that's still right in week six.", body: "Shaped for how your hair grows, not just for today.", cta: "Book now", format: "Short video", art: "demo" },
      { id: "a2", angle: "How it works", hook: "Book in a minute. Sit back for an hour.", body: "Pick a time online; we'll text a reminder the day before.", cta: "Book now", format: "Carousel", art: "problem" },
      { id: "a3", angle: "The offer", hook: "New clients: free fringe trims.", body: "Between appointments, on us.", cta: "Book now", format: "Picture", art: "offer" },
    ],
    selected: 0,
    editedHook: "A cut that still feels right in week six.",
    review: { budget: "$15 a day", where: "Facebook + Instagram", objective: "Bookings on your website", destination: "juniper-hair.example/book" },
    dashboard: {
      outcome: "bookings",
      metrics: [
        { label: "Money spent", value: "$98" },
        { label: "Bookings", value: "7" },
        { label: "Cost per booking", value: "$14" },
        { label: "Showed up", value: "Mark bookings to see", unavailable: true },
      ],
      lead: { name: "Booking for Sat, 10am", from: "Booked online", to: "Confirmed" },
      next: { title: "Keep collecting data", why: "Seven bookings isn't enough to move budget between ads yet.", when: "MAIRO checks again Friday" },
    },
    plan: { channel: "Meta — Facebook and Instagram, one campaign", objective: "Bookings on your website", audience: "Adults within a 5-mile drive of Riverside", why: "At $15 a day, one audience and one ad learn fastest.", budget: "$15 a day" },
    readiness: [
      { label: "Business profile confirmed", state: "done" },
      { label: "Meta ad account connected", state: "done" },
      { label: "Booking confirmation tracked", state: "needed" },
      { label: "Creative approved", state: "done" },
      { label: "Store orders", state: "optional" },
    ],
    colors: { a: "#4b2142", b: "#e8b4bc", c: "#c9a227", ink: "#2b1326", paper: "#fbf4f4" },
    story: {
      cards: { sell: "Cut & finish, booked online", serve: "New clients within a short drive", goal: "More bookings" },
      reason: "A finished cut shows the result people book for.",
      basis: ["Offer: cut & finish", "Goal: bookings"],
      video: { lengthS: 16, startsAtS: 5, opening: "Scissors and comb on the counter", demo: "The finished look in the mirror", caption: "A cut that's still right in week six." },
      spend: "$98",
      journey: [
        { label: "Leads", value: "9", source: "MAIRO counted" },
        { label: "Qualified", value: "8", source: "You marked" },
        { label: "Booked", value: "7", source: "You marked" },
      ],
      recommendation: { title: "Raise the budget to $20 a day", why: "Bookings cost $14 each — under the $25 you said a booking can cost.", evidence: ["7 bookings — marked by you", "$98 spent — Meta", "Most a booking can cost: $25 — your calculator"], approve: "Approve budget" },
    },
  },
};

// The multi-brand team: one of its brands, the salon, with a note that
// switching brands and team sign-off aren't offered — never pictured.
export const EXAMPLES: Record<ExampleType, Example> = {
  ...BUSINESSES,
  brands: {
    ...BUSINESSES.appointments,
    type: "brands",
    label: "Multi-brand team",
    note: "Shown for one of the team's brands. Switching between brands and team sign-off aren't available in MAIRO yet, so this story doesn't show them.",
  },
};

/** The preview's and the walkthrough's examples: three businesses. */
export const EXAMPLE_ORDER: ExampleType[] = ["shop", "service", "appointments"];
/** The landing story's examples, as the visitor picks them. */
export const HERO_ORDER: ExampleType[] = ["shop", "service", "brands"];
/** The preview example that matches each story example — the team's brand is the salon. */
export const PREVIEW_EXAMPLE: Record<ExampleType, ExampleType> = { shop: "shop", service: "service", appointments: "appointments", brands: "appointments" };

export function exampleFrom(raw: string | null | undefined): ExampleType {
  return raw === "shop" || raw === "service" || raw === "appointments" || raw === "brands" ? raw : "service";
}

/** The business type in setup that matches each example, carried into onboarding. */
export const ONBOARDING_TYPE: Record<ExampleType, string | null> = { shop: "ecommerce", service: "home_services", appointments: "beauty", brands: null };
