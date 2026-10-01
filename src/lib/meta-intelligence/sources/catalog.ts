import type { Authority } from "@/lib/platform-intelligence/types";

// The sources Meta Intelligence watches. Official Meta sources first, with the
// highest authority; more can be added later (TRUSTED), but nothing changes
// product behaviour on the strength of a blog post, a social post or a rumour.
//
// Every source must live on an allowlisted host. The fetcher refuses anything
// else, including a redirect that leaves the allowlist, so a source entry
// can't be turned into a way to make MAIRO fetch an arbitrary URL.

export type SourceKind = "CHANGELOG" | "VERSIONS" | "DOCS" | "HELP_CENTER" | "ANNOUNCEMENTS";

export type SourceDef = { key: string; name: string; url: string; kind: SourceKind; authority: Authority };

/** Hosts Meta itself runs. OFFICIAL authority only comes from these. */
export const OFFICIAL_HOSTS = ["developers.facebook.com", "www.facebook.com", "facebook.com", "about.fb.com", "business.instagram.com", "www.meta.com", "transparency.meta.com"];

/** Hosts an admin may add as TRUSTED later. Empty until someone vouches for one. */
export const TRUSTED_HOSTS: string[] = [];

export const OFFICIAL_SOURCES: SourceDef[] = [
  { key: "meta.marketing-api.changelog", name: "Marketing API changelog", url: "https://developers.facebook.com/docs/marketing-api/marketing-api-changelog/", kind: "CHANGELOG", authority: "OFFICIAL" },
  { key: "meta.graph-api.changelog", name: "Graph API changelog", url: "https://developers.facebook.com/docs/graph-api/changelog/", kind: "CHANGELOG", authority: "OFFICIAL" },
  { key: "meta.graph-api.versions", name: "Graph API versions", url: "https://developers.facebook.com/docs/graph-api/changelog/versions/", kind: "VERSIONS", authority: "OFFICIAL" },
  { key: "meta.marketing-api.docs", name: "Marketing API documentation", url: "https://developers.facebook.com/docs/marketing-api/", kind: "DOCS", authority: "OFFICIAL" },
  { key: "meta.advantage-plus.docs", name: "Advantage+ documentation", url: "https://developers.facebook.com/docs/marketing-api/advantage-plus/", kind: "DOCS", authority: "OFFICIAL" },
  { key: "meta.instagram-platform.changelog", name: "Instagram Platform changelog", url: "https://developers.facebook.com/docs/instagram-platform/changelog/", kind: "CHANGELOG", authority: "OFFICIAL" },
  { key: "meta.pages-api.docs", name: "Facebook Pages API documentation", url: "https://developers.facebook.com/docs/pages-api/", kind: "DOCS", authority: "OFFICIAL" },
  { key: "meta.developers.blog", name: "Meta for Developers blog", url: "https://developers.facebook.com/blog/", kind: "ANNOUNCEMENTS", authority: "OFFICIAL" },
  { key: "meta.business.help", name: "Meta Business Help Center (ads)", url: "https://www.facebook.com/business/help/", kind: "HELP_CENTER", authority: "OFFICIAL" },
  { key: "meta.business.news", name: "Meta for Business news", url: "https://www.facebook.com/business/news", kind: "ANNOUNCEMENTS", authority: "OFFICIAL" },
];

/** The authority a URL can carry. Unknown hosts are UNVERIFIED and never fetched. */
export function authorityFor(url: string): Authority {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return "UNVERIFIED";
    host = u.hostname.toLowerCase();
  } catch {
    return "UNVERIFIED";
  }
  if (OFFICIAL_HOSTS.includes(host)) return "OFFICIAL";
  if (TRUSTED_HOSTS.includes(host)) return "TRUSTED";
  return "UNVERIFIED";
}

/** Whether MAIRO may fetch this URL at all. */
export function fetchable(url: string): boolean {
  return authorityFor(url) !== "UNVERIFIED";
}
