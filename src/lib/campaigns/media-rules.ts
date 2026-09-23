// Meta's rules for the pictures and videos an ad can run, checked before the
// upload rather than discovered at launch.
//
// Two levels, like the campaign review: a problem is something Meta will
// refuse, so the file can't be used; a warning is something Meta accepts but
// that will look worse (cropped, blurry, cut short), said so the customer can
// decide. Pure, so the browser checks a file before sending it and the server
// can check the same numbers again.
//
// Sources: Meta's ad specs for feed, Stories and Reels placements.

export type MediaCheck = {
  problems: string[];
  warnings: string[];
};

export const IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;

/** Meta's cap on an ad image. */
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
/**
 * MAIRO's cap on an uploaded video. Meta takes up to 4GB, but an ad video
 * that size is a film, not an ad, and it has to travel through storage first.
 */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
/** Meta's limits on a video ad's length. */
export const MIN_VIDEO_SECONDS = 1;
export const MAX_VIDEO_SECONDS = 241 * 60;

const MB = 1024 * 1024;

function shape(width: number, height: number): string {
  const r = width / height;
  if (r > 1.7) return "wide (16:9)";
  if (r > 1.1) return "landscape";
  if (r >= 0.9) return "square";
  if (r >= 0.7) return "portrait (4:5)";
  return "tall (9:16)";
}

export function checkImage(input: { type: string; bytes: number; width: number; height: number }): MediaCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!(IMAGE_TYPES as readonly string[]).includes(input.type)) {
    problems.push("Meta takes JPG or PNG pictures. Save it as one of those and try again.");
  }
  if (input.bytes > MAX_IMAGE_BYTES) problems.push("That picture is over 30MB, which is more than Meta accepts.");
  if (input.width < 600 || input.height < 600) {
    problems.push(`That picture is ${input.width}×${input.height}. Meta needs at least 600 pixels on each side.`);
  } else if (input.width < 1080 && input.height < 1080) {
    warnings.push("It's on the small side — 1080 pixels or more looks sharp on phones.");
  }
  const r = input.width / input.height;
  if (r > 1.91 || r < 0.8) {
    warnings.push(`It's ${shape(input.width, input.height)}; feeds show square to 4:5, so Meta will crop the edges there.`);
  }
  return { problems, warnings };
}

export function checkVideo(input: {
  type: string;
  bytes: number;
  width: number;
  height: number;
  durationSec: number;
  /** Also hold it to TikTok's rules, for a campaign that runs there. */
  forTikTok?: boolean;
}): MediaCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (input.forTikTok) {
    if (Number.isFinite(input.durationSec) && input.durationSec >= MIN_VIDEO_SECONDS && input.durationSec < 5) {
      problems.push("TikTok ads need a video of at least 5 seconds.");
    }
    if (Math.min(input.width, input.height) < 540 && Math.min(input.width, input.height) >= 120) {
      problems.push("TikTok needs at least 540 pixels on the short side (for example 540×960).");
    }
    if (input.width > input.height) {
      warnings.push("TikTok is watched on upright phones — a landscape video shows small there. Vertical (9:16) fills the screen.");
    }
  }
  if (!(VIDEO_TYPES as readonly string[]).includes(input.type)) {
    problems.push("Upload an MP4 or MOV video — those are what Meta runs reliably.");
  }
  if (input.bytes > MAX_VIDEO_BYTES) {
    problems.push(`That video is ${Math.round(input.bytes / MB)}MB. The limit here is ${MAX_VIDEO_BYTES / MB}MB — export it smaller and try again.`);
  }
  if (!Number.isFinite(input.durationSec) || input.durationSec < MIN_VIDEO_SECONDS) {
    problems.push("That video is shorter than one second, which Meta won't run.");
  } else if (input.durationSec > MAX_VIDEO_SECONDS) {
    problems.push("That video is longer than Meta's 241-minute limit for ads.");
  } else if (input.durationSec > 60) {
    warnings.push("It's over a minute. Most people decide in the first few seconds — 15 to 30 seconds usually works best.");
  }
  if (input.width < 120 || input.height < 120) {
    problems.push("That video is too small for Meta to run.");
  } else if (Math.min(input.width, input.height) < 720) {
    warnings.push("It's below 720p, so it may look soft on phones.");
  }
  const r = input.width / input.height;
  if (r > 16 / 9 + 0.01) {
    problems.push("That video is wider than 16:9, which Meta doesn't run as an ad.");
  } else if (r > 1.25) {
    warnings.push("It's landscape. It runs in feeds, but vertical (9:16) or square fills far more of a phone screen and suits Stories and Reels.");
  }
  return { problems, warnings };
}

/** Whether a URL is one of this deployment's own public uploads, for this business. */
export function isOwnUpload(url: string, organizationId: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith(".public.blob.vercel-storage.com") &&
      u.pathname.startsWith(`/ad-media/${organizationId}/`)
    );
  } catch {
    return false;
  }
}
