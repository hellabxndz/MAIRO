// Google's OAuth, for the Tag Manager API.
//
// The third OAuth flow in this codebase and the one with the sharpest edges,
// because what it grants is write access to a container that controls the
// tracking on the customer's live website.
//
// Three Google-specific things that are not obvious:
//
// A refresh token is issued ONCE, on the first consent, and only when
// access_type=offline is asked for. Ask again without prompt=consent and
// Google returns an access token with no refresh token — so a reconnect that
// looks successful leaves MAIRO unable to do anything an hour later. Both
// parameters are always sent.
//
// The scopes are granted individually. A user can untick publish and keep
// edit, and Google returns 200 with a narrower `scope` in the response. That
// is why the granted list is stored rather than the requested one: publishing
// without the publish scope fails at the last step, after the tags already
// exist in the container.
//
// And Google's consent screen must be verified before anybody outside a test
// list can use these scopes at all. Until that is done, connecting works only
// for accounts added as test users on the Cloud project.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export const GTM_CALLBACK_PATH = "/api/gtm/callback";

/**
 * The narrowest set that can do the job.
 *
 * readonly lists the customer's accounts and containers so they can pick one.
 * edit.containers writes the tags. publish makes them live — without it the
 * tags exist in a workspace and change nothing, which is a worse outcome than
 * failing, because it looks done.
 */
export const GTM_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.publish",
  "openid",
  "email",
];

export const EDIT_SCOPE = "https://www.googleapis.com/auth/tagmanager.edit.containers";
export const PUBLISH_SCOPE = "https://www.googleapis.com/auth/tagmanager.publish";

export function gtmApiConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. Tag Manager provisioning needs a Google Cloud OAuth client — ` +
        "see the Tag Manager section in the README."
    );
  }
  return value;
}

/**
 * Where Google sends the customer back.
 *
 * Google matches this exactly against the list registered on the OAuth client,
 * including the scheme and any trailing slash, and rejects the whole flow on a
 * mismatch with an error that names redirect_uri and nothing else useful.
 */
export function gtmRedirectUri(): string {
  const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionDomain) return `https://${productionDomain}${GTM_CALLBACK_PATH}`;

  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:3000${GTM_CALLBACK_PATH}`;
  }

  throw new Error(
    `Cannot determine the Google redirect URI. Set GOOGLE_REDIRECT_URI to the ` +
      `deployment's public URL followed by ${GTM_CALLBACK_PATH}.`
  );
}

export function buildGtmAuthUrl(state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", requireEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", gtmRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GTM_SCOPES.join(" "));
  url.searchParams.set("state", state);
  // Both required to get a refresh token, and prompt=consent every time
  // because Google withholds it on a repeat authorization otherwise — which
  // produces a connection that works for an hour and then silently cannot.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

async function tokenRequest(params: Record<string, string>): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as
    | (GoogleTokenResponse & { error?: string; error_description?: string })
    | null;

  if (!json) throw new Error(`Google's token endpoint returned nothing readable (HTTP ${res.status}).`);
  if (json.error) throw new Error(json.error_description || json.error);
  if (!json.access_token) throw new Error("Google returned no access token.");
  return json;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  return tokenRequest({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    code,
    grant_type: "authorization_code",
    redirect_uri: gtmRedirectUri(),
  });
}

export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokenResponse> {
  return tokenRequest({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

export function googleScopes(token: GoogleTokenResponse): string[] {
  return token.scope ? token.scope.split(/\s+/).filter(Boolean) : [];
}

/** Which Google account this is, so the settings screen can name it. */
export async function fetchGoogleIdentity(
  accessToken: string
): Promise<{ sub: string | null; email: string | null }> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as
    | { sub?: string; email?: string }
    | null;
  return { sub: json?.sub ?? null, email: json?.email ?? null };
}

/** Google's OAuth errors, in terms of what to change. */
export function explainGoogleAuthError(raw: string): string {
  if (/redirect_uri/i.test(raw)) {
    return (
      "Google blocked the redirect. Add exactly this URL to the OAuth client's authorized " +
      `redirect URIs, with no trailing slash: ${gtmRedirectUri()}`
    );
  }
  if (/access_denied/i.test(raw)) {
    return "You cancelled, or the Google account didn't grant the permissions MAIRO asked for.";
  }
  if (/invalid_client/i.test(raw)) {
    return "Google rejected this app's credentials. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.";
  }
  if (/verification|unverified|has not completed/i.test(raw)) {
    return (
      "Google hasn't verified MAIRO for Tag Manager access yet, so only accounts added as " +
      "test users on the Cloud project can connect."
    );
  }
  if (/invalid_grant/i.test(raw)) {
    return "That authorization has expired or already been used. Try connecting again.";
  }
  return raw;
}
