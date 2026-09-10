// TikTok Login Kit — the authorization that lets MAIRO post as the customer.
//
// The second of TikTok's two OAuth flows, and the one that catches people out.
// oauth.ts in this folder authorizes an *advertiser* on the Business API:
// portal/auth, `app_id`, `secret`, an advertiser id. This authorizes a
// *creator* on the Open API: www.tiktok.com/v2/auth/authorize, `client_key`,
// `client_secret`, an open_id. The two apps are registered separately in
// TikTok's developer portal, hold separate credentials, and their tokens are
// not interchangeable in either direction.
//
// A customer who wants MAIRO to both advertise and post therefore authorizes
// twice. That is worth surfacing rather than smoothing over — a single
// "Connect TikTok" button that silently only did one of them is how somebody
// ends up wondering why their video never posted.

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

export const TIKTOK_CREATOR_CALLBACK_PATH = "/api/tiktok/creator/callback";

/**
 * What MAIRO asks a creator for.
 *
 * `video.upload` alone puts videos in their drafts. `video.publish` is what
 * makes "MAIRO posts for you" true rather than "MAIRO prepares it and you
 * post it". Both are requested, because a creator who grants only the first
 * still gets a working — if smaller — feature, and the granted list is stored
 * so the product can tell them which one they have.
 */
const CREATOR_SCOPES = ["user.info.basic", "video.upload", "video.publish"];

/** The scope that separates posting from preparing. */
export const PUBLISH_SCOPE = "video.publish";
export const UPLOAD_SCOPE = "video.upload";

export function requireContentEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. TikTok posting needs its own Login Kit credentials, ` +
        "separate from the Business API ones — see the TikTok section in the README."
    );
  }
  return value;
}

/**
 * Where TikTok sends the creator back.
 *
 * Same byte-for-byte matching rule as every other redirect URI in this
 * codebase, and the same trailing-slash trap.
 */
export function creatorRedirectUri(): string {
  const explicit = process.env.TIKTOK_CREATOR_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionDomain) return `https://${productionDomain}${TIKTOK_CREATOR_CALLBACK_PATH}`;

  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:3000${TIKTOK_CREATOR_CALLBACK_PATH}`;
  }

  throw new Error(
    "Cannot determine the TikTok creator redirect URI. Set TIKTOK_CREATOR_REDIRECT_URI " +
      `to the deployment's public URL followed by ${TIKTOK_CREATOR_CALLBACK_PATH}.`
  );
}

export function buildCreatorAuthUrl(state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_key", requireContentEnv("TIKTOK_CLIENT_KEY"));
  url.searchParams.set("scope", CREATOR_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", creatorRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

export type CreatorTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  open_id: string;
  scope?: string;
  token_type?: string;
};

type TokenErrorBody = { error?: string; error_description?: string };

/**
 * Trades the code for a token.
 *
 * Form-encoded, not JSON — the one endpoint in TikTok's Open API that is, and
 * sending JSON here returns an opaque `invalid_request` that says nothing
 * about the content type.
 */
async function tokenRequest(params: Record<string, string>): Promise<CreatorTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as
    | (CreatorTokenResponse & TokenErrorBody)
    | null;

  if (!json) {
    throw new Error(`TikTok's token endpoint returned an unreadable response (HTTP ${res.status}).`);
  }
  if (json.error) {
    throw new Error(json.error_description || json.error);
  }
  if (!json.access_token) {
    throw new Error("TikTok returned no access token.");
  }
  return json;
}

export async function exchangeCreatorCode(code: string): Promise<CreatorTokenResponse> {
  return tokenRequest({
    client_key: requireContentEnv("TIKTOK_CLIENT_KEY"),
    client_secret: requireContentEnv("TIKTOK_CLIENT_SECRET"),
    code,
    grant_type: "authorization_code",
    redirect_uri: creatorRedirectUri(),
  });
}

/**
 * Refreshes an expiring creator token.
 *
 * Unlike the Business API's, these genuinely expire — 24 hours is typical —
 * so this is called on demand before any posting work rather than being
 * scheduled. A refresh token that has itself expired means the customer has to
 * authorize again, which the caller reports as a disconnection.
 */
export async function refreshCreatorToken(refreshToken: string): Promise<CreatorTokenResponse> {
  return tokenRequest({
    client_key: requireContentEnv("TIKTOK_CLIENT_KEY"),
    client_secret: requireContentEnv("TIKTOK_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export function creatorScopes(token: CreatorTokenResponse): string[] {
  return token.scope ? token.scope.split(/[\s,]+/).filter(Boolean) : [];
}

/** Basic profile, so the settings screen shows a handle rather than an id. */
export async function fetchCreatorProfile(accessToken: string): Promise<{
  openId: string | null;
  unionId: string | null;
  username: string | null;
  nickname: string | null;
  avatarUrl: string | null;
}> {
  const url = new URL("https://open.tiktokapis.com/v2/user/info/");
  url.searchParams.set("fields", "open_id,union_id,avatar_url,display_name,username");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as {
    data?: {
      user?: {
        open_id?: string;
        union_id?: string;
        avatar_url?: string;
        display_name?: string;
        username?: string;
      };
    };
  } | null;

  const user = json?.data?.user;
  return {
    openId: user?.open_id ?? null,
    unionId: user?.union_id ?? null,
    username: user?.username ?? null,
    nickname: user?.display_name ?? null,
    avatarUrl: user?.avatar_url ?? null,
  };
}

/** TikTok's Login Kit errors, in terms of what to actually change. */
export function explainCreatorAuthError(raw: string): string {
  if (/redirect/i.test(raw)) {
    return (
      "TikTok blocked the redirect. Register exactly this URL as a redirect URI on the " +
      `Login Kit app, with no trailing slash: ${creatorRedirectUri()}`
    );
  }
  if (/client_key|client_secret|invalid_client/i.test(raw)) {
    return (
      "TikTok rejected this app's Login Kit credentials. TIKTOK_CLIENT_KEY and " +
      "TIKTOK_CLIENT_SECRET are separate from the Business API's TIKTOK_APP_ID and " +
      "TIKTOK_APP_SECRET — check the right pair is set."
    );
  }
  if (/scope/i.test(raw)) {
    return (
      "TikTok refused one of the posting permissions. video.publish has to be added to " +
      "the Login Kit app and approved by TikTok before it can be granted."
    );
  }
  return raw;
}
