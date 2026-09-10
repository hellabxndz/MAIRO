import type { AdPlatform, CreativeAspect } from "@/generated/prisma/enums";

// What makes an ad work on one network and fail on another.
//
// The requirement this file exists to satisfy is a single sentence — do not
// use the same creative on Meta and TikTok — but the reason is worth writing
// down, because "resize it to 9:16" is the wrong reading of it and the easy
// mistake to make.
//
// A Meta ad and a TikTok ad are different objects. A Meta ad is allowed to
// look like an advertisement: it sits in a feed among other advertisements,
// the audience has scrolled past a thousand of them, and production value
// reads as credibility. A TikTok ad is competing with entertainment, from
// accounts the viewer chose to follow, and anything that announces itself as
// an ad in the first second is swiped away before the second one. The whole
// discipline of TikTok creative is the first three seconds; everything else is
// downstream of whether the hook held.
//
// So this is not a formatting layer. It is two different sets of instructions
// to the writer, and the hook is a first-class field rather than the opening
// line of the body copy — because on TikTok the hook IS the ad, and because
// hook variations are the unit that creative testing compares.

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

const TIKTOK_SPEC: PlatformCreativeSpec = {
  platform: "TIKTOK",
  aspects: ["VERTICAL_9_16"],
  placements: ["TikTok For You feed"],
  hookVariations: 3,
  direction: [
    "This is for TikTok, and TikTok is not a feed of advertising — it is a feed of entertainment that this ad has to survive in.",
    "",
    "Vertical 9:16, full screen, always. Never a letterboxed landscape video and never a repurposed square.",
    "",
    "The first one to three seconds decide everything. If the opening frame reads as an advertisement it is gone before anyone hears a word of it. Open on a person, a problem, a result, or something that does not make sense yet — never on a logo, never on a product on a white background, and never on the words 'introducing' or 'at [business] we'.",
    "",
    "Shoot it like someone made it on their phone, because the ads that work here were. Hand-held, natural light, real room, real person talking to camera. A creator-style piece to camera, an unboxing, a demonstration of the thing actually working, a before-and-after — these outperform anything that looks produced.",
    "Pace it fast. A cut every two or three seconds. Nothing lingers.",
    "Assume the sound is off for the first moment and burn the subtitles in.",
    "If there is a voiceover, write it as somebody talking, not as copy being read.",
    "",
    "Write several genuinely different opening hooks, not the same sentence reworded — a question, a claim, a problem, a result. They are what gets tested against each other.",
    "The written copy matters far less than on Meta. Short, plain, one idea.",
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
  if (platform === "TIKTOK") return TIKTOK_SPEC;
  return GENERIC_SPEC(platform);
}

/**
 * Extra direction for a business with no TikTok following.
 *
 * The thing worth saying to this customer is that it does not matter, and
 * saying it is part of the product — a small business owner who thinks they
 * need an audience before they can advertise on TikTok will not try.
 */
export const GROWTH_MODE_DIRECTION = [
  "",
  "This business has little or no TikTok following, which changes nothing about whether the ad can work — TikTok shows paid content based on what someone watches, not on who they follow. Do not write anything that assumes an existing audience, do not reference their other posts, and do not ask viewers to 'check out our page'.",
  "Write it so it stands completely on its own to somebody who has never heard of this business, and so it would also work as an organic post if they wanted to put it on their profile.",
].join("\n");

/**
 * The system-prompt addition for one platform.
 *
 * Kept separate from the concept generator so the two can be tested and
 * changed independently — the direction is the part that will be tuned as ads
 * run and their figures come back.
 */
export function creativeDirectionFor(
  platform: AdPlatform,
  options: { growthMode?: boolean } = {}
): string {
  const spec = creativeSpecFor(platform);
  const parts = [spec.direction];

  if (spec.hookVariations > 1) {
    parts.push(
      "",
      `Write ${spec.hookVariations} distinct opening hooks under a **Hooks** heading, numbered, one line each.`
    );
  }

  if (options.growthMode && platform === "TIKTOK") {
    parts.push(GROWTH_MODE_DIRECTION);
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
