import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  LifeBuoy,
  MessageSquare,
  PhoneForwarded,
  ShoppingBag,
  Sparkles,
  UserPlus,
  Activity as ActivityIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AiStatusControl } from "@/components/dashboard/ai-status-control";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Alert } from "@/components/ui/alert";
import { StatusDot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { loadAiEmployee, loadOverviewMetrics, loadRecentActivity, loadShopifyConnection } from "@/lib/dashboard/metrics";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

const NOTICES: Record<string, { tone: "success" | "warning"; text: string }> = {
  "password-updated": { tone: "success", text: "Your password was updated and your other devices were signed out." },
};

export default async function OverviewPage({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await requireBusiness();
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: profile }, { data: settings }, employee, shopify, metrics, activity] = await Promise.all([
    supabase.from("users").select("full_name, dashboard_view").eq("id", ctx.user.id).single(),
    supabase.from("business_settings").select("onboarding_step, onboarding_completed_at").eq("business_id", ctx.business.id).single(),
    loadAiEmployee(ctx.business.id),
    loadShopifyConnection(ctx.business.id),
    loadOverviewMetrics(ctx),
    loadRecentActivity(ctx.business.id),
  ]);

  const advanced = profile?.dashboard_view === "advanced";
  const firstName = profile?.full_name?.split(" ")[0];
  const status = employee?.status ?? "draft";
  const canActivate = Boolean(employee?.tested_at && employee?.published_version_id);
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  const period = `Last ${metrics.periodDays} days`;
  const revenue =
    metrics.aiAssistedRevenue && metrics.aiAssistedRevenue.length > 0
      ? metrics.aiAssistedRevenue.map((r) => formatMoney(r.amount, r.currency)).join(" + ")
      : formatMoney(0);

  return (
    <div className="space-y-6">
      {sp.denied === "1" && <Alert tone="warning">You don&apos;t have access to that page. Ask an owner if you need it.</Alert>}
      {sp.welcome === "1" && <Alert tone="success" title="Setup saved">Welcome to your AI employee&apos;s control center.</Alert>}
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <section className="glass glow-ring relative overflow-hidden rounded-2xl p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-violet/20 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm text-fg-muted">Welcome back{firstName ? `, ${firstName}` : ""}</p>
            <h1 className="flex items-center gap-3 text-xl font-semibold tracking-tight sm:text-2xl">
              <StatusDot tone={status === "active" ? "success" : status === "paused" ? "warning" : "neutral"} pulse={status === "active"} />
              {status === "active"
                ? `${employee?.name ?? "Your AI employee"} is active.`
                : status === "paused"
                  ? `${employee?.name ?? "Your AI employee"} is currently paused.`
                  : employee
                    ? `${employee.name} isn't live yet.`
                    : "Your AI employee hasn't been set up yet."}
            </h1>
            <p className="max-w-xl text-sm text-fg-muted">
              {status === "active"
                ? "It's answering customers on your store right now."
                : status === "paused"
                  ? "It won't answer any customer until you resume it. Your team can still reply from the inbox."
                  : "It stays off until you've tested and published it — no untested assistant ever talks to your customers."}
            </p>
          </div>
          <AiStatusControl status={status} canActivate={canActivate} canToggle={ctx.permissions.has("ai.toggle")} />
        </div>
      </section>

      {(!settings?.onboarding_completed_at || !employee || (shopify?.status !== "active" && ctx.permissions.has("integrations.view"))) && (
        <Card>
          <CardHeader>
            <CardTitle>Finish setting up</CardTitle>
            <CardDescription>A few steps stand between you and a working AI employee.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {!settings?.onboarding_completed_at && ctx.permissions.has("business.update") && (
              <ButtonLink href="/onboarding" size="sm">Continue setup (step {Math.min(settings?.onboarding_step ?? 1, 8)} of 8)</ButtonLink>
            )}
            {shopify?.status !== "active" && ctx.permissions.has("integrations.view") && (
              <ButtonLink href="/dashboard/integrations" size="sm" variant="secondary">Connect Shopify</ButtonLink>
            )}
            {ctx.permissions.has("ai.view") && (
              <ButtonLink href="/dashboard/ai-employee" size="sm" variant="secondary">Review AI employee</ButtonLink>
            )}
          </CardContent>
        </Card>
      )}

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <MetricCard label="Conversations" value={formatNumber(metrics.conversations)} hint={period} icon={MessageSquare} href="/dashboard/inbox" />
        <MetricCard
          label="Needs attention"
          value={formatNumber(metrics.needsAttention)}
          hint="Conversations waiting on your team"
          icon={AlertCircle}
          href="/dashboard/inbox?status=needs_attention"
          tone={metrics.needsAttention > 0 ? "attention" : "default"}
        />
        <MetricCard label="New leads" value={formatNumber(metrics.newLeads)} hint={period} icon={UserPlus} href="/dashboard/customers" />
        <MetricCard
          label="Awaiting approval"
          value={formatNumber(metrics.awaitingApproval)}
          hint="Order requests for you to decide"
          icon={ClipboardCheck}
          href="/dashboard/approvals"
          tone={metrics.awaitingApproval > 0 ? "attention" : "default"}
        />
        {metrics.aiAssistedOrders !== null && (
          <>
            <MetricCard label="Resolved by AI" value={formatNumber(metrics.resolvedByAi)} hint={period} icon={CheckCircle2} />
            <MetricCard label="AI-assisted orders" value={formatNumber(metrics.aiAssistedOrders)} hint={`${period} · see attribution rule`} icon={ShoppingBag} href="/dashboard/analytics" />
            <MetricCard label="AI-assisted revenue" value={revenue} hint="Linked orders only — not total store revenue" icon={DollarSign} href="/dashboard/analytics" />
          </>
        )}
        <MetricCard label="Open support requests" value={formatNumber(metrics.openSupportRequests)} hint="Tickets open or pending" icon={LifeBuoy} />
        {advanced && metrics.escalations !== null && (
          <>
            <MetricCard label="Escalations" value={formatNumber(metrics.escalations)} hint={period} icon={PhoneForwarded} />
            <MetricCard label="Product recommendations" value={formatNumber(metrics.productRecommendations ?? 0)} hint={period} icon={Sparkles} />
          </>
        )}
      </section>

      <div className={advanced ? "grid gap-6 lg:grid-cols-[1.4fr_1fr]" : "grid gap-6"}>
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>What your AI employee and team actually did.</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <EmptyState
                icon={ActivityIcon}
                title="No activity yet"
                description="When your AI employee answers questions, captures leads or shares tracking updates, it will show up here."
              />
            ) : (
              <ol className="space-y-1">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.03]">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-glow" aria-hidden />
                    <span className="flex-1 text-sm">{a.summary}</span>
                    <time className="shrink-0 text-xs text-fg-subtle" dateTime={a.created_at}>{formatDateTime(a.created_at)}</time>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {advanced && (
          <Card>
            <CardHeader>
              <CardTitle>System status</CardTitle>
              <CardDescription>Connections and configuration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <StatusRow label="AI employee" value={status === "active" ? "Active" : status === "paused" ? "Paused" : "Not live"} tone={status === "active" ? "success" : status === "paused" ? "warning" : "neutral"} />
              <StatusRow label="Tested in preview" value={employee?.tested_at ? formatDateTime(employee.tested_at) : "Not yet"} tone={employee?.tested_at ? "success" : "neutral"} />
              <StatusRow label="Published configuration" value={employee?.published_version_id ? "Published" : "Not published"} tone={employee?.published_version_id ? "success" : "neutral"} />
              <StatusRow
                label="Shopify"
                value={shopify?.status === "active" ? shopify.shop_name ?? shopify.shop_domain : shopify?.status === "reauth_required" ? "Needs reconnecting" : "Not connected"}
                tone={shopify?.status === "active" ? "success" : shopify?.status === "reauth_required" ? "danger" : "neutral"}
              />
              <StatusRow label="Last catalog sync" value={shopify?.last_sync_at ? formatDateTime(shopify.last_sync_at) : "Never"} tone={shopify?.last_sync_status === "failed" ? "danger" : "neutral"} />
              {ctx.permissions.has("usage.view") && (
                <p className="pt-2 text-xs text-fg-subtle">
                  Usage and billing details live on the <Link className="underline" href="/dashboard/billing">Billing</Link> page.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" | "neutral" }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
      <span className="text-fg-muted">{label}</span>
      <span className="flex items-center gap-2 text-right">
        <StatusDot tone={tone} />
        {value}
      </span>
    </div>
  );
}
