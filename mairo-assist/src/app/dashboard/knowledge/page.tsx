import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import { DataTable, Td } from "@/components/dashboard/data-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Knowledge Base" };

const CATEGORY: Record<string, string> = {
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

export default async function KnowledgePage() {
  const ctx = await requireBusiness("knowledge.view");
  const supabase = await createClient();
  const { data: docs, error } = await supabase
    .from("knowledge_documents")
    .select("id, title, category, source_type, status, updated_at")
    .eq("business_id", ctx.business.id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Could not load knowledge base");

  return (
    <div className="space-y-4">
      <PageHeader title="Knowledge Base" description="What your AI employee knows about your business — only yours, never shared with other businesses." />
      <Alert tone="info">
        For order status, prices and stock your AI employee always uses live store data, never old documents. Document
        uploads and FAQ editing arrive with the AI conversation release.
      </Alert>
      {docs.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nothing here yet"
          description="Add your shipping, return and refund policies so your AI employee can answer from them."
          action={ctx.permissions.has("knowledge.manage") ? <ButtonLink href="/onboarding?step=6" size="sm">Add policies</ButtonLink> : undefined}
        />
      ) : (
        <DataTable head={["Title", "Type", "Source", "Updated"]}>
          {docs.map((d) => (
            <tr key={d.id}>
              <Td className="font-medium">{d.title}</Td>
              <Td><Badge tone="violet">{CATEGORY[d.category] ?? d.category}</Badge></Td>
              <Td className="text-fg-muted">{d.source_type === "manual" ? "Written in Mairo Assist" : d.source_type === "upload" ? "Uploaded" : "Shopify policy"}</Td>
              <Td className="text-fg-muted">{formatDateTime(d.updated_at)}</Td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
