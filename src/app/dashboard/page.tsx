import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, primaryButtonClass } from "@/components/ui";
import { currentMonthKey, formatMonthKey } from "@/lib/utils/month";

const statusTone = {
  DRAFT: "neutral",
  IN_REVIEW: "yellow",
  APPROVED: "blue",
  ACTIVE: "green",
  COMPLETE: "neutral",
} as const;

export default async function DashboardOverviewPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = session.user.organizationId;

  const [organization, plan, metaAccount, campaignCount, creativeCount] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId } }),
    db.monthlyPlan.findUnique({
      where: { organizationId_month: { organizationId, month: currentMonthKey() } },
    }),
    db.metaAdAccount.findUnique({ where: { organizationId } }),
    db.campaign.count({ where: { organizationId } }),
    db.creativeRequest.count({ where: { organizationId } }),
  ]);

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${organization?.name}`}
        description="Here's where things stand this month."
      />

      <div className="grid gap-6 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-neutral-400">Meta connection</p>
          <p className="mt-2 text-lg font-medium">
            {metaAccount?.status === "CONNECTED" ? (
              <Badge tone="green">Connected</Badge>
            ) : (
              <Badge tone="red">Not connected</Badge>
            )}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-400">Campaigns</p>
          <p className="mt-2 text-2xl font-semibold">{campaignCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-400">Creative requests</p>
          <p className="mt-2 text-2xl font-semibold">{creativeCount}</p>
        </Card>
      </div>

      <div className="mt-8">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-neutral-400">{formatMonthKey(currentMonthKey())} plan</p>
              <p className="mt-1 text-lg font-medium">
                {plan ? <Badge tone={statusTone[plan.status]}>{plan.status}</Badge> : "No plan yet"}
              </p>
            </div>
            <Link href="/dashboard/plan" className={primaryButtonClass}>
              View plan
            </Link>
          </div>
          {plan && <p className="mt-4 line-clamp-3 text-sm text-neutral-400">{plan.strategySummary}</p>}
        </Card>
      </div>

      {!metaAccount && (
        <div className="mt-8">
          <Card className="border-amber-500/30 bg-amber-500/[0.06]">
            <p className="font-medium">Connect your Meta ad account</p>
            <p className="mt-1 text-sm text-neutral-400">
              We need access to your Meta Business account before we can launch campaigns.
            </p>
            <Link href="/dashboard/meta" className={`${primaryButtonClass} mt-4`}>
              Connect Meta
            </Link>
          </Card>
        </div>
      )}
    </div>
  );
}
