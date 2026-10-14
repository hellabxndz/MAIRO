import type { ExampleType } from "@/lib/demo/examples";
import type { MetricFamily } from "@/lib/mission/goals";

// The three kinds of business MAIRO's free plan is built around, as public
// pages: online stores, local services and appointment businesses. They map
// one-to-one onto the preview builder's kinds (shop, service, appointments),
// so the example plan each page shows is the one MAIRO would really build for
// that kind of business — run on one of the landing story's invented
// businesses, and labelled as such.
//
// Every line is something the product does today, or says plainly that it
// doesn't. Pinned by scripts/check-solutions.ts.

export type UseCaseSlug = "online-stores" | "local-services" | "appointments";

export type UseCase = {
  slug: UseCaseSlug;
  /** The preview builder's example for this kind of business. */
  example: Exclude<ExampleType, "brands">;
  /** What the dashboard counts as the result for this goal (dashboard/console.ts resultFor). */
  family: Extract<MetricFamily, "sales" | "leads" | "bookings">;
  label: string;
  title: string;
  sub: string;
  forWho: string[];
  measured: { term: string; text: string }[];
  need: string[];
  notDone: string[];
  help: string[];
};

export const USE_CASES: UseCase[] = [
  {
    slug: "online-stores",
    example: "shop",
    family: "sales",
    label: "Online stores",
    title: "Facebook and Instagram ads for online stores",
    sub: "Sales campaigns built from your products and offers, judged on what each purchase costs — with the purchases Meta reports kept apart from the orders your store confirms.",
    forWho: ["Shops selling online", "Handmade and small-batch makers", "Stores on Shopify, WooCommerce, Wix or Squarespace"],
    measured: [
      { term: "Purchases", text: "Reported by Meta when your pixel's Purchase event fires on the order confirmation page." },
      { term: "Cost per purchase", text: "What you spent, divided by those purchases. It's what your first campaign is judged on." },
      { term: "Confirmed orders", text: "Orders your Shopify store reports to MAIRO, through a webhook you add — counted apart from Meta's figure." },
    ],
    need: [
      "Your own Meta ad account and a Facebook Page.",
      "The Meta pixel on your store, sending a Purchase event. MAIRO helps you choose or create it and checks that Meta receives the event.",
      "Optional: your Shopify store connected, so real orders are counted.",
    ],
    notDone: [
      "MAIRO isn't a Shopify app: it doesn't manage your store, products or checkout.",
      "It doesn't build catalogue (product feed) ads.",
      "It advertises on Facebook and Instagram only — not Google Shopping, Google Ads or TikTok.",
    ],
    help: ["website-tracking", "results", "credits-and-usage"],
  },
  {
    slug: "local-services",
    example: "service",
    family: "leads",
    label: "Local services",
    title: "Facebook and Instagram ads for local service businesses",
    sub: "Enquiries from people in your area — for trades, cleaners, repair and home services — followed past the form to the jobs they became.",
    forWho: ["Plumbers, electricians and other trades", "Cleaning, repair and home services", "Any business that works within an area"],
    measured: [
      { term: "Leads", text: "Enquiries from a Meta lead form or MAIRO's own form page, without the spam and duplicates." },
      { term: "Cost per lead", text: "What you spent, divided by those leads. It's what your first campaign is judged on." },
      { term: "Good leads, bookings and customers", text: "What you mark on the Leads page, lead by lead. MAIRO never assumes a lead was good or counts it as a sale." },
    ],
    need: [
      "Your own Meta ad account and a Facebook Page.",
      "The area you work in. Ads are shown only to people there.",
      "Nothing on your website to start: a lead form inside the ad reports each lead to Meta by itself.",
    ],
    notDone: [
      "Following up is yours: MAIRO shows you each lead, and you get in touch.",
      "It advertises on Facebook and Instagram only — not Google Local Services, Google Ads or TikTok.",
    ],
    help: ["getting-started", "results", "approvals"],
  },
  {
    slug: "appointments",
    example: "appointments",
    family: "bookings",
    label: "Appointments",
    title: "Facebook and Instagram ads for appointment businesses",
    sub: "Bookings for salons, clinics, studios and gyms — people sent to your booking page, with the bookings Meta reports kept apart from the ones you confirm.",
    forWho: ["Salons, barbers and beauty", "Clinics and therapists", "Studios, gyms and classes"],
    measured: [
      { term: "Bookings", text: "Reported by Meta when your booking page sends the pixel's Schedule event." },
      { term: "Cost per booking", text: "What you spent, divided by those bookings. It's what your first campaign is judged on." },
      { term: "Booked and customers", text: "What you mark on the Leads page for the people who got in touch." },
    ],
    need: [
      "Your own Meta ad account and a Facebook Page.",
      "A booking page people can use. MAIRO recognises common booking links on your website, such as Calendly, Acuity, Fresha and Booksy.",
      "The Meta pixel sending a Schedule event when a booking is confirmed — through your booking tool's own Meta setting, or its confirmation page.",
    ],
    notDone: [
      "MAIRO doesn't connect to your booking system, so it can't see your calendar. Bookings are counted from Meta's Schedule event and from what you mark.",
      "It advertises on Facebook and Instagram only — not Google Ads or TikTok.",
    ],
    help: ["website-tracking", "results", "approvals"],
  },
];

export function findUseCase(slug: string): UseCase | null {
  return USE_CASES.find((u) => u.slug === slug) ?? null;
}
