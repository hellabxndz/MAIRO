// The placements Meta can preview, and reading its preview HTML safely.
// Pure, so the browser can list the placements without the Graph client.

export const PREVIEW_FORMATS = [
  { value: "MOBILE_FEED_STANDARD", label: "Facebook feed" },
  { value: "INSTAGRAM_STANDARD", label: "Instagram feed" },
  { value: "INSTAGRAM_STORY", label: "Stories" },
  { value: "INSTAGRAM_REELS", label: "Reels" },
] as const;

export type PreviewFormat = (typeof PREVIEW_FORMATS)[number]["value"];

export function isPreviewFormat(value: unknown): value is PreviewFormat {
  return PREVIEW_FORMATS.some((f) => f.value === value);
}

/** The iframe address inside Meta's preview HTML, if it's really Meta's. */
export function previewSrc(html: string): string | null {
  const match = /src\s*=\s*"([^"]+)"/i.exec(html) ?? /src\s*=\s*'([^']+)'/i.exec(html);
  if (!match) return null;
  const src = match[1].replace(/&amp;/g, "&");
  try {
    const u = new URL(src);
    const host = u.hostname;
    const meta = host === "facebook.com" || host.endsWith(".facebook.com") || host === "instagram.com" || host.endsWith(".instagram.com");
    return u.protocol === "https:" && meta ? u.toString() : null;
  } catch {
    return null;
  }
}
