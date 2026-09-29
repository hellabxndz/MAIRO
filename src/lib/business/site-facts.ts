// What can be read off a web page's HTML without guessing.
//
// Pure, so every extractor is checked in scripts/check-business.ts. These are
// the facts the AI analysis is given — and the facts the page falls back to
// when no AI is configured — so they are deliberately literal: a price is a
// price that appears on the page, a colour is a colour the page declares.

export type SiteFacts = {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  headings: string[];
  /** Visible text, tags stripped, capped. */
  text: string;
  /** Prices as written on the page, e.g. "$49.00". */
  prices: string[];
  /** The page's own declared colours, most used first. */
  colors: string[];
  /** Button and call-to-action wording. */
  ctas: string[];
  /** Products the page describes in its structured data. */
  products: { name: string; price: string | null }[];
  /** Same-site links worth reading next: shop, pricing, services, about. */
  keyLinks: string[];
  mobileReady: boolean;
  hasMetaPixel: boolean;
  hasForm: boolean;
  hasPhone: boolean;
  https: boolean;
  bytes: number;
};

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function clean(s: string): string {
  return decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function meta(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']{1,400})["']|<meta[^>]+content=["']([^"']{1,400})["'][^>]*(?:name|property)=["']${name}["']`,
    "i",
  );
  const m = html.match(re);
  return m ? decode((m[1] ?? m[2]).trim()) : null;
}

/** The text a person would read: no scripts, styles or markup. */
export function visibleText(html: string, max = 12_000): string {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  return clean(body).slice(0, max);
}

export function findPrices(text: string): string[] {
  const found = text.match(/(?:US)?\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s?(?:USD|EUR|GBP)|£\s?\d+(?:\.\d{2})?|€\s?\d+(?:[.,]\d{2})?/g) ?? [];
  return [...new Set(found.map((p) => p.replace(/\s+/g, "")))].slice(0, 20);
}

/** Hex colours the page declares, most frequent first, ignoring black, white and greys. */
export function findColors(html: string): string[] {
  const counts = new Map<string, number>();
  const theme = meta(html, "theme-color");
  const add = (c: string, weight = 1) => {
    let hex = c.toLowerCase();
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    if (hex.length !== 7) return;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread < 24) return; // black, white, greys: not a brand colour
    counts.set(hex, (counts.get(hex) ?? 0) + weight);
  };
  if (theme && /^#[0-9a-f]{3,6}$/i.test(theme)) add(theme, 10);
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join(" ");
  const inline = [...html.matchAll(/style=["']([^"']*)["']/gi)].map((m) => m[1]).join(" ");
  for (const m of `${styles} ${inline}`.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) add(m[0]);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 6);
}

/** What the page's buttons and prominent links say. */
export function findCtas(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<button[^>]*>([\s\S]{1,200}?)<\/button>/gi)) {
    const t = clean(m[1]);
    if (t.length >= 2 && t.length <= 40) out.add(t);
  }
  for (const m of html.matchAll(/<a[^>]+class=["'][^"']*(?:btn|button|cta)[^"']*["'][^>]*>([\s\S]{1,200}?)<\/a>/gi)) {
    const t = clean(m[1]);
    if (t.length >= 2 && t.length <= 40) out.add(t);
  }
  return [...out].slice(0, 12);
}

/** Products from schema.org JSON-LD, which shops publish for search engines. */
export function findProducts(html: string): { name: string; price: string | null }[] {
  const out: { name: string; price: string | null }[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const o = node as Record<string, unknown>;
    const type = o["@type"];
    const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
    if (isProduct && typeof o.name === "string") {
      const offers = (Array.isArray(o.offers) ? o.offers[0] : o.offers) as Record<string, unknown> | undefined;
      const price = offers?.price ?? offers?.lowPrice;
      const currency = typeof offers?.priceCurrency === "string" ? offers.priceCurrency : "";
      out.push({
        name: decode(o.name).slice(0, 160),
        price: price !== undefined && price !== null ? `${currency === "USD" || !currency ? "$" : `${currency} `}${price}` : null,
      });
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") visit(v);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]));
    } catch {
      // Malformed structured data is common and says nothing about the business.
    }
  }
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true))).slice(0, 20);
}

const KEY_PATH = /\/(shop|store|products?|collections?|pricing|prices|services?|menu|about|plans|catalog)(\/|$|\?)/i;

/** Same-site links worth reading next, up to three. */
export function findKeyLinks(html: string, base: string): string[] {
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
      if (u.origin !== origin || !KEY_PATH.test(u.pathname)) continue;
      const clean = `${u.origin}${u.pathname}`;
      if (!out.includes(clean) && clean !== base) out.push(clean);
    } catch {
      continue;
    }
    if (out.length >= 3) break;
  }
  return out;
}

export function readSiteFacts(html: string, url: string): SiteFacts {
  const text = visibleText(html);
  return {
    url,
    title: html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)![1].trim()) : null,
    description: meta(html, "description") ?? meta(html, "og:description"),
    siteName: meta(html, "og:site_name"),
    headings: [...html.matchAll(/<h[12][^>]*>([\s\S]{1,300}?)<\/h[12]>/gi)].map((m) => clean(m[1])).filter(Boolean).slice(0, 12),
    text,
    prices: findPrices(text),
    colors: findColors(html),
    ctas: findCtas(html),
    products: findProducts(html),
    keyLinks: findKeyLinks(html, url),
    mobileReady: /<meta[^>]+name=["']?viewport["']?[^>]*>/i.test(html),
    hasMetaPixel: /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init['"]/i.test(html),
    hasForm: /<form[\s>]/i.test(html),
    hasPhone: /href=["']tel:/i.test(html),
    https: url.startsWith("https://"),
    bytes: html.length,
  };
}

export type ConversionIssue = { issue: string; why: string; fix: string; severity: "high" | "medium" | "low" };

/**
 * Conversion problems that can be seen in the HTML itself.
 *
 * Only checks with a clear yes/no answer — the AI adds judgement-based ones
 * on top, and those are labelled as its view rather than as a measurement.
 */
export function literalConversionIssues(f: SiteFacts, sellsOnline: boolean): ConversionIssue[] {
  const out: ConversionIssue[] = [];
  if (!f.https) {
    out.push({ issue: "The site isn't on a secure (https) address", why: "Browsers mark it \"Not secure\", which puts people off buying or leaving their details.", fix: "Turn on HTTPS with your website host — most include it free.", severity: "high" });
  }
  if (!f.mobileReady) {
    out.push({ issue: "The page isn't set up for phones", why: "Most people who tap an ad are on a phone, and a page without a mobile layout shows zoomed out and hard to use.", fix: "Add a responsive (mobile) layout — most website builders have a setting for it.", severity: "high" });
  }
  if (!f.hasMetaPixel) {
    out.push({ issue: "Meta's pixel isn't on the page", why: "Without it, Meta can't see who buys or enquires, so it can't find more people like them and MAIRO can't measure results.", fix: "Set it up under Tracking in MAIRO.", severity: "medium" });
  }
  if (f.ctas.length === 0 && !f.hasForm && !f.hasPhone) {
    out.push({ issue: "MAIRO couldn't find a clear button to act on", why: "If the next step isn't obvious, people who arrive from an ad leave.", fix: "Put one clear button near the top — \"Shop now\", \"Book a call\" — so it's visible without scrolling.", severity: "medium" });
  }
  if (sellsOnline && f.prices.length === 0 && f.products.length === 0) {
    out.push({ issue: "No prices are visible on the page MAIRO read", why: "People from ads want to know what something costs before they click further.", fix: "Show prices on the page your ads link to.", severity: "low" });
  }
  if (f.bytes >= 350_000) {
    out.push({ issue: "The page is heavy", why: "Large pages load slowly on phones, and people leave before they see anything.", fix: "Compress images and remove unused scripts.", severity: "low" });
  }
  return out;
}
