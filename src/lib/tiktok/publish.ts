import { db } from "@/lib/db";
import type { TikTokPostMode, TikTokPostStatus } from "@/generated/prisma/enums";
import { fail, ok, type PlatformResult } from "@/lib/ad-platforms/types";
import {
  TIKTOK_VIDEO_LIMITS,
  TikTokContentError,
  explainPublishFailure,
  fetchCreatorInfo,
  fetchPublishStatus,
  initDirectPost,
  initInboxUpload,
  planChunks,
  tiktokPostingAudited,
  tiktokPostingConfigured,
  uploadChunk,
  type TikTokCreatorInfo,
} from "@/lib/ad-platforms/tiktok/content";
import {
  loadCreatorCredentials,
  markCreatorProblem,
} from "@/lib/tiktok/creator-connection";

// Posting a video to the customer's own TikTok, end to end.
//
// The rule this file exists to keep is the same one the ads adapters keep: a
// row never says PUBLISHED unless TikTok said so. Every state here comes from
// TikTok's own answer — the init call, the upload's HTTP status, and the
// status poll — and a post MAIRO could not confirm stays PROCESSING rather
// than being optimistically closed out. A customer reading this list is
// entitled to believe it about what is on their profile.
//
// The other thing worth stating up front is what "MAIRO posts for you" can
// honestly mean today, because it has two forms and they are not the same
// promise:
//
//   DIRECT_POST — the video appears on their profile. Needs the video.publish
//   scope AND an app TikTok has audited for content posting.
//
//   INBOX — the video lands in their TikTok drafts and they tap post. Needs
//   only video.upload, and works on an unaudited app.
//
// chooseMode() picks between them from what is actually granted, and the UI
// says which one the customer is going to get before they press the button.
// Describing an inbox upload as "posted" would be the exact kind of lie this
// codebase is built to avoid.

export type PublishInput = {
  organizationId: string;
  caption: string;
  /** An https URL MAIRO can read the video from. */
  videoUrl: string;
  /** From the creator's own options. Ignored when the app is unaudited. */
  privacyLevel?: string;
  creativeRequestId?: string | null;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
};

export type PublishOutcome = {
  postId: string;
  mode: TikTokPostMode;
  status: TikTokPostStatus;
  /** What actually happened, in the customer's terms. */
  message: string;
};

/**
 * Which of the two posting paths this customer is going to get.
 *
 * Returns the reason alongside, because "your video will land in your TikTok
 * drafts" needs a because — otherwise it reads as a bug rather than as the
 * consequence of a permission nobody has granted yet.
 */
export function chooseMode(creds: { canPublish: boolean; canUpload: boolean }): {
  mode: TikTokPostMode | null;
  reason: string;
} {
  if (creds.canPublish && tiktokPostingAudited()) {
    return { mode: "DIRECT_POST", reason: "MAIRO will post this straight to your profile." };
  }
  if (creds.canPublish && !tiktokPostingAudited()) {
    return {
      mode: "INBOX",
      reason:
        "MAIRO will put this in your TikTok drafts. TikTok hasn't finished reviewing MAIRO for " +
        "posting directly to profiles yet, so the last tap is yours.",
    };
  }
  if (creds.canUpload) {
    return {
      mode: "INBOX",
      reason:
        "MAIRO will put this in your TikTok drafts, ready to post. Granting the posting " +
        "permission when you reconnect lets MAIRO publish it for you.",
    };
  }
  return {
    mode: null,
    reason:
      "This TikTok connection can't upload videos. Reconnect TikTok posting and approve the " +
      "video permissions.",
  };
}

/** Caption rules, checked before anything is uploaded. */
export function validateCaption(caption: string): string | null {
  const trimmed = caption.trim();
  if (trimmed.length === 0) return "A TikTok post needs a caption.";
  if (trimmed.length > TIKTOK_VIDEO_LIMITS.maxCaptionChars) {
    return `TikTok captions are limited to ${TIKTOK_VIDEO_LIMITS.maxCaptionChars} characters.`;
  }
  return null;
}

/**
 * The privacy level to actually ask TikTok for.
 *
 * Two constraints, and both are TikTok's rather than choices. An unaudited app
 * may only post privately, whatever is requested — so asking for public would
 * produce a private post and a customer who thinks otherwise. And the creator
 * has their own list of permitted levels, which a private account narrows.
 */
export function resolvePrivacy(
  requested: string | undefined,
  info: TikTokCreatorInfo
): { level: string; note: string | null } {
  if (!tiktokPostingAudited()) {
    return {
      level: "SELF_ONLY",
      note:
        "Posted privately. TikTok only allows public posting from apps it has reviewed for it, " +
        "and MAIRO's review is still open — you can switch the post to public in TikTok itself.",
    };
  }

  const options = info.privacyLevelOptions;
  if (requested && options.includes(requested)) return { level: requested, note: null };

  const fallback = options.includes("PUBLIC_TO_EVERYONE")
    ? "PUBLIC_TO_EVERYONE"
    : (options[0] ?? "SELF_ONLY");

  return {
    level: fallback,
    note: requested
      ? `Your TikTok account doesn't allow ${requested.toLowerCase().replace(/_/g, " ")}, so this went out as ${fallback.toLowerCase().replace(/_/g, " ")}.`
      : null,
  };
}

/**
 * Fetches the video MAIRO is about to post.
 *
 * Buffered rather than streamed on purpose: TikTok's init call has to be told
 * the exact byte count up front, and a Content-Length TikTok disagrees with
 * fails the whole upload after it has been sent. Knowing the size means
 * knowing it, not estimating it.
 */
async function fetchVideo(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Couldn't download the video to post (HTTP ${res.status}).`);
  }
  const mimeType = res.headers.get("content-type")?.split(";")[0] ?? "video/mp4";
  const bytes = Buffer.from(await res.arrayBuffer());

  if (bytes.byteLength === 0) throw new Error("That video file is empty.");
  if (bytes.byteLength > TIKTOK_VIDEO_LIMITS.maxBytes) {
    throw new Error("That video is larger than TikTok accepts.");
  }
  return { bytes, mimeType };
}

/**
 * Sends the whole file, chunk by chunk, exactly as the init call was told it
 * would be. The final chunk carries the remainder, which is why its end offset
 * is the file's last byte rather than a multiple of the chunk size.
 */
async function uploadAll(
  uploadUrl: string,
  bytes: Buffer,
  mimeType: string
): Promise<void> {
  const { chunkSize, totalChunks } = planChunks(bytes.byteLength);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const isLast = i === totalChunks - 1;
    const end = isLast ? bytes.byteLength : start + chunkSize;
    await uploadChunk(uploadUrl, bytes.subarray(start, end), start, bytes.byteLength, mimeType);
  }
}

/**
 * Posts one video to the customer's TikTok.
 *
 * Never throws. Every failure that a business owner could plausibly hit — not
 * connected, wrong permission, TikTok refusing the file, TikTok having a bad
 * afternoon — comes back as a typed failure with something they can act on,
 * and the TikTokPost row is left in the state that actually happened.
 */
export async function publishToTikTok(
  input: PublishInput
): Promise<PlatformResult<PublishOutcome>> {
  if (!tiktokPostingConfigured()) {
    return fail(
      "not_implemented",
      "TikTok posting isn't configured on this deployment yet. It needs TIKTOK_CLIENT_KEY and " +
        "TIKTOK_CLIENT_SECRET, which are separate from the advertising credentials."
    );
  }

  const captionProblem = validateCaption(input.caption);
  if (captionProblem) return fail("rejected", captionProblem);

  const creds = await loadCreatorCredentials(input.organizationId);
  if (!creds) {
    return fail(
      "not_connected",
      "MAIRO doesn't have permission to post on your TikTok. Connect TikTok posting in Settings."
    );
  }

  const { mode, reason } = chooseMode(creds);
  if (!mode) return fail("insufficient_scope", reason);

  // The row is written before anything reaches TikTok, so a crash mid-upload
  // leaves a record of an attempt rather than nothing at all.
  const post = await db.tikTokPost.create({
    data: {
      organizationId: input.organizationId,
      creativeRequestId: input.creativeRequestId ?? null,
      caption: input.caption.trim(),
      mode,
      status: "UPLOADING",
      sourceUrl: input.videoUrl,
      privacyLevel: "SELF_ONLY",
    },
  });

  try {
    const { bytes, mimeType } = await fetchVideo(input.videoUrl);

    let publishId: string;
    let uploadUrl: string | null;
    let privacyNote: string | null = null;

    if (mode === "DIRECT_POST") {
      // Required by TikTok before a direct post, and genuinely load-bearing:
      // it is what says which privacy levels this creator may use.
      const info = await fetchCreatorInfo(creds.accessToken);
      const privacy = resolvePrivacy(input.privacyLevel, info);
      privacyNote = privacy.note;

      const target = await initDirectPost(
        creds.accessToken,
        {
          caption: input.caption.trim(),
          privacyLevel: privacy.level,
          // A creator who has turned comments off account-wide cannot have
          // them on for one post; asking anyway is rejected.
          disableComment: input.disableComment ?? info.commentDisabled,
          disableDuet: input.disableDuet ?? info.duetDisabled,
          disableStitch: input.disableStitch ?? info.stitchDisabled,
        },
        bytes.byteLength
      );
      publishId = target.publishId;
      uploadUrl = target.uploadUrl;

      await db.tikTokPost.update({
        where: { id: post.id },
        data: { privacyLevel: privacy.level },
      });
    } else {
      const target = await initInboxUpload(creds.accessToken, bytes.byteLength);
      publishId = target.publishId;
      uploadUrl = target.uploadUrl;
    }

    if (!uploadUrl) {
      throw new Error("TikTok accepted the post but gave MAIRO nowhere to upload the video to.");
    }

    await db.tikTokPost.update({
      where: { id: post.id },
      data: { publishId, sizeBytes: bytes.byteLength },
    });

    await uploadAll(uploadUrl, bytes, mimeType);

    // Uploaded is not published. TikTok transcodes afterwards and can still
    // refuse, so the row says PROCESSING and the outcome is learned by polling.
    await db.tikTokPost.update({
      where: { id: post.id },
      data: { status: "PROCESSING" },
    });

    const messageParts = [
      mode === "DIRECT_POST"
        ? "Sent to TikTok. It usually appears on your profile within a minute."
        : "Uploaded to your TikTok drafts. Open TikTok and post it whenever you like.",
      privacyNote,
    ].filter(Boolean);

    return ok({
      postId: post.id,
      mode,
      status: "PROCESSING",
      message: messageParts.join(" "),
    });
  } catch (error) {
    const message = await recordFailure(post.id, input.organizationId, error);
    if (error instanceof TikTokContentError && error.isAuthProblem) {
      return fail("not_connected", message, error.body);
    }
    if (error instanceof TikTokContentError && error.isTransient) {
      return fail("unavailable", message, error.body);
    }
    return fail("rejected", message, error);
  }
}

/** Writes the failure onto the row and returns what to tell the customer. */
async function recordFailure(
  postId: string,
  organizationId: string,
  error: unknown
): Promise<string> {
  let message: string;

  if (error instanceof TikTokContentError) {
    if (error.isAuthProblem) {
      await markCreatorProblem(
        organizationId,
        "TOKEN_EXPIRED",
        "TikTok's posting permission has expired or been revoked. Reconnect it."
      );
      message =
        "TikTok's posting permission has expired or been revoked. Reconnect TikTok posting in Settings.";
    } else if (error.isCreatorProblem) {
      message = `TikTok wouldn't accept this post: ${error.message}`;
    } else if (error.isTransient) {
      message = "TikTok didn't respond. Nothing was posted — worth trying again shortly.";
    } else {
      message = `TikTok refused the post: ${error.message}`;
    }
  } else {
    message = error instanceof Error ? error.message : "Couldn't post to TikTok.";
  }

  await db.tikTokPost
    .update({ where: { id: postId }, data: { status: "FAILED", error: message } })
    .catch(() => undefined);

  return message;
}

/**
 * Asks TikTok what became of a post and writes the answer down.
 *
 * Called when the customer opens the page rather than on a schedule, which is
 * the right trade for something that resolves in under a minute and that only
 * matters when somebody is looking at it.
 */
export async function refreshPostStatus(postId: string): Promise<void> {
  const post = await db.tikTokPost.findUnique({ where: { id: postId } });
  if (!post?.publishId) return;
  if (post.status === "PUBLISHED" || post.status === "FAILED") return;

  const creds = await loadCreatorCredentials(post.organizationId);
  if (!creds) return;

  try {
    const status = await fetchPublishStatus(creds.accessToken, post.publishId);

    if (status.state === "PUBLISH_COMPLETE") {
      const [firstPostId] = status.publicPostIds;
      await db.tikTokPost.update({
        where: { id: postId },
        data: {
          status: "PUBLISHED",
          postedAt: new Date(),
          // Built from the creator's own handle; TikTok returns the post id
          // and not a URL. Without a handle there is nothing honest to link to.
          postUrl:
            firstPostId && creds.username
              ? `https://www.tiktok.com/@${creds.username}/video/${firstPostId}`
              : null,
          error: null,
        },
      });
      return;
    }

    if (status.state === "SEND_TO_USER_INBOX") {
      await db.tikTokPost.update({
        where: { id: postId },
        data: { status: "IN_TIKTOK_DRAFTS", postedAt: new Date(), error: null },
      });
      return;
    }

    if (status.state === "FAILED") {
      await db.tikTokPost.update({
        where: { id: postId },
        data: {
          status: "FAILED",
          error: status.failReason
            ? explainPublishFailure(status.failReason)
            : "TikTok refused the post and didn't say why.",
        },
      });
      return;
    }

    // Still working. Left as PROCESSING rather than nudged forward.
  } catch {
    // A failed poll says nothing about the post. Leaving the row alone is
    // correct: the next look asks again.
  }
}

/** Brings every unfinished post for an organization up to date. */
export async function refreshPendingPosts(organizationId: string): Promise<void> {
  const pending = await db.tikTokPost.findMany({
    where: { organizationId, status: { in: ["UPLOADING", "PROCESSING"] } },
    select: { id: true },
    take: 20,
  });
  await Promise.all(pending.map((p) => refreshPostStatus(p.id)));
}
