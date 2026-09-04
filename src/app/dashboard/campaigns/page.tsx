import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { planFor } from "@/lib/plans";
import { NewCampaignForm } from "./new-campaign-form";
import { fetchPerformance } from "@/lib/meta/performance";
import { loadMetaConnection } from "@/lib/meta/connection";
import { formatInteger, formatMoney, NO_VALUE } from "@/components/metrics";

// Each row's figures are a live call to Meta. See the note in
// src/app/dashboard/page.tsx — same reason, same budget.
export const maxDuration = 30;

const statusTone = {
  DRAFT: "neutral",
  PENDING_REVIEW: "yellow",
  ACTIVE: "green",
  PAUSED: "yellow",
  ARCHIVED: "neutral",
} as const;

export default async function CampaignsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId = session.user.organizationId;

  const [campaigns, organization, metaAccount] = await Promise.all([
    db.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionTier: true },
    }),
    loadMetaConnection(organizationId),
  ]);

  const performance = await fetchPerformance({
    accessToken: metaAccount?.accessToken ?? null,
    campaigns,
  });
  // Indexed by MAIRO's campaign id so a row can find its own figures without
  // scanning the list again for every render.
  const byCampaign = new Map(performance.rows.map((r) => [r.id, r]));

  const plan = planFor(organization?.subscriptionTier ?? "NONE");
  const activeCount = campaigns.filter((c) => c.status !== "ARCHIVED").length;
  const atLimit = activeCount >= plan.limits.campaigns;

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Create a campaign and, once Meta is connected, we push it live for review."
        action={
          <Badge tone={atLimit ? "yellow" : "neutral"}>
            {activeCount} / {plan.limits.campaigns} campaigns
          </Badge>
        }
      />

      <Card className="mb-8">
        {atLimit ? (
          <div className="space-y-2">
            <p className="font-medium">
              You&apos;re running the most campaigns the {plan.name} plan allows
            </p>
            <p className="text-sm text-neutral-400">
              Archive one to free up a slot, or upgrade for more concurrent campaigns.
            </p>
          </div>
        ) : (
          <NewCampaignForm />
        )}
      </Card>

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create your first campaign above, or ask the Strategist agent for a recommendation."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-white/[0.03] text-neutral-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Objective</th>
                <th className="px-4 py-3 font-medium">Daily budget</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">On Meta</th>
                <th className="px-4 py-3 text-right font-medium">Spend</th>
                <th className="px-4 py-3 text-right font-medium">Impressions</th>
                <th className="px-4 py-3 text-right font-medium">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const result = byCampaign.get(c.id);
                const insights = result?.insights;
                // A campaign that has run reports numbers; one that never has
                // reports nothing at all. Only the first case gets figures —
                // the rest get a dash, because "0 clicks" and "never started"
                // are different things and only one of them is bad news.
                const ran = Boolean(
                  insights && (insights.impressions || insights.clicks || insights.spend)
                );
                return (
                <tr key={c.id} className="border-t border-white/10">
                  <td className="px-4 py-3">{c.name}</td>
                  <td className="px-4 py-3 text-neutral-400">{c.objective}</td>
                  <td className="px-4 py-3 text-neutral-400">
                    ${(c.dailyBudgetCents / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone[c.status]}>{c.status.replace("_", " ")}</Badge>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {c.metaCampaignId ? "Yes" : "Not yet"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-300">
                    {ran ? formatMoney(Number(insights?.spend ?? 0)) : NO_VALUE}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-300">
                    {ran ? formatInteger(Number(insights?.impressions ?? 0)) : NO_VALUE}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-300">
                    {ran ? formatInteger(Number(insights?.clicks ?? 0)) : NO_VALUE}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {campaigns.length > 0 && (
        <p className="mt-4 text-xs leading-relaxed text-neutral-600">
          {performance.unavailable
            ? performance.unavailable
            : "Spend, impressions and clicks are read live from your Meta ad account. A dash means the campaign hasn't run yet — MAIRO creates every campaign paused, so nothing spends until you switch it on."}
        </p>
      )}
    </div>
  );
}
