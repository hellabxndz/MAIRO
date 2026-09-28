import type { AdPlatform, CreativeAspect } from "@/generated/prisma/enums";

// The brief the creative director writes to, per network.
//
// MAIRO runs Meta only now (TikTok was retired), so there is one real spec.
// It stays a lookup rather than a constant so a future network gets its own
// instructions rather than Meta's — an ad written for one feed is not an ad
// for another.

export type PlatformCreativeSpec = {
  platform: AdPlatform;
  /** The shapes worth producing for this network, best first. */
  aspects: CreativeAspect[];
  /** Where the ad will actually appear, in the customer's words. */
  placements: string[];
  /** Appended to the creative director's system prompt. */
  direction: string;
  /** How many distinct opening hooks to write. */
  hookVariations: number;
};

const META_SPEC: PlatformCreativeSpec = {
  platform: "META",
  aspects: ["VERTICAL_9_16", "SQUARE_1_1", "PORTRAIT_4_5"],
  placements: [
    "Instagram Reels",
    "Facebook Feed",
    "Instagram Feed",
    "Stories",
  ],
  hookVariations: 1,
  direction: [
    "This is for Meta — Facebook and Instagram.",
    "",
    "The audience is scrolling a feed that already contains advertising, so the ad is allowed to look like one. Production value works in your favour here: a clean product shot, a considered composition and a clear offer read as a business worth buying from.",
    "Formats that belong here: polished product video, single-image ads, carousels for a range or a before-and-after, Stories for something time-limited.",
    "The headline carries the offer. The primary text can afford a second sentence of context because the reader has stopped to read it.",
    "Write for someone who will see this between a friend's holiday photos and another company's ad.",
  ].join("\n"),
};

const GENERIC_SPEC = (platform: AdPlatform): PlatformCreativeSpec => ({
  platform,
  aspects: ["SQUARE_1_1"],
  placements: [],
  hookVariations: 1,
  direction: "Write a straightforward ad concept for this platform.",
});

export function creativeSpecFor(platform: AdPlatform): PlatformCreativeSpec {
  if (platform === "META") return META_SPEC;
  return GENERIC_SPEC(platform);
}

/**
 * The system-prompt addition for one platform.
 *
 * Kept separate from the concept generator so the two can be tested and
 * changed independently — the direction is the part that will be tuned as ads
 * run and their figures come back.
 */
export function creativeDirectionFor(platform: AdPlatform): string {
  const spec = creativeSpecFor(platform);
  const parts = [spec.direction];

  if (spec.hookVariations > 1) {
    parts.push(
      "",
      `Write ${spec.hookVariations} distinct opening hooks under a **Hooks** heading, numbered, one line each.`
    );
  }

  return parts.join("\n");
}

/** The aspect a creative should be produced in for a given network. */
export function defaultAspectFor(platform: AdPlatform): CreativeAspect {
  return creativeSpecFor(platform).aspects[0];
}

export function aspectLabel(aspect: CreativeAspect): string {
  switch (aspect) {
    case "VERTICAL_9_16":
      return "9:16 vertical";
    case "SQUARE_1_1":
      return "1:1 square";
    case "PORTRAIT_4_5":
      return "4:5 portrait";
    case "LANDSCAPE_16_9":
      return "16:9 landscape";
  }
}
