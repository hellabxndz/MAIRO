import { siteTarget } from "@/lib/site-tracking";

// MAIRO's own pixel id, for the browser pixel on the public pages
// (components/site-pixel.tsx) when it was set up from AIOS rather than in the
// deployment's variables. Only the id — public by nature, it's in every page
// that loads a pixel — never the token. Cached at the edge for five minutes.

export async function GET() {
  const target = await siteTarget();
  return Response.json(
    { pixelId: target?.pixelId ?? null },
    { headers: { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } }
  );
}
