import { db } from "@/lib/db";

// The MAIRO campaigns that may be spending in Meta right now.
//
// Cancelling MAIRO, or deleting the account, doesn't stop them: they live in
// the business's own ad account, and Meta keeps delivering until someone
// pauses them. Every screen that ends the relationship shows this list first.
//
// "Running" is what MAIRO last heard from Meta (the platform status ACTIVE).
// A campaign still waiting for its launch was built switched off, so it isn't
// spending and isn't listed.

export type RunningCampaign = {
  id: string;
  organizationId: string;
  name: string;
  /** What the campaign is approved to spend a day, in cents. */
  dailyBudgetCents: number;
};

export async function runningMetaCampaigns(organizationIds: string[]): Promise<RunningCampaign[]> {
  if (organizationIds.length === 0) return [];
  const rows = await db.mairoCampaign.findMany({
    where: {
      organizationId: { in: organizationIds },
      status: { not: "ARCHIVED" },
      platformCampaigns: { some: { platform: "META", externalCampaignId: { not: null }, status: "ACTIVE" } },
    },
    select: { id: true, organizationId: true, name: true, totalDailyBudgetCents: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ id: r.id, organizationId: r.organizationId, name: r.name, dailyBudgetCents: r.totalDailyBudgetCents }));
}
