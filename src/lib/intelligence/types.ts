import type { AdPlatform, DecisionConfidence, InsightCategory, InsightSeverity } from "@/generated/prisma/enums";
import type { Evidence } from "@/lib/decisions/types";

// MAIRO Intelligence: one normalized shape for everything MAIRO notices.
//
// Business Health, the Opportunity Radar, the Morning Brief, "MAIRO found
// this before you did" and the Campaign Timeline all read Insights, and none
// of them detects anything itself. A finding is made once, here, and every
// screen that should mention it does — creative fatigue lowers Creative
// Health, lights the radar's Creative area, appears as an early warning, sits
// in the timeline and carries the MAIRO Decision that fixes it.

export type ActionType =
  | "adjust_budget"
  | "pause_ad"
  | "generate_creative"
  | "expand_audience"
  | "create_retargeting"
  | "analyze_website"
  | "fix_tracking"
  | "shift_platform_budget"
  | "rewrite_copy";

export type RadarArea = "creative" | "budget" | "audience" | "website" | "retargeting" | "platform";

/** What a finding rests on, for the confidence line under it. */
export type BasedOn = {
  days: number;
  impressions: number | null;
  clicks: number | null;
  results: number | null;
  resultWord: string;
};

export type Insight = {
  /** Same situation, same key — across days, so it isn't reported as new every morning. */
  dedupeKey: string;
  type: string;
  category: InsightCategory;
  severity: InsightSeverity;
  confidence: DecisionConfidence;
  mairoCampaignId: string | null;
  campaignName: string | null;
  platform: AdPlatform | null;
  metric: string | null;
  previousValue: string | null;
  currentValue: string | null;
  title: string;
  /** What happened, in plain words. */
  happened: string;
  /** The same, in advertising terms. */
  happenedAdvanced: string;
  whyItMatters: string;
  recommendation: string;
  /** Why this recommendation. */
  reason: string;
  /** What happens if the business approves it. */
  ifApproved: string;
  evidence: Evidence[];
  basedOn: BasedOn;
  actionType: ActionType | null;
  action: { label: string; href: string } | null;
  radarArea: RadarArea | null;
  /** A problem caught early, for "MAIRO found this before you did". */
  earlyWarning: boolean;
  /** The MAIRO Decision carrying the change, when there is one. */
  decisionDedupeKey: string | null;
};

// --- Business Health ----------------------------------------------------------

export type HealthAreaKey = "advertising" | "creative" | "website" | "audience" | "budget";

export type HealthReason = { text: string; good: boolean };

export type HealthArea = {
  key: HealthAreaKey;
  label: string;
  /** Null is "not enough data yet" — never a made-up number. */
  score: number | null;
  /** Why the score is what it is, one line per thing that moved it. */
  reasons: HealthReason[];
  /** What would help most, when something would. */
  recommendation: { text: string; actionLabel: string; href: string; insightKey: string | null } | null;
  /** When there's no score, what would give it one. */
  needs: string | null;
};

export type HealthStatus = "healthy" | "attention" | "risk";

export type HealthReport = {
  score: number | null;
  status: HealthStatus | null;
  areas: HealthArea[];
};

// --- Opportunity Radar --------------------------------------------------------

export type OpportunityLevel = "LOW" | "MEDIUM" | "HIGH";

export type RadarReport = {
  /** Null when nothing has run long enough to judge. */
  areas: { area: RadarArea; label: string; level: OpportunityLevel | null; count: number }[];
  /** Keys of the insights to feature, best first. */
  top: string[];
};

// --- Morning Brief -------------------------------------------------------------

export type BriefFigures = {
  spendCents: number | null;
  revenueCents: number | null;
  results: number | null;
  resultWord: string;
  roas: number | null;
};

export type BriefReport = {
  period: "yesterday" | "week";
  /** YYYY-MM-DD, inclusive. */
  since: string;
  until: string;
  figures: BriefFigures | null;
  /** The period before, for a direction arrow. */
  before: BriefFigures | null;
  winner: {
    label: string;
    campaignName: string;
    resultShare: number;
    spendShare: number;
  } | null;
  watching: { label: string; status: string }[];
};

export type IntelligenceReportData = {
  computedAt: string;
  /** Whether any campaign has run long enough to judge. */
  judged: boolean;
  health: HealthReport;
  radar: RadarReport;
  brief: BriefReport | null;
};
