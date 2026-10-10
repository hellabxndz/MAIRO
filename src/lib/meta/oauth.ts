import { configuredOrigin } from "@/lib/canonical-host";
import { metaGraphRequest, graphApiVersion } from "@/lib/meta/client";

// business_management is here for a reason that is not obvious from grepping
// for call sites, so it is written down: nothing in this codebase calls a
// business endpoint, and it was removed on exactly that reasoning — then put
// back after the removal broke Page discovery.
//
// /me/accounts returns the Pages a person manages. When a Page is owned by a
// Meta Business portfolio rather than by the person directly, it is omitted
// from that response unless the token carries business_management. Verified
// against a real business-owned Page in the Graph API Explorer: identical call,
// identical user, empty `data` without the permission and the Page returned
// with it.
//
// That is not an edge case. Most businesses past their first year run their
// Pages through Business Manager, and Meta requires an ad to run from a Page —
// so without this, MAIRO cannot find the Page of the customers most likely to
// be paying for it.
//
// Ad accounts are unaffected; /me/adaccounts returns business-owned accounts
// under ads_management. Pages are the case that needs it.
//
// ads_read is deliberately NOT asked for. Meta's App Review (October 7, 2026)
// approved ads_management, business_management, pages_show_list and
// pages_read_engagement but not ads_read — and ads_management already lets
// the app read the ad accounts it manages: campaigns, ads and Insights. Asking
// for a permission the app isn't approved for only adds a line to the dialog
// that Meta won't grant to customers, so it's left out. It stays in
// KNOWN_SCOPES so a future review round can put it back through META_SCOPES.
// pages_read_engagement is here for Instagram too: reading
// instagram_business_account off the Page needs it, and without it the lookup
// returns an empty field rather than an error, which reads as "you have no
// Instagram" for somebody who does.
//
// This is the everyday set: what every business connecting an ad account is
// asked for, and exactly what Meta has approved. Which of them a given
// deployment actually asks for is metaScopes() below — see there for why that
// is settable.
const SCOPES = [
  "ads_management",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
];

/**
 * Posting to the business's own Instagram (Scale's Social Manager).
 *
 * Not in SCOPES, for the same reason Facebook Page posting isn't: they are
 * asked for only when a Scale business connects Instagram, through their own
 * dialog (/api/meta/connect?also=instagram). They used to be in the everyday
 * dialog — and Facebook refuses a whole login that names a permission the app
 * hasn't been set up for ("Invalid Scopes: instagram_basic,
 * instagram_content_publish"), so until the app has the Instagram use case,
 * every business connecting an ad account saw an error page. Now only the
 * Instagram button depends on that setup, and connecting ads never does.
 */
export const INSTAGRAM_SCOPES = ["instagram_basic", "instagram_content_publish"];

/** Where a Scale business goes to let MAIRO post to its Instagram. */
export const INSTAGRAM_CONNECT = `/api/meta/connect?also=instagram&returnTo=${encodeURIComponent("/dashboard/social")}`;

/**
 * Every scope name Meta knows about here, so a typo cannot reach the dialog.
 *
 * An unrecognised scope is not rejected quietly by Facebook — it fails the
 * whole login with a generic error, after the redirect, where the customer
 * sees it and MAIRO does not. Since the set is now settable from the
 * environment, the realistic mistake is a mistyped name pasted into a hosting
 * dashboard, and this is what turns that into a refusal at build-the-URL time
 * naming the bad value.
 */
const KNOWN_SCOPES = new Set([
  // One canonical order for the dialog: ads_read (not asked for by default)
  // sits beside ads_management, where a review round would expect it.
  "ads_management",
  "ads_read",
  ...SCOPES.filter((s) => s !== "ads_management"),
  ...INSTAGRAM_SCOPES,
  "pages_manage_posts",
]);

/**
 * Posting on the business's own Facebook Page (Scale).
 *
 * Deliberately not in SCOPES. It is asked for only when a Scale business says
 * yes to "Let MAIRO post on your Facebook Page?", through a second, smaller
 * dialog — so the everyday connect dialog (and the one recorded for App
 * Review) is unchanged, and nobody is asked for a permission they never use.
 */
export const PAGE_POSTING_SCOPE = "pages_manage_posts";

/**
 * The permissions the login dialog asks for.
 *
 * Normally all of SCOPES. META_SCOPES narrows it, and exists for App Review:
 * Meta rejects a submission whose screencast does not match the permissions
 * being requested, and a dialog listing seven permissions while the submission
 * covers four is exactly that mismatch. Setting META_SCOPES to the round being
 * submitted makes the recorded dialog show precisely those, and clearing it
 * afterwards restores the full set.
 *
 * Deliberately not clamped to a required minimum. Narrowing this is how a
 * submission round is recorded, and a round may legitimately cover only the
 * Page permissions — so the override is trusted, and only the names are
 * checked. What it cannot do is silently ask for something Meta has never
 * heard of.
 */
export function metaScopes(): string[] {
  const override = process.env.META_SCOPES?.trim();
  // An env var set to an empty string is how a hosting dashboard spells
  // "unset", and it must not produce a login dialog asking for nothing.
  if (!override) return SCOPES;

  const requested = override
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (requested.length === 0) return SCOPES;

  const unknown = requested.filter((s) => !KNOWN_SCOPES.has(s));
  if (unknown.length > 0) {
    throw new Error(
      `META_SCOPES contains ${unknown.join(", ")}, which ${
        unknown.length === 1 ? "is not a permission" : "are not permissions"
      } MAIRO uses. Valid values are ${[...KNOWN_SCOPES].join(", ")} — or unset META_SCOPES to ask for the usual set.`
    );
  }

  // Order follows SCOPES rather than the env var, so the dialog reads the same
  // way whoever typed the list, and duplicates collapse.
  return [...KNOWN_SCOPES].filter((s) => requested.includes(s));
}

function requireEnv(name: string): string {
  // Trimmed, because these are pasted by hand into a hosting dashboard and a
  // copied secret very often arrives with a trailing newline or space attached.
  // Meta compares the secret byte-for-byte and answers "Error validating client
  // secret" for a value that looks identical to the one on the screen, which is
  // a miserable thing to debug. Nothing Meta issues has meaningful leading or
  // trailing whitespace, so trimming can only help.
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. Add it to your .env file — see .env.example and the README's Meta App setup section.`
    );
  }
  return value;
}

// Where Facebook sends the user back after they approve access.
//
// This is derived rather than hand-configured wherever possible. Facebook
// compares the redirect_uri byte-for-byte against the list registered on the
// app and rejects the whole login with "URL blocked" on any mismatch — a
// trailing slash or a stray newline pasted along with the URL is enough. So
// the value is only read from an env var when someone deliberately sets one;
// otherwise it comes from VERCEL_PROJECT_PRODUCTION_URL, which Vercel injects
// into every deployment automatically and which cannot be mistyped.
//
// The path must stay in sync with src/app/api/meta/callback/route.ts.
export const META_CALLBACK_PATH = "/api/meta/callback";

export function metaRedirectUri(): string {
  const explicit = process.env.META_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  // The site's own address, when one is set, so moving to a custom domain is
  // one setting rather than three. Vercel's production-domain variable is the
  // fallback; with several custom domains it isn't documented which it picks.
  const site = configuredOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (site) return `${site.origin}${META_CALLBACK_PATH}`;

  const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionDomain) return `https://${productionDomain}${META_CALLBACK_PATH}`;

  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:3000${META_CALLBACK_PATH}`;
  }

  throw new Error(
    "Cannot determine the Meta redirect URI. Set META_REDIRECT_URI to " +
      `https://<your-domain>${META_CALLBACK_PATH} and register the exact same ` +
      "string under Valid OAuth Redirect URIs on your Meta app."
  );
}

export function buildMetaAuthUrl(state: string, opts: { pagePosting?: boolean; instagram?: boolean; rerequest?: boolean } = {}): string {
  const appId = requireEnv("META_APP_ID");
  const redirectUri = metaRedirectUri();

  const url = new URL(`https://www.facebook.com/${graphApiVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  const extra = [...(opts.pagePosting ? [PAGE_POSTING_SCOPE] : []), ...(opts.instagram ? INSTAGRAM_SCOPES : [])];
  const scopes = [...new Set([...metaScopes(), ...extra])];
  url.searchParams.set("scope", scopes.join(","));
  // Asks again for a permission that was turned down before, rather than
  // Facebook silently skipping it.
  // Also when a business switched something off last time and is connecting
  // again to turn it back on.
  if (extra.length > 0 || opts.rerequest) url.searchParams.set("auth_type", "rerequest");
  url.searchParams.set("response_type", "code");
  return url.toString();
}

type TokenResponse = { access_token: string; token_type: string; expires_in?: number };

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const appId = requireEnv("META_APP_ID");
  const appSecret = requireEnv("META_APP_SECRET");
  const redirectUri = metaRedirectUri();

  return metaGraphRequest<TokenResponse>("/oauth/access_token", {
    params: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    },
  });
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<TokenResponse> {
  const appId = requireEnv("META_APP_ID");
  const appSecret = requireEnv("META_APP_SECRET");

  return metaGraphRequest<TokenResponse>("/oauth/access_token", {
    params: {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    },
  });
}

export type MetaAdAccountSummary = {
  id: string; // "act_123..."
  name: string;
  account_status: number;
};

export async function fetchAdAccounts(
  accessToken: string
): Promise<MetaAdAccountSummary[]> {
  const res = await metaGraphRequest<{ data: MetaAdAccountSummary[] }>(
    "/me/adaccounts",
    {
      accessToken,
      params: { fields: "id,name,account_status" },
    }
  );
  return res.data;
}

export type MetaPageSummary = { id: string; name: string };

export async function fetchPages(accessToken: string): Promise<MetaPageSummary[]> {
  const res = await metaGraphRequest<{ data: MetaPageSummary[] }>("/me/accounts", {
    accessToken,
    params: { fields: "id,name" },
  });
  return res.data;
}
