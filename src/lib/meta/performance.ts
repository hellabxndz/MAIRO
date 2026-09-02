import { getCampaignInsights, type MetaInsights } from "@/lib/meta/campaigns";

// Reads how the campaigns MAIRO created are actually doing.
//
// This is the reporting half of the product: MAIRO builds the campaigns so the
// business owner doesn't have to open Ads Manager, and this is what means they
// never have to open it afterwards either.
//
// Two rules shape the whole module.
//
// First, it must never take the page down. These are live calls to someone
// else's API using a token that can expire, be revoked from Meta's side, or
// simply time out. A dashboard that white-screens because Meta was slow is
// worse than one that says it couldn't reach Meta, so every failure is caught
// and returned as a value.
//
// Second, no data is not the same as zero. A campaign that has never been
// switched on has no impressions because nothing has run — reporting that as
// "0 impressions, 0% CTR" reads as failure when the truthful answer is "this
// hasn't started". The two states are kept distinct all the way to the screen.

export type CampaignRow = {
  /** MAIRO's own campaign id. */
  id: string;
  metaCampaignId: string;
  insights: MetaInsights | null;
  /** Set when this specific campaign's figures couldn't be read. */
  error: string | null;
};

export type PerformanceTotals = {
  impressions: number;
  clicks: number;
  spend: number;
  /** Recomputed from the totals, never averaged from per-campaign rates. */
  ctr: number | null;
  cpc: number | null;
  /** True when at least one campaign returned figures. */
  hasData: boolean;
};

export type PerformanceReport = {
  rows: CampaignRow[];
  totals: PerformanceTotals;
  /** Set when nothing could be read at all — no token, or every call failed. */
  unavailable: string | null;
};

const EMPTY_TOTALS: PerformanceTotals = {
  impressions: 0,
  clicks: 0,
  spend: 0,
  ctr: null,
  cpc: null,
  hasData: false,
};

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fetches insights for every campaign that made it onto Meta.
 *
 * Campaigns are read in parallel — the plan limits cap this at ten, and doing
 * them in series would put a visible pause on the dashboard for no benefit.
 */
export async function fetchPerformance(input: {
  accessToken: string | null;
  campaigns: { id: string; metaCampaignId: string | null }[];
}): Promise<PerformanceReport> {
  if (!input.accessToken) {
    return { rows: [], totals: EMPTY_TOTALS, unavailable: "No Meta account is connected." };
  }

  // A campaign with no metaCampaignId never reached Meta — it was saved as a
  // draft after a failed push. There is nothing to ask Meta about.
  const live = input.campaigns.filter(
    (c): c is { id: string; metaCampaignId: string } => Boolean(c.metaCampaignId)
  );
  if (live.length === 0) {
    return { rows: [], totals: EMPTY_TOTALS, unavailable: null };
  }

  const token = input.accessToken;
  const rows = await Promise.all(
    live.map(async (campaign): Promise<CampaignRow> => {
      try {
        const insights = await getCampaignInsights(campaign.metaCampaignId, token);
        return { id: campaign.id, metaCampaignId: campaign.metaCampaignId, insights, error: null };
      } catch (error) {
        console.error(`Insights failed for campaign ${campaign.metaCampaignId}:`, error);
        return {
          id: campaign.id,
          metaCampaignId: campaign.metaCampaignId,
          insights: null,
          error: friendlyInsightsError(error),
        };
      }
    })
  );

  // Every single call failing is a different problem from a quiet month, and
  // usually means the token has gone stale. Say so once rather than putting the
  // same error on every row.
  const allFailed = rows.length > 0 && rows.every((r) => r.error);
  if (allFailed) {
    return { rows, totals: EMPTY_TOTALS, unavailable: rows[0].error };
  }

  const impressions = rows.reduce((n, r) => n + toNumber(r.insights?.impressions), 0);
  const clicks = rows.reduce((n, r) => n + toNumber(r.insights?.clicks), 0);
  const spend = rows.reduce((n, r) => n + toNumber(r.insights?.spend), 0);

  return {
    rows,
    totals: {
      impressions,
      clicks,
      spend,
      // Derived from the totals so a tiny campaign with a freak CTR can't drag
      // the headline number around.
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      cpc: clicks > 0 ? spend / clicks : null,
      hasData: impressions > 0 || clicks > 0 || spend > 0,
    },
    unavailable: null,
  };
}

function friendlyInsightsError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (/expired|session|OAuthException|190/i.test(raw)) {
    return "Meta needs you to reconnect your ad account — the connection has expired.";
  }
  if (/rate limit|too many|17|4$/i.test(raw)) {
    return "Meta is rate limiting us. These numbers will fill in shortly.";
  }
  if (/permission|OAuthException|200/i.test(raw)) {
    return "We don't have permission to read results for this campaign.";
  }
  return "Couldn't read results from Meta just now.";
}
