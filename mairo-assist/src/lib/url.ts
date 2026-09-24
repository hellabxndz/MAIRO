/**
 * Turn a configured site address into a clean origin ("https://host"),
 * forgiving the usual typing slips: missing https://, spaces, trailing
 * slashes or a path. Returns null for anything that still isn't a URL, so
 * callers can fall back instead of crashing every page.
 */
export function normalizeOrigin(value: string | undefined | null): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.origin;
  } catch {
    return null;
  }
}
