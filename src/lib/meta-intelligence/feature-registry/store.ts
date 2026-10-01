import { db } from "@/lib/db";
import { COMPATIBILITY, type Compatibility } from "@/lib/platform-intelligence/types";
import { recordKnowledge } from "../knowledge-base/store";
import { clearRegistryCache } from "./guard";
import { BASELINE_FEATURES, type FeatureRecord } from "./baseline";

// The Meta Feature Registry, stored. Seeding adds what's missing and never
// overwrites a row an admin or the pipeline changed. Every change after that
// bumps the row's version and writes the previous state to the knowledge
// base, so the registry has a full history.

const FIELDS = ["name", "category", "description", "apiVersion", "objectives", "optimizationGoals", "placements", "creativeFormats", "permissions", "accountType", "availability", "betaStatus", "regionRestrictions", "deprecated", "deprecationDate", "replacementKey", "sourceUrl", "mairoSupport", "mairoMapping", "breakingRisk", "goalFit", "aiCapability", "notes"] as const;
export type FeatureField = (typeof FIELDS)[number];

function toRow(f: FeatureRecord) {
  return {
    platform: "META",
    featureKey: f.featureKey,
    name: f.name,
    category: f.category,
    description: f.description,
    apiVersion: f.apiVersion ?? null,
    objectives: f.objectives ?? [],
    optimizationGoals: f.optimizationGoals ?? [],
    placements: f.placements ?? [],
    creativeFormats: f.creativeFormats ?? [],
    permissions: f.permissions ?? [],
    accountType: f.accountType ?? null,
    availability: f.availability,
    betaStatus: f.betaStatus ?? null,
    regionRestrictions: f.regionRestrictions ?? [],
    deprecated: f.deprecated ?? false,
    deprecationDate: f.deprecationDate ? new Date(`${f.deprecationDate}T00:00:00Z`) : null,
    replacementKey: f.replacementKey ?? null,
    sourceUrl: f.sourceUrl ?? null,
    mairoSupport: f.mairoSupport,
    mairoMapping: JSON.stringify(f.mairoMapping),
    breakingRisk: f.breakingRisk,
    goalFit: f.goalFit,
    aiCapability: f.aiCapability ?? false,
    notes: f.notes ?? null,
  };
}

/** Adds baseline features that aren't in the registry yet. Returns how many were added. */
export async function seedRegistry(): Promise<number> {
  const existing = new Set((await db.platformFeature.findMany({ where: { platform: "META" }, select: { featureKey: true } })).map((r) => r.featureKey));
  let added = 0;
  for (const f of BASELINE_FEATURES) {
    if (existing.has(f.featureKey)) continue;
    const row = await db.platformFeature.create({ data: toRow(f) });
    await recordKnowledge({ topic: "feature", key: f.featureKey, summary: `${f.name}: ${f.description}`, data: row, source: "MAIRO baseline (code in production)", confidence: f.mairoSupport === "SUPPORTED" ? "HIGH" : "LOW", changeNote: "Seeded from the baseline." });
    added++;
  }
  if (added) clearRegistryCache();
  return added;
}

export type FeatureChange = Partial<{
  name: string;
  category: string;
  description: string;
  apiVersion: string | null;
  objectives: string[];
  optimizationGoals: string[];
  placements: string[];
  creativeFormats: string[];
  permissions: string[];
  accountType: string | null;
  availability: string;
  betaStatus: string | null;
  regionRestrictions: string[];
  deprecated: boolean;
  deprecationDate: Date | null;
  replacementKey: string | null;
  sourceUrl: string | null;
  mairoSupport: Compatibility;
  breakingRisk: string;
  goalFit: string[];
  aiCapability: boolean;
  notes: string | null;
  lastVerifiedAt: Date | null;
}>;

/**
 * Changes a registry row (or adds one), keeping the old version in the
 * knowledge base. Only structured, typed fields — free text from a source can
 * describe a feature, never execute anything.
 */
export async function upsertFeature(featureKey: string, change: FeatureChange & { name?: string }, meta: { source: string; changeNote: string; updateId?: string | null }): Promise<void> {
  if (change.mairoSupport && !(COMPATIBILITY as readonly string[]).includes(change.mairoSupport)) throw new Error("Unknown support status.");
  const before = await db.platformFeature.findUnique({ where: { platform_featureKey: { platform: "META", featureKey } } });
  const row = before
    ? await db.platformFeature.update({ where: { id: before.id }, data: { ...change, version: before.version + 1 } })
    : await db.platformFeature.create({
        data: {
          platform: "META",
          featureKey,
          name: change.name ?? featureKey,
          category: change.category ?? "Uncategorized",
          description: change.description ?? "",
          ...change,
          // Something new is never "supported" on arrival.
          mairoSupport: change.mairoSupport && change.mairoSupport !== "SUPPORTED" ? change.mairoSupport : "NOT_SUPPORTED",
        },
      });
  await recordKnowledge({ topic: "feature", key: featureKey, summary: `${row.name}: ${row.description}`.slice(0, 2000), data: row, source: meta.source, confidence: row.lastVerifiedAt ? "HIGH" : "MEDIUM", changeNote: meta.changeNote, updateId: meta.updateId ?? null, verifiedAt: row.lastVerifiedAt });
  clearRegistryCache();
}

export async function listFeatures() {
  return db.platformFeature.findMany({ where: { platform: "META" }, orderBy: [{ category: "asc" }, { name: "asc" }] });
}

export function mappingOf(json: string): { systems: string[]; code: string[] } {
  try {
    const m = JSON.parse(json) as { systems?: string[]; code?: string[] };
    return { systems: m.systems ?? [], code: m.code ?? [] };
  } catch {
    return { systems: [], code: [] };
  }
}

export { FIELDS as FEATURE_FIELDS };
