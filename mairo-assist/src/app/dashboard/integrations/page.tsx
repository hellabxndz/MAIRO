import { CheckCircle2, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { ConnectShopifyForm, DisconnectShopifyButton, SyncNowButton } from "@/components/integrations/shopify-forms";
import { Alert } from "@/components/ui/alert";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { loadShopifyConnection } from "@/lib/dashboard/metrics";
import { isShopifyConfigured } from "@/lib/env";
import { normalizeShopDomain } from "@/lib/shopify/oauth";
import { requireBusiness } from "@/lib/tenancy/context";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Integrations" };

const STATUS = {
  active: { label: "Connected", tone: "success" },
  pending: { label: "Connecting", tone: "warning" },
  reauth_required: { label: "Needs reconnecting", tone: "danger" },
  disconnected: { label: "Disconnected", tone: "neutral" },
  uninstalled: { label: "App uninstalled", tone: "neutral" },
} as const;

const SYNC = {
  running: "Syncing…",
  succeeded: "Up to date",
  partial: "Partly synced",
  failed: "Last sync failed",
} as const;

/** Messages for ?shopify_error= codes set by the OAuth callback. */
const ERRORS: Record<string, string> = {
  denied: "The connection was cancelled on Shopify. Nothing was changed.",
  invalid_signature: "Shopify's response couldn't be verified, so we didn't connect. Please try again.",
  expired: "That connection attempt expired. Please start again.",
  state_mismatch: "That connection was started in a different browser or tab. Please start again here.",
  shop_mismatch: "Shopify returned a different store than the one you entered. Please try again.",
  wrong_user: "Please finish connecting while signed in as the person who started it.",
  forbidden: "You don't have permission to manage integrations for this business.",
  token_exchange: "Shopify didn't grant access. Please try again.",
  other_store_connected: "Another store is already connected. Disconnect it first.",
  store_in_use: "That store is already connected to another Mairo Assist business.",
  validation_failed: "We got access but couldn't read the store. Please try connecting again.",
  not_configured: "Shopify isn't configured on this deployment yet.",
  invalid_request: "Shopify's response was incomplete. Please try again.",
  save_failed: "We couldn't save the connection. Please try again.",
};

export default async function IntegrationsPage({ searchParams }: PageProps<"/dashboard/integrations">) {
  const ctx = await requireBusiness("integrations.view");
  const sp = await searchParams;
  const connection = await loadShopifyConnection(ctx.business.id);
  const status = connection ? STATUS[connection.status as keyof typeof STATUS] : null;
  const connected = connection?.status === "active";
  const live = connected || connection?.status === "pending" || connection?.status === "reauth_required";
  const canManage = ctx.permissions.has("integrations.manage");
  const errorCode = typeof sp.shopify_error === "string" ? sp.shopify_error : null;
  const justConnected = sp.shopify === "connected" && connected;
  const prefill = normalizeShopDomain(sp.shop) ?? (connection?.status === "reauth_required" ? connection.shop_domain : undefined);

  return (
    <div className="space-y-6">
      <PageHeader title="Integrations" description="Connect the systems your AI employee works with." />
      {justConnected && (
        <Alert tone="success" title="Store connected">
          We&apos;re syncing your products and recent orders now. Large catalogs can take a few minutes.
        </Alert>
      )}
      {errorCode && <Alert tone="danger">{ERRORS[errorCode] ?? "The store couldn't be connected. Please try again."}</Alert>}
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
            {status ? <Badge tone={status.tone}>{status.label}</Badge> : <Badge>Not connected</Badge>}
          </div>

          {connection && live && (
            <dl className="grid gap-3 rounded-xl border border-line p-4 text-sm sm:grid-cols-3" data-testid="shopify-status">
              <div><dt className="text-xs text-fg-subtle">Store</dt><dd>{connection.shop_name ?? connection.shop_domain}<span className="block text-xs text-fg-subtle">{connection.shop_domain}</span></dd></div>
              <div>
                <dt className="text-xs text-fg-subtle">Connection</dt>
                <dd className="flex items-center gap-2"><StatusDot tone={connected ? "success" : "warning"} />{status?.label}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">Sync</dt>
                <dd>
                  {connection.last_sync_status ? SYNC[connection.last_sync_status as keyof typeof SYNC] : "Not synced yet"}
                  {connection.last_sync_at && <span className="block text-xs text-fg-subtle">Last completed {formatDateTime(connection.last_sync_at)}</span>}
                </dd>
              </div>
              <div><dt className="text-xs text-fg-subtle">Products synced</dt><dd className="tabular-nums">{connection.products_synced ?? "—"}</dd></div>
              <div><dt className="text-xs text-fg-subtle">Orders synced (last 60 days)</dt><dd className="tabular-nums">{connection.orders_synced ?? "—"}</dd></div>
              <div>
                <dt className="text-xs text-fg-subtle">Customer details</dt>
                <dd>{connection.customer_data_enabled ? "Included" : "Not included"}</dd>
              </div>
            </dl>
          )}
          {connected && !connection?.customer_data_enabled && (
            <p className="text-xs text-fg-subtle">
              Customer names and emails aren&apos;t synced until Shopify approves this app for protected customer data. Orders still sync without them.
            </p>
          )}
          {connection?.last_error && (connection.status !== "active" || connection.last_sync_status === "failed") && (
            <Alert tone="danger">{connection.last_error}</Alert>
          )}

          {canManage && connected && (
            <div className="flex flex-wrap items-start justify-between gap-3 border-t border-line pt-4">
              <SyncNowButton />
              <DisconnectShopifyButton shop={connection!.shop_domain} />
            </div>
          )}

          {canManage && !connected && (
            isShopifyConfigured() ? (
              <div className="space-y-3 border-t border-line pt-4">
                <ConnectShopifyForm defaultShop={prefill} label={connection?.status === "reauth_required" ? "Reconnect Shopify" : "Connect Shopify"} />
                <p className="text-xs text-fg-subtle">You&apos;ll approve access on Shopify&apos;s own screen — we never ask for your Shopify password. Access is read-only.</p>
                {live && <DisconnectShopifyButton shop={connection!.shop_domain} />}
              </div>
            ) : (
              <p className="text-xs text-fg-subtle">Shopify isn&apos;t configured on this deployment yet (SHOPIFY_API_KEY, SHOPIFY_API_SECRET and ENCRYPTION_KEY).</p>
            )
          )}
          {!canManage && !connected && <p className="text-xs text-fg-subtle">Ask an owner or admin to connect your Shopify store.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
