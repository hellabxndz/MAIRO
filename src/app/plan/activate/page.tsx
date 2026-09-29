import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { approvedPlanOf, planHeadline } from "@/lib/strategy/store";
import { hasActivePlan } from "@/lib/readiness";
import { PLANS, TRIAL_DAYS, billingEnforced } from "@/lib/plans";
import { billingConfigured, purchasableTiers } from "@/lib/stripe/client";
import { getStartedAction } from "@/lib/actions/strategy-actions";
import { PlanButton } from "@/app/dashboard/settings/plan-button";
import { JourneyFrame } from "@/components/strategy/journey";
import { WatchDemo } from "@/components/landing/watch-demo";

// "Get Started With Mairo": the approved plan's summary, then the
// subscription. Paying unlocks the full platform and turns this exact plan
// into the first campaign — nothing is asked again.

export const metadata = { title: "Activate Mairo" };
export const dynamic = "force-dynamic";

const UNLOCKS = [
  "Home, with Simple, Advanced and Profit First views",
  "Campaigns and Create",
  "Creative Studio",
  "Analytics, Reports and Weekly Reports",
  "Business Brain, Decisions and Activity",
  "Opportunity Radar, Business Health and Campaign Timeline",
  "Integrations and Automation controls",
];

function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [row, org] = await Promise.all([
    db.strategyPlan.findUnique({ where: { organizationId } }),
    db.organization.findUnique({ where: { id: organizationId }, select: { subscriptionTier: true, subscriptionStatus: true } }),
  ]);
  if (!org) redirect("/sign-in");
  if (!row || row.status !== "APPROVED") redirect("/plan");
  if (row.activatedAt) redirect("/dashboard/launch");
  const plan = approvedPlanOf(row);
  if (!plan) redirect("/plan");

  const head = planHeadline(plan);
  const open = hasActivePlan(org);
  const configured = billingConfigured();
  const buyable = configured ? purchasableTiers() : [];

  return (
    <JourneyFrame current="Activate" wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Plan Approved ✓</p>
          <h1 className="mt-1 text-[clamp(26px,3.4vw,34px)] font-semibold tracking-[-0.02em]">Your approved plan is ready.</h1>
          <p className="mt-1.5 text-[14.5px] text-muted">Activate your account and Mairo turns this exact plan into your first campaign — nothing to fill in again.</p>

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Goal", head.goal],
              ["Platform", head.platform],
              ["Budget", head.budget],
              ["Campaign", head.campaign],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/[0.07] bg-[#0b1122]/80 p-4">
                <dt className="text-[11.5px] uppercase tracking-[0.14em] text-faint">{k}</dt>
                <dd className="mt-1 text-[14.5px] font-medium text-white">{v}</dd>
              </div>
            ))}
          </dl>
          <Link href="/plan" className="mt-3 inline-block text-[13px] text-violet-bright hover:text-white">Review or change your plan</Link>

          {checkout === "cancelled" && (
            <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] text-white/80">
              Checkout was cancelled and nothing was charged. Your approved plan is saved — pick a plan whenever you&rsquo;re ready.
            </p>
          )}

          {open && (
            <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] p-5">
              <p className="text-[15px] font-semibold text-white">
                {billingEnforced() ? "Your subscription is active." : "Your account already has full access."}
              </p>
              <p className="mt-1 text-[13.5px] text-muted">
                {billingEnforced()
                  ? "Continue and Mairo will turn your approved plan into your first campaign."
                  : "Billing isn't switched on yet while Mairo is in launch, so there's nothing to pay today. Continue to turn your plan into a campaign."}
              </p>
              <form action={getStartedAction} className="mt-4">
                <button type="submit" className="min-h-[46px] rounded-lg bg-[#7c5cff] px-6 text-[14.5px] font-medium text-white hover:brightness-110">
                  Continue — turn my plan into a campaign
                </button>
              </form>
            </div>
          )}

          <h2 className="mt-8 text-[18px] font-semibold text-white">{open ? "Plans" : "Choose your subscription"}</h2>
          <p className="mt-1 text-[13px] text-muted">
            {TRIAL_DAYS > 0 ? `Every plan starts with a ${TRIAL_DAYS}-day free trial. ` : ""}Your ad spend is separate and goes straight from you to Meta.
          </p>
          {!configured && !open && (
            <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-[13px] text-amber-200">
              Payments aren&rsquo;t switched on for this site yet, so plans can&rsquo;t be bought here right now.
            </p>
          )}
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {PLANS.map((p) => {
              const canBuy = buyable.includes(p.tier as (typeof buyable)[number]);
              return (
                <div key={p.tier} className={`flex min-w-0 flex-col rounded-2xl border p-5 ${p.featured ? "border-violet/40 bg-violet/[0.05]" : "border-white/[0.07] bg-[#0b1122]/80"}`}>
                  <p className="text-[14px] font-medium text-white">{p.name}</p>
                  <p className="mt-1 text-[28px] font-semibold tabular-nums text-white">
                    {money(p.priceMonthly)}<span className="text-[13px] font-normal text-faint">/month</span>
                  </p>
                  <p className="mt-1 text-[12.5px] text-violet-bright">{p.headline}</p>
                  <ul className="mt-3 flex-1 space-y-1.5 text-[12.5px] text-white/80">
                    {p.features.slice(0, 5).map((f) => (
                      <li key={f} className="flex gap-2"><span aria-hidden className="text-emerald-300">✓</span>{f}</li>
                    ))}
                  </ul>
                  {open ? null : canBuy ? (
                    <PlanButton tier={p.tier} label={TRIAL_DAYS > 0 ? `Start ${TRIAL_DAYS}-day free trial` : `Choose ${p.name}`} />
                  ) : (
                    <p className="mt-4 rounded-full border border-white/10 py-2 text-center text-[12px] text-faint">Not available yet</p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[12px] text-faint">Payment is handled by Stripe; Mairo never sees your card.</p>
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5">
            <p className="text-[15px] font-semibold text-white">What activating unlocks</p>
            <ul className="mt-3 space-y-2 text-[13px] text-white/85">
              {UNLOCKS.map((u) => (
                <li key={u} className="flex gap-2"><span aria-hidden className="text-violet-bright">•</span>{u}</li>
              ))}
            </ul>
            <p className="mt-4 text-[12.5px] text-muted">Then: connect Facebook & Instagram, Mairo builds your approved campaign, and you press Launch when you&rsquo;re happy. Nothing goes live without that press.</p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5">
            <p className="text-[15px] font-semibold text-white">See the dashboard first</p>
            <p className="mt-1 text-[12.5px] text-muted">A short walkthrough with sample data — not your numbers.</p>
            <WatchDemo className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/12 px-3 text-[13px] text-white/85 hover:border-white/30" />
          </div>
        </aside>
      </div>
    </JourneyFrame>
  );
}
