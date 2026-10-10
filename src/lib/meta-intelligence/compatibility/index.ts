import type { ChangeType, Compatibility, MairoSystem, PipelineStatus } from "@/lib/platform-intelligence/types";

// MAIRO's compatibility with a detected update. The rule that matters: an
// update is never shown as Supported until MAIRO has validated it. Before
// production, the best it can be is Testing.

export function compatibilityFor(input: {
  changeType: ChangeType;
  status: PipelineStatus;
  /** The registry's support for the feature this update concerns, if any. */
  featureSupport: Compatibility | null;
  /** MAIRO uses the feature today. */
  used: boolean;
}): Compatibility {
  if (input.status === "DISMISSED") return "NOT_APPLICABLE";
  const removing = ["DEPRECATED_FEATURE", "REMOVED_FEATURE", "REMOVED_ENDPOINT", "REMOVED_FIELD", "API_VERSION_DEPRECATION"].includes(input.changeType);
  if (removing && input.used) return "DEPRECATED";
  if (["DEVELOPMENT", "AUTOMATED_TESTING", "SANDBOX_TESTING", "APPROVED"].includes(input.status)) return "TESTING";
  if (input.status === "PRODUCTION") return input.featureSupport ?? "NOT_APPLICABLE";
  // Before testing: what MAIRO supports today, if it's a feature MAIRO knows.
  if (input.featureSupport) return input.featureSupport === "SUPPORTED" && !input.used ? "NOT_SUPPORTED" : input.featureSupport;
  return ["POLICY_CHANGE", "OTHER", "ERROR_SPIKE"].includes(input.changeType) ? "NOT_APPLICABLE" : "NOT_SUPPORTED";
}

/** The MAIRO systems an update could touch, from the features it mentions and what it's about. */
export function affectedSystems(input: { changeType: ChangeType; areas: string[]; featureSystems: string[] }): MairoSystem[] {
  const out = new Set<string>(input.featureSystems);
  const a = new Set(input.areas);
  if (a.has("campaign-creation") || a.has("optimization") || a.has("targeting") || a.has("placements")) out.add("Campaign builder (Create / launch)").add("Meta adapter (ad sets, ads, insights)");
  if (a.has("optimization")) out.add("MAIRO Decisions and optimization").add("Strategy Engine");
  if (a.has("creative") || a.has("ai")) out.add("Creative builder and media checks");
  if (a.has("publishing")) out.add("Instagram / Facebook publishing (Social Manager)");
  if (a.has("permissions")) out.add("Meta connection and permissions");
  if (a.has("measurement")) out.add("Reporting and analytics").add("Tracking and conversions");
  if (a.has("billing") || a.has("budget")) out.add("Billing and ad account payments");
  if (a.has("api-version")) out.add("Meta adapter (ad sets, ads, insights)").add("Meta connection and permissions");
  return [...out] as MairoSystem[];
}
