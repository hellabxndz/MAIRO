import { db } from "@/lib/db";
import { FLAG_STAGES, type FlagStage } from "@/lib/platform-intelligence/types";

// Feature flags for Meta capabilities. Every new capability ships OFF, then:
// Internal testing → Selected accounts → All eligible accounts. Any stage can
// be set back to OFF instantly if Meta's behaviour changes — the rollback.
//
// "Internal" accounts are the flag's own list plus META_INTERNAL_ORG_IDS.
// A flag being on never makes an ineligible account eligible.

export function internalOrgIds(): string[] {
  return (process.env.META_INTERNAL_ORG_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function stageAllows(stage: FlagStage, orgId: string, flag: { internalOrgIds: string[]; selectedOrgIds: string[] }): boolean {
  const internal = new Set([...flag.internalOrgIds, ...internalOrgIds()]);
  switch (stage) {
    case "OFF":
      return false;
    case "INTERNAL":
      return internal.has(orgId);
    case "SELECTED":
      return internal.has(orgId) || flag.selectedOrgIds.includes(orgId);
    case "ALL_ELIGIBLE":
      return true;
  }
}

/** Whether a flag is on for this business. Unknown flags are off. */
export async function flagEnabled(key: string, organizationId: string): Promise<boolean> {
  const flag = await db.platformFeatureFlag.findUnique({ where: { key } }).catch(() => null);
  if (!flag) return false;
  return stageAllows(flag.stage as FlagStage, organizationId, flag);
}

/** Creates a flag (OFF) for a capability, if it doesn't exist. */
export async function ensureFlag(input: { key: string; featureKey?: string | null; description: string }): Promise<void> {
  const key = input.key.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 80);
  await db.platformFeatureFlag.upsert({ where: { key }, create: { platform: "META", key, featureKey: input.featureKey ?? null, description: input.description, stage: "OFF" }, update: {} });
}

export async function setFlagStage(key: string, stage: FlagStage, by: string, lists?: { internalOrgIds?: string[]; selectedOrgIds?: string[] }): Promise<void> {
  if (!(FLAG_STAGES as readonly string[]).includes(stage)) throw new Error("Unknown stage.");
  const flag = await db.platformFeatureFlag.findUnique({ where: { key } });
  if (!flag) throw new Error("No such flag.");
  const history = JSON.parse(flag.historyJson || "[]") as unknown[];
  history.push({ at: new Date().toISOString(), by, from: flag.stage, to: stage });
  await db.platformFeatureFlag.update({
    where: { key },
    data: { stage, updatedBy: by, historyJson: JSON.stringify(history.slice(-50)), ...(lists?.internalOrgIds ? { internalOrgIds: lists.internalOrgIds } : {}), ...(lists?.selectedOrgIds ? { selectedOrgIds: lists.selectedOrgIds } : {}) },
  });
}

/** The flag name a feature gets: META_<FEATURE>_ENABLED. */
export function flagKeyFor(featureKey: string): string {
  return `META_${featureKey.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_ENABLED`;
}
