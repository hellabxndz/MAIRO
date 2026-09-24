import { Check } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPlanPrice, PLAN_LIST } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const ctx = await requireBusiness("billing.view");
  const supabase = await createClient();
  const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
  const [{ data: sub }, { data: usage }] = await Promise.all([
    supabase.from("subscriptions").select("plan_key, status, provider, current_period_end, cancel_at_period_end").eq("business_id", ctx.business.id).maybeSingle(),
    supabase.from("usage_counters").select("conversations, model_requests").eq("business_id", ctx.business.id).eq("period_start", periodStart).maybeSingle(),
  ]);

  const limits = ctx.plan?.limits;

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Your plan, usage and invoices." />
      {!ctx.billingEnforced && (
        <Alert tone="info" title="Billing isn't switched on yet">
          No one is charged during early access. Your business has access to Pro features until paid plans launch — you&apos;ll
          choose a plan before any charge happens.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Current plan</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {sub ? (
              <>
                <p className="text-lg font-semibold capitalize">{sub.plan_key} <Badge tone={sub.status === "active" ? "success" : "warning"}>{sub.status.replace("_", " ")}</Badge></p>
                {sub.current_period_end && <p className="text-fg-muted">{sub.cancel_at_period_end ? "Ends" : "Renews"} {formatDateTime(sub.current_period_end)}</p>}
              </>
            ) : (
              <p className="text-fg-muted">{ctx.billingEnforced ? "No active plan." : "Early access (Pro features, no charge)."}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Usage this month</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <UsageBar label="Conversations" used={usage?.conversations ?? 0} limit={limits?.conversationsPerMonth} />
            <UsageBar label="AI requests" used={usage?.model_requests ?? 0} limit={limits?.aiRequestsPerMonth} />
          </CardContent>
        </Card>
      </div>

      <section aria-label="Plans" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_LIST.map((p) => (
          <Card key={p.key} className={cn(sub?.plan_key === p.key && "ring-1 ring-violet/50")}>
            <CardHeader>
              <CardTitle>{p.name}</CardTitle>
              <p className="text-2xl font-semibold">{formatPlanPrice(p)}<span className="text-sm font-normal text-fg-muted">/month</span></p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm text-fg-muted">
                {p.highlights.map((h) => <li key={h} className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-violet-glow" aria-hidden />{h}</li>)}
              </ul>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit?: number }) {
  const ratio = limit ? Math.min(1, used / limit) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between"><span>{label}</span><span className="tabular-nums text-fg-muted">{formatNumber(used)}{limit ? ` / ${formatNumber(limit)}` : ""}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className={cn("h-full rounded-full", ratio >= 1 ? "bg-danger" : ratio >= 0.8 ? "bg-warning" : "bg-gradient-to-r from-violet to-electric")} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
