"use server";

import { revalidatePath } from "next/cache";
import { recordActivity, recordAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { authorize, PermissionError, type BusinessContext } from "@/lib/tenancy/context";
import type { Permission } from "@/lib/tenancy/permissions";

export type InboxResult = { ok: boolean; message: string };

async function allowed(p: Permission): Promise<BusinessContext | null> {
  try {
    return await authorize(p);
  } catch (e) {
    if (e instanceof PermissionError) return null;
    throw e;
  }
}

/** Load a live conversation of the caller's business (never a preview). */
async function conversationFor(ctx: BusinessContext, id: string) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createAdminClient()
    .from("conversations")
    .select("id, status, handled_by, assigned_user_id")
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .neq("channel", "preview")
    .maybeSingle();
  return data;
}

async function displayName(ctx: BusinessContext) {
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("full_name").eq("id", ctx.user.id).single();
  return data?.full_name?.split(" ")[0] || "Someone";
}

async function systemMessage(businessId: string, conversationId: string, content: string) {
  await createAdminClient().from("conversation_messages").insert({ business_id: businessId, conversation_id: conversationId, sender_type: "system", content });
}

export async function takeOver(conversationId: string): Promise<InboxResult> {
  const ctx = await allowed("inbox.takeover");
  if (!ctx) return { ok: false, message: "You don't have permission to take over conversations." };
  const conv = await conversationFor(ctx, conversationId);
  if (!conv) return { ok: false, message: "Conversation not found." };
  if (conv.handled_by === "human" && conv.assigned_user_id === ctx.user.id) return { ok: true, message: "You're already handling this conversation." };

  const { error } = await createAdminClient()
    .from("conversations")
    .update({ handled_by: "human", status: "human_handling", assigned_user_id: ctx.user.id })
    .eq("id", conv.id)
    .eq("business_id", ctx.business.id);
  if (error) return { ok: false, message: "We couldn't take over this conversation." };
  await systemMessage(ctx.business.id, conv.id, `${await displayName(ctx)} from the team joined the conversation.`);
  await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "inbox.taken_over", targetType: "conversation", targetId: conv.id });
  revalidatePath("/dashboard/inbox");
  return { ok: true, message: "You're now handling this conversation. The AI won't reply until you hand it back." };
}

export async function handBackToAi(conversationId: string): Promise<InboxResult> {
  const ctx = await allowed("inbox.takeover");
  if (!ctx) return { ok: false, message: "You don't have permission to do that." };
  const conv = await conversationFor(ctx, conversationId);
  if (!conv) return { ok: false, message: "Conversation not found." };
  if (conv.handled_by === "ai") return { ok: true, message: "The AI is already handling this conversation." };

  const { error } = await createAdminClient()
    .from("conversations")
    .update({ handled_by: "ai", status: "ai_handling", assigned_user_id: null })
    .eq("id", conv.id)
    .eq("business_id", ctx.business.id);
  if (error) return { ok: false, message: "We couldn't hand this conversation back." };
  await systemMessage(ctx.business.id, conv.id, "The AI assistant is back in this conversation.");
  await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "inbox.handed_back", targetType: "conversation", targetId: conv.id });
  revalidatePath("/dashboard/inbox");
  return { ok: true, message: "Handed back to the AI." };
}

export async function replyAsHuman(conversationId: string, text: string): Promise<InboxResult> {
  const ctx = await allowed("inbox.reply");
  if (!ctx) return { ok: false, message: "You don't have permission to reply." };
  const content = typeof text === "string" ? text.trim() : "";
  if (!content) return { ok: false, message: "Write a reply first." };
  if (content.length > 4000) return { ok: false, message: "Keep replies under 4,000 characters." };
  const conv = await conversationFor(ctx, conversationId);
  if (!conv) return { ok: false, message: "Conversation not found." };

  // Replying means a person is handling it: the AI must stop.
  if (conv.handled_by !== "human" || conv.status === "needs_attention" || conv.status === "resolved") {
    const taken = await takeOver(conv.id);
    if (!taken.ok) return taken;
  }
  const { error } = await createAdminClient()
    .from("conversation_messages")
    .insert({ business_id: ctx.business.id, conversation_id: conv.id, sender_type: "human", sender_user_id: ctx.user.id, content });
  if (error) return { ok: false, message: "We couldn't send your reply." };
  revalidatePath("/dashboard/inbox");
  return { ok: true, message: "Sent." };
}

export async function resolveConversation(conversationId: string): Promise<InboxResult> {
  const ctx = await allowed("inbox.reply");
  if (!ctx) return { ok: false, message: "You don't have permission to do that." };
  const conv = await conversationFor(ctx, conversationId);
  if (!conv) return { ok: false, message: "Conversation not found." };
  if (conv.status === "resolved") return { ok: true, message: "Already resolved." };

  const admin = createAdminClient();
  const { count: humanReplies } = await admin
    .from("conversation_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conv.id)
    .eq("sender_type", "human");
  const { error } = await admin
    .from("conversations")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", conv.id)
    .eq("business_id", ctx.business.id);
  if (error) return { ok: false, message: "We couldn't resolve this conversation." };

  // Counts toward the AI resolution rate only if no person had to reply.
  if (!humanReplies && conv.handled_by === "ai") {
    await admin.from("analytics_events").upsert(
      { business_id: ctx.business.id, event_type: "conversation_resolved_by_ai", conversation_id: conv.id, dedupe_key: `resolved:${conv.id}` },
      { onConflict: "business_id,dedupe_key", ignoreDuplicates: true },
    );
    await recordActivity({ businessId: ctx.business.id, type: "resolved_by_ai", summary: "AI answered a customer's questions — conversation resolved.", conversationId: conv.id });
  }
  revalidatePath("/dashboard/inbox");
  return { ok: true, message: "Marked as resolved." };
}
