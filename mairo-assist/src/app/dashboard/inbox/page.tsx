import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, Td } from "@/components/dashboard/data-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "AI Inbox" };

const STATUSES = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "ai_handling", label: "AI Handling" },
  { value: "needs_attention", label: "Needs Attention" },
  { value: "human_handling", label: "Human Handling" },
  { value: "resolved", label: "Resolved" },
] as const;

const TONE: Record<string, "neutral" | "violet" | "warning" | "blue" | "success"> = {
  new: "neutral",
  ai_handling: "violet",
  needs_attention: "warning",
  human_handling: "blue",
  resolved: "success",
};

export default async function InboxPage({ searchParams }: PageProps<"/dashboard/inbox">) {
  const ctx = await requireBusiness("inbox.view");
  const sp = await searchParams;
  const status = STATUSES.some((s) => s.value === sp.status) ? (sp.status as string) : "all";

  const supabase = await createClient();
  let query = supabase
    .from("conversations")
    .select("id, status, handled_by, subject, message_count, last_message_at, created_at, customer:customers(name, email)")
    .eq("business_id", ctx.business.id)
    .neq("channel", "preview")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data: conversations, error } = await query;
  if (error) throw new Error("Could not load conversations");

  return (
    <div>
      <PageHeader title="AI Inbox" description="Every conversation between your customers and your AI employee." />
      <nav aria-label="Filter by status" className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={s.value === "all" ? "/dashboard/inbox" : `/dashboard/inbox?status=${s.value}`}
            aria-current={status === s.value ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
              status === s.value ? "border-violet/50 bg-violet/15 text-fg" : "border-line text-fg-muted hover:text-fg",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      {conversations.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={status === "all" ? "No conversations yet" : "Nothing here"}
          description={
            status === "all"
              ? "Once your AI employee is live on your store, every customer conversation appears here — and you can take over any of them."
              : "No conversations have this status right now."
          }
        />
      ) : (
        <DataTable head={["Customer", "Subject", "Status", "Handled by", "Messages", "Last message"]}>
          {conversations.map((c) => {
            const customer = (Array.isArray(c.customer) ? c.customer[0] : c.customer) as { name: string | null; email: string | null } | null;
            return (
              <tr key={c.id} className="hover:bg-white/[0.02]">
                <Td>{customer?.name || customer?.email || <span className="text-fg-subtle">Anonymous visitor</span>}</Td>
                <Td className="max-w-xs truncate text-fg-muted">{c.subject ?? "—"}</Td>
                <Td><Badge tone={TONE[c.status] ?? "neutral"}>{STATUSES.find((s) => s.value === c.status)?.label ?? c.status}</Badge></Td>
                <Td>{c.handled_by === "human" ? "Your team" : "AI"}</Td>
                <Td className="tabular-nums">{c.message_count}</Td>
                <Td className="text-fg-muted">{formatDateTime(c.last_message_at ?? c.created_at)}</Td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
