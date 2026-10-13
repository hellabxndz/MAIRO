import { db } from "@/lib/db";
import Link from "next/link";
import { Card, PageHeader, Badge } from "@/components/ui";
import { metaIntelligenceSummary } from "@/lib/meta-intelligence";
import { heroFunnel } from "@/lib/analytics/funnel";

export default async function AiosOverviewPage() {
  const [orgCount, campaignCount, activeCampaigns, pendingCreatives, connectedMeta] =
    await Promise.all([
      db.organization.count(),
      db.campaign.count(),
      db.campaign.count({ where: { status: "ACTIVE" } }),
      db.creativeRequest.count({ where: { status: { in: ["REQUESTED", "IN_PROGRESS"] } } }),
      db.metaAdAccount.count({ where: { status: "CONNECTED" } }),
    ]);

  const metaIntel = await metaIntelligenceSummary().catch(() => null);
  const heroes = await heroFunnel(30).catch(() => []);

  const recentOrgs = await db.organization.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { intake: true, metaAdAccount: true },
  });

  return (
    <div>
      <PageHeader title="MAIRO overview" description="Everything running across every client." />

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

      <Card className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-neutral-400">Landing page versions · last 30 days</p>
          <p className="text-xs text-neutral-500">Plans created per landing view is the measure that decides. Views count once per visitor per day.</p>
        </div>
        {heroes.length ? (
          <table className="mt-3 w-full text-left text-[13.5px]">
            <thead className="text-neutral-400">
              <tr>
                <th className="py-1 font-normal">Version</th>
                <th className="py-1 font-normal">Views</th>
                <th className="py-1 font-normal">Previews started</th>
                <th className="py-1 font-normal">Previews finished</th>
                <th className="py-1 font-normal">Plans created</th>
                <th className="py-1 font-normal">Plans per view</th>
              </tr>
            </thead>
            <tbody>
              {heroes.map((h) => (
                <tr key={h.variant} className="border-t border-white/10">
                  <td className="py-1.5">{h.variant === "story" ? "Story hero (new)" : "Previous page"}</td>
                  <td className="py-1.5 tabular-nums">{h.views}</td>
                  <td className="py-1.5 tabular-nums">{h.previewStarts}</td>
                  <td className="py-1.5 tabular-nums">{h.previewCompletes}</td>
                  <td className="py-1.5 tabular-nums">{h.plansCreated}</td>
                  <td className="py-1.5 tabular-nums">{h.planRate === null ? "—" : `${(h.planRate * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-[13.5px] text-neutral-400">No landing visits recorded yet.</p>
        )}
        <p className="mt-2 text-xs text-neutral-500">Too few plans to call a winner until each version has a few dozen. The previous page has no preview, so its preview columns stay at zero.</p>
      </Card>

      {metaIntel && (
        <Link href="/aios/meta-intelligence" className="mt-6 block">
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-neutral-400">Meta Intelligence</p>
              <p className="mt-1 text-[15px] text-white">{metaIntel.open} open Meta updates · {metaIntel.alerts} unread alerts</p>
            </div>
            {metaIntel.critical > 0 ? <Badge tone="red">{metaIntel.critical} critical</Badge> : <Badge tone="green">No critical updates</Badge>}
          </Card>
        </Link>
      )}

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
