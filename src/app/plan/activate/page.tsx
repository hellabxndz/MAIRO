import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { activateIfPaid, approvedPlanOf, planHeadline } from "@/lib/strategy/store";
import { DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";
import { hasActivePlan } from "@/lib/readiness";
import { PLANS, trialDaysFor } from "@/lib/plans";
import { trialEligible } from "@/lib/billing/trial-claims";
import { billingConfigured, purchasableTiers } from "@/lib/stripe/client";
import { usd } from "@/lib/strategy/plan-logic";
import { PlanButton } from "@/app/dashboard/settings/plan-button";
import { reportError } from "@/lib/monitoring/report";
import { JourneyFrame } from "@/components/strategy/journey";
import { WatchDemo } from "@/components/landing/watch-demo";
import { loadOnboarding } from "@/lib/onboarding/progress-store";
import { connectHref, connectProblemFromParams, explainSubscription } from "@/lib/onboarding/problems";
import { ProblemCard } from "@/components/onboarding/problem-card";

// Connect the ad account, then CHOOSE YOUR MAIRO PLAN.
//
// The free plan showed what MAIRO would do. Connecting the account tells it
// where the campaign will eventually run — nothing is built or spent. The
// subscription is what lets MAIRO actually do it; nothing about the campaign
// is created before it, and the server refuses it if asked.

export const metadata = { title: "Activate MAIRO" };
export const dynamic = "force-dynamic";

const UNLOCKS = [
  "Real campaign creation",
  "Campaign publishing",
  "Creative generation",
  "Live analytics",
  "MAIRO Decisions",
  "AI optimization",
  "Business Health",
  "Profit First",
  "Weekly Reports",
  "Campaign Timeline",
  "Opportunity Radar",
  "Full dashboard access",
];

// What MAIRO may do on its own on each plan — the modes the server lets each
// plan switch on (pricing/compare.ts). AI Assist and Full Autopilot are opt-in.
const OPTIMIZATION: Record<string, string> = {
  PRO: "AI optimization recommendations — MAIRO recommends, you approve every change",
  SCALE_V2: "Manual, AI Assist or Full Autopilot if you switch it on — inside your limits, never raising your total",
};
const REPORTING: Record<string, string> = {
  PRO: "AI Daily Brief, weekly report, monthly results, Simple and Advanced views",
  SCALE_V2: "Adds advanced analytics (every ad and placement), revenue and lead tracking, and the Performance Coach",
};
const FAILED = ["incomplete", "incomplete_expired", "past_due", "unpaid", "canceled"];

/** A plan that can't be bought on this deployment, said as such — never a silent dead end. */
function Unavailable({ name, configured }: { name: string; configured: boolean }) {
  return (
    <p role="status" className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-200">
      {configured
        ? `${name} can't be bought right now because its payment setup isn't finished on our side. We've been alerted. Your plan stays saved.`
        : "Payments aren't switched on for this site yet. Your plan stays saved."}
    </p>
  );
}

function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ checkout?: string; tier?: string; skip?: string; connected?: string; subscribed?: string; try?: string; metaError?: string; missing?: string; metaDetail?: string; acct?: string }> }) {
  const params = await searchParams;
  const { checkout, tier: chosenTier, skip, connected: justConnected, subscribed } = params;
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  // One free trial per business and per Meta ad account (lib/billing/trial-claims.ts).
  const canTrial = await trialEligible(organizationId);
  const trialDays = (t: Parameters<typeof trialDaysFor>[0]) => (canTrial ? trialDaysFor(t) : 0);

  // Paid (or trialing) with an approved plan: straight on to building it.
  const row = await activateIfPaid(organizationId);
  if (!row || row.status !== "APPROVED") redirect("/plan");
  // Already started, and still paid for: on to the campaign. Started but no
  // longer paid for (a trial cancelled, or a card declined when it ended)
  // stays here to choose a plan again — sending it to the launch page, which
  // sends unpaid businesses back here, was a redirect loop.
  if (row.activatedAt) {
    const billing = await db.organization.findUnique({ where: { id: organizationId }, select: { subscriptionTier: true, subscriptionStatus: true, paymentRequired: true } });
    if (!billing || hasActivePlan(billing)) redirect("/dashboard/launch?welcome=1");
  }
  const plan = approvedPlanOf(row);
  if (!plan) redirect("/plan");

  const [org, meta, steps] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, subscriptionStatus: true, executionStoppedAt: true, executionStoppedReason: true },
    }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true, metaAdAccountId: true, pageName: true } }),
    loadOnboarding(organizationId),
  ]);
  if (!org) redirect("/sign-in");

  // Back from a checkout opened before returns went through /billing/return,
  // with no session id to read back: wait on the webhook, for a while, then
  // say so instead of refreshing for ever.
  if (subscribed === "1" && !FAILED.includes(org.subscriptionStatus ?? "")) {
    const tries = Math.max(0, Math.min(10, Number.parseInt(params.try ?? "0", 10) || 0));
    const waiting = tries < 10;
    return (
      <JourneyFrame steps={steps} here="subscribe">
        <div className="mx-auto mt-6 max-w-[560px] rounded-2xl border border-white/[0.07] bg-field/80 p-8 text-center">
          {waiting && <meta httpEquiv="refresh" content={`4;url=/plan/activate?subscribed=1&try=${tries + 1}`} />}
          <p className="text-[18px] font-semibold text-white">{waiting ? "Confirming your subscription with Stripe…" : "Stripe is taking longer than usual"}</p>
          <p className="mt-2 text-[14px] text-muted">
            {waiting
              ? "This usually takes a few seconds. The page checks again on its own, then MAIRO is ready to build your campaign."
              : "We haven't had Stripe's confirmation yet. If your payment went through, nothing more is needed — it will show up shortly."}
          </p>
          {!waiting && (
            <Link href={`/plan/activate?subscribed=1&try=0`} className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#ffffff] px-6 text-[14px] font-medium text-black hover:brightness-110">
              Check again
            </Link>
          )}
        </div>
      </JourneyFrame>
    );
  }

  const connected = meta?.status === "CONNECTED";
  const showPlans = connected || skip === "1";
  // Connected, and usable: not expired, a Page chosen, nothing Meta flagged.
  const connectionOk = steps?.find((s) => s.id === "connect")?.state === "done";
  const head = planHeadline(plan);
  const configured = billingConfigured();
  const buyable: string[] = configured ? purchasableTiers() : [];
  const selected = PLANS.find((p) => p.tier === chosenTier) ?? null;
  // A plan on sale whose price isn't configured is a broken sale: say so on
  // the page and alert whoever runs the deployment, rather than a dead end.
  const unavailable = configured ? PLANS.filter((p) => !buyable.includes(p.tier)) : [];
  if (showPlans && unavailable.length > 0) {
    console.error(`Plan activation: ${unavailable.map((p) => p.name).join(", ")} can't be bought — set ${unavailable.map((p) => (p.tier === "PRO" ? "STRIPE_PRICE_PRO" : "STRIPE_PRICE_SCALE_V2")).join(", ")} on this deployment.`);
    await reportError(new Error(`Plans on sale with no Stripe price configured: ${unavailable.map((p) => p.tier).join(", ")}`), {
      where: "plan activation",
      tags: { tiers: unavailable.map((p) => p.tier).join(",") },
    });
  }
  // What went wrong, if anything, said plainly with the way out: a connection
  // that came back with a problem, or one that worked but can't be used now
  // (expired, no Page), and a payment that didn't go through.
  const connectProblem = connectProblemFromParams(params, "/plan/activate") ?? steps?.find((s) => s.id === "connect")?.problem ?? null;
  const paymentProblem = explainSubscription(org.subscriptionStatus, { checkoutCancelled: checkout === "cancelled" });

  return (
    <JourneyFrame steps={steps} here={showPlans ? "subscribe" : "connect"} wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {org.executionStoppedAt && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-5">
              <p className="text-[15px] font-semibold text-white">MAIRO paused your campaigns</p>
              <p className="mt-1 text-[13.5px] text-white/85">{org.executionStoppedReason}</p>
            </div>
          )}

          {paymentProblem && !org.executionStoppedAt && <ProblemCard problem={paymentProblem} tone="warn" />}

          {connectProblem && <ProblemCard problem={connectProblem} tone={params.metaError ? "alert" : "warn"} />}

          {/* The ad account */}
          {connected && connectionOk ? (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] p-5">
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Account connected ✓</p>
              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div><dt className="text-[11.5px] uppercase tracking-[0.14em] text-faint">Meta Ads</dt><dd className="text-[14px] text-white">Connected</dd></div>
                <div><dt className="text-[11.5px] uppercase tracking-[0.14em] text-faint">Ad account</dt><dd className="text-[14px] text-white">{meta?.metaAdAccountId}{meta?.pageName ? ` · ${meta.pageName}` : ""}</dd></div>
                <div><dt className="text-[11.5px] uppercase tracking-[0.14em] text-faint">Status</dt><dd className="text-[14px] text-white">Ready for MAIRO</dd></div>
              </dl>
              {justConnected === "1" && <p className="mt-3 text-[12.5px] text-muted">Nothing was created in your account and nothing was spent.</p>}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.07] bg-field/80 p-6">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Plan approved ✓</p>
              <p className="mt-2 text-[20px] font-semibold text-white">Connect your ad account</p>
              <p className="mt-1 text-[14px] text-muted">So MAIRO knows where your campaign will eventually run. You&rsquo;ll sign in with Facebook and choose your ad account and Facebook Page — keep every option switched on so MAIRO can build your campaign.</p>
              <a href={connectHref("/plan/activate?connected=1")} className="mt-4 inline-flex min-h-[46px] items-center rounded-lg bg-[#ffffff] px-6 text-[14.5px] font-medium text-black hover:brightness-110">
                {connected ? "Reconnect My Ad Account" : "Connect My Ad Account"}
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
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Choose your MAIRO plan</p>
              <h1 className="mt-1 text-[clamp(26px,3.4vw,34px)] font-semibold leading-tight tracking-[-0.02em]">
                Your strategy is ready.
                <br />
                Now activate MAIRO.
              </h1>
              <p className="mt-1.5 text-[14.5px] text-muted">Choose a plan to turn your approved strategy into a real advertising campaign.</p>

              {!configured && (
                <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-[13px] text-amber-200">
                  Payments aren&rsquo;t switched on for this site yet, so plans can&rsquo;t be bought here right now. Your plan stays saved.
                </p>
              )}

              {selected ? (
                <div className="mt-5 rounded-2xl border border-violet/35 bg-violet/[0.05] p-6">
                  <p className="text-[16px] font-semibold text-white">Your MAIRO Setup</p>
                  <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 text-[13.5px] sm:grid-cols-2">
                    <div><dt className="text-faint">Business</dt><dd className="text-white">{org.name}</dd></div>
                    <div><dt className="text-faint">Goal</dt><dd className="text-white">{head.goal}</dd></div>
                    <div><dt className="text-faint">Platforms</dt><dd className="text-white">{head.platform}</dd></div>
                    <div><dt className="text-faint">Recommended ad budget</dt><dd className="text-white">{usd(plan.dailyBudget)}/day, paid to Meta</dd></div>
                    <div><dt className="text-faint">Selected MAIRO plan</dt><dd className="text-white">{selected.name} — {money(selected.priceMonthly)}/month</dd></div>
                  </dl>
                  {buyable.includes(selected.tier) ? (
                    <PlanButton tier={selected.tier} label="Continue to Payment" />
                  ) : (
                    <Unavailable name={selected.name} configured={configured} />
                  )}
                  {trialDays(selected.tier) > 0 ? (
                    <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                      Starts with a {trialDays(selected.tier)}-day free trial: Stripe takes your card today and the first charge is after the trial. If that payment doesn&rsquo;t go through, MAIRO pauses your campaigns and cancels the subscription — your plan stays saved.
                    </p>
                  ) : (
                    <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                      {trialDaysFor(selected.tier) > 0
                        ? "Billed from today — your free trial has been used (each business and each Meta ad account gets one). Change or cancel any time."
                        : `Billed from today — ${selected.name} has no free trial (only MAIRO Pro does). Change or cancel any time.`}
                    </p>
                  )}
                  <Link href="/plan/activate?skip=1#plans" className="mt-3 inline-block text-[12.5px] text-violet-bright hover:text-white">Change plan</Link>
                </div>
              ) : (
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {PLANS.map((p) => {
                    const ent = DEFAULT_ENTITLEMENTS[p.tier];
                    const rows: [string, string][] = [
                      ["Meta ad accounts", ent.ad_account_limit > 1 ? `Up to ${ent.ad_account_limit}, one per business or brand` : "1"],
                      ["Campaigns", Number.isFinite(ent.campaign_limit) ? `Up to ${ent.campaign_limit} at a time` : "Unlimited"],
                      ["AI creatives", `${ent.studio_credits_monthly} AI creative credits a month`],
                      ["Optimization", OPTIMIZATION[p.tier] ?? ""],
                      ["Reporting", REPORTING[p.tier] ?? ""],
                      ["Full Autopilot", ent.autopilot ? "Available — off until you switch it on" : "Not included"],
                      ["Team", Number.isFinite(ent.member_limit) ? "Just you" : "Team members with approval permissions"],
                      ["Support", p.features.some((f) => /priority support/i.test(f)) ? "Priority support" : "Standard support"],
                    ];
                    return (
                      <div key={p.tier} className={`flex min-w-0 flex-col rounded-2xl border p-5 ${p.featured ? "border-violet/40 bg-violet/[0.05]" : "border-white/[0.07] bg-field/80"}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[15px] font-semibold text-white">{p.name}</p>
                          {p.featured && <span className="rounded-full bg-[#ffffff] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-black">Most Popular</span>}
                        </div>
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
                        {/* Straight to Stripe: one press, not a second confirmation page. */}
                        {buyable.includes(p.tier) ? (
                          <PlanButton tier={p.tier} label={p.cta ?? `Choose ${p.name}`} />
                        ) : (
                          <Unavailable name={p.name} configured={configured} />
                        )}
                        <p className="mt-2 text-center text-[11.5px] text-faint">
                          {trialDays(p.tier) > 0 ? `${trialDays(p.tier)}-day free trial, then ${money(p.priceMonthly)}/month` : `Billed ${money(p.priceMonthly)}/month from today — no trial`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-4 text-[12.5px] text-muted">On every plan, launching a campaign, raising your total budget, spending past your limit and connecting a new ad account always wait for your approval.</p>
              <p className="mt-1 text-[12px] text-faint">Payment is handled by Stripe; MAIRO never sees your card. Cancel any time — cancelling stops the next renewal.</p>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
            <p className="text-[15px] font-semibold text-white">You already created your plan for free.</p>
            <p className="mt-1 text-[13px] text-muted">Your subscription unlocks:</p>
            <ul className="mt-3 space-y-1.5 text-[13px] text-white/85">
              {UNLOCKS.map((u) => (
                <li key={u} className="flex gap-2"><span aria-hidden className="text-emerald-300">✓</span>{u}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
            <p className="text-[15px] font-semibold text-white">Your ad budget is separate</p>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div><dt className="text-faint">MAIRO subscription</dt><dd className="text-white">{selected ? `${money(selected.priceMonthly)}/month` : `From ${money(Math.min(...PLANS.map((p) => p.priceMonthly)))}/month`}</dd></div>
              <div><dt className="text-faint">Advertising budget</dt><dd className="text-white">Paid directly to Meta (your plan suggests {usd(plan.dailyBudget)}/day)</dd></div>
            </dl>
            <p className="mt-3 text-[12.5px] text-muted">MAIRO never treats your subscription as ad spend, and never charges your ad budget.</p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
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
