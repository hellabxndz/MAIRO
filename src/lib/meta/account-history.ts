import { db } from "@/lib/db";
import { loadMetaConnection } from "@/lib/meta/connection";
import { metaGraphPaginate, metaGraphRequest, RESULTS_TTL } from "@/lib/meta/client";
import { normalizeInsights } from "@/lib/ad-platforms/meta/adapter";
import { goalFromObjective, sortCampaigns, stateOf, type AccountCampaign } from "./account-history-rules";

// Reads the campaigns on the connected Meta ad account that MAIRO didn't
// make — see account-history-rules.ts for why they're read-only.
//
// Two Graph calls, side by side: the account's campaigns, and one
// account-level insights call broken down by campaign for their lifetime
// figures. Both go through the short read cache, so the Campaigns page and
// the Business Brain asking in the same minute cost Meta one pair, not two.
// Only ads_management is needed — it covers reading the accounts it manages.

export type AccountHistory =
  | { ok: true; adAccountId: string; campaigns: AccountCampaign[] }
  | { ok: false; reason: "not_connected" | "unreadable"; message: string };

type CampaignRow = { id: string; name?: string; objective?: string; effective_status?: string; start_time?: string; stop_time?: string };
type InsightRow = Parameters<typeof normalizeInsights>[0] & { campaign_id?: string };

const FIELDS = "campaign_id,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas";
const date = (s: string | undefined) => (s ? new Date(s) : null);

export async function loadAccountHistory(organizationId: string, now = new Date()): Promise<AccountHistory> {
  const [connection, mine] = await Promise.all([
    loadMetaConnection(organizationId),
    // Everything MAIRO built on Meta, archived or not, so none of it is
    // listed twice — once as MAIRO's and again as "from your account".
    db.platformCampaign.findMany({
      where: { platform: "META", externalCampaignId: { not: null }, mairoCampaign: { organizationId } },
      select: { externalCampaignId: true },
    }),
  ]);
  if (!connection || connection.status !== "CONNECTED") {
    return { ok: false, reason: "not_connected", message: "Connect your Meta ad account to see the campaigns already on it." };
  }
  const account = connection.metaAdAccountId;
  const ours = new Set(mine.map((m) => m.externalCampaignId!));

  try {
    const [rows, insights] = await Promise.all([
      metaGraphPaginate<CampaignRow>(`/${account}/campaigns`, {
        accessToken: connection.accessToken,
        cacheFor: RESULTS_TTL,
        maxPages: 3,
        params: { fields: "id,name,objective,effective_status,start_time,stop_time", limit: 100 },
      }),
      metaGraphRequest<{ data: InsightRow[] }>(`/${account}/insights`, {
        accessToken: connection.accessToken,
        cacheFor: RESULTS_TTL,
        params: { level: "campaign", fields: FIELDS, date_preset: "maximum", limit: 500 },
      }),
    ]);
    const byId = new Map((insights.data ?? []).filter((r) => r.campaign_id).map((r) => [r.campaign_id!, r]));
    const campaigns: AccountCampaign[] = rows
      .filter((r) => r.id && !ours.has(r.id))
      .map((r) => {
        const stop = date(r.stop_time);
        const row = byId.get(r.id);
        return {
          id: r.id,
          name: r.name?.trim() || "Untitled campaign",
          goal: goalFromObjective(r.objective),
          state: stateOf(r.effective_status, stop, now),
          startedAt: date(r.start_time),
          endedAt: stop,
          metrics: row ? normalizeInsights(row) : null,
        };
      });
    return { ok: true, adAccountId: account, campaigns: sortCampaigns(campaigns) };
  } catch (error) {
    console.error("Reading the Meta account's campaigns failed:", error);
    return { ok: false, reason: "unreadable", message: "Meta didn't answer just now, so the campaigns already on your account can't be shown. Try again in a minute." };
  }
}
