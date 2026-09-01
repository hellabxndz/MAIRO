import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { NewCampaignForm } from "./new-campaign-form";

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

  const campaigns = await db.campaign.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Create a campaign and, once Meta is connected, we push it live for review."
      />

      <Card className="mb-8">
        <NewCampaignForm />
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
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
