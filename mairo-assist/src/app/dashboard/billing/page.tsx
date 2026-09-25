import type { Metadata } from "next";
import { CreditsMeter } from "@/components/billing/credits-meter";
import { ManageBillingButton } from "@/components/billing/plan-actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { costPricingConfigured } from "@/lib/ai/config";
import { loadCredits } from "@/lib/billing/credits";
import { formatPlanPrice, periodStart } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing & usage" };

export default async function BillingPage() {
  const ctx = await requireBusiness("billing.view");
  const supabase = await createClient();
  const [credits, { data: usage }, { data: invoices }] = await Promise.all([
    loadCredits(ctx.business.id),
    supabase.from("usage_counters").select("model_requests, input_tokens, output_tokens, estimated_cost_usd").eq("business_id", ctx.business.id).eq("period_start", periodStart()).maybeSingle(),
    supabase.from("invoices").select("id, amount_cents, currency, status, hosted_url, created_at").eq("business_id", ctx.business.id).order("created_at", { ascending: false }).limit(12),
  ]);
  const { plan, subscription: sub } = credits;

  return (
    <div className="space-y-6">
      <PageHeader title="Billing & usage" description="Your plan, AI credits and invoices." actions={<ButtonLink href="/dashboard/upgrade" size="sm">Compare plans</ButtonLink>} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Current plan</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2 text-lg font-semibold">
              {plan.key === "free" ? "Free Forever" : plan.name}
              <span className="text-sm font-normal text-fg-muted">{formatPlanPrice(plan).replace("From ", "")}/month</span>
              {sub && sub.status !== "active" && <Badge tone="warning">{sub.status.replace("_", " ")}</Badge>}
            </p>
            {plan.key === "free" && <p className="text-fg-muted">Nothing is charged. Upgrade any time for more credits and features.</p>}
            {sub?.current_period_end && plan.key !== "free" && (
              <p className="text-fg-muted">{sub.cancel_at_period_end ? "Moves to Free on" : "Renews"} {formatDate(sub.current_period_end)}</p>
            )}
            {ctx.permissions.has("billing.manage") && sub?.provider === "stripe" && <ManageBillingButton />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>AI credits this month</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <CreditsMeter used={credits.used} limit={credits.limit} />
            <p className="text-xs text-fg-subtle">
              Resets {formatDate(credits.resetsAt.toISOString())}. One credit = one AI reply to a customer. Preview tests are free.
            </p>
            <p className="text-xs text-fg-subtle">
              {formatNumber(Number(usage?.model_requests ?? 0))} AI requests · {formatNumber(Number(usage?.input_tokens ?? 0))} input /{" "}
              {formatNumber(Number(usage?.output_tokens ?? 0))} output tokens
              {costPricingConfigured() ? ` · estimated AI cost $${Number(usage?.estimated_cost_usd ?? 0).toFixed(2)}` : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
        <CardContent>
          {invoices?.length ? (
            <ul className="divide-y divide-line text-sm">
              {invoices.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                  <span>{formatDate(i.created_at)}</span>
                  <span className="tabular-nums">{formatMoney(i.amount_cents / 100, i.currency.toUpperCase())}</span>
                  <Badge tone={i.status === "paid" ? "success" : "warning"}>{i.status}</Badge>
                  {i.hosted_url ? <a href={i.hosted_url} className="text-xs underline" target="_blank" rel="noreferrer">View</a> : <span />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">{plan.key === "free" ? "No invoices — the Free plan is never charged." : "No invoices yet."}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
