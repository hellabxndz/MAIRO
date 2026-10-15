import { RENDERED_MEDIA } from "@/lib/demo/media";
import { siteUrl } from "@/lib/site";

// The product film described for search engines (schema.org VideoObject) —
// only when the file has been rendered, and said to be a product demo with a
// fictional business, as the film itself says on every frame.

export function FilmSchema() {
  const film = RENDERED_MEDIA.clips?.film;
  const wide = film?.wide;
  if (!film || !wide || !RENDERED_MEDIA.renderedAt) return null;
  const base = siteUrl().replace(/\/$/, "");
  const s = Math.round(wide.ms / 1000);
  const data = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: "Meet your AI advertising team — MAIRO product film",
    description: "A product demo of MAIRO with a fictional online shop and sample data: from its website to a free ad plan, ad concepts, a Meta campaign waiting for approval, the dashboard and a recommendation with its evidence.",
    thumbnailUrl: [`${base}${wide.poster}`],
    contentUrl: `${base}${wide.mp4}`,
    uploadDate: RENDERED_MEDIA.renderedAt,
    duration: `PT${Math.floor(s / 60)}M${s % 60}S`,
    inLanguage: "en",
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
