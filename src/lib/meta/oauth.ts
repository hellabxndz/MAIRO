import { metaGraphRequest, graphApiVersion } from "@/lib/meta/client";

const SCOPES = ["ads_management", "ads_read", "business_management", "pages_show_list"];

function requireEnv(name: string): string {
  const value = process.env[name];
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
