import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import type { AdPlatform, PlatformConnectionStatus } from "@/generated/prisma/enums";
import { loadMetaConnection } from "@/lib/meta/connection";

// The only place that reads or writes a stored access token for any network.
//
// This is the same rule src/lib/meta/connection.ts already enforces for Meta,
// widened to every platform, and for the same reason: encryption is only worth
// something if it cannot be bypassed by accident. A call site that reads
// PlatformConnection.accessToken directly gets ciphertext, and would happily
// send that to TikTok as a bearer token. Keeping those columns private to this
// module makes that mistake impossible to make quietly.
//
// Meta is the odd one out and deliberately so. It still lives in its own
// MetaAdAccount table — that code is in production and works, and moving it
// would be a migration with real risk and no visible benefit. So this module
// reads Meta from there and everything else from PlatformConnection, and
// presents both as the same thing. Nothing above this line knows.

export type PlatformCredentials = {
  connectionId: string;
  platform: AdPlatform;
  /** The network's own advertising-account id. */
  externalAccountId: string;
  externalAccountName: string | null;
  externalBusinessId: string | null;
  status: PlatformConnectionStatus;
  /** Decrypted. Never write this back to the database. */
  accessToken: string;
  /** Decrypted. Null where the network doesn't issue one. */
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
};

/** What a connection looks like to the UI. Carries no secrets. */
export type ConnectionSummary = {
  platform: AdPlatform;
  connected: boolean;
  status: PlatformConnectionStatus | null;
  accountName: string | null;
  accountId: string | null;
  connectedAt: Date | null;
  /** Set when the connection exists but needs attention. */
  problem: string | null;
};

function splitScopes(raw: string | null): string[] {
  return raw ? raw.split(/[\s,]+/).filter(Boolean) : [];
}

/**
 * Loads an organization's credentials for one network, decrypted.
 *
 * Returns null when there is no connection at all. Throws only when a
 * connection exists and its token cannot be decrypted — a missing or rotated
 * TOKEN_ENCRYPTION_KEY — because carrying on with an unreadable token surfaces
 * as a baffling error from the network instead of a clear one from us.
 */
export async function loadCredentials(
  organizationId: string,
  platform: AdPlatform
): Promise<PlatformCredentials | null> {
  if (platform === "META") {
    const meta = await loadMetaConnection(organizationId);
    if (!meta) return null;
    return {
      connectionId: meta.id,
      platform: "META",
      externalAccountId: meta.metaAdAccountId,
      externalAccountName: null,
      externalBusinessId: null,
      status: meta.status as PlatformConnectionStatus,
      accessToken: meta.accessToken,
      refreshToken: null,
      tokenExpiresAt: meta.tokenExpiresAt,
      // Meta's connection predates scope recording. Treated as "whatever the
      // app asks for", which is what it was before this module existed.
      scopes: [],
    };
  }

  const row = await db.platformConnection.findUnique({
    where: { organizationId_platform: { organizationId, platform } },
  });
  if (!row) return null;

  return {
    connectionId: row.id,
    platform: row.platform,
    externalAccountId: row.externalAccountId,
    externalAccountName: row.externalAccountName,
    externalBusinessId: row.externalBusinessId,
    status: row.status,
    accessToken: decryptSecret(row.accessToken),
    refreshToken: row.refreshToken ? decryptSecret(row.refreshToken) : null,
    tokenExpiresAt: row.tokenExpiresAt,
    scopes: splitScopes(row.scopes),
  };
}

/** Stores a connection, encrypting both tokens on the way in. */
export async function saveConnection(input: {
  organizationId: string;
  platform: AdPlatform;
  externalAccountId: string;
  externalAccountName?: string | null;
  externalBusinessId?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  refreshExpiresAt?: Date | null;
  scopes?: string[];
}): Promise<void> {
  const stored = {
    externalAccountId: input.externalAccountId,
    externalAccountName: input.externalAccountName ?? null,
    externalBusinessId: input.externalBusinessId ?? null,
    accessToken: encryptSecret(input.accessToken),
    refreshToken: input.refreshToken ? encryptSecret(input.refreshToken) : null,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    refreshExpiresAt: input.refreshExpiresAt ?? null,
    scopes: input.scopes?.join(" ") ?? null,
    status: "CONNECTED" as const,
    lastError: null,
  };

  await db.platformConnection.upsert({
    where: {
      organizationId_platform: {
        organizationId: input.organizationId,
        platform: input.platform,
      },
    },
    create: {
      organizationId: input.organizationId,
      platform: input.platform,
      ...stored,
    },
    update: stored,
  });
}

/**
 * Records that a connection has gone bad.
 *
 * Called when a network answers that the token is dead. Writing it down means
 * the settings screen can say "reconnect TikTok" instead of every dashboard
 * silently showing no data.
 */
export async function markConnectionProblem(
  organizationId: string,
  platform: AdPlatform,
  status: Exclude<PlatformConnectionStatus, "CONNECTED">,
  message: string
): Promise<void> {
  if (platform === "META") {
    await db.metaAdAccount
      .update({
        where: { organizationId },
        data: { status: status === "TOKEN_EXPIRED" ? "TOKEN_EXPIRED" : "ERROR" },
      })
      .catch(() => undefined);
    return;
  }
  await db.platformConnection
    .update({
      where: { organizationId_platform: { organizationId, platform } },
      data: { status, lastError: message },
    })
    .catch(() => undefined);
}

export async function disconnectPlatform(
  organizationId: string,
  platform: AdPlatform
): Promise<void> {
  if (platform === "META") {
    await db.metaAdAccount.deleteMany({ where: { organizationId } });
    return;
  }
  await db.platformConnection.deleteMany({ where: { organizationId, platform } });
}

/**
 * What every network's connection looks like for this organization.
 *
 * One query per storage location rather than one per platform, because the
 * settings page renders all of them at once and N round trips for a list this
 * short is silly.
 */
export async function connectionSummaries(
  organizationId: string
): Promise<Map<AdPlatform, ConnectionSummary>> {
  const [meta, rows] = await Promise.all([
    db.metaAdAccount.findUnique({
      where: { organizationId },
      select: { metaAdAccountId: true, status: true, connectedAt: true },
    }),
    db.platformConnection.findMany({ where: { organizationId } }),
  ]);

  const out = new Map<AdPlatform, ConnectionSummary>();

  if (meta) {
    out.set("META", {
      platform: "META",
      connected: meta.status === "CONNECTED",
      status: meta.status as PlatformConnectionStatus,
      accountName: null,
      accountId: meta.metaAdAccountId,
      connectedAt: meta.connectedAt,
      problem:
        meta.status === "TOKEN_EXPIRED"
          ? "Meta's permission for MAIRO has expired. Reconnect to keep campaigns running."
          : meta.status === "ERROR"
            ? "Meta rejected the last request on this account. Reconnecting usually fixes it."
            : null,
    });
  }

  for (const row of rows) {
    out.set(row.platform, {
      platform: row.platform,
      connected: row.status === "CONNECTED",
      status: row.status,
      accountName: row.externalAccountName,
      accountId: row.externalAccountId,
      connectedAt: row.connectedAt,
      problem: row.status === "CONNECTED" ? null : (row.lastError ?? "This connection needs attention."),
    });
  }

  return out;
}

/** True when the organization can actually spend on this network right now. */
export async function isConnected(
  organizationId: string,
  platform: AdPlatform
): Promise<boolean> {
  const summaries = await connectionSummaries(organizationId);
  return summaries.get(platform)?.connected ?? false;
}
