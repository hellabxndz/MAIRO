import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PayForPlanForm } from "@/components/billing/pay-form";
import { PlanCard } from "@/components/billing/plan-card";
import { Button } from "@/components/ui/button";
import { readPlanIntent } from "@/lib/billing/intent";
import { PLANS } from "@/lib/billing/plans";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { continueWithFree } from "@/lib/onboarding/actions";
import { requireBusiness } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Confirm your plan" };

export default async function PaymentPage() {
  const ctx = await requireBusiness("business.update");
  const intent = await readPlanIntent();
  if (!intent || intent === "free") redirect("/onboarding?step=2");
  const plan = PLANS[intent];
  const canPay = isStripeConfigured() && ctx.permissions.has("billing.manage");

  return (
    <div className="mx-auto max-w-lg space-y-6 pt-4">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Confirm {plan.name}</h1>
        <p className="text-fg-muted">
          {ctx.business.name} is set up on <strong className="text-fg">Free</strong> right now. Pay for {plan.name} to unlock it, or keep Free
          — you can upgrade any time from your dashboard.
        </p>
      </div>
      <PlanCard plan={plan} selected />
      {canPay ? (
        <PayForPlanForm plan={plan.key} next="/onboarding?step=2" label={`Continue to secure payment — ${plan.name}`} />
      ) : (
        <p className="rounded-xl border border-line p-3 text-sm text-fg-muted">
          Paid plans can&apos;t be purchased on this deployment yet, so nothing will be charged. Continue on Free — your AI employee works right away.
        </p>
      )}
      <form action={continueWithFree}>
        <Button type="submit" variant={canPay ? "ghost" : "primary"} className="w-full">Continue With Free instead</Button>
      </form>
      <p className="text-center text-xs text-fg-subtle">Payments are handled by Stripe. Your plan changes only after payment is confirmed.</p>
    </div>
  );
}
