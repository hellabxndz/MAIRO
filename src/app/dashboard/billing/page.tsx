import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { PLANS, TRIAL_DAYS, billingEnforced, planFor } from "@/lib/plans";
import { billingConfigured, purchasableTiers, statusEntitles } from "@/lib/stripe/client";
import { openBillingPortalAction } from "@/lib/actions/billing-actions";
import { PlanButton } from "../settings/plan-button";

// Where "Upgrade" goes: every plan side by side, and one button from each
// straight to Stripe's checkout.
//
// It used to be nowhere in particular. The sidebar's Upgrade card and the
// Billing link both pointed at /dashboard/plan, which is the monthly marketing
// plan, and every other "see plans" link pointed at an anchor on Settings that
// didn't exist. Someone ready to pay was shown a strategy document.
//
// Paying and changing plan are still Stripe's hosted pages. There is no card
// form here and never should be.

function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

function creativesLine(n: number): string {
  return Number.isFinite(n) ? `${n} AI creatives a month` : "Unlimited AI creatives";
}

export default async function BillingPage({ searchParams }: PageProps<"/dashboard/billing">) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionTier: true, subscriptionStatus: true, currentPeriodEnd: true, stripeCustomerId: true },
  });
  if (!organization) redirect("/sign-in");

  const { subscribed: justSubscribed, checkout } = await searchParams;
  const configured = billingConfigured();
  const buyable = configured ? purchasableTiers() : [];
  const tier = organization.subscriptionTier;
  const subscribed = tier !== "NONE" && statusEntitles(organization.subscriptionStatus);
  const current = planFor(tier);
  const status = organization.subscriptionStatus;
  const periodEnd = organization.currentPeriodEnd;

  return (
    <div>
      <PageHeader
        title={subscribed ? "Your plan" : "Choose a plan"}
        description={
          TRIAL_DAYS > 0 && !subscribed
            ? `Every plan starts with a ${TRIAL_DAYS}-day free trial. Stripe takes your card, and you can cancel before it ends at no charge.`
            : "Change or cancel any time. Your ad spend is paid to Meta and TikTok directly — never through this."
        }
      />

      {justSubscribed === "1" && (
        <p className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-200">
          You&rsquo;re subscribed. Thank you — everything in your plan is switched on.
        </p>
      )}
      {checkout === "cancelled" && (
        <p className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-neutral-300">
          Checkout was cancelled, and nothing was charged. Pick a plan whenever you&rsquo;re ready.
        </p>
      )}

      {/* Where they stand now. */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Current plan</p>
          <p className="mt-1 text-lg font-medium text-white">
            {current.name}
            {subscribed && current.priceMonthly > 0 && (
              <span className="ml-2 text-sm font-normal text-neutral-400">{money(current.priceMonthly)}/month</span>
            )}
          </p>
          {status === "past_due" ? (
            <p className="mt-1 text-sm text-amber-300">
              Your last payment didn&rsquo;t go through. Update your card below — nothing has been switched off.
            </p>
          ) : status === "trialing" && periodEnd ? (
            <p className="mt-1 text-sm text-neutral-400">Free trial until {periodEnd.toLocaleDateString()}.</p>
          ) : subscribed && periodEnd ? (
            <p className="mt-1 text-sm text-neutral-400">Renews {periodEnd.toLocaleDateString()}.</p>
          ) : status === "canceled" ? (
            <p className="mt-1 text-sm text-neutral-400">Your subscription is cancelled.</p>
          ) : !billingEnforced() ? (
            <p className="mt-1 text-sm text-neutral-400">
              While MAIRO is in launch everything is open. A plan keeps it that way once launch ends.
            </p>
          ) : null}
        </div>
        {organization.stripeCustomerId && (
          <form action={openBillingPortalAction}>
            <button type="submit" className={secondaryButtonClass}>
              Manage billing
            </button>
            <p className="mt-1.5 text-[11px] text-neutral-500">Card, invoices, cancel</p>
          </form>
        )}
      </div>

      {!configured && (
        <p className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200">
          Payments aren&rsquo;t switched on for this site yet, so plans can&rsquo;t be bought here right now.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = subscribed && plan.tier === tier;
          const canBuy = buyable.includes(plan.tier as (typeof buyable)[number]);
          return (
            <div
              key={plan.tier}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.featured ? "border-[color:var(--mairo-line-lit)] bg-white/[0.05]" : "border-white/10 bg-white/[0.02]"
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-6 rounded-full px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-white" style={{ backgroundImage: "var(--mairo-ramp)" }}>
                  Most popular
                </span>
              )}
              <p className="text-sm font-medium text-white">{plan.name}</p>
              <p className="mt-2 text-3xl font-medium tabular-nums text-white">
                {money(plan.priceMonthly)}
                <span className="text-sm font-normal text-neutral-500">/month</span>
              </p>
              <p className="mt-1 text-[13px] font-medium text-blue-bright">{plan.headline}</p>
              <p className="mt-2 text-sm text-neutral-400">{plan.tagline}</p>

              <ul className="mt-5 flex-1 space-y-2 text-[13px] text-neutral-300">
                {plan.inherits && (
                  <li className="text-neutral-500">Everything in {plan.inherits}, plus:</li>
                )}
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="mt-[2px] text-emerald-300">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
                <li className="flex gap-2 text-neutral-400">
                  <span aria-hidden className="mt-[2px] text-emerald-300">✓</span>
                  <span>{creativesLine(plan.limits.creativesPerMonth)}</span>
                </li>
              </ul>

              <p className="mt-5 text-[11.5px] text-neutral-500">{plan.spendGuidance}</p>

              {isCurrent ? (
                <p className="mt-4 rounded-full border border-emerald-400/30 py-2 text-center text-xs uppercase tracking-[0.12em] text-emerald-300">
                  Your plan
                </p>
              ) : !canBuy ? (
                <p className="mt-4 rounded-full border border-white/10 py-2 text-center text-xs text-neutral-500">
                  Not available yet
                </p>
              ) : subscribed ? (
                // Changing an existing subscription happens in Stripe's
                // portal, which works out proration and shows what today's
                // charge will actually be before anything is taken.
                <form action={openBillingPortalAction} className="mt-4">
                  <button type="submit" className={`${secondaryButtonClass} w-full`}>
                    Switch to {plan.name}
                  </button>
                </form>
              ) : (
                <PlanButton
                  tier={plan.tier}
                  label={TRIAL_DAYS > 0 ? `Start ${TRIAL_DAYS}-day free trial` : `Choose ${plan.name}`}
                />
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-8 max-w-2xl text-xs leading-relaxed text-neutral-500">
        Payment is handled by Stripe; MAIRO never sees your card. Your plan pays for MAIRO. What your ads
        cost is separate and goes straight from you to Meta or TikTok.
      </p>
    </div>
  );
}
