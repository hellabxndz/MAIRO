import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { StatusSelect } from "@/components/status-select";
import { ReviewVerdict } from "@/components/review-verdict";
import { RerunReviewButton } from "@/components/rerun-review-button";
import { DeleteOrganization } from "@/components/delete-organization";
import {
  updateCreativeStatusAction,
  updatePlanStatusAction,
  updateSubscriptionTierAction,
} from "@/lib/actions/aios-actions";
import { formatMonthKey, currentMonthKey } from "@/lib/utils/month";
import { planFor } from "@/lib/plans";

const PLAN_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "ACTIVE", "COMPLETE"];
// Approve and block belong to the safety check, not to a dropdown — see
// MANUAL_STATUSES in aios-actions.ts.
const CREATIVE_STATUSES = ["REQUESTED", "IN_PROGRESS", "DELIVERED"];
const TIERS = ["NONE", "STARTER", "GROWTH", "SCALE"];

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
      // Counted separately from `campaigns` for the delete summary: that table
      // is the pre-multi-platform one, so an org can have live campaigns and
      // still show zero there.
      mairoCampaigns: { select: { id: true } },
      creativeRequests: { orderBy: { createdAt: "desc" } },
      users: true,
    },
  });

  if (!org) notFound();

  const plan = planFor(org.subscriptionTier);
  const month = currentMonthKey();
  const creativesThisMonth = org.creativeRequests.filter((r) => r.month === month).length;
  const activeCampaigns = org.campaigns.filter((c) => c.status !== "ARCHIVED").length;
  // The legacy table was backfilled into mairoCampaigns, so the two overlap;
  // whichever is larger is the honest count of campaigns this account owns.
  const campaignCount = Math.max(org.campaigns.length, org.mairoCampaigns.length);

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

      <Card className="mb-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-medium">Plan &amp; usage</h2>
            <p className="mt-1 text-sm text-neutral-400">
              On {plan.name} (${plan.priceMonthly}/mo) · {activeCampaigns}/
              {plan.limits.campaigns} campaigns · {creativesThisMonth}/
              {plan.limits.creativesPerMonth} creatives this month
            </p>
            {org.subscriptionTier === "NONE" && (
              <p className="mt-1 text-xs text-amber-400">
                No tier assigned — being treated as {plan.name} limits.
              </p>
            )}
          </div>
          <form action={updateSubscriptionTierAction.bind(null, org.id)}>
            <StatusSelect
              name="subscriptionTier"
              defaultValue={org.subscriptionTier}
              options={TIERS}
            />
          </form>
        </div>
      </Card>

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
              <Card key={r.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-neutral-500">
                    {r.type} · {r.month}
                  </p>
                  <p>{r.brief}</p>
                  <ReviewVerdict
                    status={r.status}
                    reviewedAt={r.reviewedAt}
                    reviewCategory={r.reviewCategory}
                    reviewNotes={r.reviewNotes}
                  />
                </div>
                {r.status === "IN_REVIEW" || r.status === "BLOCKED" ? (
                  <RerunReviewButton
                    requestId={r.id}
                    organizationId={org.id}
                    label={r.status === "BLOCKED" ? "Check it again" : "Run the check again"}
                  />
                ) : (
                  <form action={updateCreativeStatusAction.bind(null, r.id, org.id)}>
                    <StatusSelect
                      defaultValue={r.status}
                      options={
                        CREATIVE_STATUSES.includes(r.status)
                          ? CREATIVE_STATUSES
                          : [r.status, ...CREATIVE_STATUSES]
                      }
                    />
                  </form>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-medium text-red-300/80">Danger zone</h2>
        <Card className="border-red-500/20">
          <DeleteOrganization
            organizationId={org.id}
            name={org.name}
            summary={[
              `${org.users.length} sign-in${org.users.length === 1 ? "" : "s"}`,
              `${campaignCount} campaign${campaignCount === 1 ? "" : "s"}`,
              `${org.creativeRequests.length} creative request${org.creativeRequests.length === 1 ? "" : "s"}`,
              `${org.monthlyPlans.length} monthly plan${org.monthlyPlans.length === 1 ? "" : "s"}`,
              "any connected ad accounts, tracking and conversion history",
            ]}
          />
          <p className="mt-4 border-t border-white/10 pt-3 text-xs text-neutral-600">
            Nothing here is sent to Meta or TikTok. A campaign still running on a
            network is refused rather than deleted — stop it there first, or it keeps
            spending with nothing left able to stop it.
          </p>
        </Card>
      </div>
    </div>
  );
}
