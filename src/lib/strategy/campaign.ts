import { db } from "@/lib/db";
import type { AdDestination, MetaPlacement } from "@/generated/prisma/enums";
import { newPlan, type CampaignPlan } from "@/lib/campaigns/plan";
import { supportsDestination } from "@/lib/campaigns/objectives";
import { approvedPlanOf } from "./store";
import { campaignTypeInfo, type StrategyContent } from "./plan-logic";

// The approved plan as the first campaign's starting point.
//
// It becomes a Create draft — the same one a business would fill in by hand —
// so every safeguard of the Create flow still applies: the audience search,
// the final creatives, the Pre-Launch Ad Score, the budget confirmation. The
// draft is prefilled; nothing is built or spent from here.

export function campaignPlanFromStrategy(
  plan: StrategyContent,
  org: { name: string; website: string | null; phone: string | null; defaultMessageChannel: CampaignPlan["messageChannel"] },
  extra: { differentiator: string | null },
): CampaignPlan {
  const base = newPlan({
    service: "meta",
    businessName: org.name,
    website: org.website,
    offering: [plan.product, plan.offer ? `Offer: ${plan.offer}` : ""].filter(Boolean).join(". "),
    targetAudience: [plan.audience.summary, plan.audience.interests.length ? `Interests: ${plan.audience.interests.join(", ")}` : ""].filter(Boolean).join(" "),
    differentiator: extra.differentiator,
    messageChannel: org.defaultMessageChannel,
    timeZone: "",
    metaPercent: 100,
  });

  const type = campaignTypeInfo(plan.campaignType);
  const destination = type.destination as AdDestination;
  const fits = supportsDestination(plan.goal, destination);
  const destinationValue = !fits ? "" : destination === "WEBSITE" ? (org.website ?? "") : destination === "PHONE_CALL" ? (org.phone ?? "") : "";

  const placements: MetaPlacement[] =
    plan.platforms.length === 2 ? [] : plan.platforms[0] === "FACEBOOK" ? ["FACEBOOK_FEED"] : ["INSTAGRAM_FEED"];

  return {
    ...base,
    promotes: plan.offer ? "OFFER" : plan.goal === "SALES" ? "PRODUCT" : plan.goal === "LEADS" ? "SERVICE" : "BUSINESS",
    promotesDetail: plan.product,
    goal: plan.goal,
    destinationType: fits ? destination : null,
    destinationValue,
    // Their own choices, so the Audience step asks them to confirm the place.
    audienceMode: "manual",
    geoLabel: null,
    geoKey: null,
    ageMin: plan.audience.ageMin,
    ageMax: plan.audience.ageMax,
    choosingPlacements: placements.length > 0,
    placements,
    budgetType: "DAILY",
    dailyAmount: plan.dailyBudget,
  };
}

/** The draft for the approved plan, made once and reused. Null when there's no approved plan. */
export async function draftFromApprovedPlan(organizationId: string, userId: string | null): Promise<string | null> {
  const row = await db.strategyPlan.findUnique({ where: { organizationId } });
  const plan = row ? approvedPlanOf(row) : null;
  if (!row || !plan) return null;

  if (row.campaignDraftId) {
    const existing = await db.campaignDraft.findFirst({ where: { id: row.campaignDraftId, organizationId }, select: { id: true } });
    if (existing) return existing.id;
  }

  const [org, intake] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, website: true, phone: true, defaultMessageChannel: true } }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { differentiator: true } }),
  ]);
  if (!org) return null;
  const data = campaignPlanFromStrategy(plan, org, { differentiator: intake?.differentiator ?? null });
  const draft = await db.campaignDraft.create({
    data: {
      organizationId,
      createdByUserId: userId,
      service: "meta",
      // Their business details came from the plan; start at the goal so
      // they see what's prefilled, step by step.
      step: "business",
      label: `Your approved plan — ${plan.product || org.name}`.slice(0, 120),
      data: JSON.parse(JSON.stringify(data)),
    },
    select: { id: true },
  });
  // Two presses of "Build My Campaign" at once both get here. Only the one
  // that finds the plan still pointing where it read it wins; the other
  // removes its own draft and uses the winner's, so one plan never has two.
  const linked = await db.strategyPlan.updateMany({ where: { id: row.id, campaignDraftId: row.campaignDraftId }, data: { campaignDraftId: draft.id } });
  if (linked.count === 0) {
    await db.campaignDraft.deleteMany({ where: { id: draft.id, organizationId } });
    const winner = await db.strategyPlan.findUnique({ where: { id: row.id }, select: { campaignDraftId: true } });
    return winner?.campaignDraftId ?? null;
  }
  return draft.id;
}

/** Called when a Create draft becomes a campaign: links it back to the plan it came from. */
export async function linkBuiltCampaign(organizationId: string, draftId: string, campaignId: string): Promise<void> {
  await db.strategyPlan.updateMany({ where: { organizationId, campaignDraftId: draftId }, data: { campaignId } });
}
