import { db } from "@/lib/db";
import { loadMetaConnection } from "@/lib/meta/connection";
import { metaGraphPaginate, metaGraphRequest, RESULTS_TTL } from "@/lib/meta/client";
import { normalizeInsights } from "@/lib/ad-platforms/meta/adapter";
import { goalFromObjective, stateOf } from "@/lib/meta/account-history-rules";
import { loadPixelSetup } from "@/lib/tracking/pixel-setup";
import { analyzeAccount, WINDOWS, type Analysis, type AnalyzerCampaign, type WindowKey } from "./analyze";

// Reads what the Analyzer needs from the business's own connected Meta ad
// account — read-only, scoped to this organization, through the short Graph
// cache — and reports each step as it really finishes, so the progress the
// owner watches is the work being done, not an animation.
//
// Graph calls: the campaign list (paged), then one account-level insights
// call per period, broken down by campaign. ads_read / ads_management covers
// them; nothing is created, changed or spent.

export type Step = "connect" | "campaigns" | "performance" | "opportunities" | "strategy";
export const STEPS: { key: Step; label: string }[] = [
  { key: "connect", label: "Connecting to your advertising account" },
  { key: "campaigns", label: "Reviewing your previous campaigns" },
  { key: "performance", label: "Analyzing your advertising performance" },
  { key: "opportunities", label: "Identifying growth opportunities" },
  { key: "strategy", label: "Preparing your personalized strategy" },
];
export type Progress = { step: Step; state: "working" | "done"; detail?: string };
export type AnalyzerResult = { ok: true; analysis: Analysis; adAccountId: string } | { ok: false; reason: "not_connected" | "unreadable"; message: string };

type CampaignRow = { id: string; name?: string; objective?: string; effective_status?: string; stop_time?: string };
type InsightRow = Parameters<typeof normalizeInsights>[0] & { campaign_id?: string };
const FIELDS = "campaign_id,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas";
const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** The since/until Meta is asked for, per period; "the 30 days before" ends where the last 30 begin. */
export function rangeOf(key: WindowKey, now: Date): { since: string; until: string } {
  const until = new Date(now.getTime() - DAY);
  if (key === "prev30") return { since: ymd(new Date(now.getTime() - 60 * DAY)), until: ymd(new Date(now.getTime() - 31 * DAY)) };
  const days = WINDOWS.find((w) => w.key === key)!.days;
  return { since: ymd(new Date(now.getTime() - days * DAY)), until: ymd(until) };
}

export async function runAnalyzer(organizationId: string, onProgress: (p: Progress) => void = () => {}, now = new Date()): Promise<AnalyzerResult> {
  onProgress({ step: "connect", state: "working" });
  const [connection, managedRows, setup] = await Promise.all([
    loadMetaConnection(organizationId),
    db.platformCampaign.findMany({ where: { platform: "META", externalCampaignId: { not: null }, mairoCampaign: { organizationId } }, select: { externalCampaignId: true } }),
    loadPixelSetup(organizationId).catch(() => null),
  ]);
  if (!connection || connection.status !== "CONNECTED") {
    return { ok: false, reason: "not_connected", message: "Connect your Meta ad account and MAIRO analyzes it straight away." };
  }
  const account = connection.metaAdAccountId;
  onProgress({ step: "connect", state: "done", detail: `Ad account ${account}` });

  try {
    onProgress({ step: "campaigns", state: "working" });
    const rows = await metaGraphPaginate<CampaignRow>(`/${account}/campaigns`, {
      accessToken: connection.accessToken,
      cacheFor: RESULTS_TTL,
      maxPages: 5,
      params: { fields: "id,name,objective,effective_status,stop_time", limit: 100 },
    });
    onProgress({ step: "campaigns", state: "done", detail: `${rows.length} campaign${rows.length === 1 ? "" : "s"} on the account` });

    onProgress({ step: "performance", state: "working" });
    const periods = await Promise.all(
      WINDOWS.map(async (w) => {
        const res = await metaGraphRequest<{ data: InsightRow[] }>(`/${account}/insights`, {
          accessToken: connection.accessToken,
          cacheFor: RESULTS_TTL,
          params: { level: "campaign", fields: FIELDS, time_range: JSON.stringify(rangeOf(w.key, now)), limit: 500 },
        });
        return [w.key, new Map((res.data ?? []).filter((r) => r.campaign_id).map((r) => [r.campaign_id!, normalizeInsights(r)]))] as const;
      }),
    );
    onProgress({ step: "performance", state: "done", detail: "7, 30, 90 and 180 days" });

    onProgress({ step: "opportunities", state: "working" });
    const managed = new Set(managedRows.map((m) => m.externalCampaignId!));
    const campaigns: AnalyzerCampaign[] = rows
      .filter((r) => r.id)
      .map((r) => ({
        id: r.id,
        name: r.name?.trim() || "Untitled campaign",
        goal: goalFromObjective(r.objective),
        running: stateOf(r.effective_status, r.stop_time ? new Date(r.stop_time) : null, now) === "running",
        managed: managed.has(r.id),
        windows: Object.fromEntries(periods.map(([k, m]) => [k, m.get(r.id) ?? null])),
      }));
    const analysis = analyzeAccount({ now, campaigns, sellsOnline: setup?.need === "required_for_purchases" });
    onProgress({ step: "opportunities", state: "done", detail: analysis.state === "ready" ? `${analysis.improve.length} to improve, ${analysis.doingWell.length} working well` : "No history yet" });
    onProgress({ step: "strategy", state: "working" });
    onProgress({ step: "strategy", state: "done" });
    return { ok: true, analysis, adAccountId: account };
  } catch (error) {
    console.error("Meta Ads Analyzer read failed:", error);
    return { ok: false, reason: "unreadable", message: "Meta didn't answer just now, so your account couldn't be analyzed. Nothing was changed. Try again in a minute." };
  }
}
