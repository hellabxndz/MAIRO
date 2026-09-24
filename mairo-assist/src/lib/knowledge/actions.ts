"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, PermissionError, type BusinessContext } from "@/lib/tenancy/context";
import type { Permission } from "@/lib/tenancy/permissions";
import { fieldErrors, str, type FormState } from "@/lib/validation/form";
import { extractText } from "./extract";
import { KNOWLEDGE_CATEGORIES, reindexDocument, searchKnowledge, type KnowledgeHit } from "./service";

async function allowed(p: Permission): Promise<BusinessContext | null> {
  try {
    return await authorize(p);
  } catch (e) {
    if (e instanceof PermissionError) return null;
    throw e;
  }
}

const DENIED: FormState = { message: "Only owners and admins can change the knowledge base." };

async function withinDocumentLimit(ctx: BusinessContext) {
  if (!ctx.billingEnforced) return true;
  const { count } = await createAdminClient().from("knowledge_documents").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id);
  return (count ?? 0) < (ctx.plan?.limits.knowledgeDocuments ?? 0);
}

const entrySchema = z.object({
  title: z.string().trim().min(1, "Give it a title").max(200),
  category: z.enum(KNOWLEDGE_CATEGORIES, { message: "Choose a type" }),
  content: z.string().trim().min(1, "Add some content").max(200_000, "Keep it under 200,000 characters"),
});

export async function saveKnowledgeEntry(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await allowed("knowledge.manage");
  if (!ctx) return DENIED;
  const raw = { title: str(form, "title"), category: str(form, "category"), content: str(form, "content") };
  const parsed = entrySchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };
  const id = str(form, "id");
  const admin = createAdminClient();

  let docId = id;
  if (id) {
    const { data, error } = await admin
      .from("knowledge_documents")
      .update({ ...parsed.data, status: "processing" })
      .eq("id", id)
      .eq("business_id", ctx.business.id)
      .select("id")
      .maybeSingle();
    if (error || !data) return { message: "We couldn't save that entry.", values: raw };
  } else {
    if (!(await withinDocumentLimit(ctx))) return { message: "You've reached your plan's knowledge base limit.", values: raw };
    const { data, error } = await admin
      .from("knowledge_documents")
      .insert({ ...parsed.data, business_id: ctx.business.id, source_type: "manual", status: "processing", created_by: ctx.user.id })
      .select("id")
      .single();
    if (error || !data) return { message: "We couldn't save that entry.", values: raw };
    docId = data.id;
  }
  await reindexDocument(ctx.business.id, docId, parsed.data.content);
  await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: id ? "knowledge.updated" : "knowledge.created", targetType: "knowledge_document", targetId: docId });
  revalidatePath("/dashboard/knowledge");
  return { ok: true, message: id ? "Saved. Your AI employee uses the new version right away." : "Added. Your AI employee can use it right away." };
}

export async function uploadKnowledgeFile(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await allowed("knowledge.manage");
  if (!ctx) return DENIED;
  const file = form.get("file");
  const category = z.enum(KNOWLEDGE_CATEGORIES).safeParse(str(form, "category"));
  if (!(file instanceof File) || file.size === 0) return { errors: { file: ["Choose a file"] } };
  if (!category.success) return { errors: { category: ["Choose a type"] } };
  if (!(await withinDocumentLimit(ctx))) return { message: "You've reached your plan's knowledge base limit." };

  const extracted = await extractText(file.name, new Uint8Array(await file.arrayBuffer()));
  if (!extracted.ok) return { errors: { file: [extracted.error] } };

  const title = (str(form, "title").trim() || file.name.replace(/\.[^.]+$/, "")).slice(0, 200);
  const { data, error } = await createAdminClient()
    .from("knowledge_documents")
    .insert({
      business_id: ctx.business.id,
      title,
      category: category.data,
      source_type: "upload",
      mime_type: extracted.mime,
      size_bytes: file.size,
      content: extracted.text,
      status: "processing",
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { message: "We couldn't save that file." };
  const chunks = await reindexDocument(ctx.business.id, data.id, extracted.text);
  await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "knowledge.uploaded", targetType: "knowledge_document", targetId: data.id, metadata: { bytes: file.size, chunks } });
  revalidatePath("/dashboard/knowledge");
  return { ok: true, message: `“${title}” was added (${chunks} searchable passage${chunks === 1 ? "" : "s"}). We keep the extracted text, not the file.` };
}

export async function deleteKnowledgeDocument(id: string): Promise<{ ok: boolean; message: string }> {
  const ctx = await allowed("knowledge.manage");
  if (!ctx) return { ok: false, message: DENIED.message! };
  const { data, error } = await createAdminClient().from("knowledge_documents").delete().eq("id", id).eq("business_id", ctx.business.id).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "We couldn't delete that entry." };
  await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "knowledge.deleted", targetType: "knowledge_document", targetId: id });
  revalidatePath("/dashboard/knowledge");
  return { ok: true, message: "Deleted." };
}

export async function inspectKnowledge(query: string): Promise<{ ok: boolean; hits: KnowledgeHit[]; message?: string }> {
  const ctx = await allowed("knowledge.view");
  if (!ctx) return { ok: false, hits: [], message: "You don't have access to the knowledge base." };
  const q = typeof query === "string" ? query.trim().slice(0, 200) : "";
  if (q.length < 2) return { ok: false, hits: [], message: "Type a question to test." };
  return { ok: true, hits: await searchKnowledge(ctx.business.id, q, 5) };
}
