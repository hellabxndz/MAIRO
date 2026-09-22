import type { CreativeStylePreset } from "@/generated/prisma/enums";

// The visual direction each preset adds to a prompt.
//
// A preset is not a filter applied after the fact — it is a paragraph of art
// direction folded into the same prompt the customer's own words go into, so
// "Streetwear" plus "worn by a male model in an underground parking garage"
// reads to the model as one coherent brief rather than two competing ones.
// CUSTOM adds nothing: the customer's own prompt is the whole brief.

export const PRESETS: { key: CreativeStylePreset; label: string; description: string; direction: string }[] = [
  {
    key: "LUXURY_STUDIO",
    label: "Luxury Studio",
    description: "Clean, high-end, considered lighting",
    direction:
      "Luxury studio photography: seamless premium background, soft directional key light, subtle reflections, shallow depth of field, high-end retail catalogue quality.",
  },
  {
    key: "STREETWEAR",
    label: "Streetwear",
    description: "Urban, bold, editorial",
    direction:
      "Streetwear editorial style: gritty urban setting, confident model pose, high contrast, desaturated colour grade with one bold accent colour, magazine-ad energy.",
  },
  {
    key: "MINIMALIST",
    label: "Minimalist",
    description: "Negative space, one focal point",
    direction:
      "Minimalist product photography: plain single-colour background, generous negative space, one clear focal point, soft even lighting, no clutter.",
  },
  {
    key: "LIFESTYLE",
    label: "Lifestyle",
    description: "Real setting, real use",
    direction:
      "Lifestyle photography: natural setting where this product is actually used, candid unposed feel, warm natural light, a real moment rather than a studio shot.",
  },
  {
    key: "CINEMATIC",
    label: "Cinematic",
    description: "Dramatic, moody, film-like",
    direction:
      "Cinematic advertising still: dramatic directional lighting, moody colour grade, film-grain quality, wide aspect composition, a sense of a bigger story.",
  },
  {
    key: "PRODUCT_PHOTOGRAPHY",
    label: "Product Photography",
    description: "Sharp, accurate, e-commerce ready",
    direction:
      "Professional product photography: neutral studio background, even shadowless lighting, sharp focus edge to edge, true-to-life colour — built to sell on its own.",
  },
  {
    key: "URBAN",
    label: "Urban",
    description: "City backdrop, natural light",
    direction:
      "Urban environment: real city backdrop — street, rooftop or transit setting — natural daylight, a sense of place and movement around the product.",
  },
  {
    key: "HIGH_FASHION",
    label: "High Fashion",
    description: "Runway-grade, striking",
    direction:
      "High fashion editorial: striking pose, dramatic studio or location lighting, a strong single mood, the kind of image a fashion magazine would run.",
  },
  {
    key: "FITNESS",
    label: "Fitness",
    description: "Energetic, athletic, in motion",
    direction:
      "Fitness advertising: athletic setting or gym environment, dynamic pose suggesting motion or effort, energetic bright lighting, motivational feel.",
  },
  {
    key: "FOOD_PHOTOGRAPHY",
    label: "Food Photography",
    description: "Appetising, styled, close",
    direction:
      "Professional food photography: styled plating, appetising close composition, warm natural light, shallow depth of field on the dish itself.",
  },
  {
    key: "TECHNOLOGY",
    label: "Technology",
    description: "Sleek, modern, precise",
    direction:
      "Technology product advertising: sleek modern surface, cool precise lighting, subtle reflections, a clean forward-looking feel.",
  },
  {
    key: "CUSTOM",
    label: "Custom",
    description: "Just your own words",
    direction: "",
  },
];

export function presetInfo(key: CreativeStylePreset) {
  return PRESETS.find((p) => p.key === key) ?? PRESETS[PRESETS.length - 1];
}

/** Folds a preset's direction and the customer's own words into one brief. */
export function buildPrompt(preset: CreativeStylePreset | null, customPrompt: string): string {
  const direction = preset ? presetInfo(preset).direction : "";
  const trimmed = customPrompt.trim();
  if (!direction) return trimmed;
  if (!trimmed) return direction;
  return `${direction}\n\nSpecifically: ${trimmed}`;
}
