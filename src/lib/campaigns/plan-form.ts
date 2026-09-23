import type { AdGoal } from "@/generated/prisma/enums";
import { AGE_CEILING, AGE_FLOOR } from "@/lib/campaigns/audience";
import { hasOwnWords, plannedSpend, runningCopy, type CampaignPlan } from "@/lib/campaigns/plan";

/** The campaign's own ads, as createCampaignAction's `ads` field. Null follows the approved creative. */
export function planAds(plan: CampaignPlan): object[] | null {
  if (plan.adChoice === "EXISTING_AD" && plan.existingAd) {
    return [{ kind: "EXISTING_AD", sourceAdId: plan.existingAd.id, sourceAdName: plan.existingAd.name }];
  }
  if (!hasOwnWords(plan)) return null;
  const visual =
    plan.adChoice === "video" && plan.video
      ? { kind: "VIDEO", videoUrl: plan.video.url, videoPosterUrl: plan.video.posterUrl }
      : plan.adChoice === "attached" && plan.studioAssetId
        ? { kind: "IMAGE", studioAssetId: plan.studioAssetId }
        : null;
  const words = runningCopy(plan);
  if (!visual || words.length === 0) return null;
  return words.map((w) => ({ ...visual, headline: w.headline, primaryText: w.primaryText, cta: w.cta }));
}

// The wizard's plan as the form createCampaignAction already accepts, so the
// Create wizard and the advanced campaign form share one launch path — its
// entitlements, plan limits and validation — rather than growing a second.

const GOAL_WORD: Record<AdGoal, string> = {
  SALES: "Sales",
  LEADS: "Enquiries",
  TRAFFIC: "Visitors",
  AWARENESS: "Awareness",
  ENGAGEMENT: "Engagement",
  APP_PROMOTION: "App installs",
};

/** A name someone will recognise in a list, without asking them for one. */
export function campaignName(plan: CampaignPlan, now: Date = new Date()): string {
  const month = now.toLocaleDateString("en-US", { month: "long" });
  const what = plan.promotesDetail.trim() || plan.businessName.trim() || "Campaign";
  return `${what} — ${plan.goal ? GOAL_WORD[plan.goal] : "Campaign"}, ${month}`.slice(0, 120);
}

export function planFormEntries(
  plan: CampaignPlan,
  opts: { draftId: string | null; name?: string; now?: Date }
): [string, string][] {
  const out: [string, string][] = [];
  const put = (key: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    out.push([key, String(value)]);
  };

  const spend = plannedSpend(plan, opts.now);
  put("name", opts.name?.trim() || campaignName(plan, opts.now));
  put("objective", plan.goal);
  // The daily figure every screen shows; for a total budget, its average day.
  put("dailyBudget", Math.max(1, spend.perDayCents / 100).toFixed(2));
  put("budgetType", plan.budgetType);
  if (plan.budgetType === "LIFETIME") put("lifetimeBudget", plan.lifetimeAmount.toFixed(2));

  if (plan.service === "meta") put("platforms", "META");
  if (plan.service === "tiktok") put("platforms", "TIKTOK");
  if (plan.service === "multi") {
    put("platforms", "META");
    put("platforms", "TIKTOK");
    put("percents", plan.metaPercent);
    put("percents", 100 - plan.metaPercent);
  }

  put("destinationType", plan.destinationType);
  if (plan.destinationType === "WEBSITE" || plan.destinationType === "PHONE_CALL" || plan.destinationType === "APP") {
    put("destinationValue", plan.destinationValue.trim());
  }
  put("messageChannel", plan.messageChannel);
  put("formAuthor", "MAIRO");
  if (plan.destinationType === "APP") put("metaAppId", plan.metaAppId.trim());

  // Letting MAIRO find customers keeps only the place, and lets Meta widen
  // from there. Choosing yourself sends every answer and keeps to them.
  const ai = plan.audienceMode === "ai";
  if (plan.geoKey) {
    put("geoKey", plan.geoKey);
    put("geoLabel", plan.geoLabel);
    put("geoRadius", plan.geoRadius);
  }
  put("ageMin", ai ? AGE_FLOOR : plan.ageMin);
  put("ageMax", ai ? AGE_CEILING : plan.ageMax);
  put("genders", ai ? 0 : plan.genders);
  if (ai && !plan.specialAdCategory) put("advantageAudience", "on");
  put("specialAdCategory", plan.specialAdCategory);

  if (plan.choosingPlacements) for (const p of plan.placements) put("placements", p);

  put("startTimeZone", plan.timeZone);
  if (plan.startOnDate) put("startLocal", plan.startLocal);
  if (plan.endOnDate) put("endLocal", plan.endLocal);

  if (plan.adChoice === "FACEBOOK_POST" || plan.adChoice === "INSTAGRAM_POST") {
    put("adSource", plan.adChoice);
    if (plan.adChoice === "FACEBOOK_POST") put("boostPostId", plan.selectedPost?.id);
    if (plan.adChoice === "INSTAGRAM_POST") put("boostInstagramMediaId", plan.selectedPost?.id);
  } else if (plan.adChoice !== "none") {
    put("adSource", "CREATIVE");
    const ads = planAds(plan);
    if (ads) put("ads", JSON.stringify(ads));
  }

  put("promotes", plan.promotes);
  put("offering", plan.offering.trim());
  put("differentiator", plan.differentiator.trim());
  put("targetAudience", plan.targetAudience.trim());
  put("draftId", opts.draftId);
  return out;
}
