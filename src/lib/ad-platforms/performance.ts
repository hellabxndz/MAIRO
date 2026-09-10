import { db } from "@/lib/db";
import type { AdPlatform } from "@/generated/prisma/enums";
import { getAdapter } from "./registry";
import { EMPTY_METRICS, type DateRange, type PlatformMetrics } from "./types";
import { aggregate } from "@/lib/budget/optimizer";

// Reading how a campaign is doing, across however many networks it runs on.
//
// This is the reporting half of the whole product: MAIRO builds the campaigns
// so a business owner never opens Ads Manager, and this is what means they
// never have to open TikTok Ads Manager either.
//
// The rules from the Meta-only version still hold and now matter more.
//
// It must never take the page down. These are live calls to two other
// companies' APIs with tokens that can expire or be revoked, and a dashboard
// that white-screens because TikTok was slow is worse than one that says so.
// Every failure is caught and returned as a value.
//
// No data is not zero. A campaign that has never been switched on has no
// impressions because nothing ran, and a network that could not be reached has
// no impressions because we could not ask. Neither is "0 impressions", and the
// difference is the difference between a customer thinking their ads failed
// and knowing they haven't started.
//
// And a platform failing is not the report failing. If TikTok is unreachable
// but Meta answers, the customer sees their Meta numbers and a note about
// TikTok — not an empty page.

export type PlatformReport = {
  platform: AdPlatform;
  metrics: PlatformMetrics;
  /** True when at least one campaign on this network returned figures. */
  hasData: boolean;
  /** Set when this network couldn't be read at all. Safe to show. */
  unavailable: string | null;
};

export type CampaignReport = {
  mairoCampaignId: string;
  name: string;
  /** Every network's figures added together. */
  total: PlatformMetrics;
  byPlatform: PlatformReport[];
  hasData: boolean;
};

export type OrganizationReport = {
  campaigns: CampaignReport[];
  /** Everything, everywhere, added up. */
  total: PlatformMetrics;
  byPlatform: PlatformReport[];
  hasData: boolean;
  /** Networks that couldn't be reached at all, for a single banner. */
  problems: { platform: AdPlatform; message: string }[];
};

/**
 * Pulls performance for every campaign an organization has.
 *
 * One call per network rather than one per campaign. Both adapters take a list
 * of campaign ids and filter server-side, so a customer with ten campaigns on
 * two networks costs two requests rather than twenty — which is the difference
 * between a dashboard that loads and one that times out.
 */
export async function fetchOrganizationPerformance(
  organizationId: string,
  range?: DateRange
): Promise<OrganizationReport> {
  const campaigns = await db.mairoCampaign.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    include: { platformCampaigns: true },
    orderBy: { createdAt: "desc" },
  });

  // Group every live external campaign id by network.
  const idsByPlatform = new Map<AdPlatform, string[]>();
  for (const campaign of campaigns) {
    for (const child of campaign.platformCampaigns) {
      // A child with no external id never reached its network. There is
      // nothing to ask about, and asking would be an error.
      if (!child.externalCampaignId) continue;
      const list = idsByPlatform.get(child.platform) ?? [];
      list.push(child.externalCampaignId);
      idsByPlatform.set(child.platform, list);
    }
  }

  const problems: { platform: AdPlatform; message: string }[] = [];
  // externalCampaignId -> metrics, for every network at once.
  const metricsByExternalId = new Map<string, PlatformMetrics>();
  const platformUnavailable = new Map<AdPlatform, string>();

  await Promise.all(
    [...idsByPlatform.entries()].map(async ([platform, ids]) => {
      const adapter = getAdapter(platform);
      if (!adapter) return;

      const result = await adapter.getCampaignPerformance({
        organizationId,
        externalCampaignIds: ids,
        range,
      });

      if (!result.ok) {
        platformUnavailable.set(platform, result.error.message);
        problems.push({ platform, message: result.error.message });
        return;
      }
      for (const row of result.data) {
        metricsByExternalId.set(row.externalCampaignId, row.metrics);
      }
    })
  );

  const campaignReports: CampaignReport[] = campaigns.map((campaign) => {
    const byPlatform: PlatformReport[] = campaign.platformCampaigns.map((child) => {
      const unavailable = platformUnavailable.get(child.platform) ?? null;
      const metrics = child.externalCampaignId
        ? metricsByExternalId.get(child.externalCampaignId)
        : undefined;

      return {
        platform: child.platform,
        metrics: metrics ?? EMPTY_METRICS,
        hasData: metrics !== undefined,
        unavailable,
      };
    });

    const withData = byPlatform.filter((p) => p.hasData);

    return {
      mairoCampaignId: campaign.id,
      name: campaign.name,
      total: withData.length > 0 ? aggregate(withData.map((p) => p.metrics)) : EMPTY_METRICS,
      byPlatform,
      hasData: withData.length > 0,
    };
  });

  // Organization-wide totals, per network and overall.
  const platformTotals = new Map<AdPlatform, PlatformMetrics[]>();
  for (const report of campaignReports) {
    for (const p of report.byPlatform) {
      if (!p.hasData) continue;
      const list = platformTotals.get(p.platform) ?? [];
      list.push(p.metrics);
      platformTotals.set(p.platform, list);
    }
  }

  const byPlatform: PlatformReport[] = [...idsByPlatform.keys()].map((platform) => {
    const parts = platformTotals.get(platform) ?? [];
    return {
      platform,
      metrics: parts.length > 0 ? aggregate(parts) : EMPTY_METRICS,
      hasData: parts.length > 0,
      unavailable: platformUnavailable.get(platform) ?? null,
    };
  });

  const withData = byPlatform.filter((p) => p.hasData);

  return {
    campaigns: campaignReports,
    total: withData.length > 0 ? aggregate(withData.map((p) => p.metrics)) : EMPTY_METRICS,
    byPlatform,
    hasData: withData.length > 0,
    problems,
  };
}
