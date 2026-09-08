import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AmbientSky } from "@/components/ambient-sky";
import { PlanButton } from "@/app/dashboard/settings/plan-button";
import { FREELANCER_PLANS, planFor, billingEnforced } from "@/lib/plans";
import { purchasableTiers, statusEntitles } from "@/lib/stripe/client";
import { openBillingPortalAction } from "@/lib/actions/billing-actions";

// Billing for a freelancer.
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
    <div className="relative min-h-screen text-white">
      <AmbientSky />

      <header className="border-b border-white/[0.07] bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm font-light tracking-[0.28em]">MAIRO</p>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-neutral-500">
              {workspace.name}
            </p>
          </div>
          <Link href="/clients" className="text-xs text-neutral-400 transition hover:text-white">
            Back to clients
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1
          className="font-light tracking-[-0.02em]"
          style={{ fontSize: "clamp(30px, 4vw, 46px)" }}
        >
          Plan and billing
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-neutral-400">
          Your plan covers every client business in your studio. The businesses
          themselves are never billed.
        </p>

        <div className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Current plan</p>
          <p className="mt-3 text-2xl font-light">
            {subscribed ? current.name : billingEnforced() ? "No plan" : `${current.name} (free while in launch)`}
          </p>
          <p className="mt-2 text-sm text-neutral-500">
            {clientCount} client {clientCount === 1 ? "business" : "businesses"} ·{" "}
            {current.limits.clients ?? 0} included
          </p>
          {workspace.currentPeriodEnd && subscribed && (
            <p className="mt-2 text-xs text-neutral-600">
              Renews {workspace.currentPeriodEnd.toLocaleDateString()}
            </p>
          )}
          {workspace.stripeCustomerId && (
            <form action={openBillingPortalAction} className="mt-5">
              <button
                type="submit"
                className="rounded-full border border-white/15 px-5 py-2.5 text-xs text-neutral-300 transition hover:border-white/40 hover:text-white"
              >
                Manage subscription
              </button>
            </form>
          )}
        </div>

        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2">
          {FREELANCER_PLANS.map((plan) => {
            const isCurrent = subscribed && workspace.subscriptionTier === plan.tier;
            const available = buyable.includes(plan.tier as never);
            return (
              <div key={plan.tier} className="flex h-full flex-col bg-black/60 p-7">
                <div className="flex items-baseline justify-between">
                  <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
                    {plan.name}
                  </p>
                  {isCurrent && (
                    <span className="rounded-full border border-emerald-400/30 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-300/90">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-5 text-3xl font-light tabular-nums">
                  ${plan.priceMonthly}
                  <span className="ml-1 text-sm text-neutral-600">/mo</span>
                </p>
                <p className="mt-3 text-xs text-neutral-500">{plan.spendGuidance}</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm text-neutral-400">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-3">
                      <span className="mt-[9px] h-px w-3 shrink-0 bg-neutral-700" />
                      {f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <p className="mt-6 text-xs text-neutral-600">You&apos;re on this plan.</p>
                ) : available ? (
                  <PlanButton tier={plan.tier} label={`Choose ${plan.name}`} />
                ) : (
                  <p className="mt-6 text-xs text-neutral-600">
                    Not available yet — no price is configured for this plan.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
