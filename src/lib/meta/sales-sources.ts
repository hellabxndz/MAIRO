import { metaGraphRequest } from "@/lib/meta/client";
import { loadMetaConnection } from "@/lib/meta/connection";
import { findInstagramAccount } from "@/lib/instagram/publish";
import type { PagePost } from "@/lib/campaigns/sales-source";

// The posts a shop can run as ads, instead of a picture MAIRO generates.
//
// A post that did well organically is the best-evidenced ad a business will
// ever run — real people already engaged with it — and running it costs nothing
// to make.
//
// Reading them is gated on pages_read_engagement, which MAIRO requests but
// which is held back from the current App Review round — so the failure is
// reported as a sentence naming the permission, rather than as a Graph error
// naming an endpoint nobody can act on.
//
// The catalogue is not here. It is read off the business's own website, in
// src/lib/catalog/, because almost no small shop keeps one in Meta Business
// Manager and asking them to build one is where the feature would have died.

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

const INSTAGRAM_REVIEW_PENDING =
  "Meta hasn't given MAIRO access to your Instagram posts yet — that needs the Instagram permission, which isn't in MAIRO's current Meta review. Pick a Facebook post, or let MAIRO make the ad, in the meantime.";

/**
 * The posts on the Instagram account linked to the business's Page, newest first.
 *
 * Videos are offered by their thumbnail; anything with no picture to show is
 * dropped, for the same reason as the Page's own posts.
 */
export async function listInstagramPosts(
  organizationId: string,
  limit = 12
): Promise<SourceResult<PagePost[]>> {
  const account = await findInstagramAccount(organizationId);
  if (!account.ok) return { ok: false, error: account.error.message };
  if (!account.data) {
    return {
      ok: false,
      error:
        "No Instagram account is linked to your Facebook Page. Link one in Meta Business settings to run its posts as ads.",
    };
  }

  const connection = await loadMetaConnection(organizationId);
  if (!connection) {
    return { ok: false, error: "Connect your Meta account first — Instagram runs through it." };
  }

  try {
    const res = await metaGraphRequest<{
      data?: {
        id: string;
        caption?: string;
        media_type?: string;
        media_url?: string;
        thumbnail_url?: string;
        permalink?: string;
        timestamp?: string;
      }[];
    }>(`/${account.data.igUserId}/media`, {
      accessToken: connection.accessToken,
      params: {
        fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
        limit,
      },
    });

    const posts = (res.data ?? [])
      .map((p) => ({
        id: p.id,
        message: p.caption?.trim() || null,
        imageUrl: (p.media_type === "VIDEO" ? p.thumbnail_url : p.media_url) ?? null,
        permalink: p.permalink ?? null,
        createdAt: p.timestamp ?? null,
      }))
      .filter((p) => Boolean(p.imageUrl));

    return { ok: true, data: posts };
  } catch (error) {
    const permission = isPermission(error);
    return {
      ok: false,
      needsReview: permission,
      error: permission
        ? INSTAGRAM_REVIEW_PENDING
        : error instanceof Error
          ? `Meta wouldn't hand over your Instagram posts: ${error.message}`
          : "Meta wouldn't hand over your Instagram posts.",
    };
  }
}
