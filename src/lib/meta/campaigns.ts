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

export function metaObjectiveFor(goal: AdGoal): string {
  return OBJECTIVE_MAP[goal];
}

export type CreateMetaCampaignInput = {
  adAccountId: string; // "act_123..."
  accessToken: string;
  name: string;
  goal: AdGoal;
  dailyBudgetCents: number;
  status?: "PAUSED" | "ACTIVE";
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
      objective: metaObjectiveFor(input.goal),
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
