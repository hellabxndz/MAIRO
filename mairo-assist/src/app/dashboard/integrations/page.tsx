import { CheckCircle2, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadShopifyConnection } from "@/lib/dashboard/metrics";
import { isShopifyConfigured } from "@/lib/env";
import { requireBusiness } from "@/lib/tenancy/context";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Integrations" };

const STATUS = {
  active: { label: "Active", tone: "success" },
  pending: { label: "Connecting", tone: "warning" },
  reauth_required: { label: "Needs reconnecting", tone: "danger" },
  disconnected: { label: "Disconnected", tone: "neutral" },
  uninstalled: { label: "App uninstalled", tone: "neutral" },
} as const;

export default async function IntegrationsPage() {
  const ctx = await requireBusiness("integrations.view");
  const connection = await loadShopifyConnection(ctx.business.id);
  const status = connection ? STATUS[connection.status as keyof typeof STATUS] : null;
  const connected = connection?.status === "active";

  return (
    <div className="space-y-6">
      <PageHeader title="Integrations" description="Connect the systems your AI employee works with." />
      <Card>
        <CardContent className="space-y-5 pt-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#95bf47]/15 ring-1 ring-[#95bf47]/30">
                <ShoppingBag className="size-6 text-[#95bf47]" aria-hidden />
              </div>
              <div>
                <p className="flex items-center gap-2 font-medium">
                  Shopify {connected && <CheckCircle2 className="size-4 text-success" aria-label="Connected" />}
                </p>
                <p className="text-sm text-fg-muted">Products, inventory, orders and fulfillment — read through Shopify&apos;s official API.</p>
              </div>
            </div>
            {status ? <Badge tone={status.tone === "neutral" ? "neutral" : status.tone}>{status.label}</Badge> : <Badge>Not connected</Badge>}
          </div>

          {connection && connection.status !== "disconnected" && connection.status !== "uninstalled" && (
            <dl className="grid gap-3 rounded-xl border border-line p-4 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-fg-subtle">Store name</dt><dd>{connection.shop_name ?? connection.shop_domain}</dd></div>
              <div>
                <dt className="text-xs text-fg-subtle">Connection status</dt>
                <dd className="flex items-center gap-2"><StatusDot tone={connected ? "success" : "warning"} />{status?.label}</dd>
              </div>
              <div><dt className="text-xs text-fg-subtle">Last sync</dt><dd>{connection.last_sync_at ? formatDateTime(connection.last_sync_at) : "Not synced yet"}</dd></div>
            </dl>
          )}
          {connection?.last_error && connection.status !== "active" && <Alert tone="danger">{connection.last_error}</Alert>}

          {!connected && (
            <div className="space-y-2">
              <Button disabled>Connect Shopify</Button>
              <p className="text-xs text-fg-subtle">
                {isShopifyConfigured()
                  ? "The Shopify connection flow is being finalized and will be enabled in an upcoming release."
                  : "Shopify isn't configured on this deployment yet (SHOPIFY_API_KEY, SHOPIFY_API_SECRET and ENCRYPTION_KEY)."}{" "}
                You&apos;ll approve access on Shopify&apos;s own screen — we never ask for your Shopify password.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
