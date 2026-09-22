import type { CampaignAdSource, SalesAdSource } from "@/generated/prisma/enums";

// What a shop's ads are made of, in the parts that are safe everywhere.
//
// Split from src/lib/meta/sales-sources.ts, which makes the Graph calls and so
// reaches the database and the token store. The picker is a client component:
// importing the Graph module for one label function pulled Prisma into the
// browser bundle and broke the build outright. Shapes and rules live here,
// network calls live there.

export type PagePost = {
  /** Meta's own {page-id}_{post-id}, which is what an ad creative wants. */
  id: string;
  message: string | null;
  imageUrl: string | null;
  permalink: string | null;
  createdAt: string | null;
};

/**
 * A short, readable name for a post, for the place it is echoed back.
 *
 * A post has no title — only a body that may be a paragraph or may be empty —
 * so the first line is used, cut at a length that still fits on one row, and a
 * photo with no words at all is named as what it is rather than as a blank.
 */
export function describePost(post: PagePost, max = 60): string {
  const firstLine = post.message?.split("\n").find((l) => l.trim().length > 0)?.trim();
  if (!firstLine) return "Photo post";
  return firstLine.length > max ? `${firstLine.slice(0, max - 1).trimEnd()}…` : firstLine;
}

/**
 * The post to run as this business's ads, or null.
 *
 * Both halves are required and the pair is the whole rule. A business that
 * picked "run one of my posts" but never chose which has nothing to run, and a
 * post id left behind by somebody who has since switched back to MAIRO writing
 * the ads must not quietly keep boosting a post they stopped choosing.
 */
export function postToBoost(organization: {
  salesAdSource: SalesAdSource;
  boostPostId: string | null;
}): string | null {
  if (organization.salesAdSource !== "EXISTING_POST") return null;
  return organization.boostPostId ?? null;
}

export type MetaPostToRun = { facebookPostId: string | null; instagramMediaId: string | null };

/**
 * The post a campaign's Meta ad runs, if any.
 *
 * The campaign's own answer wins, including "make me an ad", so a business
 * with a post picked on Sales setup can still run a generated ad for one
 * campaign. A campaign that never answered follows the business-wide choice.
 */
export function metaPostToRun(
  campaign: {
    adSource: CampaignAdSource | null;
    boostPostId: string | null;
    boostInstagramMediaId: string | null;
  },
  organization: { salesAdSource: SalesAdSource; boostPostId: string | null },
): MetaPostToRun {
  const none = { facebookPostId: null, instagramMediaId: null };
  switch (campaign.adSource) {
    case "FACEBOOK_POST":
      return { ...none, facebookPostId: campaign.boostPostId };
    case "INSTAGRAM_POST":
      return { ...none, instagramMediaId: campaign.boostInstagramMediaId };
    case "CREATIVE":
      return none;
    default:
      return { ...none, facebookPostId: postToBoost(organization) };
  }
}

/** Meta's {page-id}_{post-id} for a Facebook post. */
export const FACEBOOK_POST_ID = /^\d+_\d+$/;
/** An Instagram media id. */
export const INSTAGRAM_MEDIA_ID = /^\d+$/;
