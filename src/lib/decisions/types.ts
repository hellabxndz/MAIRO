import type {
  AdDestination,
  AdGoal,
  AdPlatform,
  CampaignAdKind,
  CampaignStatus,
  DecisionCategory,
  DecisionConfidence,
  DecisionRisk,
  SpecialAdCategory,
} from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import type { LandingProbe } from "@/lib/campaigns/landing-probe";

// The shapes MAIRO Decisions works in.
//
// Deliberately network-agnostic. A campaign snapshot names its platform and
// the ids that platform gave it; a change names the platform it runs on and is
// carried out by that platform's adapter. Adding Google or Pinterest later
// means an adapter and nothing here — the rules, cards, approvals and history
// stay the same.

/** One ad inside a campaign, with its figures over the windows the rules compare. */
export type AdSnapshot = {
  /** "Ad 1", "Ad 2"… in the order the campaign runs them. */
  label: string;
  /** MAIRO's own row, when the ad was built by MAIRO. */
  campaignAdId: string | null;
  kind: CampaignAdKind | null;
  externalAdId: string;
  /** The words, when MAIRO knows them — for writing a variation. */
  headline: string | null;
  primaryText: string | null;
  /** The button, when MAIRO knows it (the Strategy Engine compares them). */
  callToAction?: string | null;
  /** Last 3 days. */
  recent: PlatformMetrics | null;
  /** The 4 days before that. */
  prior: PlatformMetrics | null;
  /** Last 7 days. */
  week: PlatformMetrics | null;
};

/** One network's half of a campaign, with its figures. */
export type CampaignSnapshot = {
  mairoCampaignId: string;
  name: string;
  objective: AdGoal;
  status: CampaignStatus;
  platform: AdPlatform;
  platformCampaignId: string;
  externalCampaignId: string;
  externalAdGroupId: string | null;
  dailyBudgetCents: number;
  /** When it started delivering, or was created if that's unknown. */
  liveSince: Date;
  recent: PlatformMetrics | null;
  prior: PlatformMetrics | null;
  week: PlatformMetrics | null;
  ads: AdSnapshot[];
  /** Meta Feature Registry keys the campaign was built with (Meta Intelligence). */
  metaFeatures?: string[];
  audience: {
    geoKey: string | null;
    geoLabel: string | null;
    geoRadius: number | null;
    ageMin: number;
    ageMax: number;
    specialAdCategory: SpecialAdCategory | null;
    advantageAudience: boolean;
  };
  destinationType: AdDestination;
  destinationUrl: string | null;
  /** Whether this network can switch one ad off / change an audience. */
  canPauseAd: boolean;
  canChangeAudience: boolean;
};

export type Guardrails = {
  /** Account-wide ceiling on daily spend. Null when none is set. */
  maxDailyBudgetCents: number | null;
  maxDailyIncreasePercent: number;
  maxDailyDecreasePercent: number;
  maxBudgetShiftPercent: number;
  minRoas: number | null;
  maxCpaCents: number | null;
};

export type DecisionInput = {
  now: Date;
  campaigns: CampaignSnapshot[];
  guardrails: Guardrails;
  /** A landing-page check for campaigns where people click and don't convert. */
  landing: Record<string, LandingProbe | null>;
  /**
   * What the business itself said about its recent leads (last 30 days):
   * how many it has marked, and how many of those were spam or not a fit.
   * Account-wide — a lead belongs to a form, not a campaign. Absent when
   * nothing has been marked; Meta's lead count is all there is then.
   */
  leadQuality?: { marked: number; junk: number; good: number } | null;
};

/** A figure behind a decision. `metric` names a tooltip in Advanced mode. */
export type Evidence = {
  label: string;
  value: string;
  /** The same figure in advertising terms, for Advanced mode. */
  advancedLabel?: string;
};

/**
 * One concrete change. Every automatic path goes through these, and each is
 * described back to the customer with a before and an after.
 */
export type DecisionChange =
  | {
      type: "set-budget";
      platform: AdPlatform;
      mairoCampaignId: string;
      platformCampaignId: string;
      externalCampaignId: string;
      campaignName: string;
      fromCents: number;
      toCents: number;
    }
  | {
      type: "pause-ad";
      platform: AdPlatform;
      mairoCampaignId: string;
      externalAdId: string;
      adLabel: string;
      campaignName: string;
    }
  | {
      type: "new-ad-variation";
      platform: AdPlatform;
      mairoCampaignId: string;
      /** The ad the new words are written from. */
      basedOnCampaignAdId: string;
      basedOnLabel: string;
      campaignName: string;
    }
  | {
      type: "widen-audience";
      platform: AdPlatform;
      mairoCampaignId: string;
      campaignName: string;
      from: { geoRadius: number | null; ageMin: number; ageMax: number };
      to: { geoRadius: number | null; ageMin: number; ageMax: number };
    }
  | {
      /**
       * Meta Intelligence: the owner says yes to MAIRO considering a newly
       * validated Meta capability in their NEXT campaign. Approving records
       * consent only — no live campaign is touched.
       */
      type: "try-meta-feature";
      featureKey: string;
      featureName: string;
      learnMoreHref: string;
    }
  | {
      /** Nothing MAIRO can change on its own — a place to go and act. */
      type: "guide";
      label: string;
      href: string;
    };

export type DecisionDraft = {
  kind: string;
  category: DecisionCategory;
  urgent: boolean;
  mairoCampaignId: string | null;
  platform: AdPlatform | null;
  title: string;
  noticed: string;
  noticedAdvanced: string;
  whyItMatters: string;
  recommendation: string;
  impact: string;
  risk: DecisionRisk;
  confidence: DecisionConfidence;
  evidence: Evidence[];
  changes: DecisionChange[];
  /** Same situation, same key. Changes when the situation materially does. */
  dedupeKey: string;
  /** Higher first. Only the top few are kept. */
  priority: number;
};

/** Why there are no decisions, when there are none. */
export type DataStatus = "no-campaigns" | "learning" | "enough";

export type DecisionRun = {
  decisions: DecisionDraft[];
  dataStatus: DataStatus;
};
