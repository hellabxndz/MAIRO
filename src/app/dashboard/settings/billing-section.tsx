import { Card } from "@/components/ui";
import { PLANS, planFor, billingEnforced } from "@/lib/plans";
import { billingConfigured, purchasableTiers, statusEntitles } from "@/lib/stripe/client";
import { startCheckoutAction, openBillingPortalAction } from "@/lib/actions/billing-actions";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import type { SubscriptionTier } from "@/generated/prisma/enums";

// What a client sees about money.
//
// Subscribing and managing both hand off to Stripe's hosted pages, so there is
// no card form here and never should be.

function statusLine(status: string | null, periodEnd: Date | null): string | null {
  if (!status) return null;
  if (status === "past_due") {
    return "Your last payment didn't go through. Update your card and we'll retry — nothing has been switched off.";
  }
  if (status === "canceled") {
    return "Your subscription is cancelled.";
  }
  if (status === "trialing" && periodEnd) {
    return `Free trial until ${periodEnd.toLocaleDateString()}.`;
  }
  if (statusEntitles(status) && periodEnd) {
    return `Renews ${periodEnd.toLocaleDateString()}.`;
  }
  return null;
}

export function BillingSection({
  tier,
  status,
  periodEnd,
  hasCustomer,
}: {
  tier: SubscriptionTier;
  status: string | null;
  periodEnd: Date | null;
  hasCustomer: boolean;
}) {
  const configured = billingConfigured();
  const buyable = configured ? purchasableTiers() : [];
  const current = planFor(tier);
  const subscribed = tier !== "NONE" && statusEntitles(status);
  const note = statusLine(status, periodEnd);

  return (
    <Card>
      <h2 className="mb-1 text-sm font-medium">Plan and billing</h2>
      <p className="mb-6 text-sm text-neutral-400">
        {subscribed
          ? "What you're on, and how to change it."
          : "Pick a plan when you're ready. You can change or cancel any time."}
      </p>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium">{current.name}</p>
          {current.priceMonthly > 0 && (
            <p className="text-sm text-neutral-400">${current.priceMonthly}/month</p>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {current.limits.campaigns} campaign{current.limits.campaigns === 1 ? "" : "s"} ·{" "}
          {current.limits.creativesPerMonth} creative
          {current.limits.creativesPerMonth === 1 ? "" : "s"} a month
        </p>
        {note && <p className="mt-3 text-sm text-neutral-400">{note}</p>}

        {!billingEnforced() && !subscribed && (
          <p className="mt-3 text-xs leading-relaxed text-neutral-600">
            While MAIRO is in launch, everything is open and nothing is charged. Plans are
            here when you want to support it or need higher limits.
          </p>
        )}
      </div>

      {hasCustomer && (
        <form action={openBillingPortalAction} className="mt-5">
          <button type="submit" className={secondaryButtonClass}>
            Manage billing
          </button>
          <p className="mt-2 text-xs text-neutral-600">
            Change plan, update your card, see invoices, or cancel.
          </p>
        </form>
      )}

      {!configured ? (
        <p className="mt-6 text-sm text-neutral-500">
          Payments aren&apos;t switched on for this deployment yet.
        </p>
      ) : (
        <div className="mt-8">
          <p className="mb-4 text-xs uppercase tracking-[0.12em] text-neutral-600">
            {subscribed ? "Change plan" : "Plans"}
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {PLANS.filter((p) => buyable.includes(p.tier as Exclude<SubscriptionTier, "NONE">)).map(
              (plan) => {
                const isCurrent = plan.tier === tier && subscribed;
                return (
                  <div
                    key={plan.tier}
                    className="flex flex-col rounded-xl border border-white/10 p-4"
                  >
                    <p className="font-medium">{plan.name}</p>
                    <p className="mt-1 text-2xl font-medium tabular-nums">
                      ${plan.priceMonthly}
                      <span className="text-sm text-neutral-500">/mo</span>
                    </p>
                    <p className="mt-2 flex-1 text-xs leading-relaxed text-neutral-500">
                      {plan.tagline}
                    </p>
                    {isCurrent ? (
                      <p className="mt-4 text-center text-xs uppercase tracking-[0.1em] text-emerald-300">
                        Current plan
                      </p>
                    ) : subscribed ? (
                      // Changing an existing subscription belongs in the
                      // portal, where Stripe handles proration and shows the
                      // client what they will actually be charged today.
                      <form action={openBillingPortalAction} className="mt-4">
                        <button type="submit" className={`${secondaryButtonClass} w-full`}>
                          Switch
                        </button>
                      </form>
                    ) : (
                      <form action={startCheckoutAction} className="mt-4">
                        <input type="hidden" name="tier" value={plan.tier} />
                        <button type="submit" className={`${primaryButtonClass} w-full`}>
                          Choose {plan.name}
                        </button>
                      </form>
                    )}
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
