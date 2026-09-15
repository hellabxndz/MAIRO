import { metaGraphRequest } from "@/lib/meta/client";
import type { AdGoal } from "@/generated/prisma/enums";

// Maps MAIRO's simplified client-facing goal to a Meta campaign objective.
// https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/#odax
const OBJECTIVE_MAP: Record<AdGoal, string> = {
  LEADS: "OUTCOME_LEADS",
  SALES: "OUTCOME_SALES",
  AWARENESS: "OUTCOME_AWARENESS",
  TRAFFIC: "OUTCOME_TRAFFIC",
  APP_PROMOTION: "OUTCOME_APP_PROMOTION",
};

/**
 * The objective to create the campaign with.
 *
 * `hasConversionTracking` is not a refinement, it is the difference between a
 * campaign that builds and one that does not. A sales or leads objective is a
 * promise to optimize towards a conversion, and Meta holds the ad set to it:
 * the ad set has to carry a promoted_object naming the pixel and the event.
 *
 * Without a pixel there is no promoted_object to send, and metaOptimizationGoal
 * has always known that — it quietly falls back to LINK_CLICKS. The objective
 * did not, so the campaign said "sales" while the ad set beneath it said
 * "clicks" and carried no pixel. Meta rejects that pair, and the word it uses
 * is "Invalid parameter", which names neither field. The campaign was created,
 * the ad set was refused, and the customer was left with something that could
 * never show an ad and no way to find out why.
 *
 * So the objective degrades in step with the goal beneath it. A traffic
 * campaign that runs is worth more than a sales campaign that cannot be built,
 * and the moment tracking exists the next campaign asks for sales properly.
 */
export function metaObjectiveFor(goal: AdGoal, hasConversionTracking = true): string {
  if (!hasConversionTracking && (goal === "SALES" || goal === "LEADS")) {
    return OBJECTIVE_MAP.TRAFFIC;
  }
  return OBJECTIVE_MAP[goal];
}

export type CreateMetaCampaignInput = {
  adAccountId: string; // "act_123..."
  accessToken: string;
  name: string;
  goal: AdGoal;
  dailyBudgetCents: number;
  status?: "PAUSED" | "ACTIVE";
  /** Whether a pixel exists to optimize towards. See metaObjectiveFor. */
  hasConversionTracking?: boolean;
};

export type MetaCampaign = {
  id: string;
  name: string;
  objective: string;
  status: string;
};

// Creates a campaign on Meta. Ad sets, creatives, and ads are a separate step
// (they need audience targeting and creative assets), so campaigns are created
// PAUSED by default until the rest of the structure is built.
export async function createMetaCampaign(
  input: CreateMetaCampaignInput
): Promise<MetaCampaign> {
  return metaGraphRequest<MetaCampaign>(`/${input.adAccountId}/campaigns`, {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      name: input.name,
      objective: metaObjectiveFor(input.goal, input.hasConversionTracking ?? true),
      status: input.status ?? "PAUSED",
      special_ad_categories: [],
      daily_budget: input.dailyBudgetCents,
    },
  });
}

export async function listMetaCampaigns(
  adAccountId: string,
  accessToken: string
): Promise<MetaCampaign[]> {
  const res = await metaGraphRequest<{ data: MetaCampaign[] }>(
    `/${adAccountId}/campaigns`,
    {
      accessToken,
      params: { fields: "id,name,objective,status" },
    }
  );
  return res.data;
}

export type MetaInsights = {
  impressions?: string;
  clicks?: string;
  spend?: string;
  cpc?: string;
  ctr?: string;
  date_start?: string;
  date_stop?: string;
};

export async function getCampaignInsights(
  campaignId: string,
  accessToken: string
): Promise<MetaInsights | null> {
  const res = await metaGraphRequest<{ data: MetaInsights[] }>(
    `/${campaignId}/insights`,
    {
      accessToken,
      params: { fields: "impressions,clicks,spend,cpc,ctr,date_start,date_stop" },
    }
  );
  return res.data[0] ?? null;
}
