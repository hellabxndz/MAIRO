import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/notify";
import { SOCIAL_PAUSED_MESSAGE, socialAccess } from "./access";

// What happens to Social Manager when Scale stops being active — cancelled,
// downgraded, expired or unpaid:
//   - every approved post that hasn't gone out is marked PAUSED, so nothing
//     scheduled while they were on Scale is published afterwards,
//   - Autopilot is switched off and nothing new is generated,
//   - their strategy, promotions, drafts and post history are all kept.
// Coming back to Scale doesn't publish anything by itself: the business
// resumes the paused posts it still wants.

/** Statuses that would otherwise be published by the next run. */
const WOULD_PUBLISH = ["SCHEDULED", "CREATED"] as const;

export async function pauseSocial(organizationId: string, reason = SOCIAL_PAUSED_MESSAGE): Promise<{ paused: number }> {
  const { count } = await db.instagramPost.updateMany({
    where: { organizationId, status: { in: [...WOULD_PUBLISH] } },
    data: { status: "PAUSED", error: reason },
  });
  const strategy = await db.socialStrategy.findUnique({ where: { organizationId }, select: { pausedAt: true } });
  if (strategy && !strategy.pausedAt) {
    await db.socialStrategy.update({
      where: { organizationId },
      data: { pausedAt: new Date(), pausedReason: reason, approvalMode: "APPROVAL_REQUIRED" },
    });
  }
  if (count > 0 || (strategy && !strategy.pausedAt)) {
    await notify({
      organizationId,
      kind: "NEEDS_ATTENTION",
      title: "Social Manager paused",
      body: count
        ? `${reason} ${count} scheduled post${count === 1 ? " was" : "s were"} paused and won't be published.`
        : reason,
      actionLabel: "See Social Manager",
      actionHref: "/dashboard/social",
      dedupeKey: `social-paused:${new Date().toISOString().slice(0, 10)}`,
    }).catch((error) => console.error("Social pause notification failed:", error));
  }
  return { paused: count };
}

/** Pauses Social Manager when the account no longer has active Scale. */
export async function pauseSocialIfLocked(organizationId: string): Promise<boolean> {
  const access = await socialAccess(organizationId);
  if (access.ok) return false;
  const [pending, strategy] = await Promise.all([
    db.instagramPost.count({ where: { organizationId, status: { in: [...WOULD_PUBLISH] } } }),
    db.socialStrategy.findUnique({ where: { organizationId }, select: { pausedAt: true } }),
  ]);
  if (pending === 0 && (!strategy || strategy.pausedAt)) return false;
  await pauseSocial(organizationId);
  return true;
}

/** Backstop for a missed webhook: runs with the daily review. */
export async function pauseSocialSweep(): Promise<{ organizations: number }> {
  const [withPosts, withStrategy] = await Promise.all([
    db.instagramPost.findMany({ where: { status: { in: [...WOULD_PUBLISH] } }, distinct: ["organizationId"], select: { organizationId: true } }),
    db.socialStrategy.findMany({ where: { pausedAt: null }, select: { organizationId: true } }),
  ]);
  const ids = [...new Set([...withPosts, ...withStrategy].map((r) => r.organizationId))];
  let organizations = 0;
  for (const id of ids) {
    if (await pauseSocialIfLocked(id)) organizations++;
  }
  return { organizations };
}

/**
 * Back on active Scale, the business resumes: posts still ahead go back to
 * their approved times; posts whose time passed while paused wait for a new
 * approval rather than going out late.
 */
export async function resumeSocial(organizationId: string, now = new Date()): Promise<{ rescheduled: number; needApproval: number }> {
  const paused = await db.instagramPost.findMany({ where: { organizationId, status: "PAUSED" }, select: { id: true, scheduledFor: true } });
  let rescheduled = 0;
  let needApproval = 0;
  for (const p of paused) {
    if (p.scheduledFor && p.scheduledFor > now) {
      await db.instagramPost.update({ where: { id: p.id }, data: { status: "SCHEDULED", error: null, attempts: 0, containerId: null } });
      rescheduled++;
    } else {
      await db.instagramPost.update({ where: { id: p.id }, data: { status: "SUGGESTED", approvedAt: null, scheduledFor: null, error: null, attempts: 0, containerId: null } });
      needApproval++;
    }
  }
  await db.socialStrategy.updateMany({ where: { organizationId }, data: { pausedAt: null, pausedReason: null } });
  return { rescheduled, needApproval };
}
