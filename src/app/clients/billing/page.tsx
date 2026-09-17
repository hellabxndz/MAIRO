import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PlanButton } from "@/app/dashboard/settings/plan-button";
import { FREELANCER_PLANS, planFor, billingEnforced } from "@/lib/plans";
import { purchasableTiers, statusEntitles } from "@/lib/stripe/client";
import { openBillingPortalAction } from "@/lib/actions/billing-actions";
import { PageHeader, Card, Badge, secondaryButtonClass } from "@/components/ui";

// Billing for a freelancer.
//
// The page's own header is gone — the shell in ../layout.tsx draws the
// wordmark, the workspace and the navigation, so this had a second copy of all
// three plus a "Back to clients" link that was the only way out of the screen.
//
// It needs its own screen. A business owner manages their plan in
// /dashboard/settings, which sits inside an organization — but a freelancer's
// dashboard is always a CLIENT's dashboard, and the subscription belongs to
// the workspace above it. Sending them to /dashboard/settings would either
// bounce them back here (no client selected) or show them a client's billing,
// which is not the account paying for anything.

export default async function FreelancerBillingPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  if (session.user.role !== "FREELANCER") redirect("/dashboard/settings");

  const workspaceId = session.user.organizationId;
  const [workspace, clientCount] = await Promise.all([
    db.organization.findUnique({
      where: { id: workspaceId },
      select: {
        name: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        stripeCustomerId: true,
      },
    }),
    db.organization.count({ where: { parentId: workspaceId } }),
  ]);
  if (!workspace) redirect("/sign-in");

  const current = planFor(workspace.subscriptionTier);
  const subscribed = statusEntitles(workspace.subscriptionStatus);
  const buyable = purchasableTiers();

  return (
    <>
      <PageHeader
        title="Plan and billing"
        description="Your plan covers every client business in your studio. The businesses themselves are never billed."
      />

      <Card className="mb-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">Current plan</p>
        <p className="mt-3 text-[26px] font-light tracking-[-0.02em] text-white">
          {subscribed
            ? current.name
            : billingEnforced()
              ? "No plan"
              : `${current.name} (free while in launch)`}
        </p>
        <p className="mt-2 text-[13px] text-muted">
          {clientCount} client {clientCount === 1 ? "business" : "businesses"} ·{" "}
          {current.limits.clients ?? 0} included
        </p>
        {workspace.currentPeriodEnd && subscribed && (
          <p className="mt-2 text-[12px] text-faint">
            Renews {workspace.currentPeriodEnd.toLocaleDateString()}
          </p>
        )}
        {workspace.stripeCustomerId && (
          <form action={openBillingPortalAction} className="mt-5">
            <button type="submit" className={secondaryButtonClass}>
              Manage subscription
            </button>
          </form>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {FREELANCER_PLANS.map((plan) => {
          const isCurrent = subscribed && workspace.subscriptionTier === plan.tier;
          const available = buyable.includes(plan.tier as never);
          return (
            <Card key={plan.tier} className="flex h-full flex-col">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
                  {plan.name}
                </p>
                {isCurrent && <Badge tone="green">Current</Badge>}
              </div>
              <p className="mt-5 text-[30px] font-light tabular-nums tracking-[-0.02em] text-white">
                ${plan.priceMonthly}
                <span className="ml-1 text-[14px] text-faint">/mo</span>
              </p>
              <p className="mt-3 text-[12.5px] text-muted">{plan.spendGuidance}</p>
              <ul className="mt-6 flex-1 space-y-2.5 text-[13.5px] text-muted">
                {/* features lists only what this plan adds, so the plan it
                    builds on has to be named — otherwise the dearer card
                    reads as the smaller one. */}
                {plan.inherits && (
                  <li className="flex gap-3 text-white/85">
                    <span className="mt-[9px] h-px w-3 shrink-0 bg-blue-bright/70" />
                    Everything in {plan.inherits}, plus:
                  </li>
                )}
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <span
                      className="mt-[9px] h-px w-3 shrink-0"
                      style={{ background: "var(--mairo-line-lit)" }}
                    />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <p className="mt-6 text-[12px] text-faint">You&apos;re on this plan.</p>
              ) : available ? (
                <PlanButton tier={plan.tier} label={`Choose ${plan.name}`} />
              ) : (
                <p className="mt-6 text-[12px] text-faint">
                  Not available yet — no price is configured for this plan.
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
