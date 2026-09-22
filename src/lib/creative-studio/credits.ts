import { db } from "@/lib/db";
import { currentMonthKey } from "@/lib/utils/month";
import { entitlementsFor } from "@/lib/entitlements";
import type { CreativeStudioActionKind } from "@/generated/prisma/enums";

// Spending an AI credit without letting two requests spend the same one.
//
// Three phases, and the reasoning for the shape is on CreativeCreditLedger in
// the schema. In short: reserve (fast, locked, before the model call),
// generate (slow, no lock held), confirm-or-release (fast, after). Every
// caller in creative-studio/actions.ts follows exactly that order — reserve,
// then try the model, then confirm on success or release on failure — and
// nothing outside this file is allowed to write a CreativeCreditLedger row,
// which is what makes "deduct only on success" actually true rather than a
// comment nobody enforces.

/** A RESERVED row older than this is treated as abandoned, not spent. */
const RESERVATION_TIMEOUT_MS = 2 * 60 * 1000;

export type ReserveResult =
  | { ok: true; ledgerId: string }
  | { ok: false; reason: string };

/**
 * Holds `credits` against this month's allowance, or refuses if it would go
 * over. Call this BEFORE the OpenAI request, not after — the whole point is
 * that nothing spends a credit it has not already reserved.
 */
export async function reserveCredits(
  organizationId: string,
  kind: CreativeStudioActionKind,
  credits: number,
): Promise<ReserveResult> {
  // Nothing to reserve. Still logged, as a CONFIRMED zero-cost row, so an
  // upload shows up in the activity trail the same way a generation does.
  if (credits <= 0) {
    const row = await db.creativeCreditLedger.create({
      data: { organizationId, month: currentMonthKey(), kind, credits: 0, status: "CONFIRMED" },
    });
    return { ok: true, ledgerId: row.id };
  }

  const ent = await entitlementsFor(organizationId);
  const allowance = ent.studio_credits_monthly;
  const month = currentMonthKey();
  const cutoff = new Date(Date.now() - RESERVATION_TIMEOUT_MS);

  try {
    return await db.$transaction(async (tx) => {
      // Locks the organization's own row for the life of this transaction —
      // a few milliseconds — so a second request arriving in that window
      // waits, rereads the real total, and cannot double-spend the same
      // headroom. Nothing else in the app takes this lock, so it never
      // contends with, say, a campaign save happening at the same time.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;

      const used = await tx.creativeCreditLedger.aggregate({
        where: {
          organizationId,
          month,
          OR: [{ status: "CONFIRMED" }, { status: "RESERVED", createdAt: { gte: cutoff } }],
        },
        _sum: { credits: true },
      });

      const spent = used._sum.credits ?? 0;
      const remaining = allowance - spent;

      if (remaining < credits) {
        return {
          ok: false,
          reason:
            remaining <= 0
              ? `You've used all ${allowance} AI credits on your plan this month. They reset on the 1st, or move up a plan for more.`
              : `That would cost ${credits} credits and you have ${remaining} left this month.`,
        };
      }

      const row = await tx.creativeCreditLedger.create({
        data: { organizationId, month, kind, credits, status: "RESERVED" },
      });

      return { ok: true, ledgerId: row.id };
    });
  } catch (error) {
    console.error("Credit reservation failed:", error);
    return { ok: false, reason: "Couldn't check your AI credits just now. Try again in a moment." };
  }
}

/** The reservation becomes a real spend, tied to what it actually paid for. */
export async function confirmCredits(
  ledgerId: string,
  assetId: string,
  versionId: string,
): Promise<void> {
  await db.creativeCreditLedger
    .update({ where: { id: ledgerId }, data: { status: "CONFIRMED", assetId, versionId } })
    .catch((error) => {
      // The generation still succeeded and the customer still has their
      // picture; this only means the ledger undercounts by one row until the
      // reservation times out on its own. Logged so it can be noticed, not
      // thrown — failing the whole request over a bookkeeping write would
      // throw away a picture that already exists.
      console.error("Credit confirmation failed:", error);
    });
}

/** The model call failed. The reservation never becomes a spend. */
export async function releaseCredits(ledgerId: string): Promise<void> {
  await db.creativeCreditLedger.delete({ where: { id: ledgerId } }).catch(() => {
    // Already gone, or never existed. Nothing to release.
  });
}

export type CreditBalance = { used: number; allowance: number; remaining: number };

/** For the credit meter in the UI — never reserves, only reads. */
export async function creditBalance(organizationId: string): Promise<CreditBalance> {
  const ent = await entitlementsFor(organizationId);
  const month = currentMonthKey();
  const cutoff = new Date(Date.now() - RESERVATION_TIMEOUT_MS);

  const used = await db.creativeCreditLedger.aggregate({
    where: {
      organizationId,
      month,
      OR: [{ status: "CONFIRMED" }, { status: "RESERVED", createdAt: { gte: cutoff } }],
    },
    _sum: { credits: true },
  });

  const spent = used._sum.credits ?? 0;
  return { used: spent, allowance: ent.studio_credits_monthly, remaining: Math.max(0, ent.studio_credits_monthly - spent) };
}
