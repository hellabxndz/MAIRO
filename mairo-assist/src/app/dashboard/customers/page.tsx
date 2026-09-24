import { UserRound } from "lucide-react";
import type { Metadata } from "next";
import { DataTable, Td } from "@/components/dashboard/data-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { SearchForm } from "@/components/dashboard/search-form";
import { likePattern, orValue } from "@/lib/search";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Customers" };

const LEAD: Record<string, string> = { none: "—", new: "New lead", contacted: "Contacted", qualified: "Qualified", converted: "Converted", lost: "Lost" };

export default async function CustomersPage({ searchParams }: PageProps<"/dashboard/customers">) {
  const ctx = await requireBusiness("customers.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select("id, name, email, orders_count, total_spent, currency, lead_status, last_seen_at, first_seen_at")
    .eq("business_id", ctx.business.id)
    .is("redacted_at", null)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (q) {
    const p = orValue(likePattern(q));
    query = query.or(`name.ilike.${p},email.ilike.${p}`);
  }
  const { data: customers, error } = await query;
  if (error) throw new Error("Could not load customers");

  return (
    <div>
      <PageHeader title="Customers" description="People who've talked to your AI employee or bought from your store." actions={<SearchForm placeholder="Search name or email" defaultValue={q} />} />
      {customers.length === 0 ? (
        <EmptyState icon={UserRound} title={q ? "No matching customers" : "No customers yet"} description={q ? "Try a different search." : "Customers appear when they chat with your AI employee or when your Shopify store syncs."} />
      ) : (
        <DataTable head={["Customer", "Orders", "Spent", "Lead status", "Last seen"]}>
          {customers.map((c) => (
            <tr key={c.id}>
              <Td>
                <p className="font-medium">{c.name || "—"}</p>
                <p className="text-xs text-fg-muted">{c.email ?? "No email"}</p>
              </Td>
              <Td className="tabular-nums">{c.orders_count ?? "—"}</Td>
              <Td className="tabular-nums">{c.total_spent == null ? "—" : formatMoney(Number(c.total_spent), c.currency ?? "USD")}</Td>
              <Td>{c.lead_status === "none" ? "—" : <Badge tone="violet">{LEAD[c.lead_status] ?? c.lead_status}</Badge>}</Td>
              <Td className="text-fg-muted">{formatDateTime(c.last_seen_at ?? c.first_seen_at)}</Td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
