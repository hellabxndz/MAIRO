import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";
import { isSoldTier, planFor, trialDaysFor } from "@/lib/plans";
import { statusEntitles } from "@/lib/stripe/client";
import { brandsOf, payingBusinessOf } from "@/lib/brands";
import { ChangePlanButton } from "../../settings/change-plan-button";
import type { SubscriptionTier } from "@/generated/prisma/enums";

// "Switch to …": what a plan change does before anything is charged.
//
// Moving between MAIRO Pro and MAIRO Scale changes what MAIRO may do, not
// what is already running: no campaign is paused, no budget is changed, and
// nothing is deleted. The list below is worked out from the two plans'
// entitlements, so it says exactly what the server will start or stop
// allowing.

export const metadata = { title: "Change plan" };

function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export default async function ChangePlanPage({ searchParams }: PageProps<"/dashboard/billing/change">) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = session.user.organizationId;
  const { to } = await searchParams;
  const target = String(to ?? "") as SubscriptionTier;
  if (!isSoldTier(target)) redirect("/dashboard/billing");
  if (await payingBusinessOf(organizationId)) redirect("/dashboard/billing");

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, subscriptionTier: true, subscriptionStatus: true, stripeSubscriptionId: true, currentPeriodEnd: true },
  });
  if (!org) redirect("/sign-in");
  // Nothing to change from: choosing a first plan is the billing page's job.
  if (!org.stripeSubscriptionId || !statusEntitles(org.subscriptionStatus) || org.subscriptionTier === target) redirect("/dashboard/billing");

  const from = planFor(org.subscriptionTier);
  const next = planFor(target);
  const a = DEFAULT_ENTITLEMENTS[org.subscriptionTier];
  const b = DEFAULT_ENTITLEMENTS[target];
  const brands = await brandsOf(organizationId);
  const keepBrands = Math.max(0, b.ad_account_limit - 1);
  const lockedBrands = brands.slice(keepBrands);
  const team = await db.organizationMember.count({ where: { organizationId } });
  const trialing = org.subscriptionStatus === "trialing";
  const upgrade = next.priceMonthly > from.priceMonthly;

  const gains: string[] = [];
  const losses: string[] = [];
  const diff = (on: boolean, off: boolean, label: string, lost: string) => {
    if (!on && off) gains.push(label);
    if (on && !off) losses.push(lost);
  };
  if (b.ad_account_limit > a.ad_account_limit) gains.push(`Up to ${b.ad_account_limit} Meta ad accounts — add businesses in Settings › Your businesses`);
  if (b.ad_account_limit < a.ad_account_limit)
    losses.push(
      lockedBrands.length
        ? `${lockedBrands.map((x) => x.name).join(" and ")} ${lockedBrands.length === 1 ? "is" : "are"} no longer covered: building, changing and launching stop there. ${lockedBrands.length === 1 ? "Its" : "Their"} running campaigns keep running until you pause them, and nothing is deleted.`
        : `${b.ad_account_limit} Meta ad account`
    );
  if (b.studio_credits_monthly !== a.studio_credits_monthly) (b.studio_credits_monthly > a.studio_credits_monthly ? gains : losses).push(`${b.studio_credits_monthly} AI creative credits a month (from ${a.studio_credits_monthly})`);
  if (b.campaign_limit !== a.campaign_limit)
    (b.campaign_limit > a.campaign_limit ? gains : losses).push(
      Number.isFinite(b.campaign_limit) ? `Up to ${b.campaign_limit} campaigns at a time — any over that keep running, but new ones wait` : "Unlimited campaigns",
    );
  diff(a.advanced_analytics, b.advanced_analytics, "Advanced performance analytics", "Advanced performance analytics");
  diff(a.auto_optimize, b.auto_optimize, "AI Assist, when you switch it on", "AI Assist — MAIRO goes back to recommending, and every change waits for you");
  diff(a.autopilot, b.autopilot, "Full Autopilot, when you switch it on", "Full Autopilot");
  diff(a.social_posting, b.social_posting, "MAIRO Social Manager", "MAIRO Social Manager — anything scheduled is paused, never published; your posts and strategy are kept");
  diff(a.advanced_tracking, b.advanced_tracking, "Advanced revenue and lead tracking", "Advanced revenue and lead tracking — what you've recorded is kept");
  diff(a.growth_coach, b.growth_coach, "Performance Coach", "Performance Coach");
  if (b.member_limit > a.member_limit) gains.push("Invite team members with their own permissions");
  if (b.member_limit < a.member_limit) losses.push(team > b.member_limit ? `New team invitations — the ${team - 1} ${team - 1 === 1 ? "person" : "people"} already on your team stay` : "Team members");

  return (
    <div className="mx-auto max-w-[760px]">
      <Link href="/dashboard/billing" className="text-[13px] text-muted hover:text-white">
        ← Billing
      </Link>
      <PageHeader
        title={`Switch to ${next.name}`}
        description={`${from.name} → ${next.name}, ${money(next.priceMonthly)} a month. Your ad spend stays separate: Meta charges it to your own ad account.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {gains.length > 0 && (
          <section className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.04] p-5">
            <h2 className="text-[14px] font-semibold text-white">What you get</h2>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-neutral-300">
              {gains.map((g) => (
                <li key={g} className="flex gap-2"><span aria-hidden className="text-emerald-300">+</span>{g}</li>
              ))}
            </ul>
          </section>
        )}
        {losses.length > 0 && (
          <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-5">
            <h2 className="text-[14px] font-semibold text-white">What stops</h2>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-neutral-300">
              {losses.map((l) => (
                <li key={l} className="flex gap-2"><span aria-hidden className="text-amber-300">–</span>{l}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[13.5px] leading-relaxed text-neutral-300">
        <p className="font-medium text-white">What doesn&rsquo;t change</p>
        <p className="mt-1">
          No campaign is paused, no budget is changed and nothing is deleted. Launches and budget increases still wait for your approval, on either plan.
        </p>
        <p className="mt-3 font-medium text-white">What you pay</p>
        <p className="mt-1">
          {trialing && trialDaysFor(target) === 0
            ? `${next.name} has no free trial, so switching ends your trial and charges ${money(next.priceMonthly)} today, then monthly. If your card is declined, nothing changes.`
            : trialing
              ? `Your free trial carries on; ${money(next.priceMonthly)} a month starts when it ends.`
              : `Stripe shows the exact amount before you confirm: ${upgrade ? "the difference for the rest of this month, then" : "a credit for the rest of this month, then"} ${money(next.priceMonthly)} a month from your next renewal${org.currentPeriodEnd ? ` (${org.currentPeriodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric" })})` : ""}.`}
        </p>
      </div>

      <ChangePlanButton
        tier={target}
        label={trialing && trialDaysFor(target) === 0 ? `Switch and pay ${money(next.priceMonthly)} now` : `Review the change in Stripe`}
      />
      <p className="mt-2 text-[12px] text-faint">
        {trialing && trialDaysFor(target) === 0 ? "Charged to the card on your subscription." : "Nothing is charged until you confirm on Stripe's page."}
      </p>
    </div>
  );
}
