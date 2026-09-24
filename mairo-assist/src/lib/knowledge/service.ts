import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkText, estimateTokens } from "./chunk";

export const KNOWLEDGE_CATEGORIES = [
  "shipping_policy",
  "refund_policy",
  "return_policy",
  "product_info",
  "sizing_guide",
  "faq",
  "company_background",
  "business_hours",
  "contact_info",
  "support_instructions",
  "other",
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  shipping_policy: "Shipping policy",
  refund_policy: "Refund policy",
  return_policy: "Return policy",
  product_info: "Product information",
  sizing_guide: "Sizing guide",
  faq: "FAQ",
  company_background: "Company background",
  business_hours: "Business hours",
  contact_info: "Contact information",
  support_instructions: "Support instructions",
  other: "Other",
};

/** Rebuild the searchable chunks of one document. Always scoped by business. */
export async function reindexDocument(businessId: string, documentId: string, content: string) {
  const admin = createAdminClient();
  const del = await admin.from("knowledge_chunks").delete().eq("business_id", businessId).eq("document_id", documentId);
  if (del.error) throw new Error("Could not update the knowledge index");
  const chunks = chunkText(content);
  if (chunks.length > 0) {
    const ins = await admin.from("knowledge_chunks").insert(
      chunks.map((c, i) => ({ business_id: businessId, document_id: documentId, chunk_index: i, content: c, token_count: estimateTokens(c) })),
    );
    if (ins.error) throw new Error("Could not update the knowledge index");
  }
  await admin.from("knowledge_documents").update({ status: "ready", error: null }).eq("id", documentId).eq("business_id", businessId);
  return chunks.length;
}

export type KnowledgeHit = { chunkId: string; documentId: string; title: string; category: string; content: string };

export async function searchKnowledge(businessId: string, query: string, limit = 4): Promise<KnowledgeHit[]> {
  const { data, error } = await createAdminClient().rpc("search_knowledge_chunks", {
    p_business_id: businessId,
    p_query: query,
    p_limit: limit,
  });
  if (error) throw new Error("Knowledge search failed");
  return (data ?? []).map((r: { chunk_id: string; document_id: string; title: string; category: string; content: string }) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    title: r.title,
    category: r.category,
    content: r.content,
  }));
}

export async function documentsByCategory(businessId: string, categories: string[]) {
  const { data, error } = await createAdminClient()
    .from("knowledge_documents")
    .select("id, title, category, content")
    .eq("business_id", businessId)
    .eq("status", "ready")
    .in("category", categories)
    .order("updated_at", { ascending: false })
    .limit(3);
  if (error) throw new Error("Could not load policies");
  return data ?? [];
}
