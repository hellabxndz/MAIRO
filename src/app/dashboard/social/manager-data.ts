import { localInputValue, wallClockInZone } from "@/lib/campaigns/schedule";
import { calendarStatus } from "@/lib/social/goals";
import type { MediaType, Network } from "@/lib/instagram/social-logic";

// What a Social Manager card shows, worked out on the server so the browser
// only gets plain values.

export type CalendarPost = {
  id: string;
  network: Network;
  status: string;
  statusLabel: string;
  tone: "muted" | "attention" | "good" | "info" | "bad";
  mediaType: MediaType;
  contentType: string;
  objective: string;
  rationale: string | null;
  caption: string;
  creativeIdea: string | null;
  previewUrl: string | null;
  /** Pictures as they'll be posted, for the preview. */
  images: string[];
  /** Local date (YYYY-MM-DD) and time (HH:MM), or empty when unscheduled. */
  date: string;
  time: string;
  whenLocal: string;
  step: string | null;
  promotionTitle: string | null;
  autoApproved: boolean;
  suggestedByMairo: boolean;
  error: string | null;
  permalink: string | null;
  likes: number | null;
  comments: number | null;
};

type Row = {
  id: string;
  network: string;
  status: string;
  mediaType: string;
  mediaRefs: string[];
  contentType: string | null;
  objective: string | null;
  rationale: string | null;
  caption: string;
  creativeIdea: string | null;
  previewUrl: string | null;
  scheduledFor: Date | null;
  postedAt: Date | null;
  sequenceStep: string | null;
  autoApproved: boolean;
  suggestedByMairo: boolean;
  error: string | null;
  permalink: string | null;
  likeCount: number | null;
  commentCount: number | null;
  promotion?: { title: string } | null;
};

export function toCalendarPost(p: Row, zone: string): CalendarPost {
  const at = p.scheduledFor ?? p.postedAt;
  const wall = at ? wallClockInZone(at, zone) : "";
  const s = calendarStatus(p);
  return {
    id: p.id,
    network: p.network === "FACEBOOK" ? "FACEBOOK" : "INSTAGRAM",
    status: p.status,
    statusLabel: s.label,
    tone: s.tone,
    mediaType: (["IMAGE", "CAROUSEL", "REEL"].includes(p.mediaType) ? p.mediaType : "IMAGE") as MediaType,
    contentType: p.contentType ?? "Post",
    objective: p.objective ?? "",
    rationale: p.rationale,
    caption: p.caption,
    creativeIdea: p.creativeIdea,
    previewUrl: p.previewUrl,
    images: p.mediaType === "REEL" || p.status === "DRAFT" ? [] : p.mediaRefs.map((_, i) => `/api/social/media/${p.id}/${i}`),
    date: wall.slice(0, 10),
    time: wall.slice(11, 16),
    whenLocal: p.scheduledFor ? localInputValue(p.scheduledFor, zone) : "",
    step: p.sequenceStep,
    promotionTitle: p.promotion?.title ?? null,
    autoApproved: p.autoApproved,
    suggestedByMairo: p.suggestedByMairo,
    error: p.error,
    permalink: p.permalink,
    likes: p.likeCount,
    comments: p.commentCount,
  };
}

export const POST_SELECT = {
  id: true,
  network: true,
  status: true,
  mediaType: true,
  mediaRefs: true,
  contentType: true,
  objective: true,
  rationale: true,
  caption: true,
  creativeIdea: true,
  previewUrl: true,
  scheduledFor: true,
  postedAt: true,
  sequenceStep: true,
  autoApproved: true,
  suggestedByMairo: true,
  error: true,
  permalink: true,
  likeCount: true,
  commentCount: true,
  promotion: { select: { title: true } },
} as const;
