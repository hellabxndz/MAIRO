// Sends anyone arriving at another address of the live site — the project's
// .vercel.app domain, www — to the one in NEXT_PUBLIC_APP_URL (e.g.
// https://mairo.io). Otherwise a visitor who signs in on the old address
// carries a cookie the new one never sees, and a Facebook login started on one
// address and finished on the other fails its security check.
//
// Read by next.config.ts, so it imports nothing.

/** The site's address from NEXT_PUBLIC_APP_URL, or null when unset or not a plain https origin. */
export function configuredOrigin(raw: string | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.pathname.replace(/\/+$/, "") !== "" || url.search || url.hash) return null;
  return url;
}

/**
 * The address a request arrived on, as an origin a login may return to — or
 * null when it isn't one.
 *
 * Facebook and Google send the visitor back to the address in the login link,
 * and that must be the address the login started on: the check that the login
 * is genuine lives in a cookie, and a cookie stays on the address that set it.
 * So the return address is the one the visitor is on, not whichever of the
 * site's addresses Vercel calls "production" (with a custom domain added, that
 * changes on its own). Only https counts, plus plain http on this computer for
 * development. The provider still refuses any address not registered with it.
 */
export function requestOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url.origin;
  return null;
}

type HostRedirect = {
  source: string;
  missing: { type: "host"; value: string }[];
  destination: string;
  permanent: false;
};

/**
 * The redirect that sends other addresses of the live site to the real one.
 *
 * Production deployments only: previews keep their own addresses. Nothing
 * under /api is moved — Stripe doesn't follow redirects, a Facebook or Google
 * login must come back to the address it started on, and the scheduled jobs
 * call whichever address Vercel gives them. Temporary (307) rather than
 * permanent, so a mistake isn't remembered by every browser that saw it.
 */
export function canonicalHostRedirects(env: { VERCEL_ENV?: string; NEXT_PUBLIC_APP_URL?: string }): HostRedirect[] {
  if (env.VERCEL_ENV !== "production") return [];
  const url = configuredOrigin(env.NEXT_PUBLIC_APP_URL);
  if (!url) return [];
  return [
    {
      source: "/:path((?!api/|_next/).*)",
      missing: [{ type: "host", value: url.host.replace(/\./g, "\\.") }],
      destination: `${url.origin}/:path`,
      permanent: false,
    },
  ];
}
