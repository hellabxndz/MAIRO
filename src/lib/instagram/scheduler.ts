import { db } from "@/lib/db";
import { metaGraphRequest } from "@/lib/meta/client";
import { loadMetaConnection } from "@/lib/meta/connection";
import { SOCIAL_PAUSED_MESSAGE, socialAccess } from "@/lib/social/access";
import { pauseSocial } from "@/lib/social/pause";
import { executionBlock } from "@/lib/billing/execution";
import { absoluteUrl } from "@/lib/site";
import { findInstagramAccount, postsInLastDay, toFailure } from "./publish";
import { POSTS_PER_DAY } from "./constants";
import { videoUrl } from "./library";
import { publishFacebookPost } from "@/lib/facebook/page-posting";
import { MAX_ATTEMPTS, isDuePost, type MediaType } from "./social-logic";

// Publishing Scale's approved Instagram posts — photos, carousels and Reels —
// when their time comes. Facebook Page posts share the same queue and
// approval rules; their publishing calls are in lib/facebook/page-posting.
//
// Instagram publishes in steps: a "container" is created from the media, it
// processes (seconds for a photo, a minute or more for a Reel), and only then
// can it be published. Each step is written down as it happens, so a post
// still processing is simply picked up at the next check, and a post is
// only ever marked PUBLISHED when Instagram says it is.
//
// Nothing is published that the business didn't approve, nothing runs for an
// account without Scale and a live subscription, and Instagram's 25-a-day
// limit is respected.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type PublishOutcome = { status: "PUBLISHED" | "CREATED" | "SCHEDULED" | "FAILED" | "PAUSED"; message: string; permalink?: string | null };

function mediaUrl(postId: string, index: number): string {
  return absoluteUrl(`/api/social/media/${postId}/${index}`);
}

async function fail(postId: string, message: string): Promise<PublishOutcome> {
  await db.instagramPost.update({ where: { id: postId }, data: { status: "FAILED", error: message } });
  return { status: "FAILED", message };
}

export async function publishPost(postId: string, opts: { budgetMs?: number } = {}): Promise<PublishOutcome> {
  const deadline = Date.now() + (opts.budgetMs ?? 20_000);
  const post = await db.instagramPost.findUnique({ where: { id: postId } });
  if (!post || !isDuePost(post)) return { status: "SCHEDULED", message: "Not due yet." };

  const organizationId = post.organizationId;
  const facebook = post.network === "FACEBOOK";
  // Active Scale, checked now — not when the post was approved. A plan that
  // lapsed since then pauses everything still waiting, and nothing goes out.
  const access = await socialAccess(organizationId);
  if (!access.ok) {
    await pauseSocial(organizationId);
    return { status: "PAUSED", message: SOCIAL_PAUSED_MESSAGE };
  }
  const blocked = await executionBlock(organizationId);
  if (blocked) {
    await pauseSocial(organizationId, blocked);
    return { status: "PAUSED", message: blocked };
  }
  if (facebook) return publishFacebookPost(post);
  if (post.status === "SCHEDULED" && (await postsInLastDay(organizationId)) >= POSTS_PER_DAY) {
    await db.instagramPost.update({ where: { id: post.id }, data: { error: `Instagram's limit of ${POSTS_PER_DAY} posts a day is reached — this goes out at the next check.` } });
    return { status: "SCHEDULED", message: "Daily limit reached." };
  }

  const [found, connection] = await Promise.all([findInstagramAccount(organizationId), loadMetaConnection(organizationId)]);
  if (!found.ok) return fail(post.id, found.error.message);
  if (!found.data) return fail(post.id, "No Instagram Business account is linked to your Facebook Page, so there's nowhere to post.");
  if (!connection) return fail(post.id, "Connect your Meta account first.");
  const ig = found.data.igUserId;
  const token = connection.accessToken;
  const type = post.mediaType as MediaType;

  // Step one: the container, once.
  let containerId = post.containerId;
  if (!containerId) {
    try {
      if (type === "REEL") {
        const url = await videoUrl(post.mediaRefs[0] ?? "");
        if (!url) return fail(post.id, "That video is no longer available.");
        containerId = (await metaGraphRequest<{ id: string }>(`/${ig}/media`, { method: "POST", accessToken: token, params: { media_type: "REELS", video_url: url, caption: post.caption, share_to_feed: "true" } })).id;
      } else if (type === "CAROUSEL") {
        const children: string[] = [];
        for (let i = 0; i < post.mediaRefs.length; i++) {
          children.push((await metaGraphRequest<{ id: string }>(`/${ig}/media`, { method: "POST", accessToken: token, params: { image_url: mediaUrl(post.id, i), is_carousel_item: "true" } })).id);
        }
        containerId = (await metaGraphRequest<{ id: string }>(`/${ig}/media`, { method: "POST", accessToken: token, params: { media_type: "CAROUSEL", children: children.join(","), caption: post.caption } })).id;
      } else {
        containerId = (await metaGraphRequest<{ id: string }>(`/${ig}/media`, { method: "POST", accessToken: token, params: { image_url: mediaUrl(post.id, 0), caption: post.caption } })).id;
      }
    } catch (error) {
      const attempts = post.attempts + 1;
      const message = toFailure(error, "Instagram wouldn't accept the media.").error.message;
      if (attempts >= MAX_ATTEMPTS) return fail(post.id, message);
      await db.instagramPost.update({ where: { id: post.id }, data: { attempts, error: message } });
      return { status: "SCHEDULED", message };
    }
    await db.instagramPost.update({ where: { id: post.id }, data: { containerId, igUserId: ig, status: "CREATED", attempts: post.attempts + 1, error: null } });
  } else {
    await db.instagramPost.update({ where: { id: post.id }, data: { attempts: post.attempts + 1 } });
  }

  // Step two: wait for Instagram to finish processing, within the budget.
  for (;;) {
    let statusCode = "IN_PROGRESS";
    try {
      statusCode = (await metaGraphRequest<{ status_code?: string }>(`/${containerId}`, { accessToken: token, params: { fields: "status_code" } })).status_code ?? "FINISHED";
    } catch {
      statusCode = "IN_PROGRESS";
    }
    if (statusCode === "FINISHED") break;
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      return fail(post.id, type === "REEL" ? "Instagram couldn't process the video. Reels need an MP4 or MOV between 3 seconds and 15 minutes." : "Instagram couldn't process the picture.");
    }
    if (Date.now() + 3_000 > deadline) {
      const tries = post.attempts + 1;
      if (tries >= MAX_ATTEMPTS) return fail(post.id, "Instagram never finished processing this post.");
      await db.instagramPost.update({ where: { id: post.id }, data: { error: "Instagram is still processing this — MAIRO publishes it at the next check." } });
      return { status: "CREATED", message: "Still processing." };
    }
    await sleep(3_000);
  }

  // Step three: publish.
  try {
    const published = await metaGraphRequest<{ id: string }>(`/${ig}/media_publish`, { method: "POST", accessToken: token, params: { creation_id: containerId } });
    let permalink: string | null = null;
    try {
      permalink = (await metaGraphRequest<{ permalink?: string }>(`/${published.id}`, { accessToken: token, params: { fields: "permalink" } })).permalink ?? null;
    } catch {
      // Live either way; a missing link isn't a failed post.
    }
    await db.instagramPost.update({ where: { id: post.id }, data: { status: "PUBLISHED", mediaId: published.id, permalink, postedAt: new Date(), error: null } });
    return { status: "PUBLISHED", message: "Posted to your Instagram.", permalink };
  } catch (error) {
    const message = toFailure(error, "Instagram took the post but wouldn't publish it.").error.message;
    await db.instagramPost.update({ where: { id: post.id }, data: { error: message } });
    return { status: "CREATED", message };
  }
}

/** Publishes whatever is due, within a time budget. Called by the daily runs and when the business opens MAIRO. */
export async function publishDuePosts(opts: { organizationId?: string; limit?: number; budgetMs?: number } = {}): Promise<{ published: number; pending: number; failed: number }> {
  const deadline = Date.now() + (opts.budgetMs ?? 25_000);
  const now = new Date();
  const rows = await db.instagramPost.findMany({
    where: {
      ...(opts.organizationId ? { organizationId: opts.organizationId } : {}),
      OR: [
        { status: "SCHEDULED", approvedAt: { not: null }, OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }] },
        { status: "CREATED", attempts: { lt: MAX_ATTEMPTS } },
      ],
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: opts.limit ?? 10,
    select: { id: true },
  });
  const result = { published: 0, pending: 0, failed: 0 };
  for (const r of rows) {
    const left = deadline - Date.now();
    if (left < 5_000) break;
    const outcome = await publishPost(r.id, { budgetMs: Math.min(left - 2_000, 20_000) }).catch((error) => {
      console.error("Social publish failed:", r.id, error);
      return { status: "SCHEDULED" as const, message: "error" };
    });
    if (outcome.status === "PUBLISHED") result.published++;
    else if (outcome.status === "FAILED" || outcome.status === "PAUSED") result.failed++;
    else result.pending++;
  }
  return result;
}
