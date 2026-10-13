import type { MetadataRoute } from "next";
import { absoluteUrl, PUBLIC_ROUTES } from "@/lib/site";
import { TOOLS, usable } from "@/lib/tools/registry";

// The list of pages worth indexing.
//
// Only the public ones. Everything behind a login is absent here and disallowed
// in robots.ts, because a search result that promises somebody's dashboard and
// delivers a login form is a bad result — for the person who clicked it, and
// for how the site is ranked afterwards.

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  // Free tools: the hub and each tool that works. A tool that isn't built has
  // no page, so it can't appear here.
  const tools = [
    { path: "/tools", priority: 0.8, changeFrequency: "monthly" as const },
    ...TOOLS.filter(usable).map((t) => ({ path: `/tools/${t.slug}`, priority: 0.6, changeFrequency: "monthly" as const })),
  ];

  return [...PUBLIC_ROUTES, ...tools].map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
