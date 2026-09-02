import { metaGraphRequest, graphApiVersion } from "@/lib/meta/client";

// Only what the app actually calls. `business_management` was requested here
// and never used: nothing in this codebase touches /me/businesses or any
// business asset endpoint, and ad accounts owned by a Business Manager still
// come back from /me/adaccounts under ads_read. Asking for it cost us twice —
// App Review requires a recorded demonstration of every permission requested,
// so an unused one is a rejection waiting to happen, and until then every
// customer was being asked to hand over control of their business assets to
// grant it.
//
// If an ad account ever fails to appear for a customer whose account is owned
// by a Business Manager, that is the symptom that would justify adding it back
// — with a flow that actually calls a business endpoint.
const SCOPES = ["ads_management", "ads_read", "pages_show_list"];

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

export function buildMetaAuthUrl(state: string): string {
  const appId = requireEnv("META_APP_ID");
  const redirectUri = metaRedirectUri();

  const url = new URL(`https://www.facebook.com/${graphApiVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", SCOPES.join(","));
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
