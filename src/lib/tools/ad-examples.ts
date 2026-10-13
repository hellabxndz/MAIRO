// Example ads written by MAIRO for invented businesses, to show what different
// goals and formats look like. None is a real business's ad, and the page
// labels every one as an example. Prices, offers and proof in them belong to
// the invented business — in a real ad, use only your own true details.

export type ExampleGoal = "Leads" | "Bookings" | "Sales" | "Messages";
export type ExampleFormat = "Picture" | "Video" | "Carousel" | "Existing post";
export type ExampleBusiness = "Home services" | "Health and wellness" | "Beauty" | "Fitness" | "Online shop" | "Restaurant" | "Professional services";

export type AdExample = {
  id: string;
  business: ExampleBusiness;
  name: string;
  goal: ExampleGoal;
  format: ExampleFormat;
  angle: string;
  hook: string;
  primaryText: string;
  headline: string;
  cta: string;
  visual: string;
  why: string;
  test: string;
};

export const AD_EXAMPLES: AdExample[] = [
  {
    id: "plumber-moment",
    business: "Home services",
    name: "Brightwater Plumbing (invented)",
    goal: "Leads",
    format: "Video",
    angle: "The moment of need",
    hook: "Water coming through the ceiling?",
    primaryText: "Water coming through the ceiling? Turn off the stopcock, then call us — we'll talk you through it and give you a price before we come out.",
    headline: "Leak help in Eastfield",
    cta: "Call now",
    visual: "10-second phone video: a plumber points to a stopcock under a sink, then to the van with the business name.",
    why: "Catches people at the moment they need help and gives something useful before asking for anything.",
    test: "Against a picture of the van with \"Same-week repairs in Eastfield\" — situation vs. availability.",
  },
  {
    id: "roofer-local",
    business: "Home services",
    name: "Northgate Roofing (invented)",
    goal: "Leads",
    format: "Picture",
    angle: "Local",
    hook: "Roof repairs in Northgate and the villages around it",
    primaryText: "Slipped tiles, leaking flashing, blocked gutters. We're based in Northgate and give a written quote after looking at the roof.",
    headline: "Get a roof quote",
    cta: "Get quote",
    visual: "A real photo of a finished repair on a local street, with the business name small in a corner.",
    why: "For local services, nearness is often the deciding fact; naming the area filters out people too far away.",
    test: "Against the same picture with a problem-led opening (\"Slipped tiles after the storm?\").",
  },
  {
    id: "clinic-explain",
    business: "Health and wellness",
    name: "Riverside Physio (invented)",
    goal: "Bookings",
    format: "Carousel",
    angle: "How it works",
    hook: "What happens at a first physio appointment",
    primaryText: "Nervous about a first appointment? Here's exactly what happens, from the first questions to the exercises you take home.",
    headline: "Book a first visit",
    cta: "Book now",
    visual: "Four cards: the questions, the assessment, the plan, the exercises — one photo of the clinic room each.",
    why: "Removes the unknown that stops people booking, without implying anything about the viewer's health.",
    test: "Against a single picture with the first-visit price — explanation vs. price clarity.",
  },
  {
    id: "salon-offer",
    business: "Beauty",
    name: "Juniper Hair Studio (invented)",
    goal: "Bookings",
    format: "Picture",
    angle: "The offer",
    hook: "New clients: a free fringe trim with any cut this month",
    primaryText: "New to Juniper? Book any cut before 30 November and we'll add a fringe trim free. Online booking takes a minute.",
    headline: "Book your cut",
    cta: "Book now",
    visual: "A finished cut photographed in the salon's own light, offer text kept out of the top and bottom of the frame.",
    why: "A real, dated offer gives a reason to book now rather than \"some time\".",
    test: "Against a before-and-after photo with no offer — offer vs. result.",
  },
  {
    id: "gym-callout",
    business: "Fitness",
    name: "Harbour Strength (invented)",
    goal: "Leads",
    format: "Video",
    angle: "Who it's for",
    hook: "For people who've never lifted a weight before",
    primaryText: "Our beginner sessions are six people, one coach, and start with the basics. Ask about a trial session.",
    headline: "Ask about a trial",
    cta: "Learn more",
    visual: "A coach demonstrating a first lift slowly; a small group in the background.",
    why: "Speaks to one kind of customer directly so the right people stop — without asserting anything about the viewer's body.",
    test: "Against a result-led opening (\"Stronger in 8 weeks of two sessions a week\") — only if true.",
  },
  {
    id: "shop-product",
    business: "Online shop",
    name: "Fernleaf Ceramics (invented)",
    goal: "Sales",
    format: "Video",
    angle: "The product in use",
    hook: "Made by hand, used every morning",
    primaryText: "Each mug is thrown and glazed in our studio, so no two are the same. Dishwasher safe. Free returns within 30 days.",
    headline: "Shop the morning mugs",
    cta: "Shop now",
    visual: "Close-up of coffee being poured into a mug, then the mug turned to show the glaze.",
    why: "Shows the product doing its job; the details answer the questions people have before buying.",
    test: "Against a carousel of four colours — one product in use vs. choice.",
  },
  {
    id: "shop-carousel",
    business: "Online shop",
    name: "Tallow & Thyme (invented)",
    goal: "Sales",
    format: "Carousel",
    angle: "Choice",
    hook: "Four scents, all made in small batches",
    primaryText: "Pick the one that sounds like your kitchen. Every candle is poured in small batches with the burn time on the label.",
    headline: "Find your scent",
    cta: "Shop now",
    visual: "Four cards, one candle each, the scent name and burn time on each card.",
    why: "When the choice is the point, a carousel lets people browse inside the ad.",
    test: "Against the best-seller alone in a picture ad.",
  },
  {
    id: "restaurant-messages",
    business: "Restaurant",
    name: "Little Lantern Kitchen (invented)",
    goal: "Messages",
    format: "Picture",
    angle: "The moment of need",
    hook: "Booking for a group this Friday?",
    primaryText: "Message us your numbers and time and we'll tell you straight away if we can fit you in. Tables for up to 12.",
    headline: "Message to book",
    cta: "Send message",
    visual: "A long table set for a group, photographed in the restaurant.",
    why: "Groups have questions a booking form can't answer; a message removes the back-and-forth.",
    test: "Against a booking-link ad — message vs. booking form.",
  },
  {
    id: "accountant-objection",
    business: "Professional services",
    name: "Clearpath Bookkeeping (invented)",
    goal: "Leads",
    format: "Picture",
    angle: "The objection",
    hook: "\"Isn't a bookkeeper expensive?\"",
    primaryText: "Fixed monthly prices, agreed before we start, so there are no surprise bills. Tell us roughly how many transactions you have and we'll quote.",
    headline: "Get a fixed quote",
    cta: "Get quote",
    visual: "A plain card with the price structure (\"fixed monthly, agreed up front\") and the business name.",
    why: "Answers the doubt that stops people enquiring, honestly and specifically.",
    test: "Against a time-saving opening (\"Get your evenings back\") — objection vs. outcome.",
  },
  {
    id: "cleaner-existing-post",
    business: "Home services",
    name: "Sparrow Cleaning Co. (invented)",
    goal: "Leads",
    format: "Existing post",
    angle: "Proof",
    hook: "A before-and-after the business already posted",
    primaryText: "(The post's own text.) An end-of-tenancy clean we finished last week — the oven took two hours.",
    headline: "Get a cleaning quote",
    cta: "Get quote",
    visual: "The Page's own before-and-after photo, run as an ad so its likes and comments stay with it.",
    why: "A post that already got attention from real followers is cheap, proven material — and it's genuinely the business's own work.",
    test: "Against a new picture ad with an area-led opening.",
  },
  {
    id: "dentist-bookings",
    business: "Health and wellness",
    name: "Maple Street Dental (invented)",
    goal: "Bookings",
    format: "Picture",
    angle: "The first step",
    hook: "New-patient check-ups, booked online",
    primaryText: "See open appointment times and book in a minute. We'll send a reminder the day before.",
    headline: "See appointment times",
    cta: "Book now",
    visual: "The reception and a calm treatment room, no close-ups of mouths or teeth.",
    why: "Makes the first step small and concrete; avoids imagery or questions that imply something about the viewer's health.",
    test: "Against the same ad with the new-patient price, if the practice publishes one.",
  },
  {
    id: "trainer-result",
    business: "Fitness",
    name: "Oakfield Running Club (invented)",
    goal: "Leads",
    format: "Video",
    angle: "The result",
    hook: "From the sofa to a 5k in nine weeks — with a group",
    primaryText: "Three evening runs a week, a coach at every one, and a group going at your pace. The next group starts on 4 November.",
    headline: "Join the next group",
    cta: "Sign up",
    visual: "The club running together at dusk; the finish of a local 5k.",
    why: "A concrete, achievable result with the real plan behind it.",
    test: "Against a community-led opening (\"Run with people, not alone\").",
  },
];

export const EXAMPLE_GOALS: ExampleGoal[] = ["Leads", "Bookings", "Sales", "Messages"];
export const EXAMPLE_FORMATS: ExampleFormat[] = ["Picture", "Video", "Carousel", "Existing post"];
export const EXAMPLE_BUSINESSES: ExampleBusiness[] = [...new Set(AD_EXAMPLES.map((e) => e.business))];
