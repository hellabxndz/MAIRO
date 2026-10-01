import type { MetaPlacement } from "@/generated/prisma/enums";
import { placementTargeting } from "@/lib/meta-intelligence/capabilities";

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
  // The positions each choice maps to live in metaCapabilities.placements.
  return placementTargeting(placements);
}
