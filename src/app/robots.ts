import type { MetadataRoute } from "next";
import { absoluteUrl, PRIVATE_PREFIXES } from "@/lib/site";

// What a crawler may look at.
//
// The disallow list is not about secrecy — every one of those paths redirects a
// signed-out visitor to the login page anyway, so there is nothing to leak. It
// is about not spending a crawler's budget on pages that can only ever render
// as a redirect, and not ending up with a search result that goes nowhere.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PREFIXES.map((p) => `${p}/`),
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
