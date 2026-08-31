import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { StatusSelect } from "@/components/status-select";
import { updateCreativeStatusAction, updatePlanStatusAction } from "@/lib/actions/aios-actions";
import { formatMonthKey } from "@/lib/utils/month";

const PLAN_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "ACTIVE", "COMPLETE"];
const CREATIVE_STATUSES = ["REQUESTED", "IN_PROGRESS", "IN_REVIEW", "APPROVED", "DELIVERED"];

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const org = await db.organization.findUnique({
    where: { id },
    include: {
      intake: true,
      metaAdAccount: true,
      monthlyPlans: { orderBy: { month: "desc" } },
      campaigns: { orderBy: { createdAt: "desc" } },
      creativeRequests: { orderBy: { createdAt: "desc" } },
      users: true,
    },
  });

  if (!org) notFound();

  return (
    <div>
      <PageHeader
        title={org.name}
        description={org.users.map((u) => u.email).join(", ")}
        action={
          <Badge tone={org.metaAdAccount ? "green" : "red"}>
            {org.metaAdAccount ? "Meta connected" : "Meta not connected"}
          </Badge>
        }
      />

      {org.intake && (
        <Card className="mb-6">
          <h2 className="mb-3 font-medium">Intake</h2>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-neutral-500">Goal</p>
              <p>{org.intake.primaryGoal}</p>
            </div>
            <div>
              <p className="text-neutral-500">Monthly budget</p>
              <p>${(org.intake.monthlyBudgetCents / 100).toFixed(0)}</p>
            </div>
            {org.intake.targetAudience && (
              <div className="sm:col-span-2">
                <p className="text-neutral-500">Target audience</p>
                <p>{org.intake.targetAudience}</p>
              </div>
            )}
            {org.intake.notes && (
              <div className="sm:col-span-2">
                <p className="text-neutral-500">Notes</p>
                <p>{org.intake.notes}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="mb-6">
        <h2 className="mb-3 font-medium">Monthly plans</h2>
        {org.monthlyPlans.length === 0 ? (
          <EmptyState title="No plans yet" />
        ) : (
          <div className="space-y-3">
            {org.monthlyPlans.map((plan) => (
              <Card key={plan.id}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-medium">{formatMonthKey(plan.month)}</p>
                  <form action={updatePlanStatusAction.bind(null, plan.id, org.id)}>
                    <StatusSelect defaultValue={plan.status} options={PLAN_STATUSES} />
                  </form>
                </div>
                <p className="text-sm text-neutral-400">{plan.strategySummary}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mb-6">
        <h2 className="mb-3 font-medium">Campaigns</h2>
        {org.campaigns.length === 0 ? (
          <EmptyState title="No campaigns yet" />
        ) : (
          <div className="space-y-2">
            {org.campaigns.map((c) => (
              <Card key={c.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-neutral-500">
                    {c.objective} · ${(c.dailyBudgetCents / 100).toFixed(2)}/day
                  </p>
                </div>
                <Badge tone="neutral">{c.status.replace("_", " ")}</Badge>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-medium">Creative requests</h2>
        {org.creativeRequests.length === 0 ? (
          <EmptyState title="No creative requests yet" />
        ) : (
          <div className="space-y-2">
            {org.creativeRequests.map((r) => (
              <Card key={r.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm text-neutral-500">
                    {r.type} · {r.month}
                  </p>
                  <p>{r.brief}</p>
                </div>
                <form action={updateCreativeStatusAction.bind(null, r.id, org.id)}>
                  <StatusSelect defaultValue={r.status} options={CREATIVE_STATUSES} />
                </form>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
