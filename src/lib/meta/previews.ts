import { metaGraphRequest } from "@/lib/meta/client";
import { previewSrc, type PreviewFormat } from "@/lib/meta/preview-formats";

export { isPreviewFormat, PREVIEW_FORMATS, type PreviewFormat } from "@/lib/meta/preview-formats";

// Real previews, drawn by Meta itself, of how an ad will look in each place it
// can show. Nothing is created in the ad account: generatepreviews renders a
// creative spec without saving it, and an existing ad's /previews reads it.
//
// Meta answers with an <iframe> as an HTML string. It is never put on the page
// as HTML: only the iframe's address is kept, and only if it's Meta's own.

type PreviewResponse = { data?: { body?: string }[] };

/** Renders a creative spec that doesn't exist yet. */
export async function previewCreativeSpec(
  adAccountId: string,
  accessToken: string,
  creative: Record<string, unknown>,
  format: PreviewFormat
): Promise<string | null> {
  const res = await metaGraphRequest<PreviewResponse>(`/${adAccountId}/generatepreviews`, {
    accessToken,
    params: { creative: JSON.stringify(creative), ad_format: format },
  });
  return previewSrc(res.data?.[0]?.body ?? "");
}

/** Renders an ad that already exists. */
export async function previewExistingAd(adId: string, accessToken: string, format: PreviewFormat): Promise<string | null> {
  const res = await metaGraphRequest<PreviewResponse>(`/${adId}/previews`, {
    accessToken,
    params: { ad_format: format },
  });
  return previewSrc(res.data?.[0]?.body ?? "");
}
