import { db } from "@/lib/db";
import { metaGraphRequest, MetaApiError } from "@/lib/meta/client";
import { loadMetaConnection } from "@/lib/meta/connection";
import { fail, ok, type PlatformError, type PlatformResult } from "@/lib/ad-platforms/types";
import { CAPTION_MAX, POSTS_PER_DAY } from "@/lib/instagram/constants";

export { CAPTION_MAX, POSTS_PER_DAY };

// Posting to the customer's own Instagram.
//
// Same rule the ads adapters and the TikTok publisher keep: a row never says
// PUBLISHED unless Instagram said so. Every state here comes from Instagram's
// own answer, and a post MAIRO could not confirm stays CREATED rather than
// being optimistically closed out. Somebody reading this list is entitled to
// believe it about what is on their profile.
//
// Three things about Instagram's API are worth knowing before reading on,
// because each one shapes the code and none is guessable.
//
// It publishes in two calls, not one. A "container" is created from the media,
// and then published. The container can be accepted and still fail while
// Instagram processes it, which is why CREATED is a real state rather than an
// implementation detail.
//
// It fetches the picture itself. There is no upload endpoint for feed posts —
// Instagram is handed a URL and goes and gets it, so the image has to be
// reachable from the public internet. MAIRO keeps creative images as data URLs
// in its own database, so they are served through a public route for exactly
// this (src/app/api/creatives/[imageId]/raw).
//
// And it only works on a Business or Creator account linked to a Facebook
// Page. A personal Instagram cannot be posted to through any API, by anybody.
// That is Instagram's rule, not a gap in MAIRO, and the interface says so
// rather than failing with something vague about permissions.

export type InstagramTarget = {
  /** The IG Business account id — not the @handle, and not the Page id. */
  igUserId: string;
  username: string | null;
};

/**
 * Finds the Instagram Business account behind the connected Page.
 *
 * Null when there isn't one, which is the common case and not an error: most
 * small businesses have a personal Instagram, and linking it to their Page and
 * converting it to a Business account is a thing they do once, in the
 * Instagram app, and nobody can do for them.
 */
export async function findInstagramAccount(
  organizationId: string
): Promise<PlatformResult<InstagramTarget | null>> {
  const connection = await loadMetaConnection(organizationId);
  if (!connection || connection.status !== "CONNECTED") {
    return fail("not_connected", "Connect your Meta account first — Instagram posting runs through it.");
  }
  if (!connection.pageId) {
    return fail(
      "rejected",
      "No Facebook Page is picked yet. Instagram posting goes through the Page your Instagram is linked to, so choose one on the Meta screen first."
    );
  }

  try {
    const res = await metaGraphRequest<{
      instagram_business_account?: { id: string; username?: string };
    }>(`/${connection.pageId}`, {
      accessToken: connection.accessToken,
      params: { fields: "instagram_business_account{id,username}" },
    });

    const account = res.instagram_business_account;
    if (!account?.id) return ok(null);

    return ok({ igUserId: account.id, username: account.username ?? null });
  } catch (error) {
    return toFailure(error, "Couldn't check Instagram through your Meta connection.");
  }
}

export type InstagramPublishInput = {
  organizationId: string;
  caption: string;
  /** An https URL Instagram can fetch the picture from. Not a data URL. */
  imageUrl: string;
  creativeRequestId?: string | null;
};

export type InstagramPublishOutcome = {
  postId: string;
  status: "PUBLISHED" | "CREATED" | "FAILED";
  permalink: string | null;
  message: string;
};

/** How many posts this organization has published in the last 24 hours. */
export async function postsInLastDay(organizationId: string): Promise<number> {
  return db.instagramPost.count({
    where: {
      organizationId,
      network: "INSTAGRAM",
      status: "PUBLISHED",
      postedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
}

/**
 * Turns a Graph error into something a business owner can act on.
 *
 * Meta's own message is preferred where there is one — it is usually specific
 * ("The image is too small") and always more useful than a generic sentence
 * from MAIRO. The added wording is about what to do next.
 */
export function toFailure(error: unknown, fallback: string): { ok: false; error: PlatformError } {
  if (error instanceof MetaApiError) {
    const detail = typeof error.message === "string" ? error.message : "";

    // The permission the customer's connection predates. Worth naming, because
    // reconnecting is the fix and nothing about Meta's wording suggests it.
    if (/permission|OAuth|scope/i.test(detail)) {
      return fail<never>(
        "insufficient_scope",
        `${detail} Reconnecting your Meta account on the Meta screen will ask for the Instagram permission.`,
        error.body
      ) as { ok: false; error: PlatformError };
    }
    if (error.status === 401 || error.status === 403) {
      return fail<never>("not_connected", `${detail || fallback} Reconnect your Meta account.`, error.body) as { ok: false; error: PlatformError };
    }
    return fail<never>("rejected", detail || fallback, error.body) as { ok: false; error: PlatformError };
  }
  return fail<never>("unavailable", fallback, error) as { ok: false; error: PlatformError };
}
