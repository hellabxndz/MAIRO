import { db } from "@/lib/db";

// Requests that must run at most once.
//
// A form makes a key when it opens and sends it with the submit. The first
// request records the key before doing anything; a repeat — a double click,
// a retried request after a timeout, the same form open in two tabs — finds
// it recorded and is refused before anything reaches Meta. If the first
// request fails without doing anything, it releases the key, so trying again
// works; once it succeeds, the key keeps what it produced.

const KEY = /^[A-Za-z0-9_-]{16,80}$/;

export type Claim = { ok: true; key: string } | { ok: false; reason: "invalid" } | { ok: false; reason: "duplicate"; resultId: string | null };

export async function claimOnce(organizationId: string, scope: string, raw: unknown): Promise<Claim> {
  if (typeof raw !== "string" || !KEY.test(raw)) return { ok: false, reason: "invalid" };
  // Namespaced by business and scope, so a key can never collide across them.
  const key = `${scope}:${organizationId}:${raw}`;
  try {
    await db.idempotencyKey.create({ data: { key, organizationId, scope } });
    return { ok: true, key };
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const row = await db.idempotencyKey.findUnique({ where: { key }, select: { resultId: true } });
    return { ok: false, reason: "duplicate", resultId: row?.resultId ?? null };
  }
}

/** The request succeeded: keep the key, with what it made. */
export async function finishOnce(key: string, resultId: string): Promise<void> {
  await db.idempotencyKey.update({ where: { key }, data: { resultId } });
}

/** The request did nothing: let the same form try again. */
export async function releaseOnce(key: string): Promise<void> {
  await db.idempotencyKey.deleteMany({ where: { key, resultId: null } });
}
