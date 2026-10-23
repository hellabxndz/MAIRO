// Where MAIRO's own Meta pixel may run on mairo.io: the public marketing
// pages and the sign-up screen, and nowhere else.
//
// An allowlist on purpose. The pixel sends the page's full address with every
// event, and the app's addresses carry things that are none of Meta's
// business: a free plan's ?website=&sells= on /preview, a shared plan's
// token, a customer's campaign ids, the checkout id in a sign-in's
// ?callbackUrl=. A new public page has to be added here to
// be measured, which is a cheaper mistake than a new private one being
// measured by default.
//
// Client-safe: imported by the pixel component.

const EXACT = new Set(["/", "/pricing", "/help", "/tools", "/privacy", "/terms", "/data-deletion", "/sign-up", "/for-freelancers"]);
const UNDER = ["/solutions/", "/help/", "/tools/", "/landing/"];

export function pixelAllowedOn(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return EXACT.has(path) || UNDER.some((prefix) => path.startsWith(prefix));
}

// …and only when the address carries nothing but ad-tracking parameters. The
// sign-up page can carry a business's website (?website=), and a page that
// gains a parameter later shouldn't start sending it. fbclid has to stay: it
// is how the pixel learns which ad the visitor came from.
const AD_PARAM = /^(utm_[a-z_]+|fbclid|gclid)$/;

export function queryAllowed(search: string): boolean {
  return [...new URLSearchParams(search).keys()].every((key) => AD_PARAM.test(key));
}

/** The browser asked not to be tracked: Global Privacy Control, or Do Not Track. */
export function browserOptedOut(): boolean {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    return nav.globalPrivacyControl === true || nav.doNotTrack === "1";
  } catch {
    return true;
  }
}
