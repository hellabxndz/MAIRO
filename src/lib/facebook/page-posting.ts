import { db } from "@/lib/db";
import { metaGraphRequest, MetaApiError } from "@/lib/meta/client";
import { loadMetaConnection } from "@/lib/meta/connection";
import { PAGE_POSTING_SCOPE } from "@/lib/meta/oauth";
import { absoluteUrl } from "@/lib/site";
import { fail, ok, type PlatformResult } from "@/lib/ad-platforms/types";
import { videoUrl } from "@/lib/instagram/library";
import { MAX_ATTEMPTS, type MediaType } from "@/lib/instagram/social-logic";

// Posting on the business's own Facebook Page (Scale).
//
// Same promise as Instagram: a row says PUBLISHED only when Facebook says the
// post is live, and nothing goes out that the business didn't approve after
// seeing the preview. The differences are all Facebook's:
//
// - It needs pages_manage_posts, which the everyday Meta connect doesn't ask
//   for. MAIRO asks for it only when a Scale business says yes to posting on
//   its Page (/api/meta/connect?also=page_posts).
// - Posts are made as the Page, with the Page's own token, read fresh from
//   the connection each time and never stored or sent to the browser.
// - A photo is live in one call. Several photos are uploaded unpublished and
//   then attached to one post. A video is handed over by URL and processes
//   for a while before it appears, so it waits in CREATED like a Reel does.

export type FacebookTarget = {
  pageId: string;
  pageName: string | null;
  /** Whether this connection has granted posting on the Page yet. */
  canPublish: boolean;
};

/** The URL that asks Meta for permission to post on the Page, then comes back here. */
export const PAGE_POSTING_CONNECT = `/api/meta/connect?also=page_posts&returnTo=${encodeURIComponent("/dashboard/social/facebook")}`;

/** Whether the stored token carries pages_manage_posts. */
async function grantedPagePosting(accessToken: string): Promise<boolean> {
  try {
    const res = await metaGraphRequest<{ data?: { permission: string; status: string }[] }>("/me/permissions", { accessToken });
    return (res.data ?? []).some((p) => p.permission === PAGE_POSTING_SCOPE && p.status === "granted");
  } catch {
    return false;
  }
}

/** The connected Page, and whether MAIRO may post on it. */
export async function findFacebookPage(organizationId: string): Promise<PlatformResult<FacebookTarget>> {
  const connection = await loadMetaConnection(organizationId);
  if (!connection || connection.status !== "CONNECTED") {
    return fail("not_connected", "Connect your Meta account first — Facebook posting runs through it.");
  }
  if (!connection.pageId) {
    return fail("rejected", "No Facebook Page is picked yet. Choose one on the Meta screen first.");
  }
  return ok({ pageId: connection.pageId, pageName: connection.pageName, canPublish: await grantedPagePosting(connection.accessToken) });
}

export type FacebookOutcome = { status: "PUBLISHED" | "CREATED" | "SCHEDULED" | "FAILED"; message: string; permalink?: string | null };

function explain(error: unknown, fallback: string): string {
  if (error instanceof MetaApiError) {
    const detail = typeof error.message === "string" ? error.message : "";
    if (/permission|OAuth|scope|pages_manage_posts/i.test(detail)) {
      return `${detail} Give MAIRO permission to post on your Page from the Facebook posts screen.`;
    }
    return detail || fallback;
  }
  return fallback;
}

async function fail_(postId: string, message: string): Promise<FacebookOutcome> {
  await db.instagramPost.update({ where: { id: postId }, data: { status: "FAILED", error: message } });
  return { status: "FAILED", message };
}

async function permalinkOf(id: string, token: string): Promise<string | null> {
  try {
    return (await metaGraphRequest<{ permalink_url?: string }>(`/${id}`, { accessToken: token, params: { fields: "permalink_url" } })).permalink_url ?? null;
  } catch {
    return null;
  }
}

function toAbsolute(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `https://www.facebook.com${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Publishes one approved Facebook post. The caller has already checked it is
 * due, the plan, and the subscription.
 */
export async function publishFacebookPost(post: {
  id: string;
  organizationId: string;
  caption: string;
  mediaType: string;
  mediaRefs: string[];
  containerId: string | null;
  attempts: number;
}): Promise<FacebookOutcome> {
  const page = await findFacebookPage(post.organizationId);
  if (!page.ok) return fail_(post.id, page.error.message);
  if (!page.data.canPublish) return fail_(post.id, "MAIRO doesn't have permission to post on your Facebook Page yet. Allow it on the Facebook posts screen, then approve the post again.");
  const connection = await loadMetaConnection(post.organizationId);
  if (!connection) return fail_(post.id, "Connect your Meta account first.");

  const pageId = page.data.pageId;
  let pageToken: string;
  try {
    const res = await metaGraphRequest<{ access_token?: string }>(`/${pageId}`, { accessToken: connection.accessToken, params: { fields: "access_token" } });
    if (!res.access_token) return fail_(post.id, "Facebook didn't let MAIRO post as your Page. Check that you manage the Page, then allow posting again.");
    pageToken = res.access_token;
  } catch (error) {
    return fail_(post.id, explain(error, "Couldn't reach your Facebook Page."));
  }

  const type = post.mediaType as MediaType;
  const image = (i: number) => absoluteUrl(`/api/social/media/${post.id}/${i}`);

  // A video handed over earlier: wait for Facebook to finish processing it.
  if (post.containerId) {
    await db.instagramPost.update({ where: { id: post.id }, data: { attempts: post.attempts + 1 } });
    let state = "processing";
    let permalink: string | null = null;
    try {
      const v = await metaGraphRequest<{ status?: { video_status?: string }; permalink_url?: string }>(`/${post.containerId}`, { accessToken: pageToken, params: { fields: "status,permalink_url" } });
      state = v.status?.video_status ?? "ready";
      permalink = toAbsolute(v.permalink_url ?? null);
    } catch {
      state = "processing";
    }
    if (state === "ready") {
      await db.instagramPost.update({ where: { id: post.id }, data: { status: "PUBLISHED", mediaId: `fb:${post.containerId}`, permalink, postedAt: new Date(), error: null } });
      return { status: "PUBLISHED", message: "Posted to your Facebook Page.", permalink };
    }
    if (state === "error") return fail_(post.id, "Facebook couldn't process the video. Try an MP4 or MOV file.");
    if (post.attempts + 1 >= MAX_ATTEMPTS) return fail_(post.id, "Facebook never finished processing this video.");
    await db.instagramPost.update({ where: { id: post.id }, data: { error: "Facebook is still processing the video — MAIRO checks again at the next run." } });
    return { status: "CREATED", message: "Still processing." };
  }

  try {
    if (type === "REEL") {
      const url = await videoUrl(post.mediaRefs[0] ?? "");
      if (!url) return fail_(post.id, "That video is no longer available.");
      const video = await metaGraphRequest<{ id: string }>(`/${pageId}/videos`, { method: "POST", accessToken: pageToken, formParams: { file_url: url, description: post.caption } });
      await db.instagramPost.update({ where: { id: post.id }, data: { status: "CREATED", containerId: video.id, attempts: post.attempts + 1, error: "Facebook is processing the video." } });
      return { status: "CREATED", message: "Facebook is processing the video — it appears on your Page when it's ready." };
    }

    let postId: string;
    if (type === "CAROUSEL") {
      const ids: string[] = [];
      for (let i = 0; i < post.mediaRefs.length; i++) {
        ids.push((await metaGraphRequest<{ id: string }>(`/${pageId}/photos`, { method: "POST", accessToken: pageToken, formParams: { url: image(i), published: "false" } })).id);
      }
      postId = (await metaGraphRequest<{ id: string }>(`/${pageId}/feed`, {
        method: "POST",
        accessToken: pageToken,
        formParams: { message: post.caption, attached_media: JSON.stringify(ids.map((media_fbid) => ({ media_fbid }))) },
      })).id;
    } else {
      const photo = await metaGraphRequest<{ id: string; post_id?: string }>(`/${pageId}/photos`, { method: "POST", accessToken: pageToken, formParams: { url: image(0), message: post.caption, published: "true" } });
      postId = photo.post_id ?? photo.id;
    }
    const permalink = toAbsolute(await permalinkOf(postId, pageToken));
    await db.instagramPost.update({ where: { id: post.id }, data: { status: "PUBLISHED", mediaId: `fb:${postId}`, permalink, postedAt: new Date(), attempts: post.attempts + 1, error: null } });
    return { status: "PUBLISHED", message: "Posted to your Facebook Page.", permalink };
  } catch (error) {
    const attempts = post.attempts + 1;
    const message = explain(error, "Facebook wouldn't accept the post.");
    if (attempts >= MAX_ATTEMPTS || (error instanceof MetaApiError && error.status >= 400 && error.status < 500)) return fail_(post.id, message);
    await db.instagramPost.update({ where: { id: post.id }, data: { attempts, error: message } });
    return { status: "SCHEDULED", message };
  }
}
