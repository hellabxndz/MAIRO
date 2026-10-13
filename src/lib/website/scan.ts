import { readFileSync } from "node:fs";
import { join } from "node:path";
import { safeFetch, urlProblem, type SafeFetchOptions, type SafeFetchResult } from "@/lib/net/safe-fetch";
import { normalizeUrl } from "@/lib/campaigns/destination";
import { readSiteFacts, type SiteFacts } from "@/lib/business/site-facts";
import { auditSite, siteKind, type Audit, type AuditContext, type LinkCheck, type PageSummary, type PerformanceReading, type ScanFacts } from "./audit";
import {
  countAppExtensions,
  detectApps,
  detectConsent,
  detectDeclaredBusiness,
  detectDestinations,
  detectPlatform,
  detectShopifyTheme,
  detectSocial,
  detectTracking,
  quoteSentences,
  blockText,
  socialProfileFrom,
  OFFER_RE,
  POLICY_RE,
  SERVICE_AREA_RE,
  TRUST_RE,
  type ShopifyTheme,
  type SocialLink,
} from "./detect";
import { measurePagespeed } from "./pagespeed";

// One website reading, shared by onboarding, the "Before you spend on ads"
// report and the public free tools — there is no second scanner.
//
// Every request goes through safeFetch: public addresses only, redirects
// checked hop by hop, size and time limits. A scan reads at most MAX_PAGES
// pages and checks at most MAX_LINKS links, inside an overall time budget,
// and reports real progress as it goes (no fake timers).
//
// Fetched pages are untrusted data. They're matched against fixed patterns
// and quoted back; nothing in them is treated as an instruction.

export const MAX_PAGES = 4;
export const MAX_LINKS = 8;
const BUDGET_MS = 28_000;
const PAGE_TIMEOUT = 7_000;
const LINK_TIMEOUT = 4_000;

export type ScanProgress = { step: "address" | "home" | "pages" | "links" | "speed" | "audit" | "done"; label: string; done?: number; total?: number };

export type ScanStatus = "OK" | "PARTIAL" | "FAILED" | "BLOCKED";

export type BusinessFact = { field: "name" | "type" | "offering" | "products" | "prices" | "offers" | "location" | "colors" | "logo" | "tone" | "cta" | "contact" | "booking" | "checkout"; label: string; value: string | null; evidenceUrl: string | null; kind: "found" | "inferred" | "not found" | "not checked" };

export type ScanResult = {
  version: 1;
  requestedUrl: string;
  finalUrl: string | null;
  fetchedAt: string;
  durationMs: number;
  status: ScanStatus;
  error: string | null;
  /** A social profile given instead of a website — recognised, never read. */
  socialInstead: SocialLink | null;
  pages: PageSummary[];
  failedPages: { url: string; reason: string }[];
  platform: ScanFacts["platform"];
  shopifyTheme: ShopifyTheme | null;
  appExtensions: number;
  apps: ScanFacts["apps"];
  tracking: ScanFacts["tracking"];
  consent: ScanFacts["consent"];
  destinations: ScanFacts["destinations"];
  social: SocialLink[];
  business: ScanFacts["business"];
  offers: string[];
  serviceArea: string[];
  trust: string[];
  policies: string[];
  colors: string[];
  kind: "shop" | "service" | "unknown";
  facts: BusinessFact[];
  linkChecks: LinkCheck[];
  performance: PerformanceReading | null;
  audit: Audit;
  /** What this reading can't see, said once. */
  coverage: string[];
};

const EXTRA_PATH = /\/(contact|contact-us|book|booking|bookings|appointments?|schedule|quote|get-a-quote|estimate|locations?|areas?|service-areas?|pricing|prices|services?|shop|products?|collections?|menu|about)(\/|$|\?)/i;

function pagesWorthReading(html: string, base: string, keyLinks: string[]): string[] {
  let origin: string;
  try {
    origin = new URL(base).origin;
  } catch {
    return keyLinks;
  }
  const out = [...keyLinks];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      const clean = `${u.origin}${u.pathname}`;
      if (u.origin === origin && EXTRA_PATH.test(u.pathname) && !out.includes(clean) && clean !== base) out.push(clean);
    } catch {
      continue;
    }
    if (out.length >= 8) break;
  }
  // Contact and booking pages first: they're where an ad's visitor acts.
  return out.sort((a, b) => Number(/contact|book|appoint|quote|schedule/i.test(b)) - Number(/contact|book|appoint|quote|schedule/i.test(a))).slice(0, MAX_PAGES - 1);
}

function linksToCheck(html: string, base: string, skip: Set<string>): string[] {
  let origin: string;
  try {
    origin = new URL(base).origin;
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      if (u.origin !== origin || !/^https?:$/.test(u.protocol)) continue;
      if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4)$/i.test(u.pathname)) continue;
      // Carts, checkouts and accounts need a session; they'd look broken to a visitor-less check.
      if (/^\/(cart|checkout|checkouts|account|login|logout|admin|wp-admin|wp-login\.php)(\/|$)/i.test(u.pathname)) continue;
      const clean = `${u.origin}${u.pathname}`;
      if (!skip.has(clean) && !out.includes(clean)) out.push(clean);
    } catch {
      continue;
    }
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

function summary(f: SiteFacts): PageSummary {
  return {
    url: f.url,
    title: f.title,
    description: f.description,
    h1: f.headings[0] ?? null,
    headings: f.headings.slice(0, 6),
    ctas: f.ctas.slice(0, 8),
    prices: f.prices.slice(0, 10),
    mobileReady: f.mobileReady,
    https: f.https,
    bytes: f.bytes,
    hasForm: f.hasForm,
    hasPhone: f.hasPhone,
  };
}

function businessFacts(r: Omit<ScanResult, "facts" | "audit" | "coverage">, home: SiteFacts | null): BusinessFact[] {
  const url = r.finalUrl;
  const f = (field: BusinessFact["field"], label: string, value: string | null, kind?: BusinessFact["kind"]): BusinessFact => ({ field, label, value, evidenceUrl: value ? url : null, kind: kind ?? (value ? "found" : "not found") });
  const name = r.business.name ?? home?.siteName ?? home?.title?.split(/[|–—-]/)[0]?.trim() ?? null;
  const products = home?.products.length ? home.products.slice(0, 5).map((p) => (p.price ? `${p.name} (${p.price})` : p.name)).join(", ") : null;
  const prices = [...new Set(r.pages.flatMap((p) => p.prices))].slice(0, 6).join(", ") || null;
  const place = r.business.areaServed.length ? r.business.areaServed.join(", ") : r.business.locality ? [r.business.locality, r.business.region].filter(Boolean).join(", ") : r.serviceArea[0] ?? null;
  return [
    f("name", "Business name", name),
    f("type", "Kind of business", r.kind === "shop" ? "Sells online" : r.kind === "service" ? "Service business" : null, r.kind === "unknown" ? "not found" : "inferred"),
    f("offering", "What you offer", home?.description ?? r.pages[0]?.h1 ?? null),
    f("products", "Products or services listed", products),
    f("prices", "Prices shown", prices),
    f("offers", "Offers on the site", r.offers.length ? r.offers.join(" · ") : null),
    f("location", "Location or service area", place),
    f("colors", "Brand colours", r.colors.length ? r.colors.slice(0, 4).join(", ") : null),
    f("logo", "Logo", r.business.logo),
    f("tone", "Tone of voice", null, "not checked"),
    f("cta", "Main button", r.pages[0]?.ctas[0] ?? null),
    f("contact", "Phone", r.destinations.phoneLinks[0] ?? null),
    f("booking", "Booking", r.destinations.booking[0] ? `${r.destinations.booking[0].provider}: ${r.destinations.booking[0].url}` : null),
    f("checkout", "Checkout", r.destinations.checkout ? "Checkout link found" : r.destinations.cart ? "Cart found" : null),
  ];
}

export type Fetcher = (url: string, opts?: SafeFetchOptions) => Promise<SafeFetchResult>;
export type ScanOptions = { onProgress?: (p: ScanProgress) => void; context?: AuditContext; measureSpeed?: boolean; fetcher?: Fetcher };

/**
 * Local test sites, for the browser checks: only when MAIRO_SCAN_FIXTURES
 * names a folder AND this isn't running on Vercel, and only for hosts ending
 * in .fixture.test (a reserved name no real site can have). Everything else
 * still goes through safeFetch.
 */
function fixtureFetcher(): Fetcher | null {
  const dir = process.env.MAIRO_SCAN_FIXTURES?.trim();
  if (!dir || process.env.VERCEL) return null;
  return async (url, opts) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return safeFetch(url, opts);
    }
    if (!u.hostname.endsWith(".fixture.test")) return safeFetch(url, opts);
    const file = join(dir, u.hostname, u.pathname === "/" ? "index.html" : `${u.pathname.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9/_-]/gi, "")}.html`);
    try {
      const body = readFileSync(file, "utf8");
      return { ok: true, status: 200, finalUrl: url, body, contentType: "text/html", bytes: body.length, redirects: [] };
    } catch {
      return { ok: false, reason: "error_status", status: 404, message: "The site answered with an error (404)." };
    }
  };
}

const failed = (requestedUrl: string, status: ScanStatus, error: string, started: number, social: SocialLink | null = null): ScanResult => ({
  version: 1,
  requestedUrl,
  finalUrl: null,
  fetchedAt: new Date().toISOString(),
  durationMs: Date.now() - started,
  status,
  error,
  socialInstead: social,
  pages: [],
  failedPages: [],
  platform: null,
  shopifyTheme: null,
  appExtensions: 0,
  apps: [],
  tracking: { metaPixelIds: [], metaPixelScript: false, gtmContainers: [], ga4Ids: [], googleAdsIds: [], tiktok: false, pinterest: false, snapchat: false, microsoftAds: false, shopifyWebPixels: false, evidence: [] },
  consent: [],
  destinations: { phoneLinks: [], emailLink: false, booking: [], forms: [], cart: false, checkout: false },
  social: [],
  business: { name: null, types: [], telephone: null, locality: null, region: null, country: null, areaServed: [], priceRange: null, logo: null, rating: null, sameAs: [] },
  offers: [],
  serviceArea: [],
  trust: [],
  policies: [],
  colors: [],
  kind: "unknown",
  facts: [],
  linkChecks: [],
  performance: null,
  audit: { top: [], findings: [], checked: 0, issues: 0, notChecked: 0 },
  coverage: [],
});

/**
 * Reads a public website. Never throws for an ordinary failure: an invalid,
 * private or unreachable address comes back as a FAILED/BLOCKED result with a
 * plain reason. `pages` (with full facts) is returned alongside for callers
 * that need the text, such as the AI business reading; it isn't stored.
 */
export async function scanWebsite(raw: string, opts: ScanOptions = {}): Promise<{ result: ScanResult; siteFacts: SiteFacts[] }> {
  const started = Date.now();
  const fetchPage = opts.fetcher ?? fixtureFetcher() ?? safeFetch;
  const progress = opts.onProgress ?? (() => {});
  const over = () => Date.now() - started > BUDGET_MS;
  progress({ step: "address", label: "Checking the address" });

  const social = socialProfileFrom(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  if (social) {
    return { result: failed(raw, "FAILED", `That's a ${social.network} profile. MAIRO doesn't read social profiles — ${social.network} only allows that through its own approved access. Add your website instead, or tell MAIRO about your business and upload your photos.`, started, social), siteFacts: [] };
  }
  const url = normalizeUrl(raw);
  if (!url) return { result: failed(raw, "FAILED", "That doesn't look like a web address. Something like yourbusiness.com.", started), siteFacts: [] };
  const problem = urlProblem(url);
  if (problem) return { result: failed(url, problem === "not-a-url" || problem === "scheme" ? "FAILED" : "BLOCKED", "MAIRO can only read public websites.", started), siteFacts: [] };

  progress({ step: "home", label: "Reading your home page" });
  const speed = opts.measureSpeed ? measurePagespeed(url) : Promise.resolve(null);
  const home = await fetchPage(url, { maxBytes: 400_000, timeoutMs: PAGE_TIMEOUT, userAgent: "Mozilla/5.0 (compatible; MAIRO website check; +https://www.mairo.io)" });
  if (!home.ok) {
    return { result: failed(url, home.reason === "blocked" ? "BLOCKED" : "FAILED", home.message, started), siteFacts: [] };
  }
  if (home.contentType && !/html/i.test(home.contentType)) {
    return { result: failed(url, "FAILED", "That address isn't a web page MAIRO can read.", started), siteFacts: [] };
  }

  const homeFacts = readSiteFacts(home.body, home.finalUrl);
  const html = [home.body];
  const siteFacts: SiteFacts[] = [homeFacts];
  const failedPages: { url: string; reason: string }[] = [];

  const more = pagesWorthReading(home.body, home.finalUrl, homeFacts.keyLinks);
  if (more.length && !over()) {
    progress({ step: "pages", label: "Reading your other pages", done: 0, total: more.length });
    let done = 0;
    await inBatches(more, 3, async (u) => {
      const r = await fetchPage(u, { maxBytes: 300_000, timeoutMs: PAGE_TIMEOUT });
      done++;
      progress({ step: "pages", label: "Reading your other pages", done, total: more.length });
      if (r.ok && (!r.contentType || /html/i.test(r.contentType))) {
        siteFacts.push(readSiteFacts(r.body, r.finalUrl));
        html.push(r.body);
      } else failedPages.push({ url: u, reason: r.ok ? "Not a web page" : r.message });
    });
  }

  const all = html.join("\n");
  const destinations = detectDestinations(all);
  const linkChecks: LinkCheck[] = [];
  let linkCheckRan = false;
  const toCheck = [
    ...linksToCheck(home.body, home.finalUrl, new Set(siteFacts.map((p) => p.url))).map((u) => ({ url: u, kind: "page" as const })),
    ...destinations.booking.slice(0, 1).map((b) => ({ url: b.url, kind: "booking" as const })),
  ];
  if (!over()) linkCheckRan = true;
  if (toCheck.length && !over()) {
    progress({ step: "links", label: "Checking links", done: 0, total: toCheck.length });
    let done = 0;
    linkChecks.push(
      ...(await inBatches(toCheck, 4, async (l) => {
        const r = await fetchPage(l.url, { maxBytes: 2_048, timeoutMs: LINK_TIMEOUT, accept: "text/html,*/*" });
        done++;
        progress({ step: "links", label: "Checking links", done, total: toCheck.length });
        return r.ok ? { url: l.url, status: r.status, ok: true, reason: null, kind: l.kind } : { url: l.url, status: r.status ?? null, ok: false, reason: r.message, kind: l.kind };
      })),
    );
  }

  if (opts.measureSpeed) progress({ step: "speed", label: "Measuring speed with PageSpeed Insights" });
  const performance = await speed;

  progress({ step: "audit", label: "Writing your report" });
  const text = siteFacts.map((p) => p.text).join(" \n ");
  const blocks = html.map((h) => blockText(h)).join("\n");
  const base = {
    version: 1 as const,
    requestedUrl: url,
    finalUrl: home.finalUrl,
    fetchedAt: new Date().toISOString(),
    durationMs: 0,
    status: (failedPages.length ? "PARTIAL" : "OK") as ScanStatus,
    error: null,
    socialInstead: null,
    pages: siteFacts.map(summary),
    failedPages,
    platform: detectPlatform(all),
    shopifyTheme: detectShopifyTheme(home.body),
    appExtensions: countAppExtensions(all),
    apps: detectApps(all),
    tracking: detectTracking(all),
    consent: detectConsent(all),
    destinations,
    social: detectSocial(all),
    business: detectDeclaredBusiness(all),
    offers: quoteSentences(blocks, OFFER_RE),
    serviceArea: quoteSentences(blocks, SERVICE_AREA_RE),
    trust: quoteSentences(blocks, TRUST_RE),
    policies: quoteSentences(blocks, POLICY_RE, 2).concat(/\/policies\/(refund|shipping)/i.test(all) ? ["Store policy pages linked"] : []).slice(0, 2),
    colors: homeFacts.colors,
    kind: "unknown" as ScanResult["kind"],
    linkChecks,
    performance,
  };
  base.kind = siteKind(base);
  const audit = auditSite({ ...base, url: home.finalUrl, text, linkCheckRan }, opts.context);
  const coverage = [
    `Read ${siteFacts.length} page${siteFacts.length === 1 ? "" : "s"} and checked ${linkChecks.length} link${linkChecks.length === 1 ? "" : "s"}. Pages behind a login, and content that only appears after the page runs scripts, aren't seen.`,
    "Tracking that loads after a consent choice, inside Tag Manager or in Shopify's web pixels can't be seen from outside. A detected pixel doesn't prove events reach Meta.",
    ...(base.platform?.name === "Shopify" ? ["Shopify apps that work only in the admin or at checkout don't show on public pages, so \"not detected\" doesn't mean \"not installed\"."] : []),
    ...(performance ? [] : ["Speed wasn't measured."]),
  ];
  const result: ScanResult = { ...base, facts: businessFacts(base, homeFacts), audit, coverage, durationMs: Date.now() - started };
  progress({ step: "done", label: "Done" });
  return { result, siteFacts };
}
