import { BarChart3, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { loadAnalytics } from "@/lib/analytics/load";
import { resolveRange } from "@/lib/analytics/summary";
import { requireBusiness } from "@/lib/tenancy/context";
import { cn, formatMoney, formatNumber } from "@/lib/utils";
import {
  CheckCircle2,
  ClipboardList,
  MessageSquare,
  MousePointerClick,
  PhoneForwarded,
  Repeat,
  ShoppingBag,
  Sparkles,
  Undo2,
  UserPlus,
  Users,
  DollarSign,
} from "lucide-react";

export const metadata: Metadata = { title: "Analytics" };

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
] as const;

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export default async function AnalyticsPage({ searchParams }: PageProps<"/dashboard/analytics">) {
  const ctx = await requireBusiness("analytics.view");
  const sp = await searchParams;
  const range = resolveRange({ range: sp.range, from: sp.from, to: sp.to });
  const s = await loadAnalytics(ctx.business.id, range);
  const exportQuery = new URLSearchParams({ range: range.key, ...(range.key === "custom" ? { from: String(sp.from), to: String(sp.to) } : {}) });
  const hasData = s.totalConversations > 0 || s.aiAssociatedOrders > 0 || s.leadsCollected > 0;
  const revenue = s.aiAssociatedRevenue.length ? s.aiAssociatedRevenue.map((r) => formatMoney(r.amount, r.currency)).join(" + ") : formatMoney(0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={`What actually happened — ${range.label.toLowerCase()}.`}
        actions={ctx.permissions.has("analytics.export") ? (
          <ButtonLink href={`/dashboard/analytics/export?${exportQuery}`} variant="secondary" size="sm" prefetch={false}>
            <Download aria-hidden /> Export CSV
          </ButtonLink>
        ) : undefined}
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Date range" className="flex gap-1.5 overflow-x-auto">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/dashboard/analytics?range=${r.key}`}
              aria-current={range.key === r.key ? "page" : undefined}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs", range.key === r.key ? "border-violet/50 bg-violet/15 text-fg" : "border-line text-fg-muted hover:text-fg")}
            >
              {r.label}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <input type="hidden" name="range" value="custom" />
          <label className="flex items-center gap-1.5">From <Input type="date" name="from" defaultValue={range.key === "custom" ? String(sp.from) : ""} className="h-9 w-40" required /></label>
          <label className="flex items-center gap-1.5">To <Input type="date" name="to" defaultValue={range.key === "custom" ? String(sp.to) : ""} className="h-9 w-40" required /></label>
          <button className={cn("h-9 rounded-xl border px-3", range.key === "custom" ? "border-violet/50 bg-violet/15 text-fg" : "border-line hover:text-fg")}>Custom range</button>
        </form>
      </div>

      {!hasData && (
        <EmptyState icon={BarChart3} title="Not enough data yet" description="Numbers appear here as customers talk to your AI employee. Nothing is estimated or filled in." />
      )}

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Conversation metrics">
        <MetricCard label="Total conversations" value={formatNumber(s.totalConversations)} icon={MessageSquare} />
        <MetricCard label="Unique customers" value={formatNumber(s.uniqueCustomers)} hint="Identified customers only" icon={Users} />
        <MetricCard label="AI resolution rate" value={pct(s.aiResolutionRate)} hint={`${formatNumber(s.resolvedByAi)} resolved without a person`} icon={CheckCircle2} />
        <MetricCard label="Human escalation rate" value={pct(s.escalationRate)} hint={`${formatNumber(s.escalated)} escalated`} icon={PhoneForwarded} />
        <MetricCard label="Product recommendations" value={formatNumber(s.productRecommendations)} icon={Sparkles} />
        <MetricCard label="Product link clicks" value={formatNumber(s.productLinkClicks)} icon={MousePointerClick} />
        <MetricCard label="Leads collected" value={formatNumber(s.leadsCollected)} icon={UserPlus} />
        <MetricCard label="Order requests handled" value={formatNumber(s.orderRequestsHandled)} icon={ClipboardList} />
        <MetricCard label="Return requests" value={formatNumber(s.returnRequests)} icon={Undo2} />
        <MetricCard label="Exchange requests" value={formatNumber(s.exchangeRequests)} icon={Repeat} />
        <MetricCard label="AI-associated orders" value={formatNumber(s.aiAssociatedOrders)} icon={ShoppingBag} />
        <MetricCard label="AI-associated revenue" value={revenue} hint="Not total store revenue" icon={DollarSign} />
      </section>

      <Card>
        <CardHeader><CardTitle>How we count</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-fg-muted">
          <p><strong className="text-fg">AI-associated order:</strong> an order containing a product your AI employee recommended in a conversation, placed within 7 days of that recommendation by the same shopper. It shows the AI was involved — not that it caused the sale.</p>
          <p><strong className="text-fg">AI-associated revenue</strong> is the total of those orders only. It is never your total store revenue.</p>
          <p><strong className="text-fg">AI resolution rate:</strong> conversations the AI marked resolved without a person stepping in, out of all conversations started.</p>
          <p>Test chats from the preview are never counted.</p>
        </CardContent>
      </Card>
    </div>
  );
}
