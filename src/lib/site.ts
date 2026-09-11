// Where this deployment lives, and what it calls itself.
//
// One place, because four different things need the absolute URL — the sitemap,
// robots.txt, the canonical tag and the social preview image — and a link that
// disagrees with the others is worse than no link at all. A social card built
// on a relative URL silently renders as a broken image in every preview.
//
// Resolution order is deliberate: an explicit setting wins, because a custom
// domain is the one thing the deployment cannot work out for itself; Vercel's
// production domain is the reliable fallback; and localhost is last, so a
// developer gets working absolute URLs without configuring anything.

export const SITE_NAME = "MAIRO";

/**
 * What MAIRO is, in one sentence, for search results and social previews.
 *
 * Both networks are named on purpose. The old description said only Meta,
 * which stopped being true the day TikTok shipped — and a description that
 * undersells the product is a worse problem than a missing one, because it is
 * the sentence a stranger decides on.
 */
export const SITE_DESCRIPTION =
  "MAIRO plans, writes and runs your Meta and TikTok ads for you. No ads manager, no jargon — " +
  "tell it what you sell and it handles the rest.";

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

/** An absolute URL for a path on this deployment. */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The pages a search engine should see.
 *
 * Everything behind a login is deliberately absent, and robots.ts disallows
 * those paths as well — a signed-out crawler following a link to /dashboard
 * gets a redirect to the sign-in page, and a search result promising somebody's
 * dashboard that lands on a login form is a bad result for everyone.
 */
export const PUBLIC_ROUTES = [
  { path: "/", priority: 1, changeFrequency: "weekly" as const },
  { path: "/for-freelancers", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/sign-up", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/sign-in", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" as const },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" as const },
  { path: "/data-deletion", priority: 0.2, changeFrequency: "yearly" as const },
];

/** Everything behind a login, kept out of both the sitemap and the crawl. */
export const PRIVATE_PREFIXES = [
  "/dashboard",
  "/aios",
  "/clients",
  "/onboarding",
  "/setup",
  "/api",
];
