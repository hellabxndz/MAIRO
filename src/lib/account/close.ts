import { db } from "@/lib/db";
import { stripe, billingConfigured } from "@/lib/stripe/client";
import { deleteFilesUnder, organizationPrefixes } from "@/lib/storage/blob";
import { runningMetaCampaigns } from "@/lib/billing/running-campaigns";

// Closing an account: what has to happen, in order, so nothing keeps going
// after the business thinks it has left.
//
//   1. Campaigns still running in Meta are named first. Deleting MAIRO can't
//      pause them afterwards (the access goes with the account), so the owner
//      either pauses them or confirms they understand.
//   2. The MAIRO subscription is cancelled with Stripe. Deleting the records
//      without this left Stripe billing every month for an account that no
//      longer existed. If Stripe can't confirm, nothing is deleted.
//   3. Uploaded and generated files are removed. A failure here doesn't stop
//      the deletion; the daily sweep removes what's left.
//   4. The records go, in one transaction: the business (everything belonging
//      to it cascades, including the Meta token), its client businesses for a
//      freelancer, and every login.

/** Stripe statuses under which a subscription can still charge. */
const CHARGEABLE = ["active", "trialing", "past_due", "unpaid", "incomplete"];

export type CloseDeps = {
  cancelSubscription: (subscriptionId: string) => Promise<void>;
  deleteFiles: (prefix: string) => Promise<number>;
  billingReachable: () => boolean;
};

const defaults: CloseDeps = {
  cancelSubscription: async (id) => {
    await stripe().subscriptions.cancel(id);
  },
  deleteFiles: deleteFilesUnder,
  billingReachable: billingConfigured,
};

export type CloseResult =
  | { ok: true; cancelledSubscriptions: number; filesRemoved: number }
  | { ok: false; reason: "running-campaigns"; running: { name: string; dailyBudgetCents: number }[]; error: string }
  | { ok: false; reason: "billing"; error: string };

function isAlreadyGone(error: unknown): boolean {
  const e = error as { code?: string; statusCode?: number } | null;
  return e?.code === "resource_missing" || e?.statusCode === 404;
}

export async function closeAccount(
  input: { userId: string; organizationId: string | null; acknowledgedRunning: boolean },
  deps: CloseDeps = defaults,
): Promise<CloseResult> {
  if (!input.organizationId) {
    await db.user.delete({ where: { id: input.userId } });
    return { ok: true, cancelledSubscriptions: 0, filesRemoved: 0 };
  }

  const orgs = await db.organization.findMany({
    where: { OR: [{ id: input.organizationId }, { parentId: input.organizationId }] },
    select: { id: true, stripeSubscriptionId: true, subscriptionStatus: true },
  });
  const ids = orgs.map((o) => o.id);

  const running = await runningMetaCampaigns(ids);
  if (running.length > 0 && !input.acknowledgedRunning) {
    return {
      ok: false,
      reason: "running-campaigns",
      running: running.map((r) => ({ name: r.name, dailyBudgetCents: r.dailyBudgetCents })),
      error: `${running.length === 1 ? "A campaign is" : `${running.length} campaigns are`} still running in your Meta ad account and will keep spending after your account is deleted. Pause ${running.length === 1 ? "it" : "them"} first, or confirm you understand.`,
    };
  }

  const toCancel = orgs.filter((o) => o.stripeSubscriptionId && CHARGEABLE.includes(o.subscriptionStatus ?? ""));
  if (toCancel.length > 0 && !deps.billingReachable()) {
    return { ok: false, reason: "billing", error: "MAIRO can't reach Stripe right now, so your subscription couldn't be cancelled and nothing was deleted — otherwise you could keep being billed. Try again, or cancel in Manage billing first." };
  }
  let cancelled = 0;
  for (const o of toCancel) {
    try {
      await deps.cancelSubscription(o.stripeSubscriptionId!);
      cancelled += 1;
    } catch (error) {
      if (isAlreadyGone(error)) continue;
      console.error(`Closing ${o.id}: Stripe refused to cancel ${o.stripeSubscriptionId}:`, error);
      return { ok: false, reason: "billing", error: "Stripe didn't confirm that your subscription was cancelled, so nothing was deleted — otherwise you could keep being billed. Try again in a minute, or cancel in Manage billing first." };
    }
  }

  let filesRemoved = 0;
  for (const id of ids) {
    for (const prefix of organizationPrefixes(id)) {
      try {
        filesRemoved += await deps.deleteFiles(prefix);
      } catch (error) {
        console.error(`Closing ${id}: couldn't remove files under ${prefix}; the daily sweep will.`, error);
      }
    }
  }

  await db.$transaction(async (tx) => {
    await tx.user.deleteMany({ where: { organizationId: { in: ids } } });
    await tx.user.deleteMany({ where: { id: input.userId } });
    await tx.organization.deleteMany({ where: { parentId: input.organizationId! } });
    await tx.organization.delete({ where: { id: input.organizationId! } });
  });

  return { ok: true, cancelledSubscriptions: cancelled, filesRemoved };
}

/**
 * Files left behind by businesses that no longer exist — a storage outage
 * during a deletion, or a deletion from before files were removed with it.
 * Run daily. Returns how many folders were cleared.
 */
export async function sweepOrphanedFiles(deps: {
  folderIds: (folder: string) => Promise<string[]>;
  deleteFiles: (prefix: string) => Promise<number>;
  folders: readonly string[];
  limit?: number;
}): Promise<number> {
  let cleared = 0;
  const limit = deps.limit ?? 50;
  for (const folder of deps.folders) {
    const ids = await deps.folderIds(folder);
    if (ids.length === 0) continue;
    const existing = new Set((await db.organization.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((o) => o.id));
    for (const id of ids) {
      if (existing.has(id) || cleared >= limit) continue;
      await deps.deleteFiles(`${folder}/${id}/`);
      cleared += 1;
    }
  }
  return cleared;
}
