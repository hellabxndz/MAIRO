import { metaGraphRequest } from "@/lib/meta/client";
import { loadMetaConnection } from "@/lib/meta/connection";
import type { PagePost, ProductCatalog } from "@/lib/campaigns/sales-source";

// What a shop can make its sales ads out of, besides a picture MAIRO generates.
//
// Two things a business already has and MAIRO was ignoring. A post that did
// well organically is the best-evidenced ad it will ever run — real people
// already engaged with it — and running it costs nothing to make. A product
// catalogue is the other: Meta picks which item to show each person, which no
// single generated image can do.
//
// Both are reads of the customer's own property, and both are gated on a
// permission. Page posts need pages_read_engagement, which MAIRO requests but
// which is held back from the current App Review round. Catalogues need
// catalog_management, which MAIRO does not request at all yet. So both failures
// are reported as a sentence naming what is missing, rather than as a Graph
// error naming an endpoint nobody can act on.

export type SourceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; needsReview?: boolean };

/**
 * Whether a Graph failure is a permission MAIRO has not been granted.
 *
 * Same three codes as everywhere else: 200 and 10 for a missing permission,
 * 190 when the token never carried the scope at all.
 */
function isPermission(error: unknown): boolean {
  const code = (error as { body?: { error?: { code?: number } } })?.body?.error?.code;
  return code === 10 || code === 200 || code === 190;
}

const POSTS_REVIEW_PENDING =
  "Meta hasn't approved MAIRO to read your Page's posts yet — that needs pages_read_engagement, which is still in App Review. MAIRO can write the ad for you in the meantime.";

const CATALOG_REVIEW_PENDING =
  "Meta hasn't approved MAIRO for product catalogues yet — that needs catalog_management, which MAIRO is still applying for. Your other campaigns are unaffected.";

/**
 * The posts on the business's own Page, newest first.
 *
 * published_posts rather than feed: feed includes what other people posted to
 * the Page, and an ad can only ever run the Page's own. Anything without a
 * picture is dropped, because a photoless post makes a bleak ad and picking one
 * by accident is a worse outcome than not being offered it.
 */
export async function listPagePosts(
  organizationId: string,
  limit = 12
): Promise<SourceResult<PagePost[]>> {
  const connection = await loadMetaConnection(organizationId);
  if (!connection) {
    return { ok: false, error: "Connect your Meta account first — the posts live on your Page." };
  }
  if (!connection.pageId) {
    return {
      ok: false,
      error:
        "No Facebook Page is picked yet. Choose one on the Meta connection screen and MAIRO can show you its posts.",
    };
  }

  try {
    const res = await metaGraphRequest<{
      data?: {
        id: string;
        message?: string;
        full_picture?: string;
        permalink_url?: string;
        created_time?: string;
      }[];
    }>(`/${connection.pageId}/published_posts`, {
      accessToken: connection.accessToken,
      params: {
        fields: "id,message,full_picture,permalink_url,created_time",
        limit,
      },
    });

    const posts = (res.data ?? [])
      .filter((p) => Boolean(p.full_picture))
      .map((p) => ({
        id: p.id,
        message: p.message?.trim() || null,
        imageUrl: p.full_picture ?? null,
        permalink: p.permalink_url ?? null,
        createdAt: p.created_time ?? null,
      }));

    return { ok: true, data: posts };
  } catch (error) {
    const permission = isPermission(error);
    return {
      ok: false,
      needsReview: permission,
      error: permission
        ? POSTS_REVIEW_PENDING
        : error instanceof Error
          ? `Meta wouldn't hand over your posts: ${error.message}`
          : "Meta wouldn't hand over your posts.",
    };
  }
}

/**
 * The product catalogues this business owns, through its Meta business.
 *
 * Two calls, because a catalogue belongs to a business portfolio rather than to
 * a person: the businesses first, then each one's catalogues. Most customers
 * have exactly one of each, and the second call is skipped entirely when there
 * is no business at all — which is itself the answer worth giving, since a
 * catalogue cannot exist without one.
 */
export async function listProductCatalogs(
  organizationId: string
): Promise<SourceResult<ProductCatalog[]>> {
  const connection = await loadMetaConnection(organizationId);
  if (!connection) {
    return { ok: false, error: "Connect your Meta account first." };
  }

  try {
    const businesses = await metaGraphRequest<{ data?: { id: string; name?: string }[] }>(
      "/me/businesses",
      { accessToken: connection.accessToken, params: { fields: "id,name", limit: 10 } }
    );

    const rows = businesses.data ?? [];
    if (rows.length === 0) {
      return {
        ok: false,
        error:
          "This Meta login isn't attached to a Business portfolio, and a product catalogue lives in one. Set one up in Meta Business settings, then come back.",
      };
    }

    const catalogs: ProductCatalog[] = [];
    for (const business of rows) {
      const owned = await metaGraphRequest<{
        data?: { id: string; name?: string; product_count?: number }[];
      }>(`/${business.id}/owned_product_catalogs`, {
        accessToken: connection.accessToken,
        params: { fields: "id,name,product_count", limit: 25 },
      });
      for (const c of owned.data ?? []) {
        catalogs.push({
          id: c.id,
          name: c.name ?? c.id,
          productCount: typeof c.product_count === "number" ? c.product_count : null,
        });
      }
    }

    return { ok: true, data: catalogs };
  } catch (error) {
    const permission = isPermission(error);
    return {
      ok: false,
      needsReview: permission,
      error: permission
        ? CATALOG_REVIEW_PENDING
        : error instanceof Error
          ? `Meta wouldn't hand over your catalogues: ${error.message}`
          : "Meta wouldn't hand over your catalogues.",
    };
  }
}
