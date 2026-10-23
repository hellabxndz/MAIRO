import { siteUrl } from "@/lib/site";
import { buildTagFile, tagTarget } from "@/lib/tracking/tag-relay";

// A business's MAIRO tag file: /t/<tag id>.js (lib/tracking/smart-tag.ts).
// Cached for five minutes, so a change of pixel or business type reaches
// their website within minutes without every page view hitting the database.

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const tagId = file.endsWith(".js") ? file.slice(0, -3) : "";
  const target = tagId ? await tagTarget(tagId) : null;
  const headers = { "content-type": "application/javascript; charset=utf-8", "x-content-type-options": "nosniff" };
  if (!target) {
    // Not an error on their page: a tag whose pixel was removed just does nothing.
    return new Response("/* MAIRO: this tag isn't connected to a pixel. */\n", { status: 404, headers: { ...headers, "cache-control": "public, max-age=60" } });
  }
  return new Response(buildTagFile(target, tagId, siteUrl()), {
    headers: { ...headers, "cache-control": "public, max-age=300, s-maxage=300" },
  });
}
