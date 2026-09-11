import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import {
  EDIT_SCOPE,
  PUBLISH_SCOPE,
  refreshGoogleToken,
  type GoogleTokenResponse,
} from "@/lib/tracking/gtm-api/oauth";

// The only place that reads or writes a stored Google token.
//
// Same rule as every other credential in this codebase. It matters more here
// than most: this token can edit and publish the tracking on the customer's
// live website, so a call site reading the column directly and getting
// ciphertext would be the least of the problems.
//
// Refreshing lives here too, because Google's access tokens last an hour and a
// provisioning run can outlive one. Every caller that is about to use the
// token comes through loadGtmCredentials, which refreshes first if it has to.

export type GtmCredentials = {
  organizationId: string;
  accessToken: string;
  scopes: string[];
  canEdit: boolean;
  canPublish: boolean;
  accountId: string | null;
  containerId: string | null;
  containerPublic: string | null;
  workspaceId: string | null;
};

export type GtmConnectionSummary = {
  connected: boolean;
  googleEmail: string | null;
  containerPublic: string | null;
  containerName: string | null;
  canEdit: boolean;
  canPublish: boolean;
  lastPublishedAt: Date | null;
  publishedTagCount: number | null;
  problem: string | null;
};

function splitScopes(raw: string | null): string[] {
  return raw ? raw.split(/[\s,]+/).filter(Boolean) : [];
}

export async function saveGtmConnection(input: {
  organizationId: string;
  token: GoogleTokenResponse;
  scopes: string[];
  identity: { sub: string | null; email: string | null };
}): Promise<void> {
  const existing = await db.gtmConnection.findUnique({
    where: { organizationId: input.organizationId },
    select: { refreshToken: true },
  });

  const stored = {
    googleUserId: input.identity.sub,
    googleEmail: input.identity.email,
    accessToken: encryptSecret(input.token.access_token),
    // Google issues a refresh token on first consent only. A reconnect that
    // comes back without one must keep the old one rather than null it —
    // otherwise the connection works for an hour and then cannot be renewed,
    // which looks like a random failure a day later.
    refreshToken: input.token.refresh_token
      ? encryptSecret(input.token.refresh_token)
      : (existing?.refreshToken ?? null),
    tokenExpiresAt: input.token.expires_in
      ? new Date(Date.now() + input.token.expires_in * 1000)
      : null,
    scopes: input.scopes.join(" "),
    status: "CONNECTED" as const,
    lastError: null,
  };

  await db.gtmConnection.upsert({
    where: { organizationId: input.organizationId },
    create: { organizationId: input.organizationId, ...stored },
    update: stored,
  });
}

/** Enough headroom that a token cannot expire mid-provision. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export async function loadGtmCredentials(
  organizationId: string
): Promise<GtmCredentials | null> {
  const row = await db.gtmConnection.findUnique({ where: { organizationId } });
  if (!row || row.status === "DISCONNECTED") return null;

  let accessToken: string;
  try {
    accessToken = decryptSecret(row.accessToken);
  } catch {
    await markGtmProblem(
      organizationId,
      "ERROR",
      "MAIRO can no longer read the stored Google token. Reconnect Tag Manager."
    );
    return null;
  }

  let scopes = splitScopes(row.scopes);
  const expiring =
    row.tokenExpiresAt !== null && row.tokenExpiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS;

  if (expiring) {
    if (!row.refreshToken) {
      await markGtmProblem(
        organizationId,
        "TOKEN_EXPIRED",
        "Google's permission expired and there is no way to renew it. Reconnect Tag Manager."
      );
      return null;
    }
    try {
      const refreshed = await refreshGoogleToken(decryptSecret(row.refreshToken));
      await db.gtmConnection.update({
        where: { organizationId },
        data: {
          accessToken: encryptSecret(refreshed.access_token),
          tokenExpiresAt: refreshed.expires_in
            ? new Date(Date.now() + refreshed.expires_in * 1000)
            : null,
          status: "CONNECTED",
          lastError: null,
        },
      });
      accessToken = refreshed.access_token;
      // A scope revoked in the customer's Google account shows up here.
      if (refreshed.scope) scopes = splitScopes(refreshed.scope);
    } catch {
      await markGtmProblem(
        organizationId,
        "TOKEN_EXPIRED",
        "Google's permission for MAIRO has expired. Reconnect Tag Manager."
      );
      return null;
    }
  }

  return {
    organizationId,
    accessToken,
    scopes,
    canEdit: scopes.includes(EDIT_SCOPE),
    canPublish: scopes.includes(PUBLISH_SCOPE),
    accountId: row.gtmAccountId,
    containerId: row.gtmContainerId,
    containerPublic: row.gtmContainerPublic,
    workspaceId: row.gtmWorkspaceId,
  };
}

export async function markGtmProblem(
  organizationId: string,
  status: "TOKEN_EXPIRED" | "ERROR" | "DISCONNECTED",
  message: string
): Promise<void> {
  await db.gtmConnection
    .update({ where: { organizationId }, data: { status, lastError: message } })
    .catch(() => undefined);
}

export async function setGtmContainer(
  organizationId: string,
  container: { accountId: string; containerId: string; publicId: string; name: string }
): Promise<void> {
  await db.gtmConnection.update({
    where: { organizationId },
    data: {
      gtmAccountId: container.accountId,
      gtmContainerId: container.containerId,
      gtmContainerPublic: container.publicId,
      gtmContainerName: container.name,
      // Cleared on purpose: a workspace belongs to one container, so a
      // remembered id from a different one would address a workspace that
      // either does not exist or, worse, belongs to somebody else's container.
      gtmWorkspaceId: null,
      lastError: null,
      status: "CONNECTED",
    },
  });
}

export async function rememberWorkspace(
  organizationId: string,
  workspaceId: string
): Promise<void> {
  await db.gtmConnection.update({
    where: { organizationId },
    data: { gtmWorkspaceId: workspaceId },
  });
}

export async function notePublished(
  organizationId: string,
  tagCount: number
): Promise<void> {
  await db.gtmConnection.update({
    where: { organizationId },
    data: { lastPublishedAt: new Date(), publishedTagCount: tagCount, lastError: null },
  });
}

export async function disconnectGtm(organizationId: string): Promise<void> {
  await db.gtmConnection.delete({ where: { organizationId } }).catch(() => undefined);
}

export async function gtmConnectionSummary(
  organizationId: string
): Promise<GtmConnectionSummary> {
  const row = await db.gtmConnection.findUnique({ where: { organizationId } });
  if (!row) {
    return {
      connected: false,
      googleEmail: null,
      containerPublic: null,
      containerName: null,
      canEdit: false,
      canPublish: false,
      lastPublishedAt: null,
      publishedTagCount: null,
      problem: null,
    };
  }

  const scopes = splitScopes(row.scopes);
  return {
    connected: row.status === "CONNECTED",
    googleEmail: row.googleEmail,
    containerPublic: row.gtmContainerPublic,
    containerName: row.gtmContainerName,
    canEdit: scopes.includes(EDIT_SCOPE),
    canPublish: scopes.includes(PUBLISH_SCOPE),
    lastPublishedAt: row.lastPublishedAt,
    publishedTagCount: row.publishedTagCount,
    problem: row.status === "CONNECTED" ? null : row.lastError,
  };
}
