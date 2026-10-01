import { db } from "@/lib/db";
import type { AdGoal } from "@/generated/prisma/enums";
import { missionGoal, type MarketingObjective } from "@/lib/mission/goals";
import type { MissionPlan } from "@/lib/mission/planner";
import type { CreativeBrief } from "./core";

// The brief every creative carries: the goal it serves, its marketing
// objective, who it's for, its hook, message, CTA, format, and why MAIRO
// made it. Stored as briefJson on creative requests, campaign ads and social
// posts, so results can later be read against what each piece was meant to do.

export const FROM_AD_GOAL: Record<AdGoal, MarketingObjective> = {
  SALES: "Conversion",
  LEADS: "Lead generation",
  TRAFFIC: "Consideration",
  AWARENESS: "Awareness",
  ENGAGEMENT: "Awareness",
  APP_PROMOTION: "Conversion",
};

const AD_GOAL_LABEL: Record<AdGoal, string> = {
  SALES: "Sales",
  LEADS: "Leads",
  TRAFFIC: "Website traffic",
  AWARENESS: "Awareness",
  ENGAGEMENT: "Engagement",
  APP_PROMOTION: "App installs",
};

type Concept = MissionPlan["adConcepts"][number];

/** A brief from the mission plan (itself built from the Strategy Engine). */
export function planBrief(plan: MissionPlan, concept: Concept | null, extra: { hook?: string | null; message?: string | null; cta?: string | null; format?: string | null; reason?: string | null } = {}): CreativeBrief {
  const c = concept ?? plan.adConcepts[0] ?? null;
  return {
    goal: missionGoal(plan.goal).label,
    objective: (c?.objective as MarketingObjective | undefined) ?? "Consideration",
    audience: (plan.engine?.audienceDirection ?? plan.tactics.audience).slice(0, 300),
    hook: (extra.hook ?? c?.headline ?? plan.engine?.messaging[0] ?? "").slice(0, 160),
    message: (extra.message ?? c?.primaryText ?? plan.tactics.messaging).slice(0, 400),
    cta: (extra.cta ?? c?.cta ?? plan.tactics.cta).slice(0, 60),
    format: (extra.format ?? c?.format ?? "image").toLowerCase(),
    reason: (extra.reason ?? c?.why ?? plan.why).slice(0, 300),
  };
}

export function readBrief(json: string | null | undefined): CreativeBrief | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as CreativeBrief;
  } catch {
    return null;
  }
}

/** A new version of an ad keeps its brief, with the new words and why it exists. */
export function variationBrief(basedOn: string | null, fresh: { headline: string; primaryText: string; cta: string | null }, label: string): string | null {
  const b = readBrief(basedOn);
  if (!b) return null;
  return JSON.stringify({ ...b, hook: fresh.headline.slice(0, 160), message: fresh.primaryText.slice(0, 400), cta: fresh.cta ?? b.cta, reason: `A new version of ${label}, testing fresh words toward the same goal.` } satisfies CreativeBrief);
}

/**
 * Writes the brief for each ad of a campaign that just launched: from the
 * active mission when there is one, from the campaign's own goal otherwise.
 * Ads that already carry a brief keep it.
 */
export async function briefCampaignAds(organizationId: string, mairoCampaignId: string): Promise<void> {
  const [campaign, mission] = await Promise.all([
    db.mairoCampaign.findFirst({
      where: { id: mairoCampaignId, organizationId },
      select: { objective: true, marketingObjective: true, geoLabel: true, ageMin: true, ageMax: true, ads: { where: { briefJson: null } } },
    }),
    db.marketingMission.findFirst({ where: { organizationId, status: "ACTIVE" }, select: { id: true, planJson: true } }),
  ]);
  if (!campaign || campaign.ads.length === 0) return;
  let plan: MissionPlan | null = null;
  try {
    plan = mission ? (JSON.parse(mission.planJson) as MissionPlan) : null;
  } catch {
    plan = null;
  }
  const audience = [campaign.geoLabel ? `People around ${campaign.geoLabel}` : "People", `aged ${campaign.ageMin}–${campaign.ageMax}`].filter(Boolean).join(" ");
  for (const ad of campaign.ads) {
    const format = ad.kind === "VIDEO" ? "video" : ad.kind === "IMAGE" ? "image" : "existing ad";
    const concept = plan?.adConcepts.find((c) => c.objective === campaign.marketingObjective) ?? null;
    const brief: CreativeBrief = plan
      ? { ...planBrief(plan, concept, { hook: ad.headline, message: ad.primaryText, cta: ad.callToAction, format }), audience: (audience || plan.tactics.audience).slice(0, 300) }
      : {
          goal: AD_GOAL_LABEL[campaign.objective],
          objective: (campaign.marketingObjective as MarketingObjective | null) ?? FROM_AD_GOAL[campaign.objective],
          audience: audience.slice(0, 300),
          hook: (ad.headline ?? "").slice(0, 160),
          message: (ad.primaryText ?? "").slice(0, 400),
          cta: ad.callToAction ?? "",
          format,
          reason: `Made for this campaign's goal: ${AD_GOAL_LABEL[campaign.objective].toLowerCase()}.`,
        };
    await db.campaignAd.update({ where: { id: ad.id }, data: { briefJson: JSON.stringify(brief) } });
  }
}
