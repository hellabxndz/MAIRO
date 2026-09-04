import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import type { MetaConnectionStatus } from "@/generated/prisma/enums";

// The only place that reads or writes a stored Meta access token.
//
// Every other module goes through here rather than touching
// MetaAdAccount.accessToken directly. That is the point: encryption is only
// worth anything if it cannot be bypassed by accident, and a single call site
// that reads the raw column would hand a caller ciphertext and let it send
// that to Meta as a token. Keeping the column private to this file makes that
// mistake impossible to make quietly.

export type MetaConnection = {
  id: string;
  metaAdAccountId: string;
  pageId: string | null;
  status: MetaConnectionStatus;
  /** Decrypted and ready to send to Meta. Never write this back to the database. */
  accessToken: string;
  tokenExpiresAt: Date | null;
};

/**
 * Loads an organization's Meta connection with the token decrypted.
 *
 * Returns null when there is no connection. Throws only when a connection
 * exists but its token cannot be read — a missing or changed encryption key —
 * because continuing with an unusable token would surface as a confusing
 * failure from Meta rather than a clear one from us.
 */
export async function loadMetaConnection(
  organizationId: string
): Promise<MetaConnection | null> {
  const row = await db.metaAdAccount.findUnique({
    where: { organizationId },
    select: {
      id: true,
      metaAdAccountId: true,
      pageId: true,
      status: true,
      accessToken: true,
      tokenExpiresAt: true,
    },
  });
  if (!row) return null;

  return { ...row, accessToken: decryptSecret(row.accessToken) };
}

/** True when the organization has connected an ad account, without decrypting anything. */
export async function hasMetaConnection(organizationId: string): Promise<boolean> {
  const row = await db.metaAdAccount.findUnique({
    where: { organizationId },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Stores a connection, encrypting the token on the way in.
 *
 * Called on every successful OAuth callback, so a connection written before
 * encryption was switched on upgrades itself the next time the client
 * reconnects — no migration script, no downtime.
 */
export async function saveMetaConnection(input: {
  organizationId: string;
  metaAdAccountId: string;
  pageId?: string | null;
  accessToken: string;
  tokenExpiresAt: Date | null;
}): Promise<void> {
  const stored = {
    metaAdAccountId: input.metaAdAccountId,
    pageId: input.pageId ?? null,
    accessToken: encryptSecret(input.accessToken),
    tokenExpiresAt: input.tokenExpiresAt,
    status: "CONNECTED" as const,
  };

  await db.metaAdAccount.upsert({
    where: { organizationId: input.organizationId },
    create: { organizationId: input.organizationId, ...stored },
    update: stored,
  });
}
