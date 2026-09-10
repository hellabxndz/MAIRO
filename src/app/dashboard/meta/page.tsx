import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { disconnectMetaAction, exploreWithoutMetaAction } from "@/lib/actions/meta-actions";
import { activeOrganizationId } from "@/lib/active-org";
import { fetchMetaBillingStatus, fetchMonthToDateSpendCents } from "@/lib/meta/billing";
import { AdSpendCard } from "@/components/ad-spend-card";

// The billing figures are live Graph calls. Same budget as the other pages that
// read from Meta, for the same reason.
export const maxDuration = 30;

export default async function MetaConnectionPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    connected?: string;
    required?: string;
    checkBilling?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId =
    (await activeOrganizationId()) ?? session.user.organizationId;

  const { error, connected, required, checkBilling } = await searchParams;

  // Selected explicitly rather than loading the whole row: this page shows the
  // account id and when it was connected, and has no business pulling the
  // stored access token into a rendered component at all.
  const metaAccount = await db.metaAdAccount.findUnique({
    where: { organizationId: organizationId },
    select: { status: true, metaAdAccountId: true, connectedAt: true },
  });

  // Only worth asking Meta about money once there is a connection to ask
  // through. The intake's monthly budget is what the customer *said* they would
  // spend; the spend figure is what Meta actually charged.
  const [billing, monthToDate, intake] = metaAccount
    ? await Promise.all([
        fetchMetaBillingStatus(organizationId),
        fetchMonthToDateSpendCents(organizationId),
        db.onboardingIntake.findUnique({
          where: { organizationId },
          select: { monthlyBudgetCents: true },
        }),
      ])
    : [null, null, null];

  return (
    <div>
      <PageHeader
        title="Meta connection"
        description="Connect your Facebook/Instagram ad account so MAIRO can launch and manage campaigns for you."
      />

      {required && !metaAccount && (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/[0.06]">
          <p className="text-sm text-amber-300">
            One last step — connect your Meta ad account to unlock the rest of your dashboard.
            We can&apos;t plan or launch campaigns without it.
          </p>
        </Card>
      )}

      {error && (
        <Card className="mb-6 border-red-500/30 bg-red-500/[0.06]">
          <p className="text-sm text-red-300">{decodeURIComponent(error)}</p>
        </Card>
      )}
      {connected && (
        <Card className="mb-6 border-emerald-500/30 bg-emerald-500/[0.06]">
          <p className="text-sm text-emerald-300">
            {checkBilling
              ? "Meta account connected — but Meta says it can't run ads yet. Check the payment details below."
              : "Meta account connected successfully."}
          </p>
        </Card>
      )}

      {/* Above the connection details, deliberately. Once an account is
          connected, "can it actually pay for anything" is the more urgent
          question, and it is the one nothing in the product answered. */}
      {billing && (
        <div className="mb-6">
          <AdSpendCard
            billing={billing}
            accountId={metaAccount?.metaAdAccountId ?? null}
            monthToDateCents={monthToDate}
            plannedMonthlyCents={intake?.monthlyBudgetCents ?? null}
          />
        </div>
      )}

      <Card>
        {metaAccount ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge tone={metaAccount.status === "CONNECTED" ? "green" : "red"}>
                {metaAccount.status}
              </Badge>
              <span className="text-sm text-neutral-400">
                Ad account {metaAccount.metaAdAccountId}
              </span>
            </div>
            <p className="text-sm text-neutral-500">
              Connected {metaAccount.connectedAt.toLocaleDateString()}
            </p>
            <div className="flex flex-wrap gap-3">
              {required && (
                <Link href="/dashboard" className={primaryButtonClass}>
                  Continue to your dashboard →
                </Link>
              )}
              <form action={disconnectMetaAction}>
                <button type="submit" className={secondaryButtonClass}>
                  Disconnect
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-neutral-400">
              You&apos;ll be redirected to Facebook to log in and grant MAIRO access to your
              ad account.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <a href="/api/meta/connect" className={primaryButtonClass}>
                Connect Meta account
              </a>
              <form action={exploreWithoutMetaAction}>
                <button
                  type="submit"
                  className="text-sm text-neutral-400 underline underline-offset-4 transition hover:text-white"
                >
                  Look around first
                </button>
              </form>
            </div>
            <p className="text-xs leading-relaxed text-neutral-600">
              You can explore the dashboard, build a plan, and talk to the AI
              specialists without connecting. Nothing goes live until you do.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
