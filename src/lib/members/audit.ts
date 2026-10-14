import { db } from "@/lib/db";

/** One line in the business's audit log. Never pass secrets, passwords or customer details. */
export async function audit(organizationId: string, actorUserId: string | null, action: string, target?: string | null, detail?: string | null) {
  await db.auditLog.create({ data: { organizationId, actorUserId, action: action.slice(0, 120), target: target?.slice(0, 200) ?? null, detail: detail?.slice(0, 1000) ?? null } }).catch(() => null);
}
