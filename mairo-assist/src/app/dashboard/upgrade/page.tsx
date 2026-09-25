import { Check, Plus } from "lucide-react";
import type { Metadata } from "next";
import { CreditsMeter } from "@/components/billing/credits-meter";
import { ChoosePlanButton, ManageBillingButton } from "@/components/billing/plan-actions";
import { PlanCard } from "@/components/billing/plan-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadCredits } from "@/lib/billing/credits";
import { addedFeatures, FEATURE_LABELS, isPlanKey, PLAN_KEYS, PLAN_LIST, PLANS } from "@/lib/billing/plans";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { requireBusiness } from "@/lib/tenancy/context";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Upgrade plan" };

const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL;

const CHECKOUT: Record<string, { tone: "success" | "info" | "warning"; text: string }> = {
  success: { tone: "success", text: "Payment confirmed — your new plan is active. Your AI employee, store connection and conversations are unchanged." },
  pending: { tone: "info", text: "Your payment is still being confirmed. Your plan will update automatically in a moment." },
  canceled: { tone: "warning", text: "Checkout was cancelled. Nothing was charged and your plan hasn't changed." },
  failed: { tone: "warning", text: "We couldn't confirm a payment, so your plan hasn't changed. If you were charged, contact support." },
};

export default async function UpgradePage({ searchParams }: PageProps<"/dashboard/upgrade">) {
  const ctx = await requireBusiness("billing.view");
  const sp = await searchParams;
  const credits = await loadCredits(ctx.business.id);
  const current = credits.plan;
  const sub = credits.subscription;
  const canManage = ctx.permissions.has("billing.manage");
  const stripeReady = isStripeConfigured();
  const highlighted = isPlanKey(sp.plan) ? sp.plan : null;
  const checkout = typeof sp.checkout === "string" ? CHECKOUT[sp.checkout] : undefined;
  const changed = typeof sp.changed === "string" ? sp.changed : null;
  const rank = (k: string) => PLAN_KEYS.indexOf(k as (typeof PLAN_KEYS)[number]);

  return (
    <div className="space-y-6">
      <PageHeader title="Plans" description="Your current plan, your AI credits, and everything you can unlock." />
      {checkout && <Alert tone={checkout.tone}>{checkout.text}</Alert>}
      {changed === "downgrade" && (
        <Alert tone="info">Your paid plan will end at the close of this billing period, then you&apos;ll be on Free. You won&apos;t be charged again.</Alert>
      )}
      {changed && isPlanKey(changed) && (
        <Alert tone="success">You&apos;re now on {PLANS[changed].name}. Your AI employee, store and conversations are unchanged.</Alert>
      )}

      <Card>
        <CardContent className="grid gap-6 pt-5 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-fg-subtle">Current plan</p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-semibold" data-testid="current-plan">
              {current.key === "free" ? "Free Forever" : current.name}
              {sub && sub.status !== "active" && <Badge tone="warning">{sub.status.replace("_", " ")}</Badge>}
            </p>
            {sub?.cancel_at_period_end && sub.current_period_end && (
              <p className="mt-1 text-xs text-warning">Moves to Free on {formatDate(sub.current_period_end)}.</p>
            )}
            {!sub?.cancel_at_period_end && sub?.current_period_end && current.key !== "free" && (
              <p className="mt-1 text-xs text-fg-muted">Renews {formatDate(sub.current_period_end)}</p>
            )}
            {canManage && sub?.provider === "stripe" && <div className="mt-3"><ManageBillingButton /></div>}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-fg-subtle">AI credits</p>
            <div className="mt-1"><CreditsMeter used={credits.used} limit={credits.limit} /></div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-fg-subtle">Next reset</p>
            <p className="mt-1 text-2xl font-semibold" data-testid="next-reset">{formatDate(credits.resetsAt.toISOString())}</p>
            <p className="text-xs text-fg-subtle">Credits reset on the 1st of every month (UTC). One credit = one AI reply to a customer; tests are free.</p>
          </div>
        </CardContent>
      </Card>

      {!stripeReady && (
        <Alert tone="info" title="Paid plans aren't on sale yet">
          You can compare plans now; buying one opens once payments are set up on this deployment. Nothing is ever charged without your
          confirmation.
        </Alert>
      )}
      {!canManage && <p className="text-sm text-fg-muted">Only the business owner can change the plan.</p>}

      <section aria-label="All plans" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {PLAN_LIST.map((p) => {
          const isCurrent = p.key === current.key;
          const higher = rank(p.key) > rank(current.key);
          const adds = higher ? addedFeatures(p, current) : [];
          const label = p.key === "free" ? "Downgrade to Free" : higher ? `Upgrade to ${p.name}` : `Switch to ${p.name}`;
          return (
            <PlanCard
              key={p.key}
              plan={p}
              current={isCurrent}
              selected={!isCurrent && highlighted === p.key}
              note={
                <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
                  {isCurrent ? (
                    <p className="flex items-center gap-1.5 text-success"><Check className="size-3.5" aria-hidden /> You have everything in this plan</p>
                  ) : higher ? (
                    <>
                      <p className="flex items-center gap-1.5 text-fg-muted"><Check className="size-3.5 text-success" aria-hidden /> Everything you have now</p>
                      <p className="font-medium text-fg">Unlocks:</p>
                      <p className="flex items-center gap-1.5"><Plus className="size-3.5 text-violet-glow" aria-hidden /> {p.key === "enterprise" ? "Custom" : p.limits.aiResponsesPerMonth.toLocaleString("en-US")} AI responses a month</p>
                      {adds.map((f) => (
                        <p key={f} className="flex items-center gap-1.5"><Plus className="size-3.5 text-violet-glow" aria-hidden /> {FEATURE_LABELS[f]}</p>
                      ))}
                    </>
                  ) : (
                    <p className="text-fg-subtle">Fewer credits and features than your current plan.</p>
                  )}
                </div>
              }
              action={
                isCurrent ? (
                  <p className="text-center text-xs text-fg-subtle">Your current plan</p>
                ) : p.key === "enterprise" ? (
                  SALES_EMAIL ? (
                    <ButtonLink href={`mailto:${SALES_EMAIL}?subject=Mairo%20Assist%20Enterprise`} variant="secondary" className="w-full">Contact Sales</ButtonLink>
                  ) : (
                    <p className="text-center text-xs text-fg-subtle">Contact our team to set up Enterprise.</p>
                  )
                ) : canManage ? (
                  <ChoosePlanButton plan={p.key} label={label} primary={higher && (highlighted === p.key || p.key === "growth")} />
                ) : null
              }
            />
          );
        })}
      </section>
      <p className="text-xs text-fg-subtle">
        Upgrades take effect as soon as payment is confirmed. Downgrading keeps your paid plan until the end of the period you paid for.
        Changing plans never touches your AI employee, store connection, knowledge base or conversations.
      </p>
    </div>
  );
}
