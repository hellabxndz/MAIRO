import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { activateIfPaid, approvedPlanOf, planHeadline } from "@/lib/strategy/store";
import { DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";
import { billingConfigured, purchasableTiers } from "@/lib/stripe/client";
import { usd } from "@/lib/strategy/plan-logic";
import { PlanButton } from "@/app/dashboard/settings/plan-button";
import { JourneyFrame } from "@/components/strategy/journey";
import { WatchDemo } from "@/components/landing/watch-demo";

// Connect the ad account, then CHOOSE YOUR MAIRO PLAN.
//
// The free plan showed what Mairo would do. Connecting the account tells it
// where the campaign will eventually run — nothing is built or spent. The
// subscription is what lets Mairo actually do it; nothing about the campaign
// is created before it, and the server refuses it if asked.

export const metadata = { title: "Activate Mairo" };
export const dynamic = "force-dynamic";

const UNLOCKS = [
  "Real campaign creation",
  "Campaign publishing",
  "Creative generation",
  "Live analytics",
  "Mairo Decisions",
  "AI optimization",
  "Business Health",
  "Profit First",
  "Weekly Reports",
  "Campaign Timeline",
  "Opportunity Radar",
  "Full dashboard access",
];

const OPTIMIZATION: Record<string, string> = {
  STARTER: "Mairo recommends, you approve every change",
  GROWTH: "AI Assist makes small, reversible fixes for you",
  SCALE: "Full Autopilot manages budgets and targeting inside your limits",
};
const REPORTING: Record<string, string> = {
  STARTER: "Weekly Reports, Business Health, Profit First",
  GROWTH: "Adds advanced analytics for every ad",
  SCALE: "Adds advanced analytics for every ad",
};
const FAILED = ["incomplete", "incomplete_expired", "past_due", "unpaid", "canceled"];

function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ checkout?: string; tier?: string; skip?: string; connected?: string; subscribed?: string }> }) {
  const { checkout, tier: chosenTier, skip, connected: justConnected, subscribed } = await searchParams;
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  // Paid (or trialing) with an approved plan: straight on to building it.
  const row = await activateIfPaid(organizationId);
  if (!row || row.status !== "APPROVED") redirect("/plan");
  if (row.activatedAt) redirect("/dashboard/launch?welcome=1");
  const plan = approvedPlanOf(row);
  if (!plan) redirect("/plan");

  const [org, meta] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, subscriptionStatus: true, executionStoppedAt: true, executionStoppedReason: true },
    }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true, metaAdAccountId: true, pageName: true } }),
  ]);
  if (!org) redirect("/sign-in");

  // Back from Stripe before its confirmation reached Mairo: say so and look again.
  if (subscribed === "1" && !FAILED.includes(org.subscriptionStatus ?? "")) {
    return (
      <JourneyFrame step={4}>
        <div className="mx-auto mt-6 max-w-[560px] rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-8 text-center">
          <meta httpEquiv="refresh" content="4" />
          <p className="text-[18px] font-semibold text-white">Confirming your subscription with Stripe…</p>
          <p className="mt-2 text-[14px] text-muted">This usually takes a few seconds. The page checks again on its own, then Mairo is ready to build your campaign.</p>
        </div>
      </JourneyFrame>
    );
  }

  const connected = meta?.status === "CONNECTED";
  const showPlans = connected || skip === "1";
  const head = planHeadline(plan);
  const configured = billingConfigured();
  const buyable = configured ? purchasableTiers() : [];
  const selected = PLANS.find((p) => p.tier === chosenTier) ?? null;
  const saved = checkout === "cancelled" || FAILED.includes(org.subscriptionStatus ?? "");

  return (
    <JourneyFrame step={showPlans ? 4 : 3} skipped={connected ? [] : [3]} wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {org.executionStoppedAt && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-5">
              <p className="text-[15px] font-semibold text-white">Mairo paused your campaigns</p>
              <p className="mt-1 text-[13.5px] text-white/85">{org.executionStoppedReason}</p>
            </div>
          )}

          {saved && !org.executionStoppedAt && (
            <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-5">
              <p className="text-[15px] font-semibold text-white">Your Mairo plan is saved.</p>
              <p className="mt-1 text-[13.5px] text-muted">Choose a subscription whenever you&rsquo;re ready to activate it. Your business details, approved plan, connected account and website analysis are all kept.</p>
              <a href="#plans" className="mt-3 inline-flex min-h-[42px] items-center rounded-lg bg-[#7c5cff] px-5 text-[14px] font-medium text-white hover:brightness-110">Choose a Plan</a>
            </div>
          )}

          {/* The ad account */}
          {connected ? (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] p-5">
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Account connected ✓</p>
              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div><dt className="text-[11.5px] uppercase tracking-[0.14em] text-faint">Meta Ads</dt><dd className="text-[14px] text-white">Connected</dd></div>
                <div><dt className="text-[11.5px] uppercase tracking-[0.14em] text-faint">Ad account</dt><dd className="text-[14px] text-white">{meta?.metaAdAccountId}{meta?.pageName ? ` · ${meta.pageName}` : ""}</dd></div>
                <div><dt className="text-[11.5px] uppercase tracking-[0.14em] text-faint">Status</dt><dd className="text-[14px] text-white">Ready for Mairo</dd></div>
              </dl>
              {justConnected === "1" && <p className="mt-3 text-[12.5px] text-muted">Nothing was created in your account and nothing was spent.</p>}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-6">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Plan approved ✓</p>
              <p className="mt-2 text-[20px] font-semibold text-white">Connect your ad account</p>
              <p className="mt-1 text-[14px] text-muted">So Mairo knows where your campaign will eventually run.</p>
              <a href="/api/meta/connect?returnTo=%2Fplan%2Factivate%3Fconnected%3D1" className="mt-4 inline-flex min-h-[46px] items-center rounded-lg bg-[#7c5cff] px-6 text-[14.5px] font-medium text-white hover:brightness-110">
                Connect My Ad Account
              </a>
              <p className="mt-3 text-[13px] text-muted">Connecting your account does not launch anything or spend money.</p>
              {!showPlans && (
                <Link href="/plan/activate?skip=1" className="mt-3 inline-block text-[12.5px] text-faint hover:text-white">
                  Skip for now — I&rsquo;ll connect after choosing a plan
                </Link>
              )}
            </div>
          )}

          {showPlans && (
            <section id="plans" className="scroll-mt-6">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Choose your Mairo plan</p>
              <h1 className="mt-1 text-[clamp(26px,3.4vw,34px)] font-semibold leading-tight tracking-[-0.02em]">
                Your strategy is ready.
                <br />
                Now activate Mairo.
              </h1>
              <p className="mt-1.5 text-[14.5px] text-muted">Choose a plan to turn your approved strategy into a real advertising campaign.</p>

              {!configured && (
                <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-[13px] text-amber-200">
                  Payments aren&rsquo;t switched on for this site yet, so plans can&rsquo;t be bought here right now. Your plan stays saved.
                </p>
              )}

              {selected ? (
                <div className="mt-5 rounded-2xl border border-violet/35 bg-violet/[0.05] p-6">
                  <p className="text-[16px] font-semibold text-white">Your Mairo Setup</p>
                  <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 text-[13.5px] sm:grid-cols-2">
                    <div><dt className="text-faint">Business</dt><dd className="text-white">{org.name}</dd></div>
                    <div><dt className="text-faint">Goal</dt><dd className="text-white">{head.goal}</dd></div>
                    <div><dt className="text-faint">Platforms</dt><dd className="text-white">{head.platform}</dd></div>
                    <div><dt className="text-faint">Recommended ad budget</dt><dd className="text-white">{usd(plan.dailyBudget)}/day, paid to Meta</dd></div>
                    <div><dt className="text-faint">Selected Mairo plan</dt><dd className="text-white">{selected.name} — {money(selected.priceMonthly)}/month</dd></div>
                  </dl>
                  {buyable.includes(selected.tier as (typeof buyable)[number]) ? (
                    <PlanButton tier={selected.tier} label="Continue to Payment" />
                  ) : (
                    <p className="mt-4 text-[13px] text-faint">This plan can&rsquo;t be bought here yet.</p>
                  )}
                  {TRIAL_DAYS > 0 && (
                    <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                      Starts with a {TRIAL_DAYS}-day free trial: Stripe takes your card today and the first charge is after the trial. If that payment doesn&rsquo;t go through, Mairo pauses your campaigns and cancels the subscription — your plan stays saved.
                    </p>
                  )}
                  <Link href="/plan/activate?skip=1#plans" className="mt-3 inline-block text-[12.5px] text-violet-bright hover:text-white">Change plan</Link>
                </div>
              ) : (
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                  {PLANS.map((p) => {
                    const ent = DEFAULT_ENTITLEMENTS[p.tier];
                    const rows: [string, string][] = [
                      ["Campaigns", Number.isFinite(ent.campaign_limit) ? `Up to ${ent.campaign_limit} at a time` : "Unlimited"],
                      ["AI creatives", p.features.find((f) => /image credits/i.test(f)) ?? `${ent.studio_credits_monthly} AI image credits a month`],
                      ["Optimization", OPTIMIZATION[p.tier] ?? ""],
                      ["Reporting", REPORTING[p.tier] ?? ""],
                      ["Autopilot", ent.autopilot ? "Included" : "Not included"],
                      ["Support", p.features.some((f) => /priority support/i.test(f)) ? "Priority support" : "Standard support"],
                    ];
                    return (
                      <div key={p.tier} className={`flex min-w-0 flex-col rounded-2xl border p-5 ${p.featured ? "border-violet/40 bg-violet/[0.05]" : "border-white/[0.07] bg-[#0b1122]/80"}`}>
                        <p className="text-[15px] font-semibold text-white">{p.name}</p>
                        <p className="mt-1 text-[28px] font-semibold tabular-nums text-white">
                          {money(p.priceMonthly)}<span className="text-[13px] font-normal text-faint">/month</span>
                        </p>
                        <p className="mt-1 text-[12.5px] text-muted">{p.tagline}</p>
                        <dl className="mt-4 flex-1 space-y-2.5">
                          {rows.map(([k, v]) => (
                            <div key={k}>
                              <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">{k}</dt>
                              <dd className="text-[13px] text-white/90">{v}</dd>
                            </div>
                          ))}
                        </dl>
                        <Link href={`/plan/activate?skip=1&tier=${p.tier}#plans`} className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#7c5cff] px-4 text-[14px] font-medium text-white hover:brightness-110">
                          Choose {p.name}
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-4 text-[12px] text-faint">Payment is handled by Stripe; Mairo never sees your card.</p>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5">
            <p className="text-[15px] font-semibold text-white">You already created your plan for free.</p>
            <p className="mt-1 text-[13px] text-muted">Your subscription unlocks:</p>
            <ul className="mt-3 space-y-1.5 text-[13px] text-white/85">
              {UNLOCKS.map((u) => (
                <li key={u} className="flex gap-2"><span aria-hidden className="text-emerald-300">✓</span>{u}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5">
            <p className="text-[15px] font-semibold text-white">Your ad budget is separate</p>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div><dt className="text-faint">Mairo subscription</dt><dd className="text-white">{selected ? `${money(selected.priceMonthly)}/month` : `From ${money(Math.min(...PLANS.map((p) => p.priceMonthly)))}/month`}</dd></div>
              <div><dt className="text-faint">Advertising budget</dt><dd className="text-white">Paid directly to Meta (your plan suggests {usd(plan.dailyBudget)}/day)</dd></div>
            </dl>
            <p className="mt-3 text-[12.5px] text-muted">Mairo never treats your subscription as ad spend, and never charges your ad budget.</p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5">
            <p className="text-[15px] font-semibold text-white">Your approved plan</p>
            <p className="mt-1 text-[13px] text-muted">{head.goal} · {head.platform} · {head.budget} · {head.campaign}</p>
            <Link href="/plan" className="mt-2 inline-block text-[12.5px] text-violet-bright hover:text-white">Review or change it</Link>
            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <p className="text-[13px] text-white">See the dashboard first</p>
              <p className="mt-0.5 text-[12px] text-faint">A short walkthrough with sample data — not your numbers.</p>
              <WatchDemo className="mt-2 inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-white/12 px-3 text-[12.5px] text-white/85 hover:border-white/30" />
            </div>
          </div>
        </aside>
      </div>
    </JourneyFrame>
  );
}
