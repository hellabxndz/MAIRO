// TikTok's Content Posting API — the one that puts a video on the customer's
// own profile, rather than buying placements for it.
//
// This is a different API to the one next door in client.ts, and almost
// nothing carries over. Different host (open.tiktokapis.com, not
// business-api.tiktok.com). Different auth (a normal OAuth bearer token, not
// an `Access-Token` header). Different envelope: the Business API says
// `code: 0` for success, this one says `error.code === "ok"`, and a call that
// worked still carries an `error` object. Different token entirely — an
// advertiser token from the Business side is rejected here, which is why
// TikTokCreatorConnection exists as its own row.
//
// Every one of those differences fails in a way that blames the wrong thing,
// so they are all handled here and nowhere else.

const CONTENT_API_BASE = "https://open.tiktokapis.com/v2";

/**
 * TikTok's own limits on a posted video, for validating before an upload
 * rather than after one. These are the documented defaults; the per-creator
 * maximum duration comes back from creator_info and overrides the last one.
 */
export const TIKTOK_VIDEO_LIMITS = {
  maxBytes: 4 * 1024 * 1024 * 1024,
  /** TikTok's chunked upload requires 5MB minimum per chunk except the last. */
  minChunkBytes: 5 * 1024 * 1024,
  maxChunkBytes: 64 * 1024 * 1024,
  /** Default ceiling before creator_info says otherwise. */
  defaultMaxDurationSeconds: 600,
  /** A caption longer than this is rejected. */
  maxCaptionChars: 2200,
} as const;

/** Error codes TikTok returns that mean reconnecting is the fix. */
const AUTH_ERRORS = new Set([
  "access_token_invalid",
  "access_token_expired",
  "token_not_found",
  "scope_not_authorized",
  "scope_permission_missed",
]);

/** Codes that mean the creator, not the connection, is the blocker. */
const CREATOR_ERRORS = new Set([
  "spam_risk_too_many_posts",
  "spam_risk_user_banned_from_posting",
  "spam_risk",
  "reached_active_user_cap",
  "unaudited_client_can_only_post_to_private_accounts",
]);

export class TikTokContentError extends Error {
  constructor(
    message: string,
    /** TikTok's `error.code`. Never "ok" — that isn't an error. */
    public readonly code: string,
    public readonly httpStatus: number,
    public readonly logId: string | null,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "TikTokContentError";
  }

  get isAuthProblem(): boolean {
    return AUTH_ERRORS.has(this.code) || this.httpStatus === 401;
  }

  /** The connection is fine; TikTok is refusing on the creator's behalf. */
  get isCreatorProblem(): boolean {
    return CREATOR_ERRORS.has(this.code);
  }

  get isTransient(): boolean {
    return this.httpStatus >= 500 || this.code === "internal_error";
  }
}

type ContentEnvelope<T> = {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string };
};

async function contentRequest<T>(
  path: string,
  accessToken: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${CONTENT_API_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as ContentEnvelope<T> | null;

  if (!json) {
    throw new TikTokContentError(
      `TikTok returned a response that could not be read (HTTP ${res.status}).`,
      "unreadable_response",
      res.status,
      null,
      null
    );
  }

  // Success still carries an error object, with code "ok". Treating the
  // presence of `error` as failure would reject every successful call.
  const code = json.error?.code ?? "ok";
  if (code !== "ok") {
    throw new TikTokContentError(
      json.error?.message || `TikTok refused the request (${code}).`,
      code,
      res.status,
      json.error?.log_id ?? null,
      json
    );
  }

  return json.data as T;
}

// --- what the creator is allowed to post -----------------------------------

export type TikTokCreatorInfo = {
  nickname: string | null;
  username: string | null;
  avatarUrl: string | null;
  /** The privacy settings this creator may choose. Never assume the full set. */
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxDurationSeconds: number;
};

/**
 * What this creator can actually post, asked before posting anything.
 *
 * TikTok requires this call before a direct post, and it is not a formality:
 * a private account cannot choose PUBLIC_TO_EVERYONE, a creator who has been
 * posting heavily is rate-limited, and the maximum video length differs per
 * account. Posting without asking means finding all of that out as a rejection
 * after the bytes have already been uploaded.
 */
export async function fetchCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
  const data = await contentRequest<{
    creator_nickname?: string;
    creator_username?: string;
    creator_avatar_url?: string;
    privacy_level_options?: string[];
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
    max_video_post_duration_sec?: number;
  }>("/post/publish/creator_info/query/", accessToken, {});

  return {
    nickname: data.creator_nickname ?? null,
    username: data.creator_username ?? null,
    avatarUrl: data.creator_avatar_url ?? null,
    privacyLevelOptions: data.privacy_level_options ?? [],
    commentDisabled: data.comment_disabled ?? false,
    duetDisabled: data.duet_disabled ?? false,
    stitchDisabled: data.stitch_disabled ?? false,
    maxDurationSeconds:
      data.max_video_post_duration_sec ?? TIKTOK_VIDEO_LIMITS.defaultMaxDurationSeconds,
  };
}

// --- starting a post -------------------------------------------------------

export type DirectPostInput = {
  caption: string;
  /** Must be one of the creator's own privacyLevelOptions. */
  privacyLevel: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  videoCoverTimestampMs?: number;
};

export type UploadTarget = {
  publishId: string;
  /** Absent when the source was PULL_FROM_URL — TikTok fetches it itself. */
  uploadUrl: string | null;
};

/**
 * Chunking, TikTok's way.
 *
 * The rules are unusual enough to be worth stating: every chunk must be at
 * least 5MB except the final one, no chunk may exceed 64MB, and the count must
 * match the size exactly or the init is rejected. A video under the minimum is
 * sent whole as a single chunk, which is the one case where a sub-5MB chunk is
 * allowed.
 */
export function planChunks(sizeBytes: number): { chunkSize: number; totalChunks: number } {
  if (sizeBytes <= TIKTOK_VIDEO_LIMITS.minChunkBytes) {
    return { chunkSize: sizeBytes, totalChunks: 1 };
  }
  const chunkSize = Math.min(TIKTOK_VIDEO_LIMITS.maxChunkBytes, TIKTOK_VIDEO_LIMITS.minChunkBytes);
  // The remainder rides along with the last chunk rather than becoming an
  // undersized chunk of its own, which TikTok rejects.
  const totalChunks = Math.max(1, Math.floor(sizeBytes / chunkSize));
  return { chunkSize, totalChunks };
}

/** Starts a post that will appear on the creator's profile. */
export async function initDirectPost(
  accessToken: string,
  post: DirectPostInput,
  sizeBytes: number
): Promise<UploadTarget> {
  const { chunkSize, totalChunks } = planChunks(sizeBytes);

  const data = await contentRequest<{ publish_id: string; upload_url?: string }>(
    "/post/publish/video/init/",
    accessToken,
    {
      post_info: {
        title: post.caption,
        privacy_level: post.privacyLevel,
        disable_comment: post.disableComment ?? false,
        disable_duet: post.disableDuet ?? false,
        disable_stitch: post.disableStitch ?? false,
        ...(post.videoCoverTimestampMs !== undefined
          ? { video_cover_timestamp_ms: post.videoCoverTimestampMs }
          : {}),
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: sizeBytes,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks,
      },
    }
  );

  return { publishId: data.publish_id, uploadUrl: data.upload_url ?? null };
}

/**
 * Starts an upload into the creator's TikTok drafts instead of their profile.
 *
 * This is the path that works with only the `video.upload` scope, and the path
 * an app that has not passed TikTok's content audit can use for a public
 * account. The customer opens TikTok and posts it themselves — which is less
 * than "MAIRO posts for you", and is said plainly wherever it is offered
 * rather than being described as posting.
 */
export async function initInboxUpload(
  accessToken: string,
  sizeBytes: number
): Promise<UploadTarget> {
  const { chunkSize, totalChunks } = planChunks(sizeBytes);

  const data = await contentRequest<{ publish_id: string; upload_url?: string }>(
    "/post/publish/inbox/video/init/",
    accessToken,
    {
      source_info: {
        source: "FILE_UPLOAD",
        video_size: sizeBytes,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks,
      },
    }
  );

  return { publishId: data.publish_id, uploadUrl: data.upload_url ?? null };
}

/**
 * Sends one chunk to the URL TikTok handed back.
 *
 * Not a contentRequest: the upload goes to a signed URL on TikTok's storage,
 * takes no bearer token, and answers with a bare status rather than an
 * envelope. The Content-Range header is what makes it a chunk — TikTok
 * reassembles by byte offset, and an off-by-one here produces a video that
 * uploads successfully and then fails to transcode with no explanation.
 */
export async function uploadChunk(
  uploadUrl: string,
  chunk: Uint8Array | Buffer,
  startByte: number,
  totalBytes: number,
  mimeType = "video/mp4"
): Promise<void> {
  const endByte = startByte + chunk.byteLength - 1;
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(chunk.byteLength),
      "Content-Range": `bytes ${startByte}-${endByte}/${totalBytes}`,
    },
    // Node's fetch wants a plain view; a Buffer is one already.
    body: new Uint8Array(chunk),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TikTokContentError(
      `TikTok rejected part of the upload (HTTP ${res.status}).`,
      "upload_failed",
      res.status,
      null,
      text
    );
  }
}

// --- how it went -----------------------------------------------------------

export type PublishState =
  | "PROCESSING_UPLOAD"
  | "PROCESSING_DOWNLOAD"
  | "SEND_TO_USER_INBOX"
  | "PUBLISH_COMPLETE"
  | "FAILED";

export type PublishStatus = {
  state: PublishState;
  /** Set when TikTok failed it. Its own words. */
  failReason: string | null;
  /** Ids of the posts that went live, when any did. */
  publicPostIds: string[];
  uploadedBytes: number | null;
};

/**
 * Where a publish job got to.
 *
 * Polled rather than pushed: TikTok has webhooks for this but they require a
 * publicly reachable endpoint registered on the app, and a deployment without
 * one would silently never learn the outcome. Polling always works.
 */
export async function fetchPublishStatus(
  accessToken: string,
  publishId: string
): Promise<PublishStatus> {
  const data = await contentRequest<{
    status?: string;
    fail_reason?: string;
    // TikTok's own spelling. Kept verbatim so the field is actually found.
    publicaly_available_post_id?: string[];
    uploaded_bytes?: number;
  }>("/post/publish/status/fetch/", accessToken, { publish_id: publishId });

  return {
    state: (data.status as PublishState) ?? "PROCESSING_UPLOAD",
    failReason: data.fail_reason ?? null,
    publicPostIds: data.publicaly_available_post_id ?? [],
    uploadedBytes: data.uploaded_bytes ?? null,
  };
}

/**
 * TikTok's fail_reason codes, in words a business owner can act on.
 *
 * Left as the raw code when it isn't one of these, because an unrecognised
 * code shown verbatim is more useful than a guess dressed up as an
 * explanation.
 */
export function explainPublishFailure(reason: string): string {
  switch (reason) {
    case "file_format_check_failed":
      return "TikTok couldn't read that video file. It needs to be an MP4 or MOV.";
    case "duration_check_failed":
      return "That video is longer than this TikTok account is allowed to post.";
    case "frame_rate_check_failed":
      return "TikTok rejected the video's frame rate. It needs to be between 23 and 60 fps.";
    case "picture_size_check_failed":
      return "TikTok rejected the video's dimensions. Vertical, at least 360px on the short side.";
    case "internal":
      return "TikTok had a problem processing the video. Nothing was posted — worth trying again.";
    case "video_pull_failed":
      return "TikTok couldn't download the video from the link it was given.";
    case "publish_cancelled":
      return "The post was cancelled on TikTok's side before it went live.";
    default:
      return `TikTok refused the post: ${reason}`;
  }
}

/**
 * Whether this deployment can post to TikTok at all.
 *
 * Separate from tiktokConfigured(): the Business API and the Content Posting
 * API are separate registrations on the TikTok developer portal with separate
 * credentials, and a deployment very often has one and not the other.
 */
export function tiktokPostingConfigured(): boolean {
  return Boolean(
    process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim()
  );
}

/**
 * Whether TikTok has audited this app for public posting.
 *
 * Until it has, TikTok restricts everything an unaudited client posts to
 * private (SELF_ONLY), whatever the request asks for. This is not something
 * the API reports, so it is a deployment setting — and it defaults to
 * unaudited, because claiming an audit that hasn't happened means promising a
 * customer a public post and quietly giving them a private one.
 */
export function tiktokPostingAudited(): boolean {
  return process.env.TIKTOK_CONTENT_AUDITED?.trim() === "1";
}
