import { db } from "@/lib/db";

/** How long after launch the dashboard says it's still collecting data. */
const LEARNING_MS = 72 * 60 * 60 * 1000;

/**
 * The first campaign's state, for a business that came through the free plan.
 * Null for everyone else (and before activation, when the dashboard isn't
 * reachable anyway). Launch is read from the network status, not assumed.
 */
export async function firstCampaignState(organizationId: string, now = new Date()) {
  const row = await db.strategyPlan.findUnique({
    where: { organizationId },
    select: { id: true, activatedAt: true, campaignId: true, launchedAt: true, welcomedAt: true },
  });
  if (!row?.activatedAt) return null;
  let launchedAt = row.launchedAt;
  if (!launchedAt && row.campaignId) {
    const live = await db.platformCampaign.findFirst({ where: { mairoCampaignId: row.campaignId, status: "ACTIVE" }, select: { id: true } });
    if (live) {
      launchedAt = now;
      await db.strategyPlan.update({ where: { id: row.id }, data: { launchedAt } });
    }
  }
  return {
    launched: Boolean(launchedAt),
    launchedAt,
    welcomed: Boolean(row.welcomedAt),
    learning: Boolean(launchedAt && now.getTime() - launchedAt.getTime() < LEARNING_MS),
  };
}
