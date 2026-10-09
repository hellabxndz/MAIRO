import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { openCancelPortalAction } from "@/lib/actions/billing-actions";
import { runningMetaCampaigns } from "@/lib/billing/running-campaigns";
import { RunningCampaigns } from "@/components/billing/running-campaigns";
import { CancelReason } from "@/components/success/cancel-reason";
import { planFor } from "@/lib/plans";
import { activeOrganizationId } from "@/lib/active-org";
import { daysLeft } from "@/lib/meta/token-expiry";

// "Before you cancel": the page between "Cancel MAIRO" and Stripe.
//
// Cancelling MAIRO stops MAIRO; it doesn't stop Meta. Campaigns MAIRO built
// live in the business's own ad account and keep spending until someone
// pauses them. So this page lists them first, with a pause button each, and
// only then sends the owner to Stripe to cancel. Nothing here pauses anything
// on its own, and cancelling never pauses anything either.

export const maxDuration = 60;

const LIVE = ["active", "trialing", "past_due", "unpaid"];

export default async function CancelPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = session.user.organizationId;

  const [org, clients, meta] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionTier: true, subscriptionStatus: true, stripeCustomerId: true, stripeSubscriptionId: true, currentPeriodEnd: true, subscriptionCancelAt: true },
    }),
    db.organization.findMany({ where: { parentId: organizationId }, select: { id: true } }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true, tokenExpiresAt: true } }),
  ]);
  if (!org) redirect("/dashboard/billing");

  const running = await runningMetaCampaigns([organizationId, ...clients.map((c) => c.id)]);
  // Pausing acts on the business open now; a freelancer's other clients are
  // listed, with the way to pause them.
  const openNow = (await activeOrganizationId()) ?? organizationId;
  // Connected, and the permission's date hasn't passed (daysLeft is null once it has).
  const metaReachable = meta?.status === "CONNECTED" && (!meta.tokenExpiresAt || daysLeft(meta.tokenExpiresAt) !== null);
  const subscribed = Boolean(org.stripeSubscriptionId && LIVE.includes(org.subscriptionStatus ?? ""));
  const endsOn = (org.subscriptionCancelAt ?? org.currentPeriodEnd)?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const plan = planFor(org.subscriptionTier);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Before you cancel"
        description="Cancelling MAIRO doesn't cancel your advertising with Meta. Check your campaigns first."
      />

      <Card className="mb-6">
        <h2 className="text-base font-medium text-white">What cancelling changes</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-300">
          <li>
            Your {plan.name} plan stays active until the end of the period you paid for
            {endsOn ? ` (${endsOn})` : ""}. The current month isn&apos;t refunded.
          </li>
          <li>After that, MAIRO stops building, changing and launching campaigns, and stops watching them.</li>
          <li>
            <strong className="text-white">Campaigns already running in Meta keep running and spending</strong> at the
            budgets you approved until someone pauses them. Cancelling doesn&apos;t pause them.
          </li>
          <li>You can still pause campaigns from MAIRO after cancelling, and always in Meta Ads Manager.</li>
          <li>If you disconnect Meta or delete your account, MAIRO can no longer pause anything — manage those campaigns in Meta Ads Manager.</li>
          <li>Your plan, settings and history are kept if you come back.</li>
        </ul>
      </Card>

      <Card id="campaigns" className="mb-6 scroll-mt-24">
        <h2 className="text-base font-medium text-white">Your campaigns running in Meta</h2>
        <p className="mt-1 mb-4 text-sm text-neutral-400">What MAIRO last heard from Meta. Pausing asks Meta and shows the result.</p>
        <RunningCampaigns
          campaigns={running.map((c) => ({ id: c.id, name: c.name, dailyBudgetCents: c.dailyBudgetCents, pausable: c.organizationId === openNow }))}
          canPause={metaReachable}
        />
      </Card>

      {subscribed && org.subscriptionCancelAt ? (
        <Card>
          <h2 className="text-base font-medium text-white">Your subscription is already cancelled</h2>
          <p className="mt-2 text-sm text-neutral-300">
            MAIRO stays active until {endsOn}. Changed your mind? You can undo it in{" "}
            <Link href="/dashboard/billing" className="underline underline-offset-4">Billing → Manage billing</Link>.
          </p>
        </Card>
      ) : subscribed && org.stripeCustomerId ? (
        <Card>
          <h2 className="text-base font-medium text-white">Cancel your MAIRO subscription</h2>
          <CancelReason onCancelPage />
          <p className="mt-5 text-sm leading-relaxed text-neutral-300">
            You finish cancelling on Stripe&apos;s secure page, and Stripe emails you a confirmation. That confirmation
            is about your MAIRO subscription only — your campaigns&apos; status is what&apos;s shown above.
          </p>
          <form action={openCancelPortalAction} className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" className="min-h-[44px] rounded-full border border-red-400/40 px-5 text-sm text-red-200 transition hover:bg-red-500 hover:text-white">
              Continue to cancel on Stripe
            </button>
            <Link href="/dashboard/billing" className="text-sm text-neutral-400 underline underline-offset-4 hover:text-white">
              Keep my subscription
            </Link>
          </form>
        </Card>
      ) : (
        <Card>
          <h2 className="text-base font-medium text-white">No subscription to cancel</h2>
          <p className="mt-2 text-sm text-neutral-300">
            You don&apos;t have an active MAIRO subscription.{" "}
            <Link href="/dashboard/billing" className="underline underline-offset-4">Back to Billing</Link>
          </p>
        </Card>
      )}
    </div>
  );
}
