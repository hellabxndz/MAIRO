import type { MetaPlacement } from "@/generated/prisma/enums";

// Where a Meta ad shows, as four choices instead of Ads Manager's dozen.
//
// No choice at all means Advantage+ placements: Meta spreads the budget across
// everywhere and moves it to what works, which is its own advice and usually
// the cheaper result. The choices exist for the business that knows it only
// wants to be in the feed, or only in Stories.

export const PLACEMENT_OPTIONS: { value: MetaPlacement; label: string; sub: string }[] = [
  { value: "FACEBOOK_FEED", label: "Facebook feed", sub: "Between posts as people scroll Facebook" },
  { value: "INSTAGRAM_FEED", label: "Instagram feed", sub: "Between posts as people scroll Instagram" },
  { value: "STORIES", label: "Stories", sub: "Full screen, between Facebook and Instagram Stories" },
  { value: "REELS", label: "Reels", sub: "Between short videos on Facebook and Instagram" },
];

const PLACEMENT_VALUES = new Set<string>(PLACEMENT_OPTIONS.map((p) => p.value));

export function isPlacement(value: string): value is MetaPlacement {
  return PLACEMENT_VALUES.has(value);
}

/**
 * The placement fields of a Meta targeting spec.
 *
 * Empty returns nothing, which is what switches Advantage+ placements on —
 * sending every position explicitly would not, and would stop Meta adding new
 * ones as they appear.
 */
export function metaPlacementTargeting(placements: MetaPlacement[]): Record<string, string[]> {
  if (placements.length === 0) return {};
  const chosen = new Set(placements);

  const facebook = [
    chosen.has("FACEBOOK_FEED") && "feed",
    chosen.has("STORIES") && "story",
    chosen.has("REELS") && "facebook_reels",
  ].filter((p): p is string => Boolean(p));
  const instagram = [
    chosen.has("INSTAGRAM_FEED") && "stream",
    chosen.has("STORIES") && "story",
    chosen.has("REELS") && "reels",
  ].filter((p): p is string => Boolean(p));

  return {
    publisher_platforms: [
      ...(facebook.length > 0 ? ["facebook"] : []),
      ...(instagram.length > 0 ? ["instagram"] : []),
    ],
    ...(facebook.length > 0 ? { facebook_positions: facebook } : {}),
    ...(instagram.length > 0 ? { instagram_positions: instagram } : {}),
  };
}
