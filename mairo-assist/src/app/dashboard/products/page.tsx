import { Package } from "lucide-react";
import type { Metadata } from "next";
import { DataTable, Td } from "@/components/dashboard/data-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { SearchForm } from "@/components/dashboard/search-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { loadShopifyConnection } from "@/lib/dashboard/metrics";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: PageProps<"/dashboard/products">) {
  const ctx = await requireBusiness("business.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("id, title, status, price_min, price_max, currency, total_inventory, tracks_inventory, synced_at")
    .eq("business_id", ctx.business.id)
    .is("deleted_at", null)
    .order("title")
    .limit(100);
  if (q) query = query.textSearch("search", q, { type: "websearch", config: "english" });
  const [{ data: products, error }, shopify] = await Promise.all([query, loadShopifyConnection(ctx.business.id)]);
  if (error) throw new Error("Could not load products");

  return (
    <div>
      <PageHeader title="Products" description="The catalog your AI employee answers from — synced from Shopify." actions={<SearchForm placeholder="Search products" defaultValue={q} />} />
      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={q ? "No matching products" : shopify?.status === "active" ? "No products synced yet" : "Connect Shopify to sync products"}
          description={q ? "Try different words." : "Your AI employee only recommends products that exist in your synced catalog — it never makes them up."}
          action={!q && shopify?.status !== "active" && ctx.permissions.has("integrations.view") ? <ButtonLink href="/dashboard/integrations" size="sm">Go to Integrations</ButtonLink> : undefined}
        />
      ) : (
        <DataTable head={["Product", "Status", "Price", "Inventory", "Synced"]}>
          {products.map((p) => (
            <tr key={p.id}>
              <Td className="font-medium">{p.title}</Td>
              <Td><Badge tone={p.status === "active" ? "success" : "neutral"}>{p.status}</Badge></Td>
              <Td className="tabular-nums">
                {p.price_min == null ? "—" : p.price_min === p.price_max ? formatMoney(Number(p.price_min), p.currency ?? "USD") : `${formatMoney(Number(p.price_min), p.currency ?? "USD")} – ${formatMoney(Number(p.price_max), p.currency ?? "USD")}`}
              </Td>
              <Td className="tabular-nums">{p.tracks_inventory === false ? "Not tracked" : p.total_inventory ?? "Unknown"}</Td>
              <Td className="text-fg-muted">{formatDateTime(p.synced_at)}</Td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
