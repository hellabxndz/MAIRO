import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, Badge } from "@/components/ui";

export default async function OrganizationsPage() {
  const organizations = await db.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      intake: true,
      metaAdAccount: true,
      _count: { select: { campaigns: true, creativeRequests: true } },
    },
  });

  return (
    <div>
      <PageHeader title="Organizations" description={`${organizations.length} client accounts`} />

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Business</th>
              <th className="px-4 py-3 font-medium">Goal</th>
              <th className="px-4 py-3 font-medium">Budget</th>
              <th className="px-4 py-3 font-medium">Campaigns</th>
              <th className="px-4 py-3 font-medium">Meta</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => (
              <tr key={org.id} className="border-t border-white/10 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <Link href={`/aios/organizations/${org.id}`} className="font-medium hover:underline">
                    {org.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-400">
                  {org.intake?.primaryGoal ?? "Incomplete"}
                </td>
                <td className="px-4 py-3 text-neutral-400">
                  {org.intake ? `$${(org.intake.monthlyBudgetCents / 100).toFixed(0)}/mo` : "—"}
                </td>
                <td className="px-4 py-3 text-neutral-400">{org._count.campaigns}</td>
                <td className="px-4 py-3">
                  <Badge tone={org.metaAdAccount ? "green" : "red"}>
                    {org.metaAdAccount ? "Connected" : "Not connected"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
