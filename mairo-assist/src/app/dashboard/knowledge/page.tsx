import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { DocumentActions, EntryForm, Inspector, UploadForm } from "@/components/knowledge/knowledge-forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CATEGORY_LABELS, KNOWLEDGE_CATEGORIES } from "@/lib/knowledge/service";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Knowledge Base" };

const OPTIONS = KNOWLEDGE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }));
const SOURCE: Record<string, string> = { manual: "Written here", upload: "Uploaded", shopify_policy: "Shopify policy" };

export default async function KnowledgePage() {
  const ctx = await requireBusiness("knowledge.view");
  const canManage = ctx.permissions.has("knowledge.manage");
  const supabase = await createClient();
  const { data: docs, error } = await supabase
    .from("knowledge_documents")
    .select("id, title, category, source_type, status, content, updated_at, size_bytes")
    .eq("business_id", ctx.business.id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Could not load knowledge base");

  return (
    <div className="space-y-6">
      <PageHeader title="Knowledge Base" description="What your AI employee knows about your business — only yours, never shared with other businesses." />
      <Alert tone="info">
        For order status, prices and stock your AI employee always uses live store data, never these documents. Text in
        these documents is treated as information — it can&apos;t change your AI employee&apos;s safety rules.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Test what your AI employee finds</CardTitle>
          <CardDescription>Ask a customer question and see exactly which passages it would use to answer.</CardDescription>
        </CardHeader>
        <CardContent><Inspector /></CardContent>
      </Card>

      {canManage && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Add an entry</CardTitle><CardDescription>FAQs, sizing notes, business hours — anything customers ask.</CardDescription></CardHeader>
            <CardContent><EntryForm options={OPTIONS} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Upload a document</CardTitle><CardDescription>We read the text and make it searchable.</CardDescription></CardHeader>
            <CardContent><UploadForm options={OPTIONS} /></CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Everything your AI knows ({docs.length})</CardTitle></CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <EmptyState icon={BookOpen} title="Nothing here yet" description="Add your shipping, return and refund policies and common questions so your AI employee can answer from them." />
          ) : (
            <ul className="divide-y divide-line">
              {docs.map((d) => (
                <li key={d.id} className="space-y-2 py-4" data-testid="knowledge-doc">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{d.title}</p>
                    <Badge tone="violet">{CATEGORY_LABELS[d.category as keyof typeof CATEGORY_LABELS] ?? d.category}</Badge>
                    <Badge>{SOURCE[d.source_type] ?? d.source_type}</Badge>
                    {d.status !== "ready" && <Badge tone={d.status === "failed" ? "danger" : "warning"}>{d.status}</Badge>}
                    <span className="ml-auto text-xs text-fg-subtle">Updated {formatDateTime(d.updated_at)}</span>
                  </div>
                  <DocumentActions doc={{ id: d.id, title: d.title, category: d.category, content: d.content ?? "" }} options={OPTIONS} canManage={canManage} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
