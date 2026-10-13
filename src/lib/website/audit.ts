import type { DeclaredBusiness, Destinations, DetectedApp, Platform, TrackingTags, ConsentTool } from "./detect";

// "Before you spend on ads": what a visitor from an ad would find, as findings
// an owner can act on.
//
// Pure — built from a scan, pinned by scripts/check-website.ts. Three kinds of
// statement, never mixed:
//   observed     — seen in the pages MAIRO read (a missing button, a 404).
//   inferred     — a judgement from what was seen (a headline that's vague).
//   not checked  — what a public read can't tell (does the form send? is the
//                  page fast for real visitors?), said as such.
// Speed is "measured" only with a PageSpeed Insights reading, and its lab and
// field numbers are kept apart. Every recommendation is a hypothesis until
// results say otherwise; nothing here forecasts conversions.
//
// Suggested copy uses only facts found on the site or given by the owner:
// no invented offers, reviews, prices or guarantees.

export type PageSummary = {
  url: string;
  title: string | null;
  description: string | null;
  h1: string | null;
  headings: string[];
  ctas: string[];
  prices: string[];
  mobileReady: boolean;
  https: boolean;
  bytes: number;
  hasForm: boolean;
  hasPhone: boolean;
};

export type LinkCheck = { url: string; status: number | null; ok: boolean; reason: string | null; kind: "page" | "booking" };

export type PerformanceReading = {
  source: "PageSpeed Insights";
  strategy: "mobile";
  fetchedAt: string;
  lab: { score: number | null; lcpMs: number | null; cls: number | null; tbtMs: number | null } | null;
  field: { scope: "page" | "origin"; lcpMs: number | null; inpMs: number | null; cls: number | null; category: string | null } | null;
};

export type ScanFacts = {
  url: string;
  pages: PageSummary[];
  platform: Platform | null;
  apps: DetectedApp[];
  tracking: TrackingTags;
  consent: ConsentTool[];
  destinations: Destinations;
  business: DeclaredBusiness;
  offers: string[];
  serviceArea: string[];
  trust: string[];
  policies: string[];
  linkChecks: LinkCheck[];
  /** The link step ran (even if it found nothing to check), so "no broken links" is an answer. */
  linkCheckRan?: boolean;
  performance: PerformanceReading | null;
  /** All visible text read, for message-match checks. Not stored. */
  text: string;
};

export type Category = "Headline and offer" | "Call to action" | "Mobile" | "Links and forms" | "Service area" | "Buying or booking details" | "Trust" | "Speed" | "Ad and page match" | "Tracking" | "Security";
export type Confidence = "observed" | "inferred" | "not checked";
export type Priority = "high" | "medium" | "low";

export type Finding = {
  /** Stable across scans: rule plus page path. */
  key: string;
  rule: string;
  category: Category;
  status: "issue" | "ok" | "not checked";
  title: string;
  evidence: string | null;
  evidenceUrl: string | null;
  confidence: Confidence;
  why: string;
  change: string;
  /** Ready-to-use wording, built from facts on the site. */
  copy: string[];
  effort: "minutes" | "an hour" | "a day or more";
  priority: Priority;
  next: { label: string; href: string | null };
};

export type AuditContext = {
  /** What the ad will say, when known (from the plan, or typed in a free tool). */
  adMessage?: string | null;
  /** The owner's own description of what they do, when known. */
  offering?: string | null;
  location?: string | null;
};

export type Audit = { top: Finding[]; findings: Finding[]; checked: number; issues: number; notChecked: number };

/**
 * Rules that answer the same question share a family — a missing headline and
 * a vague one, a broken link and "links checked, none broken" — so a later
 * reading that answers it differently can confirm an earlier issue is gone.
 */
const FAMILY: Record<string, string> = {
  "headline-missing": "headline",
  "headline-vague": "headline",
  "cta-missing": "cta",
  "cta-generic": "cta",
  "link-broken": "links",
  "booking-broken": "booking",
  "form-no-submit": "form",
  "mobile-viewport": "viewport",
  "prices-missing": "prices",
  "policies-missing": "policies",
  "service-cost": "service-cost",
};
export const familyOf = (rule: string): string => FAMILY[rule] ?? rule;

const GENERIC_H1 = /^(welcome|home|hello|hi there|about us|our services|services|shop|products|untitled)\b|^(welcome to )/i;
const BUZZ = /\b(solutions?|innovative|world[- ]class|cutting[- ]edge|best[- ]in[- ]class|synerg|seamless|next[- ]level|game[- ]chang|one[- ]stop[- ]shop|premier)\b/i;
const GENERIC_CTA = /^(submit|send|click here|go|learn more|read more|more|continue|ok|enter|here|details)$/i;
const SERVICE_TYPES = /Plumber|Electrician|Dentist|Physician|Clinic|Salon|HomeAndConstructionBusiness|ProfessionalService|AutomotiveBusiness|HealthAndBeautyBusiness|LegalService|Contractor|Roofing|HVAC|Locksmith|MovingCompany|Painter|CleaningService|LocalBusiness/;

const pathOf = (u: string) => {
  try {
    return new URL(u).pathname || "/";
  } catch {
    return "/";
  }
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Shop, service or not sure — from what the site shows, and said as an inference. */
export function siteKind(f: Pick<ScanFacts, "destinations" | "business" | "platform">): "shop" | "service" | "unknown" {
  const shopPlatform = f.platform && /Shopify|WooCommerce|BigCommerce/.test(f.platform.name);
  if (f.destinations.cart || f.destinations.checkout || shopPlatform) return "shop";
  if (f.business.types.some((t) => SERVICE_TYPES.test(t)) || f.destinations.booking.length || f.destinations.phoneLinks.length) return "service";
  return "unknown";
}

/** The business facts copy may use: from the site, then the owner. */
function factsForCopy(f: ScanFacts, ctx: AuditContext) {
  const home = f.pages[0];
  const name = f.business.name ?? home?.title?.split(/[|–—-]/)[0]?.trim() ?? null;
  const offering = ctx.offering?.trim() || null;
  const place = ctx.location?.trim() || f.business.areaServed[0] || f.business.locality || null;
  return { name, offering, place };
}

export function headlineSuggestions(f: ScanFacts, ctx: AuditContext): string[] {
  const { name, offering, place } = factsForCopy(f, ctx);
  const out: string[] = [];
  const offer = f.offers[0];
  if (offering) {
    out.push(`${cap(offering)}${place ? ` in ${place}` : ""}`);
    if (offer) out.push(`${cap(offering)}${place ? ` in ${place}` : ""} — ${offer.replace(/[.!]$/, "")}`);
    if (name) out.push(`${name}: ${offering}${place ? ` for ${place}` : ""}`);
  } else {
    out.push(`[What you do]${place ? ` in ${place}` : ""} — [the result customers get]`);
  }
  return [...new Set(out)].slice(0, 3);
}

export function ctaSuggestions(f: ScanFacts): string[] {
  const kind = siteKind(f);
  const out: string[] = [];
  if (kind === "shop") out.push("Shop now", "Buy now");
  if (f.destinations.booking.length) out.push("Book online");
  if (f.destinations.phoneLinks.length) out.push(`Call ${f.destinations.phoneLinks[0]}`);
  const freeQuote = f.offers.some((o) => /free (quote|estimate)/i.test(o));
  if (kind !== "shop" && (f.destinations.forms.length || !out.length)) out.push(freeQuote ? "Get a free quote" : "Get a quote");
  return [...new Set(out)].slice(0, 3);
}

export function auditSite(f: ScanFacts, ctx: AuditContext = {}): Audit {
  const home = f.pages[0];
  const homeUrl = home?.url ?? f.url;
  const kind = siteKind(f);
  const findings: Finding[] = [];
  const add = (x: Omit<Finding, "key"> & { page?: string }) => findings.push({ key: `${x.rule}:${pathOf(x.page ?? homeUrl)}`, ...x });

  if (!home) {
    return { top: [], findings: [], checked: 0, issues: 0, notChecked: 0 };
  }

  // Security.
  if (!home.https) {
    add({ rule: "https", category: "Security", status: "issue", title: "The page isn't on a secure (https) address", evidence: homeUrl, evidenceUrl: homeUrl, confidence: "observed", why: "Browsers label it \"Not secure\", which puts people off leaving their details or paying.", change: "Turn on HTTPS with your website host — most include it free — and send the http address to https.", copy: [], effort: "an hour", priority: "high", next: { label: "Ask your web host to turn on HTTPS", href: null } });
  }

  // Headline.
  if (!home.h1) {
    add({ rule: "headline-missing", category: "Headline and offer", status: "issue", title: "There's no main headline", evidence: "No <h1> heading on the page.", evidenceUrl: homeUrl, confidence: "observed", why: "People from an ad decide in a few seconds whether they're in the right place; the headline is what they read first.", change: "Add one headline at the top that says what you do and for whom.", copy: headlineSuggestions(f, ctx), effort: "minutes", priority: "high", next: { label: "Copy a headline", href: null } });
  } else if (GENERIC_H1.test(home.h1) || BUZZ.test(home.h1) || (f.business.name && home.h1.trim().toLowerCase() === f.business.name.toLowerCase())) {
    add({ rule: "headline-vague", category: "Headline and offer", status: "issue", title: "The headline doesn't say what you offer", evidence: `Headline: "${home.h1}"`, evidenceUrl: homeUrl, confidence: "inferred", why: "A welcome, a name or a buzzword doesn't tell a visitor from an ad what they'll get.", change: "Say what you do, for whom, and where — in a dozen words or fewer.", copy: headlineSuggestions(f, ctx), effort: "minutes", priority: "medium", next: { label: "Copy a headline", href: null } });
  } else {
    add({ rule: "headline", category: "Headline and offer", status: "ok", title: "There's a main headline", evidence: `Headline: "${home.h1}"`, evidenceUrl: homeUrl, confidence: "observed", why: "", change: "", copy: [], effort: "minutes", priority: "low", next: { label: "", href: null } });
  }

  // Call to action.
  const anyAction = home.ctas.length || home.hasForm || home.hasPhone || f.destinations.booking.length || f.destinations.cart;
  if (!anyAction) {
    add({ rule: "cta-missing", category: "Call to action", status: "issue", title: "There's no clear next step", evidence: "No button, form, phone link, booking link or cart found on the page.", evidenceUrl: homeUrl, confidence: "observed", why: "If the next step isn't obvious, people who arrive from an ad leave — and you pay for the click either way.", change: "Put one clear button near the top, and repeat it lower down.", copy: ctaSuggestions(f), effort: "an hour", priority: "high", next: { label: "Copy button wording", href: null } });
  } else if (home.ctas.length && home.ctas.every((c) => GENERIC_CTA.test(c.trim())) && !home.hasPhone && !f.destinations.booking.length) {
    add({ rule: "cta-generic", category: "Call to action", status: "issue", title: "The buttons don't say what happens next", evidence: `Buttons: ${home.ctas.slice(0, 4).map((c) => `"${c}"`).join(", ")}`, evidenceUrl: homeUrl, confidence: "inferred", why: "\"Submit\" or \"Learn more\" doesn't tell people what they're agreeing to; a specific button does.", change: "Name the action: book, call, get a quote, shop.", copy: ctaSuggestions(f), effort: "minutes", priority: "medium", next: { label: "Copy button wording", href: null } });
  } else {
    add({ rule: "cta", category: "Call to action", status: "ok", title: "There's a way to act", evidence: [home.ctas[0] && `Button: "${home.ctas[0]}"`, home.hasPhone && "Phone link", f.destinations.booking[0] && `Booking: ${f.destinations.booking[0].provider}`].filter(Boolean).join(" · ") || "Form or cart", evidenceUrl: homeUrl, confidence: "observed", why: "", change: "", copy: [], effort: "minutes", priority: "low", next: { label: "", href: null } });
  }

  // Mobile.
  if (!home.mobileReady) {
    add({ rule: "mobile-viewport", category: "Mobile", status: "issue", title: "The page isn't set up for phones", evidence: "No mobile viewport setting in the page.", evidenceUrl: homeUrl, confidence: "observed", why: "Most people who tap an ad are on a phone; without a mobile layout the page shows zoomed out and hard to use.", change: "Turn on your site builder's mobile (responsive) layout.", copy: [], effort: "an hour", priority: "high", next: { label: "Check your site on your phone", href: null } });
  }
  add({ rule: "mobile-layout", category: "Mobile", status: "not checked", title: "How the page looks on a phone", evidence: null, evidenceUrl: homeUrl, confidence: "not checked", why: "MAIRO reads the page's code; it doesn't look at it on a phone screen.", change: "Open the page on your phone: is the headline and the main button visible without scrolling?", copy: [], effort: "minutes", priority: "low", next: { label: "Check it on your phone", href: null } });

  // Links and forms.
  const broken = f.linkChecks.filter((l) => !l.ok && l.status !== null && l.status >= 400);
  const brokenBooking = broken.filter((b) => b.kind === "booking");
  const brokenPages = broken.filter((b) => b.kind === "page");
  for (const b of brokenBooking.slice(0, 1)) {
    add({ rule: "booking-broken", page: b.url, category: "Links and forms", status: "issue", title: "The booking link doesn't work", evidence: `${b.url} answered ${b.status}`, evidenceUrl: homeUrl, confidence: "observed", why: "A visitor ready to book hits a dead end.", change: "Fix the booking link, or link to your booking page directly.", copy: [], effort: "minutes", priority: "high", next: { label: "Recheck after fixing", href: null } });
  }
  if (brokenPages.length) {
    add({ rule: "link-broken", category: "Links and forms", status: "issue", title: brokenPages.length === 1 ? "A link leads to an error page" : `${brokenPages.length} links lead to error pages`, evidence: brokenPages.slice(0, 3).map((b) => `${b.url} answered ${b.status}`).join("; "), evidenceUrl: homeUrl, confidence: "observed", why: "A broken link on the page an ad sends people to looks careless and loses them.", change: "Fix or remove the link.", copy: [], effort: "minutes", priority: "medium", next: { label: "Recheck after fixing", href: null } });
  }
  const unchecked = f.linkChecks.filter((l) => !l.ok && (l.status === null || l.status < 400));
  const bookingOk = f.linkChecks.filter((l) => l.kind === "booking" && l.ok);
  if (!brokenBooking.length && bookingOk.length) {
    add({ rule: "booking", category: "Links and forms", status: "ok", title: "The booking link works", evidence: `${bookingOk[0].url} answered ${bookingOk[0].status}`, evidenceUrl: homeUrl, confidence: "observed", why: "", change: "", copy: [], effort: "minutes", priority: "low", next: { label: "", href: null } });
  }
  const pageChecks = f.linkChecks.filter((l) => l.kind === "page");
  if (!brokenPages.length && (pageChecks.length || f.linkCheckRan)) {
    add({ rule: "links", category: "Links and forms", status: "ok", title: pageChecks.length ? `${pageChecks.length - unchecked.length} link${pageChecks.length - unchecked.length === 1 ? "" : "s"} checked, none broken` : "No broken links", evidence: unchecked.length ? `${unchecked.length} couldn't be checked (they didn't answer).` : null, evidenceUrl: homeUrl, confidence: "observed", why: "", change: "", copy: [], effort: "minutes", priority: "low", next: { label: "", href: null } });
  }
  const noSubmit = f.destinations.forms.filter((x) => !x.hasSubmit && x.fields > 0);
  if (noSubmit.length) {
    add({ rule: "form-no-submit", category: "Links and forms", status: "issue", title: "A form has no visible send button", evidence: `${noSubmit.length} form${noSubmit.length === 1 ? "" : "s"} without a submit button in the page code.`, evidenceUrl: homeUrl, confidence: "inferred", why: "Some forms add the button with code that MAIRO doesn't run — but if it's missing, nobody can enquire.", change: "Check the form on your phone and send yourself a test enquiry.", copy: [], effort: "minutes", priority: "medium", next: { label: "Send a test enquiry", href: null } });
  }
  if (f.destinations.forms.length && !noSubmit.length) {
    add({ rule: "form", category: "Links and forms", status: "ok", title: "Forms have a send button", evidence: `${f.destinations.forms.length} form${f.destinations.forms.length === 1 ? "" : "s"} found`, evidenceUrl: homeUrl, confidence: "observed", why: "", change: "", copy: [], effort: "minutes", priority: "low", next: { label: "", href: null } });
  }
  if (f.destinations.forms.length) {
    add({ rule: "form-works", category: "Links and forms", status: "not checked", title: "Whether your form actually sends", evidence: null, evidenceUrl: homeUrl, confidence: "not checked", why: "MAIRO never submits forms on your site.", change: "Send yourself a test enquiry and check it arrives — and that a thank-you page or message appears.", copy: [], effort: "minutes", priority: "low", next: { label: "Send a test enquiry", href: null } });
  }

  // Service area.
  if (kind === "service") {
    const found = f.serviceArea[0] ?? (f.business.areaServed.length ? `Area served: ${f.business.areaServed.join(", ")}` : f.business.locality ? `Located in ${f.business.locality}` : null);
    if (!found) {
      add({ rule: "service-area", category: "Service area", status: "issue", title: "The pages don't say where you work", evidence: `No service area or location found on the ${f.pages.length} page${f.pages.length === 1 ? "" : "s"} read.`, evidenceUrl: homeUrl, confidence: "observed", why: "For a local service, \"do they come to me?\" decides whether someone enquires.", change: "Name your area near the top: the towns or the distance you cover.", copy: ctx.location ? [`Serving ${ctx.location}`] : ["Serving [your towns] and nearby"], effort: "minutes", priority: "medium", next: { label: "Copy the wording", href: null } });
    } else {
      add({ rule: "service-area", category: "Service area", status: "ok", title: "Your area is mentioned", evidence: found, evidenceUrl: homeUrl, confidence: "observed", why: "", change: "", copy: [], effort: "minutes", priority: "low", next: { label: "", href: null } });
    }
  }

  // Buying or booking details.
  const anyPrice = f.pages.some((p) => p.prices.length);
  if (kind === "shop" && !anyPrice) {
    add({ rule: "prices-missing", category: "Buying or booking details", status: "issue", title: "No prices on the pages read", evidence: `No prices found on ${f.pages.length} page${f.pages.length === 1 ? "" : "s"}.`, evidenceUrl: homeUrl, confidence: "observed", why: "People from ads want to know what something costs before they click further.", change: "Show the price on the page your ads link to.", copy: [], effort: "an hour", priority: "medium", next: { label: "Add prices to the ad's page", href: null } });
  }
  if (kind === "shop" && !f.policies.length) {
    add({ rule: "policies-missing", category: "Buying or booking details", status: "issue", title: "No returns or shipping policy found", evidence: "No returns, refund or shipping policy on the pages read.", evidenceUrl: homeUrl, confidence: "observed", why: "First-time buyers from an ad check what happens if something goes wrong.", change: "Link your returns and shipping policy near the buy button — only the policy you actually have.", copy: [], effort: "an hour", priority: "medium", next: { label: "Link your policy", href: null } });
  }
  if (kind === "service" && !anyPrice && !f.offers.some((o) => /quote|estimate|consultation/i.test(o))) {
    add({ rule: "service-cost", category: "Buying or booking details", status: "issue", title: "Visitors can't tell what it costs or what the first step costs", evidence: "No prices, \"from\" prices or free quote found on the pages read.", evidenceUrl: homeUrl, confidence: "observed", why: "Not knowing the cost stops people enquiring.", change: "Add a starting price or say what the first step costs — only if it's true.", copy: ["From $[your starting price]", "Free quote — only if you offer one"], effort: "minutes", priority: "low", next: { label: "Copy the wording", href: null } });
  }

  // Trust.
  const reviewsShown = Boolean(f.business.rating) || f.apps.some((a) => a.category === "Reviews");
  if (!reviewsShown && !f.trust.length) {
    add({ rule: "trust", category: "Trust", status: "issue", title: "No reviews or reasons to trust found", evidence: `No review widget, rating or trust details (licensed, insured, years in business) on the ${f.pages.length} page${f.pages.length === 1 ? "" : "s"} read.`, evidenceUrl: homeUrl, confidence: "observed", why: "Strangers from an ad need a reason to believe you. These may exist elsewhere on your site.", change: "Show real reviews you're allowed to show, and facts like years in business or licences. Never write your own.", copy: [], effort: "an hour", priority: "medium", next: { label: "Add real proof", href: null } });
  } else {
    add({ rule: "trust", category: "Trust", status: "ok", title: "Some proof is shown", evidence: f.business.rating ? `Rating in the page data: ${f.business.rating.value} from ${f.business.rating.count} reviews` : f.trust[0] ?? f.apps.find((a) => a.category === "Reviews")?.name ?? null, evidenceUrl: homeUrl, confidence: "observed", why: "", change: "", copy: [], effort: "minutes", priority: "low", next: { label: "", href: null } });
  }

  // Speed: measured only with PageSpeed Insights; lab and field kept apart.
  if (f.performance?.lab) {
    const lcp = f.performance.lab.lcpMs;
    const slow = lcp !== null && lcp > 4000;
    const okish = lcp !== null && lcp <= 2500;
    add({
      rule: "speed-lab",
      category: "Speed",
      status: slow || (lcp !== null && !okish) ? "issue" : "ok",
      title: slow ? "The main content loads slowly on a phone (lab test)" : okish ? "The main content loads quickly in a phone lab test" : "The main content loads slower than Google recommends (lab test)",
      evidence: `PageSpeed Insights, simulated phone: largest content after ${lcp !== null ? (lcp / 1000).toFixed(1) : "?"} s${f.performance.lab.score !== null ? `, performance score ${Math.round(f.performance.lab.score * 100)}` : ""}.`,
      evidenceUrl: homeUrl,
      confidence: "observed",
      why: "A lab test is one simulated visit; it shows problems, not what every visitor gets.",
      change: slow || !okish ? "Compress the biggest images and remove scripts you don't use; recheck after." : "",
      copy: [],
      effort: "a day or more",
      priority: slow ? "high" : "low",
      next: { label: "Recheck after changes", href: null },
    });
  } else {
    add({ rule: "speed-lab", category: "Speed", status: "not checked", title: "Page speed", evidence: "Not measured — MAIRO's PageSpeed Insights connection isn't set up, and MAIRO doesn't guess speed from page size.", evidenceUrl: homeUrl, confidence: "not checked", why: "Slow pages lose ad visitors, but only a measurement can say whether yours is slow.", change: "Test it yourself at pagespeed.web.dev with your page's address.", copy: [], effort: "minutes", priority: "low", next: { label: "Open PageSpeed Insights", href: "https://pagespeed.web.dev/" } });
  }
  if (f.performance?.field) {
    const fd = f.performance.field;
    add({ rule: "speed-field", category: "Speed", status: fd.category === "SLOW" ? "issue" : "ok", title: `Real visitors' experience (${fd.scope === "page" ? "this page" : "whole site"}): ${fd.category?.toLowerCase() ?? "no rating"}`, evidence: `Chrome users over 28 days: largest content ${fd.lcpMs !== null ? (fd.lcpMs / 1000).toFixed(1) : "?"} s at the 75th percentile.`, evidenceUrl: homeUrl, confidence: "observed", why: "Field data is what real Chrome users experienced — the better guide when it exists.", change: fd.category === "SLOW" ? "Start with the largest images on the page." : "", copy: [], effort: "a day or more", priority: fd.category === "SLOW" ? "high" : "low", next: { label: "Recheck later", href: null } });
  }

  // Ad and page match.
  if (ctx.adMessage?.trim()) {
    const words = ctx.adMessage.toLowerCase().match(/[a-z0-9$%]{4,}/g) ?? [];
    const key = [...new Set(words)].filter((w) => !/^(your|with|that|this|from|have|will|more|just|what|when|they|them|then|than|into|over|only|also|very|here|near)$/.test(w));
    const text = f.text.toLowerCase();
    const missing = key.filter((w) => !text.includes(w.replace(/s$/, "")));
    const share = key.length ? 1 - missing.length / key.length : 1;
    if (key.length >= 2 && share < 0.5) {
      add({ rule: "message-match", category: "Ad and page match", status: "issue", title: "The page doesn't repeat what the ad says", evidence: `Words from the ad not found on the page: ${missing.slice(0, 6).join(", ")}`, evidenceUrl: homeUrl, confidence: "inferred", why: "People who click expect to see what the ad promised; if they don't, they assume they're in the wrong place.", change: "Use the ad's main promise in the page's headline, or send the ad to a page that already says it.", copy: headlineSuggestions(f, ctx), effort: "minutes", priority: "medium", next: { label: "Copy a headline", href: null } });
    } else {
      add({ rule: "message-match", category: "Ad and page match", status: "ok", title: "The page repeats what the ad says", evidence: null, evidenceUrl: homeUrl, confidence: "inferred", why: "", change: "", copy: [], effort: "minutes", priority: "low", next: { label: "", href: null } });
    }
  } else {
    add({ rule: "message-match", category: "Ad and page match", status: "not checked", title: "Whether the page matches your ad", evidence: null, evidenceUrl: homeUrl, confidence: "not checked", why: "There's no ad to compare yet.", change: "Once your ad is written, check the page repeats its main promise.", copy: [], effort: "minutes", priority: "low", next: { label: "Plan your first ad", href: "/sign-up?from=tools" } });
  }

  // Tracking.
  const t = f.tracking;
  if (t.metaPixelScript) {
    add({ rule: "tracking", category: "Tracking", status: "ok", title: "Meta's pixel is on the page", evidence: t.evidence.find((e) => /Meta/.test(e.what))?.where ?? "fbevents.js", evidenceUrl: homeUrl, confidence: "observed", why: "It's there — but that alone doesn't prove leads or purchases reach Meta.", change: "Check in Meta's Events Manager that your lead or purchase event arrives when you test it.", copy: [], effort: "minutes", priority: "low", next: { label: "Set up tracking in MAIRO", href: "/dashboard/tracking" } });
  } else if (t.shopifyWebPixels || t.gtmContainers.length) {
    add({ rule: "tracking", category: "Tracking", status: "not checked", title: "Meta's pixel may load in a way a public scan can't see", evidence: t.shopifyWebPixels ? "Shopify web pixels are on the page — pixels set up in Shopify run in a sandbox." : `Tag Manager is on the page (${t.gtmContainers.join(", ")}) — tags inside it load later.`, evidenceUrl: homeUrl, confidence: "not checked", why: "MAIRO can't confirm tracking from outside; Meta's own records can.", change: "Connect Meta in MAIRO to check whether events arrive.", copy: [], effort: "minutes", priority: "medium", next: { label: "Check tracking", href: "/dashboard/tracking" } });
  } else {
    add({ rule: "tracking", category: "Tracking", status: "issue", title: "No Meta pixel detected", evidence: `No Meta pixel, Tag Manager or Shopify web pixels found on the page${f.consent.length ? ` (a consent tool is present — tracking may load only after visitors accept)` : ""}.`, evidenceUrl: homeUrl, confidence: f.consent.length ? "inferred" : "observed", why: "Without it Meta can't see who enquires or buys, can't find more people like them, and nobody can tell which ads worked. Not needed for Meta lead forms or call ads.", change: "Set up the pixel with MAIRO — reusing one you already have if there is one.", copy: [], effort: "an hour", priority: kind === "shop" ? "high" : "medium", next: { label: "Set up tracking", href: "/dashboard/tracking" } });
  }

  const ORDER: Category[] = ["Call to action", "Headline and offer", "Security", "Links and forms", "Mobile", "Tracking", "Buying or booking details", "Service area", "Trust", "Ad and page match", "Speed"];
  const rank = (x: Finding) => ({ high: 0, medium: 1, low: 2 })[x.priority] * 100 + ({ observed: 0, inferred: 1, "not checked": 2 })[x.confidence] * 20 + ORDER.indexOf(x.category);
  const issues = findings.filter((x) => x.status === "issue").sort((a, b) => rank(a) - rank(b));
  // The top three are three different problems, not one rule three times.
  const top: Finding[] = [];
  for (const i of issues) if (top.length < 3 && !top.some((t) => t.rule === i.rule)) top.push(i);
  return {
    top,
    findings: [...issues, ...findings.filter((x) => x.status !== "issue")],
    checked: findings.filter((x) => x.status !== "not checked").length,
    issues: issues.length,
    notChecked: findings.filter((x) => x.status === "not checked").length,
  };
}
