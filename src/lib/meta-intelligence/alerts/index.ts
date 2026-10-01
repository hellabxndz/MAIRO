import { db } from "@/lib/db";

// Internal notifications for MAIRO administrators (AIOS → Meta Intelligence).
// One per situation (dedupeKey), so a daily run never repeats itself. Nobody
// has to go and read Meta's documentation to find out something broke.

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export async function raiseAlert(input: { key: string; severity: AlertSeverity; title: string; body: string; href?: string | null }): Promise<boolean> {
  const existing = await db.platformAdminAlert.findUnique({ where: { dedupeKey: input.key }, select: { id: true } });
  if (existing) return false;
  await db.platformAdminAlert.create({ data: { platform: "META", dedupeKey: input.key, severity: input.severity, title: input.title.slice(0, 200), body: input.body.slice(0, 2000), href: input.href ?? null } });
  if (input.severity === "CRITICAL") console.warn(`[Meta Intelligence] CRITICAL: ${input.title}`);
  return true;
}

export async function unreadAlertCount(): Promise<number> {
  return db.platformAdminAlert.count({ where: { platform: "META", readAt: null } });
}

export async function markAlertsRead(ids?: string[]): Promise<void> {
  await db.platformAdminAlert.updateMany({ where: { platform: "META", readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}
