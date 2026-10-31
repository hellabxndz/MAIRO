import { db } from "@/lib/db";
import type { NotificationKind } from "@/generated/prisma/enums";
import { kindInfo, optionalGroup } from "./kinds";
import { sendSms } from "@/lib/sms/send";
import { emailConfigured, sendEmail } from "@/lib/email/send";

// Writing a notification, once.
//
// The whole value of this function is the dedupe key. Detectors run on a
// schedule and describe situations rather than events — "this creative is
// fatiguing", "TikTok is cheaper this week" — and a situation is still true
// tomorrow. Without a key, a daily sweep turns one problem into a notification
// a day until somebody turns the whole feature off.
//
// So the key names the situation, not the moment: `fatigue:<creativeId>` and
// not `fatigue:<creativeId>:<today>`. Running the detector twice finds the same
// row and leaves it alone. When the situation genuinely changes — a new
// creative fatigues, the numbers move enough to be worth saying again — the key
// changes with it and a new row appears.
//
// The text goes out only on creation, for the same reason.

export type NotifyInput = {
  organizationId: string;
  kind: NotificationKind;
  /** Names the situation, not the moment. See above. */
  dedupeKey: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
  mairoCampaignId?: string;
  /** The figures this was true of, so it can be checked later. */
  evidence?: unknown;
  /** The one-line version for a phone. Omit and no text is sent. */
  smsBody?: string;
};

export type NotifyResult = { created: boolean; id: string | null };

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const info = kindInfo(input.kind);

  // The business's own choice for the optional kinds. Urgent ones ignore it.
  const group = optionalGroup(input.kind);
  if (group) {
    const prefs = await db.organization.findUnique({ where: { id: input.organizationId }, select: { notifyOpportunities: true, notifyReports: true, notifyCoachAlerts: true } });
    if (prefs && ((group === "opportunities" && !prefs.notifyOpportunities) || (group === "reports" && !prefs.notifyReports) || (group === "coach" && !prefs.notifyCoachAlerts))) {
      return { created: false, id: null };
    }
  }

  const existing = await db.notification.findUnique({
    where: {
      organizationId_dedupeKey: {
        organizationId: input.organizationId,
        dedupeKey: input.dedupeKey,
      },
    },
    select: { id: true },
  });
  if (existing) return { created: false, id: existing.id };

  const row = await db.notification.create({
    data: {
      organizationId: input.organizationId,
      kind: input.kind,
      severity: info.severity,
      title: input.title,
      body: input.body,
      actionLabel: input.actionLabel ?? null,
      actionHref: input.actionHref ?? null,
      mairoCampaignId: input.mairoCampaignId ?? null,
      evidenceJson: input.evidence === undefined ? null : JSON.stringify(input.evidence),
      dedupeKey: input.dedupeKey,
    },
    select: { id: true },
  });

  // A text, if this kind is one people asked to be texted about and the
  // caller wrote a phone-sized version of it. sendSms does the rest of the
  // refusing — unverified number, no consent, opted out, switched off.
  //
  // Wrapped, because a notification that failed to text is still a
  // notification. Losing the row over it would be the worse outcome.
  if (info.sms && input.smsBody) {
    try {
      await sendSms(input.organizationId, info.sms, input.smsBody);
    } catch (error) {
      console.error("Notification text failed:", error);
    }
  }
  // An email to the people who run the business, for the kinds worth one.
  // Wrapped for the same reason: the row is what matters, the email is a copy.
  if (info.email) {
    try {
      await emailNotification(input);
    } catch (error) {
      console.error("Notification email failed:", error instanceof Error ? error.message : error);
    }
  }

  return { created: true, id: row.id };
}

/**
 * The email copy of a notification: to the business's owners and admins,
 * only when an email provider is configured and the business hasn't turned
 * email off. Plain text, the same words as the app, one link back in.
 */
async function emailNotification(input: NotifyInput): Promise<number> {
  if (!emailConfigured()) return 0;
  const org = await db.organization.findUnique({ where: { id: input.organizationId }, select: { name: true, notifyEmail: true } });
  if (!org?.notifyEmail) return 0;
  const people = await db.organizationMember.findMany({
    where: { organizationId: input.organizationId, role: { in: ["OWNER", "ADMIN"] } },
    select: { user: { select: { email: true } } },
  });
  const to = [...new Set(people.map((p) => p.user.email).filter(Boolean))];
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.mairo.io").replace(/\/$/, "");
  const link = input.actionHref ? `${base}${input.actionHref.startsWith("/") ? input.actionHref : `/${input.actionHref}`}` : `${base}/dashboard`;
  const text = [
    input.title,
    "",
    input.body,
    "",
    `${input.actionLabel ?? "Open MAIRO"}: ${link}`,
    "",
    "— MAIRO",
    `You're getting this because you manage ${org.name} in MAIRO. Choose which emails you get: ${base}/dashboard/notifications`,
  ].join("\n");
  let sent = 0;
  for (const address of to) {
    const r = await sendEmail({ to: address, subject: `MAIRO · ${input.title}`, text });
    if (r.sent) sent++;
  }
  return sent;
}

/** Everything unread, newest first. */
export async function unreadCount(organizationId: string): Promise<number> {
  return db.notification.count({
    where: { organizationId, readAt: null, dismissedAt: null },
  });
}

export async function recentNotifications(organizationId: string, take = 20) {
  return db.notification.findMany({
    where: { organizationId, dismissedAt: null },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/**
 * Clear a situation that has resolved.
 *
 * Called when the thing a notification was about stops being true — a paused
 * creative, a reconnected account. Deleting rather than marking read, because
 * an unread warning about a problem that no longer exists is worse than no
 * warning: it sends somebody to look at a campaign that is fine.
 */
export async function clearNotification(
  organizationId: string,
  dedupeKey: string,
): Promise<void> {
  await db.notification
    .delete({ where: { organizationId_dedupeKey: { organizationId, dedupeKey } } })
    .catch(() => {
      // Nothing to clear is the normal case, not an error.
    });
}
