import type { AdDestination, AdGoal, CampaignStatus } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import type { MetricFamily } from "@/lib/mission/goals";
import { goalOption } from "@/lib/campaigns/objectives";
import { money, num } from "./home";

// Campaigns, simply: which tab a campaign belongs in, its goal and status in
// plain words, and the one result that matters for it. Pure; pinned by
// scripts/check-simple-ui.ts.

export const CAMPAIGN_TABS = [
  { key: "active", label: "Active" },
  { key: "drafts", label: "Drafts" },
  { key: "paused", label: "Paused" },
  { key: "completed", label: "Completed" },
] as const;
export type CampaignTab = (typeof CAMPAIGN_TABS)[number]["key"];

export function campaignTab(c: { status: CampaignStatus; endDate: Date | null }, now: Date): CampaignTab {
  if (c.status === "ARCHIVED" || (c.endDate && c.endDate < now)) return "completed";
  if (c.status === "ACTIVE" || c.status === "PENDING_REVIEW") return "active";
  if (c.status === "PAUSED") return "paused";
  return "drafts";
}

/**
 * Status in plain words, with the dot that says it at a glance — kept apart
 * the way Meta keeps them apart: a campaign MAIRO switched on (Meta accepted
 * the change) isn't "delivering" until Meta's ad review approved the ad, and
 * a rejected ad or a failed launch says so instead of "Active".
 */
export function statusLabel(
  c: {
    status: CampaignStatus;
    endDate: Date | null;
    launchApprovedAt?: Date | null;
    platformCampaigns?: { adReviewState?: string | null; lastError?: string | null; [field: string]: unknown }[];
  },
  now: Date,
): { dot: string; text: string; tone: "green" | "yellow" | "neutral" | "blue" } {
  if (c.status === "ARCHIVED") return { dot: "⚪", text: "Stopped", tone: "neutral" };
  if (c.endDate && c.endDate < now) return { dot: "⚪", text: "Completed", tone: "neutral" };
  const pcs = c.platformCampaigns ?? [];
  const review = (s: string) => pcs.some((p) => p.adReviewState === s);
  const failed = pcs.some((p) => p.lastError);
  switch (c.status) {
    case "ACTIVE":
      if (review("REJECTED")) return { dot: "🔴", text: "Ad rejected by Meta", tone: "yellow" };
      if (review("WITH_ISSUES")) return { dot: "🟡", text: "Delivering with issues", tone: "yellow" };
      if (review("PENDING")) return { dot: "🟡", text: "Switched on — in Meta's review", tone: "yellow" };
      if (review("APPROVED")) return { dot: "🟢", text: "Delivering", tone: "green" };
      // Meta accepted "switch it on"; its review hasn't been read yet.
      return { dot: "🟢", text: "Switched on", tone: "green" };
    case "PENDING_REVIEW":
      if (failed) return { dot: "🔴", text: "Launch failed — see why", tone: "yellow" };
      if (c.launchApprovedAt) return { dot: "🟡", text: "Approved — waiting for Meta", tone: "yellow" };
      return { dot: "🟡", text: "Built — waiting for your approval", tone: "yellow" };
    case "PAUSED":
      return { dot: "⏸", text: "Paused", tone: "yellow" };
    default:
      return { dot: "📝", text: failed ? "Draft — last build failed" : "Draft", tone: "blue" };
  }
}

/** The goal in the customer's words ("Get More Sales"), never "OUTCOME_SALES". */
export function goalLabel(objective: AdGoal): string {
  return goalOption(objective).label;
}

/** The goal family a campaign's own results are judged by. */
export function familyFor(objective: AdGoal, destination?: AdDestination | null): MetricFamily {
  switch (objective) {
    case "SALES":
    case "APP_PROMOTION":
      return "sales";
    case "LEADS":
      return destination === "PHONE_CALL" ? "calls" : "leads";
    case "TRAFFIC":
      return "traffic";
    case "AWARENESS":
      return "awareness";
    case "ENGAGEMENT":
      return destination === "DIRECT_MESSAGE" ? "calls" : "social";
  }
}

/** The one result a campaign card shows, for its goal. */
export function primaryResult(objective: AdGoal, destination: AdDestination | null, m: PlatformMetrics | null): { label: string; value: string } {
  const f = familyFor(objective, destination);
  if (!m) return { label: RESULT_LABEL[f], value: "—" };
  const v: Record<MetricFamily, number | null | undefined> = {
    sales: objective === "APP_PROMOTION" ? m.conversions : (m.purchases ?? m.conversions),
    leads: m.leads ?? m.conversions,
    bookings: m.bookings,
    calls: m.contacts,
    traffic: m.landingPageViews ?? m.clicks,
    awareness: m.reach,
    visits: m.reach,
    social: m.engagement,
  };
  return { label: objective === "APP_PROMOTION" ? "Installs" : RESULT_LABEL[f], value: num(v[f]) };
}

const RESULT_LABEL: Record<MetricFamily, string> = {
  sales: "Sales",
  leads: "Leads",
  bookings: "Bookings",
  calls: "Calls & messages",
  traffic: "Website visits",
  awareness: "People reached",
  visits: "People reached",
  social: "Engagements",
};

/** What MAIRO is optimizing for, said plainly (Simple mode's "optimization goal"). */
export function optimizingFor(objective: AdGoal, destination: AdDestination | null, hasTracking: boolean): string {
  switch (familyFor(objective, destination)) {
    case "sales":
      return hasTracking ? "Purchases on your website" : "Visits to your website (purchases become the target once your sales tracking is set up)";
    case "leads":
      return destination === "LEAD_FORM" ? "People filling in your form" : hasTracking ? "People contacting you from your website" : "Visits to your website";
    case "calls":
      return destination === "PHONE_CALL" ? "Phone calls" : "Conversations started";
    case "traffic":
      return "People who visit your website";
    case "awareness":
    case "visits":
      return "Reaching as many of the right people as possible";
    case "social":
      return "Likes, comments and shares";
    default:
      return "Results for your goal";
  }
}

export { money };
