// The three fictional businesses the landing-page story shows. Every one is
// invented, uses a reserved .example address, and is shown under a
// persistent "Example campaign — sample data" label. The numbers in their
// dashboards are sample figures that show *where* results appear — never
// evidence of what MAIRO achieves — and none is revenue, ROAS or a customer
// count.

export type ExampleType = "shop" | "service" | "appointments";

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
};

export const EXAMPLES: Record<ExampleType, Example> = {
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
  },
  service: {
    type: "service",
    label: "Local service",
    name: "Brightwater Plumbing",
    url: "brightwater-plumbing.example",
    site: { headline: "Leak and drain repair in Eastfield", sub: "Family-run since 2009. Licensed and insured.", nav: ["Services", "Areas", "Contact"], button: "Get a quote" },
    profile: { offer: "Same-week leak and drain repair", audience: "Homeowners with a plumbing problem", location: "Eastfield and 15 miles around", style: "Clear, trustworthy, practical", swatches: ["#123a6b", "#3b82f6", "#f5b83d"] },
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
    colors: { a: "#123a6b", b: "#3b82f6", c: "#f5b83d", ink: "#10233f", paper: "#f3f7fc" },
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
  },
};

export const EXAMPLE_ORDER: ExampleType[] = ["shop", "service", "appointments"];

export function exampleFrom(raw: string | null | undefined): ExampleType {
  return raw === "shop" || raw === "service" || raw === "appointments" ? raw : "service";
}

/** The business type in setup that matches each example, carried into onboarding. */
export const ONBOARDING_TYPE: Record<ExampleType, string> = { shop: "ecommerce", service: "home_services", appointments: "beauty" };
