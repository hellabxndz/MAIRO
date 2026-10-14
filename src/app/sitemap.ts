import type { MetadataRoute } from "next";
import { absoluteUrl, PUBLIC_ROUTES } from "@/lib/site";
import { TOOLS, usable } from "@/lib/tools/registry";
import { helpArticles } from "@/lib/help/articles";
import { USE_CASES } from "@/lib/solutions/use-cases";

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

  // The help center: the index and every article.
  const help = [
    { path: "/help", priority: 0.6, changeFrequency: "monthly" as const },
    ...helpArticles().map((a) => ({ path: `/help/${a.slug}`, priority: 0.5, changeFrequency: "monthly" as const })),
  ];

  // A page per kind of business.
  const solutions = USE_CASES.map((u) => ({ path: `/solutions/${u.slug}`, priority: 0.7, changeFrequency: "monthly" as const }));

  return [...PUBLIC_ROUTES, ...tools, ...help, ...solutions].map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
