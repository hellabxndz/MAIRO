import { requireTikTokEnv, tiktokRequest } from "./client";
import type { PlatformAccount } from "../types";

// TikTok's OAuth, which is close enough to Meta's to be misleading.
//
// The authorize URL lives on a different host to the API, takes `app_id`
// rather than `client_id`, and the token exchange is a POST with a JSON body
// rather than a GET with query parameters. Each of those is a small thing and
// each fails in a way that blames something else, so they are all in this one
// file with the differences written down.
//
// The scopes are the part worth reading. TikTok grants scopes per authorized
// advertiser and returns the list it actually granted, which is not always the
// list that was asked for — a user can approve an app for a business account
// they only partly administer. That is why the granted scopes are stored on
// the connection: an action that needs one can check first and say which
// permission is missing, instead of failing at the network with a code.

const AUTH_HOST = "https://business-api.tiktok.com/portal/auth";
const OAUTH_BASE = "https://business-api.tiktok.com/open_api/v1.3";

/**
 * What MAIRO asks TikTok for.
 *
 * Deliberately the minimum that lets the product work: read the advertiser,
 * create and manage campaigns, and read back how they did. No scope here
 * touches organic posting or the user's personal account.
 */
const SCOPES = [
  "user_info",
  "advertiser_read",
  "campaign_create",
  "campaign_update",
  "adgroup_create",
  "adgroup_update",
  "ad_create",
  "ad_update",
  "reporting",
];

/**
 * The extra scope Spark Ads need, which is not requested by default.
 *
 * Promoting an existing organic post means reading the business's TikTok posts
 * and being authorized against them, which is a materially larger ask than
 * "run ads for me". It is requested only when a customer turns on the part of
 * Growth Mode that uses it, so the consent screen a first-time customer sees
 * stays as small as it can be.
 */
export const SPARK_ADS_SCOPE = "video_list";

export const TIKTOK_CALLBACK_PATH = "/api/tiktok/callback";

/**
 * Where TikTok sends the customer back.
 *
 * Derived rather than hand-configured wherever possible, for exactly the
 * reason the Meta equivalent is: the network compares this byte-for-byte
 * against the list registered on the app and rejects the whole login on any
 * mismatch, and a trailing slash pasted along with the URL is enough to do it.
 */
export function tiktokRedirectUri(): string {
  const explicit = process.env.TIKTOK_REDIRECT_URI?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionDomain) return `https://${productionDomain}${TIKTOK_CALLBACK_PATH}`;

  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:3000${TIKTOK_CALLBACK_PATH}`;
  }

  throw new Error(
    "Cannot determine the TikTok redirect URI. Set TIKTOK_REDIRECT_URI to the " +
      `deployment's public URL followed by ${TIKTOK_CALLBACK_PATH}.`
  );
}

export function buildTikTokAuthUrl(state: string, extraScopes: string[] = []): string {
  const appId = requireTikTokEnv("TIKTOK_APP_ID");
  const url = new URL(AUTH_HOST);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", tiktokRedirectUri());
  url.searchParams.set("scope", [...SCOPES, ...extraScopes].join(","));
  return url.toString();
}

export type TikTokTokenResponse = {
  access_token: string;
  /** Present on long-lived apps; absent on the ones that issue static tokens. */
  refresh_token?: string;
  /** Seconds. Absent means the token does not expire on a clock. */
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string[] | string;
  /** Every advertiser this authorization covers. */
  advertiser_ids?: string[];
};

/**
 * Trades the authorization code for a token.
 *
 * Note the shape: a POST with a JSON body to the API host, not a GET against
 * the authorize host. Sending this the way Meta's is sent returns a 404 page
 * rather than an OAuth error, which is a bad half hour if you don't know.
 */
export async function exchangeCodeForToken(code: string): Promise<TikTokTokenResponse> {
  return tiktokRequest<TikTokTokenResponse>("/oauth2/access_token/", {
    method: "POST",
    baseUrl: OAUTH_BASE,
    body: {
      app_id: requireTikTokEnv("TIKTOK_APP_ID"),
      secret: requireTikTokEnv("TIKTOK_APP_SECRET"),
      auth_code: code,
      grant_type: "auth_code",
    },
  });
}

/**
 * Exchanges a refresh token for a fresh access token.
 *
 * Only meaningful for apps TikTok issues expiring tokens to. Where the app has
 * a static token this is never called, which is why nothing schedules it — the
 * refresh happens on demand, when a call comes back with an auth code.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TikTokTokenResponse> {
  return tiktokRequest<TikTokTokenResponse>("/oauth2/refresh_token/", {
    method: "POST",
    baseUrl: OAUTH_BASE,
    body: {
      app_id: requireTikTokEnv("TIKTOK_APP_ID"),
      secret: requireTikTokEnv("TIKTOK_APP_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    },
  });
}

type AdvertiserInfoRow = {
  advertiser_id: string;
  advertiser_name?: string;
  name?: string;
  company?: string;
  currency?: string;
  status?: string;
  owner_bc_id?: string;
};

/**
 * The advertiser accounts this token can spend from.
 *
 * Two calls rather than one, because TikTok splits them: the token response
 * carries the ids, and the names and currencies come from a separate lookup.
 * A connection with an id and no name is usable but reads as a bare number in
 * the settings screen, so it is worth the second request.
 */
export async function fetchAdvertisers(
  accessToken: string,
  advertiserIds: string[]
): Promise<PlatformAccount[]> {
  if (advertiserIds.length === 0) return [];

  const res = await tiktokRequest<{ list?: AdvertiserInfoRow[] }>("/advertiser/info/", {
    accessToken,
    params: {
      advertiser_ids: JSON.stringify(advertiserIds),
      fields: JSON.stringify([
        "advertiser_id",
        "advertiser_name",
        "currency",
        "status",
        "owner_bc_id",
      ]),
    },
  });

  const rows = res.list ?? [];
  // Fall back to the bare ids if the lookup came back empty — a connection
  // with an unnamed account still works, and refusing it would be worse.
  if (rows.length === 0) {
    return advertiserIds.map((id) => ({ id, name: id, usable: true }));
  }

  return rows.map((row) => ({
    id: row.advertiser_id,
    name: row.advertiser_name ?? row.name ?? row.company ?? row.advertiser_id,
    businessId: row.owner_bc_id ?? null,
    currency: row.currency ?? null,
    // TikTok reports a handful of statuses; only STATUS_ENABLE can run ads.
    usable: row.status ? row.status === "STATUS_ENABLE" : true,
  }));
}

export function grantedScopes(token: TikTokTokenResponse): string[] {
  if (Array.isArray(token.scope)) return token.scope;
  if (typeof token.scope === "string") return token.scope.split(/[\s,]+/).filter(Boolean);
  return [];
}

/**
 * Turns TikTok's OAuth errors into something naming the actual fix.
 *
 * Same reasoning as the Meta version: every one of these is a configuration
 * problem on the deployment rather than something the person clicking the
 * button did, and TikTok phrases them as if you already knew that.
 */
export function explainTikTokError(raw: string): string {
  if (/secret|signature/i.test(raw)) {
    return (
      "TikTok rejected this app's secret. The TIKTOK_APP_SECRET on this " +
      "deployment doesn't match the one on the TikTok app — usually because it " +
      "was regenerated in TikTok's developer portal and never updated here, or " +
      "updated without a redeploy."
    );
  }
  if (/redirect/i.test(raw)) {
    return (
      "TikTok blocked the redirect. Register exactly this URL as an Advertiser " +
      `Redirect URL on the TikTok app, with no trailing slash: ${tiktokRedirectUri()}`
    );
  }
  if (/scope|permission|not authorized/i.test(raw)) {
    return (
      "TikTok refused one of the permissions MAIRO asks for. Until the app is " +
      "approved for advertising scopes, only accounts added as testers on the " +
      "TikTok app can connect."
    );
  }
  if (/auth_code|expired/i.test(raw)) {
    return "That TikTok authorization expired before it could be used. Please try connecting again.";
  }
  return raw;
}
