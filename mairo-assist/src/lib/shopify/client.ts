import "server-only";
import { log } from "@/lib/log";
import { decryptSecret, encryptSecret } from "@/lib/security/secrets";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiVersion, credentials, shopBaseUrl } from "./config";
import { refreshTokens, ShopifyAuthError, type TokenSet } from "./oauth";

export class ShopifyReauthRequired extends Error {
  constructor(message = "The store needs to be reconnected") {
    super(message);
  }
}
export class ShopifyApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

type Connection = { id: string; business_id: string; shop_domain: string; status: string };

const REFRESH_MARGIN_MS = 5 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Encrypt and store a token set for a connection (associated data = connection id). */
export async function storeTokens(connectionId: string, businessId: string, tokens: TokenSet) {
  const { error } = await createAdminClient()
    .from("shopify_credentials")
    .upsert({
      connection_id: connectionId,
      business_id: businessId,
      access_token_enc: encryptSecret(tokens.accessToken, connectionId),
      access_token_expires_at: tokens.accessTokenExpiresAt?.toISOString() ?? null,
      refresh_token_enc: tokens.refreshToken ? encryptSecret(tokens.refreshToken, connectionId) : null,
      refresh_token_expires_at: tokens.refreshTokenExpiresAt?.toISOString() ?? null,
      refreshing_until: null,
    });
  if (error) throw new Error(`Could not store Shopify credentials: ${error.message}`);
}

export async function markReauthRequired(connectionId: string, reason: string) {
  await createAdminClient()
    .from("shopify_connections")
    .update({ status: "reauth_required", last_error: reason.slice(0, 500) })
    .eq("id", connectionId)
    .in("status", ["active", "pending"]);
}

async function readCredentials(connectionId: string) {
  const { data } = await createAdminClient()
    .from("shopify_credentials")
    .select("access_token_enc, access_token_expires_at, refresh_token_enc, refresh_token_expires_at, refreshing_until")
    .eq("connection_id", connectionId)
    .maybeSingle();
  return data;
}

/**
 * A usable access token, refreshing it first if it's about to expire.
 * Refresh tokens rotate, so a short lease makes sure only one worker
 * refreshes; the others wait for the new token.
 */
async function accessToken(conn: Connection, force = false): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const creds = await readCredentials(conn.id);
    if (!creds) throw new ShopifyReauthRequired("No credentials for this store");
    const expiresAt = creds.access_token_expires_at ? Date.parse(creds.access_token_expires_at) : null;
    const fresh = expiresAt === null || expiresAt - Date.now() > REFRESH_MARGIN_MS;
    if (fresh && !force) return decryptSecret(creds.access_token_enc, conn.id);

    if (!creds.refresh_token_enc) {
      if (expiresAt === null && !force) return decryptSecret(creds.access_token_enc, conn.id);
      throw new ShopifyReauthRequired("The store's access expired and can't be renewed");
    }

    // Try to take the refresh lease.
    const leaseUntil = new Date(Date.now() + 30_000).toISOString();
    const { data: lease } = await createAdminClient()
      .from("shopify_credentials")
      .update({ refreshing_until: leaseUntil })
      .eq("connection_id", conn.id)
      .eq("access_token_enc", creds.access_token_enc)
      .or(`refreshing_until.is.null,refreshing_until.lt."${new Date().toISOString()}"`)
      .select("connection_id")
      .maybeSingle();

    if (!lease) {
      // Someone else is refreshing (or just did): wait and re-read.
      await sleep(500);
      force = false;
      continue;
    }

    try {
      const { clientId, clientSecret } = credentials();
      const tokens = await refreshTokens({
        shopBase: shopBaseUrl(conn.shop_domain),
        clientId,
        clientSecret,
        refreshToken: decryptSecret(creds.refresh_token_enc, conn.id),
      });
      await storeTokens(conn.id, conn.business_id, tokens);
      return tokens.accessToken;
    } catch (e) {
      await createAdminClient().from("shopify_credentials").update({ refreshing_until: null }).eq("connection_id", conn.id);
      if (e instanceof ShopifyAuthError && e.code === "invalid_grant") {
        await markReauthRequired(conn.id, "Shopify refused to renew access. Please reconnect the store.");
        throw new ShopifyReauthRequired();
      }
      throw e;
    }
  }
  throw new ShopifyApiError("Timed out waiting for a token refresh");
}

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
  extensions?: { cost?: { requestedQueryCost?: number; throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
};

export type ShopifyClient = {
  connection: Connection;
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
};

/** A GraphQL client for one connected store, scoped to its business. */
export async function shopifyClient(connectionId: string, businessId: string, fetchImpl: typeof fetch = fetch): Promise<ShopifyClient> {
  const { data: conn } = await createAdminClient()
    .from("shopify_connections")
    .select("id, business_id, shop_domain, status")
    .eq("id", connectionId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!conn) throw new ShopifyApiError("Store connection not found");
  if (conn.status === "disconnected" || conn.status === "uninstalled") throw new ShopifyApiError("The store is disconnected");
  if (conn.status === "reauth_required") throw new ShopifyReauthRequired();

  const endpoint = `${shopBaseUrl(conn.shop_domain)}/admin/api/${apiVersion()}/graphql.json`;

  async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let token = await accessToken(conn!);
    let refreshed = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
        body: JSON.stringify({ query, variables }),
      });

      if (res.status === 401) {
        if (refreshed) {
          await markReauthRequired(conn!.id, "Shopify rejected the store's access token. Please reconnect the store.");
          throw new ShopifyReauthRequired();
        }
        token = await accessToken(conn!, true);
        refreshed = true;
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
        await sleep(Math.min(retryAfter, 10) * 1000);
        continue;
      }
      if (res.status === 402 || res.status === 423) throw new ShopifyApiError("The store is frozen or locked by Shopify", res.status);
      if (res.status === 404) throw new ShopifyApiError("The store could not be found", 404);
      if (!res.ok) throw new ShopifyApiError(`Shopify returned ${res.status}`, res.status);

      const body = (await res.json()) as GraphQLResponse<T>;
      const throttled = body.errors?.some((e) => e.extensions?.code === "THROTTLED");
      if (throttled) {
        const status = body.extensions?.cost?.throttleStatus;
        const needed = body.extensions?.cost?.requestedQueryCost ?? 100;
        const waitSeconds = status && status.restoreRate > 0 ? Math.max(1, (needed - status.currentlyAvailable) / status.restoreRate) : 2;
        log.info("shopify.throttled", { shop: conn!.shop_domain, waitSeconds });
        await sleep(Math.min(waitSeconds, 20) * 1000);
        continue;
      }
      if (body.errors?.length) {
        const denied = body.errors.some((e) => e.extensions?.code === "ACCESS_DENIED");
        throw new ShopifyApiError(denied ? "Missing permission for this data" : `GraphQL error: ${body.errors[0].message}`, 200);
      }
      if (!body.data) throw new ShopifyApiError("Empty response from Shopify");
      return body.data;
    }
    throw new ShopifyApiError("Shopify kept throttling or failing; will retry later");
  }

  return { connection: conn, graphql };
}
