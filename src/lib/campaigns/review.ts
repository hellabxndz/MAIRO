import { db } from "@/lib/db";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { fetchMetaBillingStatus } from "@/lib/meta/billing";
import { canOptimizeTowards } from "@/lib/tracking/pixels";
import { normalizeUrl } from "@/lib/campaigns/destination";
import { probeLandingPage } from "@/lib/campaigns/landing-probe";
import type { CampaignPlan } from "@/lib/campaigns/plan";
import { reviewFindings, reviewStatus, type Finding, type ReviewFacts, type ReviewStatus } from "@/lib/campaigns/review-rules";
import { hasOwnWords, runningCopy } from "@/lib/campaigns/plan";
import { ctaLabel } from "@/lib/campaigns/ad-copy";
import { reviewCreative } from "@/lib/ai/review";

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
  const safety = await copySafety(plan);
  if (safety) findings.push(safety);
  return { status: reviewStatus(findings), findings, checkedAt: new Date().toISOString() };
}

/**
 * The same AI safety review the words get at launch, run early so a problem
 * shows here with a way to fix it rather than as a refusal on the last screen.
 */
async function copySafety(plan: CampaignPlan): Promise<Finding | null> {
  if (!hasOwnWords(plan)) return null;
  const words = runningCopy(plan).filter((w) => w.primaryText.trim());
  if (words.length === 0) return null;
  try {
    const review = await reviewCreative({
      type: "COPY",
      brief: "Ad copy chosen and edited by the business in MAIRO's campaign builder.",
      businessName: plan.businessName,
      concept: words
        .map((w, i) => `Version ${i + 1}\n**Headline:** ${w.headline}\n**Primary text:** ${w.primaryText}\n**Call to action:** ${ctaLabel(w.cta)}`)
        .join("\n\n"),
    });
    if (review.verdict !== "BLOCK") return null;
    return {
      id: "copy-safety",
      severity: "blocking",
      area: "Advertisement",
      title: "The ad's words won't pass Meta's rules",
      detail: review.reason || "Something in the text would likely be rejected. Change it and check again.",
      fix: "ad",
    };
  } catch (error) {
    console.error("Copy safety review failed during campaign review:", error);
    return {
      id: "copy-safety-unavailable",
      severity: "recommendation",
      area: "Advertisement",
      title: "The ad's words couldn't be safety-checked just now",
      detail: "MAIRO checks them again when you launch, and nothing runs unchecked.",
      fix: null,
    };
  }
}
