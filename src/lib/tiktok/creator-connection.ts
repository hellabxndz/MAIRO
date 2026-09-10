import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import {
  PUBLISH_SCOPE,
  UPLOAD_SCOPE,
  refreshCreatorToken,
  type CreatorTokenResponse,
} from "@/lib/ad-platforms/tiktok/creator-oauth";

// The only place that reads or writes a stored TikTok posting token.
//
// Same rule as src/lib/ad-platforms/connections.ts, for the same reason:
// encryption that can be bypassed by reading the column directly is
// decoration. A caller that wants to post gets a decrypted token from here or
// it does not get one.
//
// This module also owns refreshing. TikTok's creator tokens really do expire —
// a day is typical, unlike the Business API's, which mostly do not — so any
// call that is about to use one comes through loadCreatorCredentials, which
// refreshes if it has to and writes the new pair back before handing it over.

export type CreatorCredentials = {
  organizationId: string;
  openId: string;
  username: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  /** Decrypted. Never write this back. */
  accessToken: string;
  scopes: string[];
  /** True when MAIRO may post straight to the profile. */
  canPublish: boolean;
  /** True when MAIRO may at least put videos in the creator's drafts. */
  canUpload: boolean;
};

export type CreatorConnectionSummary = {
  connected: boolean;
  username: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  canPublish: boolean;
  canUpload: boolean;
  problem: string | null;
  connectedAt: Date | null;
};

function splitScopes(raw: string | null): string[] {
  return raw ? raw.split(/[\s,]+/).filter(Boolean) : [];
}

export async function saveCreatorConnection(input: {
  organizationId: string;
  token: CreatorTokenResponse;
  scopes: string[];
  profile: {
    openId: string | null;
    unionId: string | null;
    username: string | null;
    nickname: string | null;
    avatarUrl: string | null;
  };
}): Promise<void> {
  const stored = {
    // The token response always carries open_id; the profile call may fail
    // without that being fatal, so it is the fallback rather than the source.
    openId: input.profile.openId ?? input.token.open_id,
    unionId: input.profile.unionId,
    username: input.profile.username,
    nickname: input.profile.nickname,
    avatarUrl: input.profile.avatarUrl,
    accessToken: encryptSecret(input.token.access_token),
    refreshToken: input.token.refresh_token ? encryptSecret(input.token.refresh_token) : null,
    tokenExpiresAt: input.token.expires_in
      ? new Date(Date.now() + input.token.expires_in * 1000)
      : null,
    refreshExpiresAt: input.token.refresh_expires_in
      ? new Date(Date.now() + input.token.refresh_expires_in * 1000)
      : null,
    scopes: input.scopes.join(" "),
    status: "CONNECTED" as const,
    lastError: null,
  };

  await db.tikTokCreatorConnection.upsert({
    where: { organizationId: input.organizationId },
    create: { organizationId: input.organizationId, ...stored },
    update: stored,
  });
}

/**
 * How much of the token's life has to be left for it to be worth using.
 *
 * A token that expires during an upload is worse than one refreshed a minute
 * early, and a large video takes real time to send.
 */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * The credentials for posting, refreshed if they were about to expire.
 *
 * Returns null when there is no connection, when it has been marked bad, or
 * when the refresh token itself is spent — all three mean the same thing to a
 * caller, which is that the customer has to authorize again.
 */
export async function loadCreatorCredentials(
  organizationId: string
): Promise<CreatorCredentials | null> {
  const row = await db.tikTokCreatorConnection.findUnique({ where: { organizationId } });
  if (!row || row.status === "DISCONNECTED") return null;

  let accessToken: string;
  try {
    accessToken = decryptSecret(row.accessToken);
  } catch {
    // An unreadable token is a rotated or missing TOKEN_ENCRYPTION_KEY. Saying
    // "reconnect" is honest and actionable; carrying on would send ciphertext
    // to TikTok and surface as a baffling auth error from them.
    await markCreatorProblem(
      organizationId,
      "ERROR",
      "MAIRO can no longer read the stored TikTok token. Reconnect TikTok posting."
    );
    return null;
  }

  let scopes = splitScopes(row.scopes);
  const expiring =
    row.tokenExpiresAt !== null &&
    row.tokenExpiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS;

  if (expiring && row.refreshToken) {
    try {
      const refreshed = await refreshCreatorToken(decryptSecret(row.refreshToken));
      await db.tikTokCreatorConnection.update({
        where: { organizationId },
        data: {
          accessToken: encryptSecret(refreshed.access_token),
          refreshToken: refreshed.refresh_token
            ? encryptSecret(refreshed.refresh_token)
            : row.refreshToken,
          tokenExpiresAt: refreshed.expires_in
            ? new Date(Date.now() + refreshed.expires_in * 1000)
            : null,
          refreshExpiresAt: refreshed.refresh_expires_in
            ? new Date(Date.now() + refreshed.refresh_expires_in * 1000)
            : null,
          status: "CONNECTED",
          lastError: null,
        },
      });
      accessToken = refreshed.access_token;
      // A refresh can come back with fewer scopes than were first granted, if
      // the creator has since revoked one in TikTok's own settings.
      if (refreshed.scope) scopes = splitScopes(refreshed.scope);
    } catch {
      await markCreatorProblem(
        organizationId,
        "TOKEN_EXPIRED",
        "TikTok's posting permission has expired. Reconnect it to keep posting."
      );
      return null;
    }
  } else if (expiring) {
    await markCreatorProblem(
      organizationId,
      "TOKEN_EXPIRED",
      "TikTok's posting permission has expired and there is no way to renew it automatically. Reconnect it."
    );
    return null;
  }

  if (row.status !== "CONNECTED" && !expiring) return null;

  return {
    organizationId,
    openId: row.openId,
    username: row.username,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    accessToken,
    scopes,
    canPublish: scopes.includes(PUBLISH_SCOPE),
    canUpload: scopes.includes(UPLOAD_SCOPE),
  };
}

export async function markCreatorProblem(
  organizationId: string,
  status: "TOKEN_EXPIRED" | "ERROR" | "DISCONNECTED",
  message: string
): Promise<void> {
  await db.tikTokCreatorConnection
    .update({ where: { organizationId }, data: { status, lastError: message } })
    .catch(() => {
      // Nothing to mark. Not worth failing the caller's real work over.
    });
}

export async function disconnectCreator(organizationId: string): Promise<void> {
  await db.tikTokCreatorConnection
    .delete({ where: { organizationId } })
    .catch(() => undefined);
}

/** What the settings screen shows. Carries no secrets. */
export async function creatorConnectionSummary(
  organizationId: string
): Promise<CreatorConnectionSummary> {
  const row = await db.tikTokCreatorConnection.findUnique({ where: { organizationId } });
  if (!row) {
    return {
      connected: false,
      username: null,
      nickname: null,
      avatarUrl: null,
      canPublish: false,
      canUpload: false,
      problem: null,
      connectedAt: null,
    };
  }

  const scopes = splitScopes(row.scopes);
  return {
    connected: row.status === "CONNECTED",
    username: row.username,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    canPublish: scopes.includes(PUBLISH_SCOPE),
    canUpload: scopes.includes(UPLOAD_SCOPE),
    problem: row.status === "CONNECTED" ? null : row.lastError,
    connectedAt: row.connectedAt,
  };
}
