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
//
// With teams, deleting your account closes the business only when you're its
// only owner (closePlan). Anyone else — a teammate, or one of several owners
// — deletes their own login and leaves; the business carries on. And nobody
// can leave a business they solely own with no owner at all.

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
  | { ok: false; reason: "billing"; error: string }
  | { ok: false; reason: "blocked"; error: string };

function isAlreadyGone(error: unknown): boolean {
  const e = error as { code?: string; statusCode?: number } | null;
  return e?.code === "resource_missing" || e?.statusCode === 404;
}

export type ClosePlan =
  /** Closes this business (and a freelancer's client businesses); `others` more people lose it. */
  | { kind: "business"; organizationId: string; name: string; others: number }
  /** Only this login goes; every business it belongs to carries on. */
  | { kind: "leave"; businesses: string[] }
  | { kind: "blocked"; error: string };

const soleOwner = async (organizationId: string) => (await db.organizationMember.count({ where: { organizationId, role: "OWNER" } })) === 1;

/** What deleting this person's account would do, from their memberships — never from the session. */
export async function closePlan(userId: string): Promise<ClosePlan> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { organizationId: true, memberships: { select: { organizationId: true, role: true, organization: { select: { name: true } } } } },
  });
  if (!user) return { kind: "blocked", error: "That account doesn't exist any more." };
  for (const m of user.memberships) {
    if (m.role !== "OWNER" || m.organizationId === user.organizationId) continue;
    if (await soleOwner(m.organizationId)) {
      return { kind: "blocked", error: `You're the only owner of ${m.organization.name}. Make someone else an owner in Settings → Team first, so it isn't left without one.` };
    }
  }
  const home = user.memberships.find((m) => m.organizationId === user.organizationId);
  if (home && home.role === "OWNER" && (await soleOwner(home.organizationId))) {
    const others = await db.organizationMember.count({ where: { organizationId: home.organizationId, userId: { not: userId } } });
    return { kind: "business", organizationId: home.organizationId, name: home.organization.name, others };
  }
  return { kind: "leave", businesses: user.memberships.map((m) => m.organization.name) };
}

export async function closeAccount(
  input: { userId: string; acknowledgedRunning: boolean },
  deps: CloseDeps = defaults,
): Promise<CloseResult> {
  const plan = await closePlan(input.userId);
  if (plan.kind === "blocked") return { ok: false, reason: "blocked", error: plan.error };
  if (plan.kind === "leave") {
    // Their memberships go with the login; the businesses don't.
    await db.user.delete({ where: { id: input.userId } });
    return { ok: true, cancelledSubscriptions: 0, filesRemoved: 0 };
  }
  const organizationId = plan.organizationId;

  const orgs = await db.organization.findMany({
    where: { OR: [{ id: organizationId }, { parentId: organizationId }] },
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
    // Logins whose own business this was: deleted, unless they're on another
    // team too — then that becomes their business and they keep their login.
    const homed = await tx.user.findMany({ where: { organizationId: { in: ids }, id: { not: input.userId } }, select: { id: true, memberships: { where: { organizationId: { notIn: ids } }, orderBy: { createdAt: "asc" }, take: 1, select: { organizationId: true } } } });
    for (const u of homed) {
      if (u.memberships[0]) await tx.user.update({ where: { id: u.id }, data: { organizationId: u.memberships[0].organizationId } });
      else await tx.user.delete({ where: { id: u.id } });
    }
    await tx.user.deleteMany({ where: { id: input.userId } });
    await tx.organization.deleteMany({ where: { parentId: organizationId } });
    await tx.organization.delete({ where: { id: organizationId } });
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
