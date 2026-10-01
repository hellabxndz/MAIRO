// Platform Intelligence: the shared vocabulary for keeping MAIRO aligned with
// the ad platforms it runs on. Meta is implemented (src/lib/meta-intelligence);
// TikTok, Google Ads, YouTube and LinkedIn can plug in with the same tables
// (each row carries `platform`) and the same pipeline.
//
// The rule every implementation keeps: external content is untrusted. It can
// be detected, analysed, proposed and tested — it never changes code, and
// never changes a customer's live campaign, on its own.

export const PLATFORMS = ["META", "TIKTOK", "GOOGLE_ADS", "YOUTUBE", "LINKEDIN"] as const;
export type PlatformKey = (typeof PLATFORMS)[number];

export const CHANGE_TYPES = [
  "NEW_FEATURE",
  "UPDATED_FEATURE",
  "REMOVED_FEATURE",
  "DEPRECATED_FEATURE",
  "RENAMED_FEATURE",
  "NEW_ENDPOINT",
  "REMOVED_ENDPOINT",
  "NEW_FIELD",
  "REMOVED_FIELD",
  "PERMISSION_CHANGE",
  "OBJECTIVE_CHANGE",
  "OPTIMIZATION_CHANGE",
  "PLACEMENT_CHANGE",
  "TARGETING_CHANGE",
  "CREATIVE_FORMAT_CHANGE",
  "MEASUREMENT_CHANGE",
  "ATTRIBUTION_CHANGE",
  "ADVANTAGE_PLUS_CHANGE",
  "AI_CAPABILITY",
  "AUTOMATION_OPTION",
  "INSTAGRAM_PUBLISHING",
  "API_VERSION_RELEASE",
  "API_VERSION_DEPRECATION",
  "POLICY_CHANGE",
  "ERROR_SPIKE",
  "OTHER",
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const URGENCIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const RISKS = ["NON_BREAKING", "POTENTIALLY_BREAKING", "BREAKING", "UNKNOWN"] as const;
export type Risk = (typeof RISKS)[number];

/** How far MAIRO supports something. Never SUPPORTED until validated. */
export const COMPATIBILITY = ["SUPPORTED", "PARTIALLY_SUPPORTED", "TESTING", "NOT_SUPPORTED", "DEPRECATED", "NOT_APPLICABLE"] as const;
export type Compatibility = (typeof COMPATIBILITY)[number];

export const COMPATIBILITY_LABEL: Record<Compatibility, string> = {
  SUPPORTED: "Supported",
  PARTIALLY_SUPPORTED: "Partially supported",
  TESTING: "Testing",
  NOT_SUPPORTED: "Not supported",
  DEPRECATED: "Deprecated",
  NOT_APPLICABLE: "Not applicable",
};

/** The parts of MAIRO a change can touch. The sensitive ones need stronger testing. */
export const AREAS = [
  "campaign-creation",
  "budget",
  "publishing",
  "permissions",
  "billing",
  "optimization",
  "targeting",
  "live-campaigns",
  "placements",
  "creative",
  "measurement",
  "ai",
  "api-version",
  "knowledge",
] as const;
export type Area = (typeof AREAS)[number];

export const SENSITIVE_AREAS: Area[] = ["campaign-creation", "budget", "publishing", "permissions", "billing", "optimization", "targeting", "live-campaigns"];

/** The MAIRO systems an update can affect, for the "which systems?" question. */
export const MAIRO_SYSTEMS = [
  "Campaign builder (Create / launch)",
  "Meta adapter (ad sets, ads, insights)",
  "Creative builder and media checks",
  "Instagram / Facebook publishing (Social Manager)",
  "Meta connection and permissions",
  "Lead forms",
  "Tracking and conversions",
  "Mairo Decisions and optimization",
  "Strategy Engine",
  "Reporting and analytics",
  "Billing and ad account payments",
] as const;
export type MairoSystem = (typeof MAIRO_SYSTEMS)[number];

/** The safe update pipeline. */
export const PIPELINE = ["DETECTED", "ANALYZED", "PROPOSED", "DEVELOPMENT", "AUTOMATED_TESTING", "SANDBOX_TESTING", "APPROVED", "PRODUCTION"] as const;
export type PipelineStatus = (typeof PIPELINE)[number] | "DISMISSED";

export const PIPELINE_LABEL: Record<PipelineStatus, string> = {
  DETECTED: "Detected",
  ANALYZED: "Analyzed",
  PROPOSED: "Proposed",
  DEVELOPMENT: "Development",
  AUTOMATED_TESTING: "Automated testing",
  SANDBOX_TESTING: "Sandbox / test account",
  APPROVED: "Approved",
  PRODUCTION: "In production",
  DISMISSED: "Dismissed",
};

/** Feature-flag rollout. */
export const FLAG_STAGES = ["OFF", "INTERNAL", "SELECTED", "ALL_ELIGIBLE"] as const;
export type FlagStage = (typeof FLAG_STAGES)[number];

export const FLAG_STAGE_LABEL: Record<FlagStage, string> = {
  OFF: "Off",
  INTERNAL: "Internal testing",
  SELECTED: "Selected accounts",
  ALL_ELIGIBLE: "All eligible accounts",
};

/** Source authority. Official documentation outranks everything. */
export const AUTHORITIES = ["OFFICIAL", "TRUSTED", "UNVERIFIED"] as const;
export type Authority = (typeof AUTHORITIES)[number];

/** The interface a platform's intelligence implements. */
export type PlatformIntelligence = {
  platform: PlatformKey;
  label: string;
  /** Check sources, analyse what changed, sweep versions, errors and deprecations. */
  run: (opts?: { budgetMs?: number; now?: Date }) => Promise<Record<string, unknown>>;
};
