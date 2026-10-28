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

// --- the campaign board -------------------------------------------------------

/** The board's columns, in the order a campaign moves through them. */
export const BOARD_COLUMNS = [
  { key: "draft", label: "Draft" },
  { key: "awaiting", label: "Awaiting approval" },
  { key: "scheduled", label: "Scheduled" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "completed", label: "Completed" },
] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number]["key"];

/**
 * Where a campaign sits on the board, from its own records only.
 * "Awaiting approval" is built and waiting for the owner; "Scheduled" is
 * approved and waiting — for its start date, or for Meta to switch it on —
 * never "active" until MAIRO's record says Meta accepted it.
 */
export function boardColumn(c: { status: CampaignStatus; endDate: Date | null; startDate?: Date | null; launchApprovedAt?: Date | null }, now: Date): BoardColumn {
  if (c.status === "ARCHIVED" || (c.endDate && c.endDate < now)) return "completed";
  if (c.status === "PAUSED") return "paused";
  if (c.status === "ACTIVE") return c.startDate && c.startDate > now ? "scheduled" : "active";
  if (c.status === "PENDING_REVIEW") return c.launchApprovedAt ? "scheduled" : "awaiting";
  return "draft";
}

// --- the campaign's life, as stages -----------------------------------------------

export type CampaignStage = { id: string; label: string; state: "done" | "current" | "upcoming" | "problem"; when: string | null; note: string | null };

const day = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null);

/**
 * Where a campaign is in its life — created, built in Meta, approved by
 * you, Meta's review, delivering, ended — from its records only: a stage is
 * done when something recorded it, and the current one is where it is now.
 * A rejected ad or a failed launch marks its stage as a problem rather than
 * moving on.
 */
export function campaignStages(
  c: {
    status: CampaignStatus;
    createdAt: Date;
    endDate: Date | null;
    launchApprovedAt?: Date | null;
    platformCampaigns: { externalCampaignId?: string | null; createdAt?: Date | null; adReviewState?: string | null; adReviewCheckedAt?: Date | null; lastError?: string | null }[];
  },
  now: Date,
): { stages: CampaignStage[]; summary: string } {
  const pcs = c.platformCampaigns;
  const built = pcs.find((p) => p.externalCampaignId) ?? null;
  const review = (s: string) => pcs.some((p) => p.adReviewState === s);
  const reviewedAt = pcs.map((p) => p.adReviewCheckedAt).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const ended = c.status === "ARCHIVED" || Boolean(c.endDate && c.endDate < now);

  let at: number;
  let problem: string | null = null;
  let summary: string;
  if (ended) {
    at = 6;
    summary = c.status === "ARCHIVED" ? "Stopped. It no longer runs or spends." : `Ended on ${day(c.endDate)}.`;
  } else if (c.status === "ACTIVE" || c.status === "PAUSED") {
    if (review("REJECTED")) {
      at = 3;
      problem = "Ad rejected";
      summary = "Meta didn't approve the ad, so it isn't delivering. The Performance tab says what to change.";
    } else if (review("WITH_ISSUES")) {
      at = 4;
      problem = "Delivering with issues";
      summary = "Delivering, but Meta flagged a problem with the ad.";
    } else if (review("APPROVED")) {
      at = 4;
      summary = c.status === "PAUSED" ? "Paused. It doesn't spend until you switch it back on." : "Delivering — Meta approved the ad.";
    } else {
      at = 3;
      summary = review("PENDING") ? "Switched on and in Meta's review — usually within a day." : "Switched on. MAIRO hasn't read Meta's review result yet.";
    }
  } else if (c.status === "PENDING_REVIEW") {
    if (pcs.some((p) => p.lastError)) {
      at = 2;
      problem = "Launch failed";
      summary = "Approved, but Meta refused the launch. Open Setup to see why.";
    } else if (c.launchApprovedAt) {
      at = 2;
      summary = "Approved by you — MAIRO switches it on once Meta can run it.";
    } else {
      at = 1;
      summary = "Built in Meta, switched off. It waits for your approval before anything spends.";
    }
  } else {
    at = built ? 1 : 0;
    summary = built ? "Built in Meta, switched off." : "A draft in MAIRO — nothing is in Meta yet.";
  }

  const defs: { id: string; label: string; when: Date | null | undefined }[] = [
    { id: "created", label: "Created", when: c.createdAt },
    { id: "built", label: "Built in Meta", when: built?.createdAt },
    { id: "approved", label: "Approved by you", when: c.launchApprovedAt },
    { id: "review", label: "Meta's review", when: reviewedAt },
    { id: "delivering", label: c.status === "PAUSED" ? "Delivering · paused" : "Delivering", when: null },
    { id: "ended", label: "Ended", when: c.endDate && c.endDate < now ? c.endDate : null },
  ];
  const stages = defs.map((d, i): CampaignStage => {
    const state: CampaignStage["state"] = i < at ? "done" : i === at ? (problem ? "problem" : "current") : "upcoming";
    return { id: d.id, label: d.label, state: at === 6 && i <= 5 ? "done" : state, when: state === "upcoming" ? null : day(d.when ?? null), note: i === at ? problem : null };
  });
  return { stages, summary };
}
