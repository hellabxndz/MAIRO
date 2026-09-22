import { metaGraphRequest } from "@/lib/meta/client";
import type { AdGoal, SpecialAdCategory } from "@/generated/prisma/enums";

// Maps MAIRO's simplified client-facing goal to a Meta campaign objective.
// https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/#odax
const OBJECTIVE_MAP: Record<AdGoal, string> = {
  LEADS: "OUTCOME_LEADS",
  SALES: "OUTCOME_SALES",
  AWARENESS: "OUTCOME_AWARENESS",
  TRAFFIC: "OUTCOME_TRAFFIC",
  APP_PROMOTION: "OUTCOME_APP_PROMOTION",
  ENGAGEMENT: "OUTCOME_ENGAGEMENT",
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
export function metaObjectiveFor(
  goal: AdGoal,
  hasConversionTracking = true,
  usesInstantForm = false
): string {
  // An instant form collects the lead inside the ad. That is OUTCOME_LEADS
  // whatever the customer picked from MAIRO's own list and whether or not a
  // pixel exists — there is nothing offsite to track, so the degrade below
  // does not apply and would break the ad set if it did.
  if (usesInstantForm) return OBJECTIVE_MAP.LEADS;

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
  /** Whether the ad carries Meta's own instant form. */
  usesInstantForm?: boolean;
  /** A total for the whole run instead of a daily amount. Needs an end date on the ad set. */
  lifetimeBudgetCents?: number | null;
  specialAdCategory?: SpecialAdCategory | null;
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
/**
 * The exact fields a campaign is created with.
 *
 * Split out from the request so a check can read it without a network call.
 * Two of these fields have each cost a customer a campaign that could never be
 * built, and both failures were invisible until Meta refused the ad set
 * underneath — so they are worth asserting on rather than trusting.
 */
export function metaCampaignBody(input: {
  name: string;
  goal: AdGoal;
  dailyBudgetCents: number;
  status?: "PAUSED" | "ACTIVE";
  hasConversionTracking?: boolean;
  usesInstantForm?: boolean;
  lifetimeBudgetCents?: number | null;
  specialAdCategory?: SpecialAdCategory | null;
}): Record<string, unknown> {
  return {
    name: input.name,
    objective: metaObjectiveFor(
      input.goal,
      input.hasConversionTracking ?? true,
      input.usesInstantForm ?? false
    ),
    status: input.status ?? "PAUSED",
    // Declared, never inferred: an ad in a special category that isn't
    // declared is rejected, and so is one declared without its country.
    special_ad_categories: input.specialAdCategory ? [input.specialAdCategory] : [],
    ...(input.specialAdCategory ? { special_ad_category_country: ["US"] } : {}),
    ...(input.lifetimeBudgetCents
      ? { lifetime_budget: input.lifetimeBudgetCents }
      : { daily_budget: input.dailyBudgetCents }),
    // Stated rather than inherited, and that is the whole point of the line.
    //
    // Left unset, Meta falls back to whatever bid strategy the ad account
    // happens to default to. Plenty of accounts default to a capped one —
    // LOWEST_COST_WITH_BID_CAP or COST_CAP — and those require a bid_amount
    // that MAIRO has no way to choose on the customer's behalf. The ad set is
    // then refused with "Bid Amount Required For The Bid Strategy Provided"
    // (subcode 1815857), which is a property of the account rather than of
    // anything the customer did: the same campaign built fine for one person
    // and never for another.
    //
    // LOWEST_COST_WITHOUT_CAP is Meta's "highest volume": spend the budget, get
    // the most results it can, no cap to name. It is the only strategy that is
    // correct without asking a small business owner to pick a bid, which is
    // exactly the question this product exists not to ask.
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
  };
}

// Creates a campaign on Meta. Ad sets, creatives, and ads are a separate step
// (they need audience targeting and creative assets), so campaigns are created
// PAUSED by default until the rest of the structure is built.
export async function createMetaCampaign(
  input: CreateMetaCampaignInput
): Promise<MetaCampaign> {
  return metaGraphRequest<MetaCampaign>(`/${input.adAccountId}/campaigns`, {
    method: "POST",
    accessToken: input.accessToken,
    body: metaCampaignBody(input),
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
