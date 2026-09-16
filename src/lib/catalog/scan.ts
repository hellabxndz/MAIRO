// Reading what a shop sells off its own website.
//
// The alternative was asking the business to pick a catalogue in Meta Business
// Manager. Almost no small shop has one, and the few that do had it set up by
// somebody else years ago — so the question lands as "no" for nearly everyone
// it is asked of, and the feature dies there.
//
// The shop already publishes what it sells, on a page it keeps up to date
// because customers buy from it. That is the catalogue. MAIRO reads it.
//
// Two ways in, tried in order, because between them they cover most of what a
// small business runs on:
//
//   1. Shopify's own products.json, which every Shopify store exposes and which
//      gives prices, images and variants as data rather than as page furniture.
//   2. schema.org Product markup in the page's JSON-LD, which WooCommerce,
//      Squarespace, BigCommerce, Wix and most bespoke shops emit because it is
//      what makes a product show up properly in Google.
//
// Deliberately not a general crawler. Guessing which parts of arbitrary HTML
// are a product is how you end up advertising a cookie banner, and a wrong
// product in a live ad is worse than no catalogue at all.

export type ScannedProduct = {
  /** The shop's own id where it gives one, else the product URL. */
  externalId: string;
  title: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  imageUrl: string | null;
  url: string;
  available: boolean;
};

export type ScanOutcome =
  | { ok: true; products: ScannedProduct[]; how: "shopify" | "structured-data" }
  | { ok: false; error: string };

/** How many products to take from one shop. Enough to advertise, not a mirror. */
export const SCAN_LIMIT = 100;

/**
 * A price in integer cents, from the many shapes a site writes one in.
 *
 * Sites write "129.00", "129", 129, "$129.00" and "1 299,00" — and the last is
 * why this is careful: a European decimal comma read as a thousands separator
 * turns €1,299 into €1299.00 or worse, and a price that is wrong by a factor of
 * a hundred in a live ad is the kind of mistake that ends a customer.
 */
export function priceToCents(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  }
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // Strip currency symbols, letters and spaces; keep digits and separators.
  const cleaned = trimmed.replace(/[^\d.,-]/g, "");
  if (cleaned.length === 0) return null;

  // Which separator is the decimal point is decided by what follows it, not by
  // which character it is. "1,299" is one thousand two hundred and ninety-nine
  // everywhere; "24,50" is twenty-four fifty in half of Europe. The tell is the
  // digit count: a group of exactly three after the last separator is thousands,
  // one or two is a decimal fraction.
  const lastSeparator = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));

  let normalized: string;
  if (lastSeparator === -1) {
    normalized = cleaned;
  } else {
    const after = cleaned.length - lastSeparator - 1;
    normalized =
      after === 1 || after === 2
        ? `${cleaned.slice(0, lastSeparator).replace(/[.,]/g, "")}.${cleaned.slice(lastSeparator + 1)}`
        : cleaned.replace(/[.,]/g, "");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** An absolute URL, since sites write product and image links both ways. */
export function absolutize(raw: string | null | undefined, base: string): string | null {
  if (!raw || raw.trim().length === 0) return null;
  try {
    return new URL(raw.trim(), base).toString();
  } catch {
    return null;
  }
}

/** Plain text from a description that may carry markup. */
function plainText(raw: unknown, max = 400): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    // A tag sitting between a word and its full stop ("<b>mud</b>.") leaves a
    // space in front of the punctuation once the tag goes.
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
  if (text.length === 0) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

type ShopifyProduct = {
  id?: number | string;
  title?: string;
  handle?: string;
  body_html?: string;
  variants?: { price?: string | number; available?: boolean }[];
  images?: { src?: string }[];
};

/**
 * Shopify's products.json, which every Shopify storefront serves.
 *
 * The first variant's price is the one shown on the product card, and
 * availability is true when any variant can be bought — a shop with the medium
 * sold out is still selling the shirt.
 */
export function parseShopifyProducts(payload: unknown, siteUrl: string): ScannedProduct[] {
  const products = (payload as { products?: ShopifyProduct[] })?.products;
  if (!Array.isArray(products)) return [];

  const out: ScannedProduct[] = [];
  for (const p of products) {
    const title = typeof p.title === "string" ? p.title.trim() : "";
    if (!title || !p.handle) continue;

    const url = absolutize(`/products/${p.handle}`, siteUrl);
    if (!url) continue;

    const variants = Array.isArray(p.variants) ? p.variants : [];
    out.push({
      externalId: p.id !== undefined ? String(p.id) : url,
      title,
      description: plainText(p.body_html),
      priceCents: priceToCents(variants[0]?.price),
      currency: "USD",
      imageUrl: absolutize(p.images?.[0]?.src, siteUrl),
      url,
      // No variants at all means the shop did not say, and refusing to
      // advertise something for lack of a field it never sent is worse than
      // advertising it.
      available: variants.length === 0 || variants.some((v) => v.available !== false),
    });
    if (out.length >= SCAN_LIMIT) break;
  }
  return out;
}

/**
 * Every JSON-LD block in a page, parsed and flattened.
 *
 * Sites nest these in every legal way: a bare object, an array, or an @graph.
 * A malformed block is skipped rather than failing the page — one shop's broken
 * script tag must not cost the other nineteen products.
 */
export function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(pattern)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const graph = (item as { "@graph"?: unknown[] })?.["@graph"];
        if (Array.isArray(graph)) blocks.push(...graph);
        else blocks.push(item);
      }
    } catch {
      // A broken block is one shop's bad markup, not a reason to give up.
    }
  }
  return blocks;
}

type LdOffer = { price?: unknown; priceCurrency?: unknown; availability?: unknown };
type LdProduct = {
  "@type"?: unknown;
  name?: unknown;
  description?: unknown;
  image?: unknown;
  url?: unknown;
  sku?: unknown;
  offers?: LdOffer | LdOffer[];
};

function isProduct(block: unknown): block is LdProduct {
  const type = (block as LdProduct)?.["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === "string" && t.toLowerCase() === "product");
}

/**
 * schema.org Product markup, which is what most non-Shopify shops emit.
 *
 * They emit it for Google rather than for MAIRO, which is exactly why it is
 * worth reading: a shop that wants to be found keeps it accurate.
 */
export function parseStructuredProducts(html: string, pageUrl: string): ScannedProduct[] {
  const out: ScannedProduct[] = [];

  for (const block of jsonLdBlocks(html)) {
    if (!isProduct(block)) continue;

    const title = typeof block.name === "string" ? block.name.trim() : "";
    if (!title) continue;

    const url = absolutize(typeof block.url === "string" ? block.url : pageUrl, pageUrl);
    if (!url) continue;

    const offers = Array.isArray(block.offers) ? block.offers[0] : block.offers;
    const image = Array.isArray(block.image) ? block.image[0] : block.image;
    const availability =
      typeof offers?.availability === "string" ? offers.availability.toLowerCase() : "";

    out.push({
      externalId: typeof block.sku === "string" && block.sku.trim() ? block.sku.trim() : url,
      title,
      description: plainText(block.description),
      priceCents: priceToCents(offers?.price),
      currency:
        typeof offers?.priceCurrency === "string" && offers.priceCurrency.trim()
          ? offers.priceCurrency.trim().toUpperCase().slice(0, 3)
          : "USD",
      imageUrl: absolutize(typeof image === "string" ? image : null, pageUrl),
      url,
      // Only an explicit "out of stock" counts against it. Most pages say
      // nothing, and treating silence as sold out empties the catalogue.
      available: !availability.includes("outofstock") && !availability.includes("soldout"),
    });
    if (out.length >= SCAN_LIMIT) break;
  }

  return out;
}

/** Drops repeats, which a page carrying both a list and a detail block will have. */
export function dedupe(products: ScannedProduct[]): ScannedProduct[] {
  const seen = new Set<string>();
  return products.filter((p) => {
    if (seen.has(p.externalId)) return false;
    seen.add(p.externalId);
    return true;
  });
}
