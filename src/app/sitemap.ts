import type { MetadataRoute } from "next";
import { absoluteUrl, PUBLIC_ROUTES } from "@/lib/site";

// The list of pages worth indexing.
//
// Only the public ones. Everything behind a login is absent here and disallowed
// in robots.ts, because a search result that promises somebody's dashboard and
// delivers a login form is a bad result — for the person who clicked it, and
// for how the site is ranked afterwards.

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
