"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";

// Reading and dismissing notifications.
//
// Every one of these is scoped by organization in the `where` rather than
// checked after loading the row. A notification id is a guessable-shaped
// string, and "load it, then compare the org" is the version of this that
// works right up until somebody changes the order of two lines.

async function currentOrgId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  return (await activeOrganizationId()) ?? session.user.organizationId;
}

export async function markNotificationReadAction(id: string): Promise<void> {
  const organizationId = await currentOrgId();
  if (!organizationId) return;
  await db.notification.updateMany({
    where: { id, organizationId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard", "layout");
}

export async function markAllReadAction(): Promise<void> {
  const organizationId = await currentOrgId();
  if (!organizationId) return;
  await db.notification.updateMany({
    where: { organizationId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard", "layout");
}

/**
 * Put one away.
 *
 * Dismissed rather than deleted, so the dedupe key survives — otherwise
 * dismissing a warning about a situation that is still true would simply
 * bring it straight back on the next detector run.
 */
export async function dismissNotificationAction(id: string): Promise<void> {
  const organizationId = await currentOrgId();
  if (!organizationId) return;
  await db.notification.updateMany({
    where: { id, organizationId },
    data: { dismissedAt: new Date(), readAt: new Date() },
  });
  revalidatePath("/dashboard", "layout");
}

/**
 * Which optional notifications the business wants: opportunities and report
 * announcements. Problems that stop ads, launches and anything MAIRO did on
 * its own are always sent — see optionalGroup in notifications/kinds.ts.
 */
export async function saveNotificationPrefsAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.organizationId) return;
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  await db.organization.update({
    where: { id: organizationId },
    data: { notifyOpportunities: formData.get("opportunities") === "on", notifyReports: formData.get("reports") === "on", notifyCoachAlerts: formData.get("coach") === "on" },
  });
  revalidatePath("/dashboard/notifications");
}
