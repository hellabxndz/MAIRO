import { db } from "@/lib/db";
import { normalizeUrl } from "@/lib/campaigns/destination";
import {
  dedupe,
  parseShopifyProducts,
  parseStructuredProducts,
  SCAN_LIMIT,
  type ScanOutcome,
  type ScannedProduct,
} from "@/lib/catalog/scan";

// Going and getting the shop's page. The reading of it is in scan.ts, which is
// pure and checked; this is the part that touches the network and the database.

/** Long enough for a slow shop, short enough not to hang a server action. */
const TIMEOUT_MS = 12_000;

/**
 * Says who is calling, because a shop's host may well want to know.
 *
 * A request with no user agent is what a scraper looks like, and being blocked
 * as one is a failure mode with no error message worth showing the customer.
 */
const UA = "MAIRO-catalog/1.0 (+https://mairo.app)";

async function get(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json, text/html;q=0.9" },
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, body: res.ok ? await res.text() : "" };
  } catch {
    return { ok: false, status: 0, body: "" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Where a Shopify feed might be for the address they typed.
 */
function shopifyCandidates(site: string): string[] {
  const query = `products.json?limit=${SCAN_LIMIT}`;
  const root = new URL(`/${query}`, site).toString();

  const url = new URL(site);
  const path = url.pathname.replace(/\/+$/, "");
  if (path.length === 0) return [root];

  // Same URL twice is one wasted request on every non-Shopify shop.
  const nested = new URL(`${path}/${query}`, site).toString();
  return nested === root ? [root] : [root, nested];
}

/**
 * Reads a shop and returns what it sells.
 *
 * Shopify first because it answers with data rather than markup and is the
 * single most common thing a small shop runs on; the page's own structured data
 * second, which is what everything else emits. A shop that yields neither gets
 * a sentence about what to do rather than an empty list, because "we found
 * nothing" and "we could not read your site" are different problems with
 * different fixes.
 */
export async function readShop(rawUrl: string): Promise<ScanOutcome> {
  const site = normalizeUrl(rawUrl);
  if (!site) {
    return { ok: false, error: "That doesn't look like a web address. Something like yourshop.com." };
  }

  // Shopify serves this on every storefront, and a shop that is not Shopify
  // answers 404 — which costs one request and settles the question.
  //
  // Both the domain root and the address they actually typed. Shopify's own
  // feed lives at the root, so that is tried first; the second covers a shop
  // living under a path, and somebody who pastes the link to their products
  // page is doing the most reasonable thing in the world.
  for (const base of shopifyCandidates(site)) {
    const shopify = await get(base);
    if (!shopify.ok) continue;
    try {
      const products = dedupe(parseShopifyProducts(JSON.parse(shopify.body), site));
      if (products.length > 0) return { ok: true, products, how: "shopify" };
    } catch {
      // Not Shopify after all — some hosts answer everything with a page.
    }
  }

  const page = await get(site);
  if (!page.ok) {
    return {
      ok: false,
      error:
        page.status > 0
          ? `Your website answered with an error (${page.status}), so MAIRO couldn't read it. Check the address and try again.`
          : "MAIRO couldn't reach that address. Check it's right and that the site is up.",
    };
  }

  const products = dedupe(parseStructuredProducts(page.body, site));
  if (products.length > 0) return { ok: true, products, how: "structured-data" };

  return {
    ok: false,
    error:
      "MAIRO couldn't find any products on that page. Try the address of the page that lists what you sell — a shop or products page rather than your home page.",
  };
}

/**
 * Stores what a scan found, as the business's current catalogue.
 *
 * Upserted on the shop's own id so a second read updates prices rather than
 * stacking a second copy of the shop. Nothing is deleted: a product that has
 * dropped off the page may be a page that failed to render half its list, and
 * quietly emptying somebody's catalogue is worse than carrying one stale item.
 */
export async function saveProducts(
  organizationId: string,
  products: ScannedProduct[]
): Promise<number> {
  for (const p of products) {
    await db.product.upsert({
      where: { organizationId_externalId: { organizationId, externalId: p.externalId } },
      update: {
        title: p.title,
        description: p.description,
        priceCents: p.priceCents,
        currency: p.currency,
        imageUrl: p.imageUrl,
        url: p.url,
        available: p.available,
      },
      create: { organizationId, ...p },
    });
  }

  await db.organization.update({
    where: { id: organizationId },
    data: { catalogScannedAt: new Date() },
  });

  return products.length;
}
