// A guided search of Meta's public Ad Library — not automated research.
//
// The Ad Library shows ads currently running from any Facebook Page, but its
// API only covers ads about social issues, elections or politics (and ads
// shown in the EU), so MAIRO doesn't scrape it or claim to. This builds the
// search link, gives a template for writing down what you see, and turns those
// notes into original test ideas for your own business.
//
// What the Library can't tell you: spend, results, or whether an ad works. An
// ad that has run for months may be profitable, forgotten, or a brand ad;
// the mix of formats isn't the mix of spend.

export const AD_LIBRARY_COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "ALL", name: "All countries" },
] as const;

export function adLibraryUrl(query: string, country: string): string | null {
  const q = query.trim();
  if (!q || q.length > 100) return null;
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: AD_LIBRARY_COUNTRIES.some((c) => c.code === country) ? country : "US",
    q,
    search_type: "keyword_unordered",
    media_type: "all",
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

export type AdNote = {
  /** What the ad opens with, in your words. */
  hook: string;
  /** The offer or reason to act, if any. */
  offer: string;
  format: "picture" | "video" | "carousel" | "other" | "";
  /** "Started running on" as the Library shows it. */
  since: string;
  notes: string;
};

export const CAVEATS = [
  "Long-running ads aren't proof of profit — they may be working, forgotten or brand ads.",
  "The Library doesn't show spend or results, so the mix of formats isn't the mix of spend.",
  "Write your own ads from the ideas. Copying another business's words, pictures or video isn't allowed and won't build your brand.",
];

/** Turns notes on others' ads into testable ideas for your own — angles, not copies. */
export function hypothesesFrom(notes: AdNote[], ownOffering: string): string[] {
  const out: string[] = [];
  const offering = ownOffering.trim() || "your offer";
  const filled = notes.filter((n) => n.hook.trim() || n.offer.trim());
  const formats = filled.map((n) => n.format).filter(Boolean);
  const video = formats.filter((f) => f === "video").length;
  if (filled.some((n) => n.offer.trim())) out.push(`Others lead with an offer. Test whether a real offer of your own beats your current opening for ${offering} — only one you actually run.`);
  if (filled.some((n) => /\?/.test(n.hook))) out.push(`Some open with a question about the situation. Test a situation-based opening for ${offering} against a result-based one.`);
  if (video > 0 && video >= formats.length / 2) out.push(`Video is common in what you saw (not necessarily where the money goes). If you can film a 15-second clip of ${offering} in action, test it against your best picture.`);
  if (filled.length) out.push(`Write down what none of them say that's true about you — your area, your process, a promise you really keep — and test leading with that.`);
  return out.slice(0, 4);
}
