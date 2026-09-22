import { db } from "@/lib/db";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { fetchMetaBillingStatus } from "@/lib/meta/billing";
import { canOptimizeTowards } from "@/lib/tracking/pixels";
import { normalizeUrl } from "@/lib/campaigns/destination";
import { probeLandingPage } from "@/lib/campaigns/landing-probe";
import type { CampaignPlan } from "@/lib/campaigns/plan";
import { reviewFindings, reviewStatus, type Finding, type ReviewFacts, type ReviewStatus } from "@/lib/campaigns/review-rules";

export type CampaignReview = {
  status: ReviewStatus;
  findings: Finding[];
  checkedAt: string;
};

/** Gathers what the account can actually tell us, then applies the rules. */
export async function reviewCampaign(organizationId: string, plan: CampaignPlan): Promise<CampaignReview> {
  const usesMeta = plan.service !== "tiktok";
  const url = plan.destinationType === "WEBSITE" ? normalizeUrl(plan.destinationValue) : null;

  const [connections, metaAccount, pixel, creative, billing, landing] = await Promise.all([
    connectionSummaries(organizationId),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { pageId: true } }),
    db.trackingPixel.findUnique({
      where: { organizationId_platform: { organizationId, platform: "META" } },
      select: { status: true },
    }),
    db.creativeRequest.count({
      where: { organizationId, status: { in: ["APPROVED", "DELIVERED"] }, images: { some: { isFinal: true } } },
    }),
    usesMeta ? fetchMetaBillingStatus(organizationId) : Promise.resolve(null),
    url ? probeLandingPage(url) : Promise.resolve(null),
  ]);

  const facts: ReviewFacts = {
    metaConnected: Boolean(connections.get("META")?.connected),
    pageChosen: Boolean(metaAccount?.pageId),
    tiktokConnected: Boolean(connections.get("TIKTOK")?.connected),
    funding: billing?.state ?? "unknown",
    currency: billing?.currency ?? null,
    metaPixelActive: pixel ? canOptimizeTowards(pixel.status) : false,
    hasApprovedCreative: creative > 0,
    landing,
  };

  const findings = reviewFindings(plan, facts);
  return { status: reviewStatus(findings), findings, checkedAt: new Date().toISOString() };
}
