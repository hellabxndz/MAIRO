// The help center's categories and search, apart from the articles so the
// browser can use them: the articles are built on the server from deployment
// settings, and only this plain index reaches the search box.

export type HelpCategory = "Getting started" | "Ads and approvals" | "Creative" | "Tracking and results" | "Billing and plans";
export const HELP_CATEGORIES: HelpCategory[] = ["Getting started", "Ads and approvals", "Creative", "Tracking and results", "Billing and plans"];

/** What the search box needs, and nothing else. */
export type HelpIndexEntry = { slug: string; title: string; summary: string; category: HelpCategory; keywords: string[]; text: string };

/**
 * Ranks articles for a query: every word has to appear somewhere; a match in
 * the title counts most, then keywords and the summary, then the body. Pure,
 * so the server (for a search without JavaScript) and the browser agree.
 */
export function searchHelp<T extends Pick<HelpIndexEntry, "title" | "summary" | "keywords" | "text">>(query: string, entries: T[]): T[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1)
    // "credits" finds "credit", "approvals" finds "approval".
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  if (!words.length) return entries;
  const scored: { e: T; score: number }[] = [];
  for (const e of entries) {
    const title = e.title.toLowerCase();
    const near = `${e.summary} ${e.keywords.join(" ")}`.toLowerCase();
    const body = e.text.toLowerCase();
    let score = 0;
    let all = true;
    for (const w of words) {
      const s = (title.includes(w) ? 6 : 0) + (near.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0);
      if (!s) {
        all = false;
        break;
      }
      score += s;
    }
    if (all) scored.push({ e, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.e);
}
