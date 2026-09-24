import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import { DataTable, Td } from "@/components/dashboard/data-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Approvals" };

const LABEL: Record<string, string> = {
  return: "Return",
  exchange: "Exchange",
  refund: "Refund",
  cancellation: "Cancellation",
  address_change: "Address change",
};
const STATUS: Record<string, { label: string; tone: "warning" | "success" | "danger" | "neutral" | "blue" }> = {
  awaiting_approval: { label: "Awaiting approval", tone: "warning" },
  approved: { label: "Approved", tone: "blue" },
  executing: { label: "In progress", tone: "blue" },
  completed: { label: "Completed", tone: "success" },
  rejected: { label: "Rejected", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  manual_required: { label: "Needs manual handling", tone: "warning" },
};

export default async function ApprovalsPage() {
  const ctx = await requireBusiness("approvals.view");
  const supabase = await createClient();
  const { data: requests, error } = await supabase
    .from("order_action_requests")
    .select("id, action_type, status, created_at, decided_at, order:orders(name)")
    .eq("business_id", ctx.business.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Could not load approvals");

  return (
    <div className="space-y-4">
      <PageHeader title="Approvals" description="Customer requests that need your decision before anything changes on an order." />
      <Alert tone="info">
        Your AI employee never refunds, cancels or changes an order on its own. It collects the request, checks the order
        and availability, and waits here for someone on your team to approve it.
      </Alert>
      {requests.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Nothing waiting for you" description="Return, exchange, refund and cancellation requests from customers will appear here." />
      ) : (
        <DataTable head={["Request", "Order", "Status", "Received", "Decided"]}>
          {requests.map((r) => {
            const order = (Array.isArray(r.order) ? r.order[0] : r.order) as { name: string } | null;
            const st = STATUS[r.status] ?? { label: r.status, tone: "neutral" as const };
            return (
              <tr key={r.id}>
                <Td className="font-medium">{LABEL[r.action_type] ?? r.action_type}</Td>
                <Td>{order?.name ?? "—"}</Td>
                <Td><Badge tone={st.tone}>{st.label}</Badge></Td>
                <Td className="text-fg-muted">{formatDateTime(r.created_at)}</Td>
                <Td className="text-fg-muted">{formatDateTime(r.decided_at)}</Td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
