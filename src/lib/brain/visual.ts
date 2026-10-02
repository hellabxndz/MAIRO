// The Business Brain, for pictures: the part of what MAIRO knows that should
// shape an image — the brand's visual direction, preferred creative style,
// colours and mood, what to avoid, and anything sold out that shouldn't be
// featured. Nothing else: no prices, no claims, no offers, because an image
// model turns words into things it draws, and a stray "$1,200" or "free"
// ends up painted on the picture.
//
// Pure; pinned by scripts/check-brain.ts. Creative Studio appends it after
// the customer's own request, so what they asked for always comes first.

type Visual = {
  industry?: string;
  overview?: string;
  brandStyle?: string;
  creativeStyle?: string;
  brandVoice?: string;
  brandColors?: string[];
  avoidClaims?: string[];
  products?: { name: string; status?: string | null }[];
};

const MAX = 700;
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** A short brand brief for an image prompt, or null when MAIRO knows nothing visual yet. */
export function imageBrandDirection(p: Visual): string | null {
  const lines: string[] = [];
  const business = [p.industry?.trim(), p.overview?.trim()].filter(Boolean).join(" — ");
  if (business) lines.push(`The business: ${cut(business, 140)}`);
  const look = [p.brandStyle?.trim(), p.creativeStyle?.trim()].filter(Boolean).join(". ");
  if (look) lines.push(`Visual direction: ${cut(look, 220)}`);
  if (p.brandVoice?.trim()) lines.push(`Mood: ${cut(p.brandVoice.trim(), 100)}`);
  const colours = (p.brandColors ?? []).filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)).slice(0, 4);
  if (colours.length) lines.push(`Brand colours, as accents where natural: ${colours.join(", ")}`);
  const avoid = (p.avoidClaims ?? []).map((a) => a.trim()).filter(Boolean).slice(0, 5);
  if (avoid.length) lines.push(`Avoid: ${cut(avoid.join("; "), 200)}`);
  const sold = (p.products ?? []).filter((x) => x.status === "unavailable").map((x) => x.name).slice(0, 4);
  if (sold.length) lines.push(`Don't feature (currently unavailable): ${sold.join(", ")}`);
  if (lines.length === 0) return null;
  const text = [
    "About the brand (from MAIRO's Business Brain — follow it unless the request above says otherwise; don't add text, prices, logos or claims that weren't asked for):",
    ...lines.map((l) => `- ${l}`),
  ].join("\n");
  return cut(text, MAX);
}

/** The customer's request first, then the brand brief. The request always wins. */
export function withBrandDirection(prompt: string, direction: string | null): string {
  return direction ? `${prompt}\n\n${direction}` : prompt;
}
