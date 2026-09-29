import { CAPTION_MAX } from "./constants";

// The rules for Scale's Instagram and Facebook posting, kept pure so
// scripts/check-social-scheduler.ts can check each one.

export const MEDIA_TYPES = ["IMAGE", "CAROUSEL", "REEL"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_LABEL: Record<MediaType, string> = { IMAGE: "Photo", CAROUSEL: "Carousel", REEL: "Reel" };

/** Where a post goes: the Instagram feed, or the business's Facebook Page. */
export const NETWORKS = ["INSTAGRAM", "FACEBOOK"] as const;
export type Network = (typeof NETWORKS)[number];
export const NETWORK_NAME: Record<Network, string> = { INSTAGRAM: "Instagram", FACEBOOK: "Facebook" };

/** What each kind of post is called on Facebook, where Reels are just videos. */
const FACEBOOK_LABEL: Record<MediaType, string> = { IMAGE: "Photo", CAROUSEL: "Multi-photo", REEL: "Video" };
export function mediaLabel(type: MediaType, network: Network = "INSTAGRAM"): string {
  return network === "FACEBOOK" ? FACEBOOK_LABEL[type] : MEDIA_LABEL[type];
}

/** Facebook allows far longer posts; MAIRO keeps them readable. */
export const FACEBOOK_TEXT_MAX = 5000;
export function captionMax(network: Network = "INSTAGRAM"): number {
  return network === "FACEBOOK" ? FACEBOOK_TEXT_MAX : CAPTION_MAX;
}

export function asNetwork(value: string | null | undefined): Network {
  return value === "FACEBOOK" ? "FACEBOOK" : "INSTAGRAM";
}

/** Instagram's carousel limits. */
export const CAROUSEL_MIN = 2;
export const CAROUSEL_MAX = 10;
/** How far ahead a post can be scheduled. */
export const MAX_DAYS_AHEAD = 75;
/** After this many tries a post that won't publish is marked failed. */
export const MAX_ATTEMPTS = 6;

/** Feed pictures must be between 4:5 (portrait) and 1.91:1 (landscape). */
export const MIN_RATIO = 4 / 5;
export const MAX_RATIO = 1.91;
export const MAX_WIDTH = 1440;

export type MediaRef = string;

export function refKind(ref: MediaRef): "image" | "video" | null {
  if (ref.startsWith("creative:") || ref.startsWith("studio:")) return "image";
  if (ref.startsWith("video:")) return "video";
  return null;
}

export function validatePost(input: { mediaType: MediaType; refs: MediaRef[]; caption: string; network?: Network }): string | null {
  const caption = input.caption.trim();
  const facebook = input.network === "FACEBOOK";
  if (!caption) return facebook ? "The post needs some text." : "The post needs a caption.";
  if (facebook) {
    if (caption.length > FACEBOOK_TEXT_MAX) return `That post is ${caption.length} characters — keep it under ${FACEBOOK_TEXT_MAX}.`;
  } else {
    if (caption.length > CAPTION_MAX) return `That caption is ${caption.length} characters and Instagram's limit is ${CAPTION_MAX}.`;
    if ((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > 30) return "Instagram allows at most 30 hashtags in a post.";
  }
  const kinds = input.refs.map(refKind);
  if (kinds.some((k) => k === null)) return "One of those pictures can't be posted.";
  if (input.mediaType === "IMAGE") {
    if (input.refs.length !== 1 || kinds[0] !== "image") return "Pick one picture for a photo post.";
  } else if (input.mediaType === "CAROUSEL") {
    const what = facebook ? "A multi-photo post" : "A carousel";
    if (input.refs.length < CAROUSEL_MIN || input.refs.length > CAROUSEL_MAX) return `${what} takes ${CAROUSEL_MIN} to ${CAROUSEL_MAX} pictures.`;
    if (kinds.some((k) => k !== "image")) return `${what} here is pictures only.`;
    if (new Set(input.refs).size !== input.refs.length) return "Each picture can only be in the post once.";
  } else {
    if (input.refs.length !== 1 || kinds[0] !== "video") return facebook ? "Pick one video." : "Pick one video for a Reel.";
  }
  return null;
}

/** Whether a scheduled time is acceptable. Null time means "post now". */
export function validateWhen(when: Date | null, now = new Date()): string | null {
  if (!when) return null;
  if (Number.isNaN(when.getTime())) return "That time isn't valid.";
  if (when.getTime() < now.getTime() - 60_000) return "That time has already passed.";
  if (when.getTime() > now.getTime() + MAX_DAYS_AHEAD * 86_400_000) return `Posts can be scheduled up to ${MAX_DAYS_AHEAD} days ahead.`;
  return null;
}

/**
 * The canvas a picture goes onto so Instagram accepts it: never cropped —
 * padded to the nearest allowed shape — and no wider than 1440px.
 */
export function feedCanvas(width: number, height: number): { width: number; height: number; imageWidth: number; imageHeight: number } {
  const scale = Math.min(1, MAX_WIDTH / Math.max(width, 1));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const ratio = w / h;
  if (ratio < MIN_RATIO) return { width: Math.round(h * MIN_RATIO), height: h, imageWidth: w, imageHeight: h };
  if (ratio > MAX_RATIO) return { width: w, height: Math.round(w / MAX_RATIO), imageWidth: w, imageHeight: h };
  return { width: w, height: h, imageWidth: w, imageHeight: h };
}

/** Local wall-clock times for a week's plan: the next `count` days at `hour`, every other day. */
export function planSlots(count: number, todayLocal: string, hour: number): string[] {
  const [y, m, d] = todayLocal.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; out.length < count; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + 1 + i * 2));
    out.push(`${day.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`);
  }
  return out;
}

/** Which posts the runner should look at now. */
export function isDuePost(p: { status: string; scheduledFor: Date | null; approvedAt: Date | null; attempts: number }, now = new Date()): boolean {
  if (p.status === "CREATED") return p.attempts < MAX_ATTEMPTS;
  if (p.status !== "SCHEDULED" || !p.approvedAt) return false;
  return !p.scheduledFor || p.scheduledFor.getTime() <= now.getTime();
}
