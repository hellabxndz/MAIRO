"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runTurn, type StoredMessage } from "@/lib/ai/turn";
import { recordAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { authorize, PermissionError, type BusinessContext } from "@/lib/tenancy/context";
import type { Permission } from "@/lib/tenancy/permissions";
import { aiEmployeeConfigSchema } from "@/lib/validation/ai-employee";
import { aiNameSchema } from "@/lib/validation/business";
import { fieldErrors, str, type FormState } from "@/lib/validation/form";

async function allowed(permission: Permission): Promise<BusinessContext | null> {
  try {
    return await authorize(permission);
  } catch (e) {
    if (e instanceof PermissionError) return null;
    throw e;
  }
}

async function employeeOf(businessId: string) {
  const { data } = await createAdminClient()
    .from("ai_employees")
    .select("id, name, avatar_url, draft_config, published_version_id")
    .eq("business_id", businessId)
    .maybeSingle();
  return data;
}

const avatarSchema = z
  .string()
  .trim()
  .max(2048)
  .transform((v) => (v === "" ? null : v))
  .pipe(z.url({ protocol: /^https$/, message: "Use an https:// image address" }).nullable());

export async function saveAiDraft(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await allowed("ai.configure");
  if (!ctx) return { message: "You don't have permission to change the AI employee." };
  const employee = await employeeOf(ctx.business.id);
  if (!employee) return { message: "Set up your AI employee first." };

  const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const name = aiNameSchema.safeParse({ name: str(form, "name") });
  const avatar = avatarSchema.safeParse(str(form, "avatarUrl"));
  const config = aiEmployeeConfigSchema.safeParse({
    welcomeMessage: str(form, "welcomeMessage"),
    personality: str(form, "personality"),
    communicationStyle: str(form, "communicationStyle"),
    formality: str(form, "formality"),
    salesApproach: str(form, "salesApproach"),
    serviceApproach: str(form, "serviceApproach"),
    escalation: {
      offerHumanWhenUpset: form.get("offerHumanWhenUpset") === "on",
      escalateOnRequest: form.get("escalateOnRequest") === "on",
      notes: str(form, "escalationNotes"),
    },
    instructions: str(form, "instructions"),
    brandColor: str(form, "brandColor"),
    bubblePosition: str(form, "bubblePosition"),
    logoUrl: str(form, "logoUrl") || undefined,
  });
  if (!name.success || !avatar.success || !config.success) {
    return {
      errors: {
        ...(name.success ? {} : fieldErrors(name.error)),
        ...(avatar.success ? {} : { avatarUrl: [avatar.error.issues[0]?.message ?? "Invalid address"] }),
        ...(config.success ? {} : fieldErrors(config.error)),
      },
      values,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_employees")
    .update({ name: name.data.name, avatar_url: avatar.data, draft_config: config.data })
    .eq("id", employee.id)
    .eq("business_id", ctx.business.id);
  if (error) return { message: "We couldn't save your changes. Please try again.", values };

  await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "ai_employee.draft_saved", targetType: "ai_employee", targetId: employee.id });
  revalidatePath("/dashboard/ai-employee");
  return { ok: true, message: "Draft saved. Test it in the preview, then publish when you're happy." };
}

export type SimpleResult = { ok: boolean; message: string };

export async function publishAiEmployee(note: string): Promise<SimpleResult> {
  const ctx = await allowed("ai.publish");
  if (!ctx) return { ok: false, message: "You don't have permission to publish." };
  const employee = await employeeOf(ctx.business.id);
  if (!employee) return { ok: false, message: "Set up your AI employee first." };

  const admin = createAdminClient();
  const { data: last } = await admin
    .from("ai_employee_versions")
    .select("version")
    .eq("ai_employee_id", employee.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (last?.version ?? 0) + 1;
  const { data: created, error } = await admin
    .from("ai_employee_versions")
    .insert({
      business_id: ctx.business.id,
      ai_employee_id: employee.id,
      version,
      name: employee.name,
      config: aiEmployeeConfigSchema.parse(employee.draft_config ?? {}),
      note: note.trim().slice(0, 280) || null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !created) {
    return { ok: false, message: error?.code === "23505" ? "Someone else just published. Refresh and try again." : "We couldn't publish. Please try again." };
  }
  const { error: pubErr } = await admin.from("ai_employees").update({ published_version_id: created.id }).eq("id", employee.id).eq("business_id", ctx.business.id);
  if (pubErr) return { ok: false, message: "We couldn't publish. Please try again." };

  await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "ai_employee.published", targetType: "ai_employee_version", targetId: created.id, metadata: { version } });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `Version ${version} published. Customers will see it on your store.` };
}

export async function restoreVersion(versionId: string): Promise<SimpleResult> {
  const ctx = await allowed("ai.configure");
  if (!ctx) return { ok: false, message: "You don't have permission to change the AI employee." };
  const admin = createAdminClient();
  const { data: v } = await admin
    .from("ai_employee_versions")
    .select("id, version, name, config, ai_employee_id")
    .eq("id", versionId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!v) return { ok: false, message: "Version not found." };
  const { error } = await admin
    .from("ai_employees")
    .update({ name: v.name, draft_config: aiEmployeeConfigSchema.parse(v.config) })
    .eq("id", v.ai_employee_id)
    .eq("business_id", ctx.business.id);
  if (error) return { ok: false, message: "We couldn't restore that version." };
  await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "ai_employee.version_restored", targetType: "ai_employee_version", targetId: v.id, metadata: { version: v.version } });
  revalidatePath("/dashboard/ai-employee");
  return { ok: true, message: `Version ${v.version} restored to your draft. Publish it to make it live.` };
}

export type PreviewResult =
  | { ok: true; conversationId: string; messages: StoredMessage[]; notice?: string }
  | { ok: false; message: string; conversationId?: string; messages?: StoredMessage[] };

async function previewConversation(ctx: BusinessContext, fresh: boolean) {
  const admin = createAdminClient();
  if (!fresh) {
    const { data } = await admin
      .from("conversations")
      .select("id")
      .eq("business_id", ctx.business.id)
      .eq("channel", "preview")
      .eq("preview_user_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data.id as string;
  } else {
    await admin.from("conversations").delete().eq("business_id", ctx.business.id).eq("channel", "preview").eq("preview_user_id", ctx.user.id);
  }
  const { data, error } = await admin
    .from("conversations")
    .insert({ business_id: ctx.business.id, channel: "preview", preview_user_id: ctx.user.id, subject: "Preview" })
    .select("id")
    .single();
  if (error || !data) throw new Error("Could not start a preview");
  return data.id as string;
}

async function previewMessages(conversationId: string) {
  const { data } = await createAdminClient()
    .from("conversation_messages")
    .select("id, sender_type, content, sources, tool_names, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at");
  return (data ?? []) as StoredMessage[];
}

export async function sendPreviewMessage(text: string): Promise<PreviewResult> {
  const ctx = await allowed("ai.configure");
  if (!ctx) return { ok: false, message: "You don't have permission to test the AI employee." };
  if (typeof text !== "string") return { ok: false, message: "Type a message first." };
  const conversationId = await previewConversation(ctx, false);
  const result = await runTurn({ businessId: ctx.business.id, conversationId, mode: "preview", customerText: text });
  const messages = await previewMessages(conversationId);
  if (result.status === "rejected") return { ok: false, message: result.message, conversationId, messages };
  if (result.status === "replied") revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    conversationId,
    messages,
    notice: result.status === "skipped" ? "The AI didn't reply to this preview." : undefined,
  };
}

export async function resetPreview(): Promise<PreviewResult> {
  const ctx = await allowed("ai.configure");
  if (!ctx) return { ok: false, message: "You don't have permission to test the AI employee." };
  const conversationId = await previewConversation(ctx, true);
  return { ok: true, conversationId, messages: [] };
}
