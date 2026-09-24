import "server-only";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";

type AuditEntry = {
  businessId: string | null;
  actorUserId: string | null;
  actorType?: "user" | "platform_admin" | "system" | "ai";
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Append to the audit log. Written with the service role because users can
 * never write audit rows themselves (they could otherwise forge them).
 */
export async function recordAudit(entry: AuditEntry) {
  if (!isSupabaseAdminConfigured()) {
    log.warn("audit.skipped_not_configured", { action: entry.action });
    return;
  }
  const { error } = await createAdminClient()
    .from("audit_logs")
    .insert({
      business_id: entry.businessId,
      actor_user_id: entry.actorUserId,
      actor_type: entry.actorType ?? "user",
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      metadata: entry.metadata ?? {},
    });
  if (error) log.error("audit.write_failed", { action: entry.action, error: error.message });
}

/** Merchant-facing activity feed entry — only for events that really happened. */
export async function recordActivity(entry: {
  businessId: string;
  type: string;
  summary: string;
  conversationId?: string;
  customerId?: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isSupabaseAdminConfigured()) return;
  const { error } = await createAdminClient()
    .from("activity_logs")
    .insert({
      business_id: entry.businessId,
      type: entry.type,
      summary: entry.summary,
      conversation_id: entry.conversationId ?? null,
      customer_id: entry.customerId ?? null,
      order_id: entry.orderId ?? null,
      metadata: entry.metadata ?? {},
    });
  if (error) log.error("activity.write_failed", { type: entry.type, error: error.message });
}
