import type { AdGoal, AdPlatform, AgentRole, CampaignStatus, CoachCategory, CoachConfidence, LeadSource, LeadStatus } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import type { DecisionDraft, Guardrails } from "@/lib/decisions/types";

// The Performance Coach's vocabulary. Everything it reads is a real record —
// Meta's figures for MAIRO's campaigns, the leads MAIRO stored, what the
// business marked — and everything it writes keeps three things apart: what
// it observed, what might explain it, and what it can't see.

/** Whole days, `since` and `until` both included (as Meta reports them). */
export type Period = { since: Date; until: Date };

export type CoachLead = {
  id: string;
  createdAt: Date;
  status: LeadStatus;
  source: LeadSource;
  /** Only when reliably known. */
  mairoCampaignId: string | null;
  firstContactedAt: Date | null;
  appointmentAt: Date | null;
  nextFollowUpAt: Date | null;
  statusChangedAt: Date | null;
  estimatedValueCents: number | null;
  valueCents: number | null;
  lostReason: string | null;
};

export type CoachAd = { label: string; externalAdId: string; headline: string | null; metrics: PlatformMetrics | null };

export type CoachCampaign = {
  mairoCampaignId: string;
  name: string;
  objective: AdGoal;
  status: CampaignStatus;
  platform: AdPlatform;
  platformCampaignId: string;
  externalCampaignId: string;
  dailyBudgetCents: number;
  liveSince: Date;
  current: PlatformMetrics | null;
  previous: PlatformMetrics | null;
  /** Each ad's figures for the last 7 days, when the campaign is running. */
  ads: CoachAd[];
  /** The ad sends people to MAIRO's own form. */
  hostedForm: boolean;
};

export type CoachTracking = {
  /** none: no pixel · waiting: never fired · firing: fired in the last week · stopped: fired before, not lately. */
  pixel: "none" | "waiting" | "firing" | "stopped";
  pixelLastFiredAt: Date | null;
  storeConnected: boolean;
};

export type CoachHistory = {
  /** Changes carried out on Meta that were followed by worse results. */
  worsened: { kind: string; mairoCampaignId: string | null; at: Date }[];
  /** Situations the business dismissed lately — not raised again for a while. */
  dismissedKeys: string[];
};

export type CoachInput = {
  now: Date;
  current: Period;
  previous: Period;
  campaigns: CoachCampaign[];
  /** Leads created from the start of the previous period on. */
  leads: CoachLead[];
  tracking: CoachTracking;
  guardrails: Guardrails;
  labels: Record<LeadStatus, string>;
  /** Sales the business's store reported (verified), when a store is connected. */
  orders: { current: { count: number; valueCents: number }; previous: { count: number; valueCents: number } } | null;
  history: CoachHistory;
};

export type Funnel = {
  spendCents: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  /** What Meta reported for lead campaigns. Never added to `leads`. */
  metaLeads: number | null;
  metaPurchases: number | null;
  metaRevenueCents: number | null;
  /** Leads MAIRO stored (its form, Meta's instant form), minus spam. */
  leads: number;
  spam: number;
  /** Leads the business has judged: good or later, not a fit, or spam. */
  judged: number;
  unmarked: number;
  contacted: number;
  qualified: number;
  appointments: number;
  estimates: number;
  customers: number;
  lost: number;
  /** Sale values the business confirmed, plus orders its store reported. Null when none. */
  verifiedRevenueCents: number | null;
  /** What the business expects open estimates to be worth. An estimate, never revenue. */
  estimatedValueCents: number | null;
  costPerLeadCents: number | null;
  costPerQualifiedCents: number | null;
  /** Spend ÷ customers the business marked. */
  cacCents: number | null;
  roasVerified: number | null;
  roasReported: number | null;
  /** Median hours from enquiry to the first contact the business logged. */
  medianResponseHours: number | null;
  responseSample: number;
  /** Untouched for over a day. */
  waitingForContact: number;
  /** Where the lead count comes from. */
  leadSource: "recorded" | "meta" | "none";
};

export type Explanation = { text: string; basis: "evidence" | "possibility" };

export type StepKind = "review" | "contact" | "tracking" | "creative" | "meta-change" | "monitor" | "setting";
export type StepStatus = "todo" | "done" | "skipped";

export type PlanStep = {
  id: string;
  title: string;
  detail: string;
  kind: StepKind;
  priority: number;
  risk: "LOW" | "MEDIUM" | "HIGH";
  /** What has to be approved, said plainly. */
  approval: string;
  /** What it may do — always uncertain, never a number. */
  benefit: string;
  /** What would show it worked. */
  verify: string;
  status: StepStatus;
  href?: string;
};

export type MetricKey =
  | "medianResponseHours"
  | "waitingForContact"
  | "qualifiedShare"
  | "appointmentShare"
  | "stalledEstimates"
  | "costPerQualified"
  | "costPerLead"
  | "clickToLead"
  | "ctr"
  | "cpm";

/** The figure that would show a plan worked, as it stood when it was found. */
export type Measure = { metric: MetricKey; value: number; betterWhen: "lower" | "higher"; campaignId: string | null };

export type Severity = "ATTENTION" | "OPPORTUNITY" | "WATCH";

export type Finding = {
  key: string;
  category: CoachCategory;
  severity: Severity;
  mairoCampaignId: string | null;
  campaignName: string | null;
  title: string;
  /** For someone with no advertising knowledge. */
  plain: string;
  /** Observed, with the numbers. */
  noticed: string;
  explanations: Explanation[];
  recommendation: string;
  alternatives: string[];
  evidence: { label: string; value: string }[];
  confidence: CoachConfidence;
  limitations: string;
  missing: string[];
  steps: PlanStep[];
  agents: AgentRole[];
  measure: Measure | null;
  /** A change on Meta, for the business to approve through MAIRO Decisions. */
  change: DecisionDraft | null;
  priority: number;
};

/** Something MAIRO can't see yet, and how to let it. */
export type Gap = { key: string; title: string; why: string; href: string };

export type StepChange = { step: string; label: string; current: number; previous: number | null; change: number | null };

export type CoachResult = {
  current: Funnel;
  previous: Funnel;
  /** Stage-to-stage rates, current against previous, where both are measurable. */
  steps: StepChange[];
  /** One plain sentence on where people drop out, when the data can say. */
  whereItDrops: string | null;
  findings: Finding[];
  gaps: Gap[];
  /** What came in and what became of it, in a sentence or two. Null with nothing to follow. */
  funnelLine: string | null;
  summary: string;
};
