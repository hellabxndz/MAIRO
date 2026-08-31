import { db } from "@/lib/db";
import { Card, PageHeader, Badge } from "@/components/ui";

export default async function AiosOverviewPage() {
  const [orgCount, campaignCount, activeCampaigns, pendingCreatives, connectedMeta] =
    await Promise.all([
      db.organization.count(),
      db.campaign.count(),
      db.campaign.count({ where: { status: "ACTIVE" } }),
      db.creativeRequest.count({ where: { status: { in: ["REQUESTED", "IN_PROGRESS"] } } }),
      db.metaAdAccount.count({ where: { status: "CONNECTED" } }),
    ]);

  const recentOrgs = await db.organization.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { intake: true, metaAdAccount: true },
  });

  return (
    <div>
      <PageHeader title="MyRo overview" description="Everything running across every client." />

      <div className="grid gap-6 sm:grid-cols-4">
        <Card>
          <p className="text-sm text-neutral-400">Organizations</p>
          <p className="mt-2 text-2xl font-semibold">{orgCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-400">Campaigns (active)</p>
          <p className="mt-2 text-2xl font-semibold">
            {activeCampaigns} <span className="text-base text-neutral-500">/ {campaignCount}</span>
          </p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-400">Meta accounts connected</p>
          <p className="mt-2 text-2xl font-semibold">{connectedMeta}</p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-400">Creative requests open</p>
          <p className="mt-2 text-2xl font-semibold">{pendingCreatives}</p>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 font-medium">Newest organizations</h2>
        <div className="space-y-3">
          {recentOrgs.map((org) => (
            <Card key={org.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{org.name}</p>
                <p className="text-sm text-neutral-500">
                  {org.intake ? org.intake.primaryGoal : "Onboarding incomplete"}
                </p>
              </div>
              <Badge tone={org.metaAdAccount ? "green" : "red"}>
                {org.metaAdAccount ? "Meta connected" : "Not connected"}
              </Badge>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
