// Where to send someone after they connect Meta, when they started from
// somewhere other than the Meta page — a half-finished campaign, say.
//
// Only paths inside the dashboard are accepted, so the connect link can't be
// turned into a redirect to another site.

export const RETURN_COOKIE = "mairo_meta_return";

export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/dashboard/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) {
    return null;
  }
  try {
    // Resolving against a dummy origin must not change the origin.
    const u = new URL(value, "https://mairo.invalid");
    return u.origin === "https://mairo.invalid" && u.pathname.startsWith("/dashboard/") ? `${u.pathname}${u.search}` : null;
  } catch {
    return null;
  }
}
