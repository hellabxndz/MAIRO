import { Check, CircleDashed, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { ConnectShopifyForm } from "@/components/integrations/shopify-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WidgetControls } from "@/components/widget/widget-controls";
import { WidgetPreview } from "@/components/widget/widget-preview";
import { proxyPath, shopBaseUrl } from "@/lib/shopify/config";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { parseAiConfig } from "@/lib/validation/ai-employee";

export const metadata: Metadata = { title: "Chat widget" };

/** Ask the store's App Proxy for our own config: proves Shopify forwards chat requests to us. */
async function proxyWorks(shop: string) {
  try {
    const res = await fetch(`${shopBaseUrl(shop)}${proxyPath()}/config`, { signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.headers.get("content-type")?.includes("application/json")) return false;
    const body = (await res.json()) as { enabled?: unknown };
    return typeof body.enabled === "boolean";
  } catch {
    return false;
  }
}

export default async function WidgetPage() {
  const ctx = await requireBusiness("integrations.view");
  const supabase = await createClient();
  const [{ data: conn }, { data: employee }] = await Promise.all([
    supabase.from("shopify_connections").select("shop_domain, status, scopes, widget_installed_at").eq("business_id", ctx.business.id).eq("status", "active").maybeSingle(),
    supabase.from("ai_employees").select("name, status, draft_config").eq("business_id", ctx.business.id).maybeSingle(),
  ]);
  const connected = Boolean(conn);
  const hasScope = Boolean(conn && (conn.scopes as string[]).includes("write_script_tags"));
  const proxyOk = conn ? await proxyWorks(conn.shop_domain) : false;
  const aiActive = employee?.status === "active";
  const installed = Boolean(conn?.widget_installed_at);
  const canManage = ctx.permissions.has("integrations.manage");
  const config = parseAiConfig(employee?.draft_config);
  const live = installed && proxyOk && aiActive;

  const steps = [
    { done: connected, label: "Shopify store connected", action: !connected && <Link href="/dashboard/integrations" className="underline">Connect in Integrations</Link> },
    {
      done: hasScope,
      label: "Permission to add the widget to your store",
      action: connected && !hasScope && canManage && <ConnectShopifyForm defaultShop={conn!.shop_domain} returnTo="/dashboard/widget" label="Update permissions" />,
    },
    {
      done: proxyOk,
      label: "App proxy set up in your Shopify app (lets the chat reach Mairo Assist securely)",
      action: connected && !proxyOk && (
        <p className="text-xs text-fg-muted">
          In the Shopify Dev Dashboard, open your app&apos;s version settings → <strong>App proxy</strong>: prefix <code>apps</code>, subpath{" "}
          <code>{proxyPath().split("/")[2]}</code>, proxy URL <code>https://&lt;your Mairo Assist address&gt;/api/proxy</code>. Release the version, then reload this page.
        </p>
      ),
    },
    { done: aiActive, label: `${employee?.name ?? "Your AI employee"} is active`, action: !aiActive && <Link href="/dashboard" className="underline">Test, publish and activate it</Link> },
    { done: installed, label: "Chat widget added to your store", action: null },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Chat widget" description="Put your AI employee on your store so customers can chat with it." />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader>
            <CardTitle>{live ? "Your AI employee is live on your store" : "Get the widget live"}</CardTitle>
            <CardDescription>
              {live ? "Customers see the chat bubble on every page of your online store." : "Every step below must be done before customers can chat."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ol className="space-y-3" data-testid="widget-checklist">
              {steps.map((s) => (
                <li key={s.label} className="flex gap-3 text-sm">
                  {s.done ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-label="Not done" />}
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className={s.done ? "" : "text-fg-muted"}>{s.label}</p>
                    {s.action}
                  </div>
                </li>
              ))}
            </ol>
            {canManage && connected && (
              <WidgetControls installed={installed} canInstall={hasScope} />
            )}
            {installed && !aiActive && <p className="text-xs text-warning">The widget stays hidden until your AI employee is active.</p>}
            {conn && (
              <a href={`https://${conn.shop_domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-fg-muted underline">
                Open my store <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
          </CardContent>
        </Card>
        <div className="space-y-3">
          <WidgetPreview name={employee?.name ?? "Your AI employee"} welcomeMessage={config.welcomeMessage} brandColor={config.brandColor} businessName={ctx.business.name} />
          <p className="text-xs text-fg-subtle">
            Name, welcome message, color and position come from your <Link href="/dashboard/ai-employee" className="underline">AI Employee</Link> settings (published version).
          </p>
        </div>
      </div>
    </div>
  );
}
