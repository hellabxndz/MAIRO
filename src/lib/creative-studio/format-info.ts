import type { CreativeFormat } from "@/generated/prisma/enums";
import type { NativeSize } from "@/lib/ai/openai-image";

// The client-safe half of format.ts: names, ratios and labels, with no
// dependency on sharp.
//
// Split out on purpose. format.ts's cropToFormat needs sharp, a native image
// library that only runs in Node — pulling it into a client bundle fails the
// build outright (it reaches for `fs`, which does not exist in a browser).
// Everything in THIS file is plain data any component can import, server or
// client, and nothing here may gain a sharp import later without breaking
// that promise again.

export const FORMAT_RATIO: Record<CreativeFormat, number> = {
  SQUARE: 1,
  PORTRAIT: 4 / 5,
  STORY: 9 / 16,
  LANDSCAPE: 16 / 9,
};

export const FORMAT_LABEL: Record<CreativeFormat, { name: string; ratio: string; use: string }> = {
  SQUARE: { name: "Square", ratio: "1:1", use: "Feed ads on every network" },
  PORTRAIT: { name: "Portrait", ratio: "4:5", use: "The tallest most feeds allow before cropping it themselves" },
  STORY: { name: "Story / Reel", ratio: "9:16", use: "Full-screen on a phone — Stories, Reels, TikTok" },
  LANDSCAPE: { name: "Landscape", ratio: "16:9", use: "In-stream video placements" },
};

/**
 * Which native canvas to generate for a target format.
 *
 * SQUARE needs no cropping at all. PORTRAIT and STORY are both narrower than
 * the tall 1024×1536 canvas, so both are generated at that size and cropped
 * to their own ratio afterwards — cropping is free, a second model call is
 * not. LANDSCAPE uses the wide canvas the same way.
 */
export function nativeSizeFor(format: CreativeFormat): NativeSize {
  if (format === "SQUARE") return "1024x1024";
  if (format === "LANDSCAPE") return "1536x1024";
  return "1024x1536"; // PORTRAIT, STORY
}
