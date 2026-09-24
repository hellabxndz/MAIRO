import { ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import { DataTable, Td } from "@/components/dashboard/data-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { SearchForm } from "@/components/dashboard/search-form";
import { likePattern } from "@/lib/search";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { loadShopifyConnection } from "@/lib/dashboard/metrics";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: PageProps<"/dashboard/orders">) {
  const ctx = await requireBusiness("orders.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("id, name, processed_at, financial_status, fulfillment_status, display_status, total_price, currency")
    .eq("business_id", ctx.business.id)
    .order("processed_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (q) query = query.ilike("name", likePattern(q));
  const [{ data: orders, error }, shopify] = await Promise.all([query, loadShopifyConnection(ctx.business.id)]);
  if (error) throw new Error("Could not load orders");

  return (
    <div>
      <PageHeader title="Orders" description="Orders synced from your Shopify store." actions={<SearchForm placeholder="Search order number" defaultValue={q} />} />
      {orders.length === 0 ? (
        shopify?.status === "active" ? (
          <EmptyState icon={ShoppingBag} title={q ? "No matching orders" : "No orders synced yet"} description={q ? "Try a different order number." : "Orders appear here after your store's next sync."} />
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="Connect Shopify to see orders"
            description="Order lookup, tracking and return or exchange requests all use your store's real order data."
            action={ctx.permissions.has("integrations.view") ? <ButtonLink href="/dashboard/integrations" size="sm">Go to Integrations</ButtonLink> : undefined}
          />
        )
      ) : (
        <DataTable head={["Order", "Date", "Payment", "Fulfillment", "Total"]}>
          {orders.map((o) => (
            <tr key={o.id}>
              <Td className="font-medium">{o.name}</Td>
              <Td className="text-fg-muted">{formatDateTime(o.processed_at)}</Td>
              <Td><Badge>{o.financial_status?.toLowerCase().replaceAll("_", " ") ?? "—"}</Badge></Td>
              <Td><Badge tone={o.fulfillment_status === "FULFILLED" ? "success" : "neutral"}>{(o.display_status ?? o.fulfillment_status ?? "—").toLowerCase().replaceAll("_", " ")}</Badge></Td>
              <Td className="tabular-nums">{formatMoney(o.total_price == null ? null : Number(o.total_price), o.currency ?? "USD")}</Td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
