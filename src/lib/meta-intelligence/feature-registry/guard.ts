import { db } from "@/lib/db";

// The registry's say over NEW campaigns.
//
// When a Meta feature is retired (a deprecation that went through the safe
// update pipeline and was promoted to production), MAIRO stops building new
// campaigns with it. Existing campaigns are never touched here: they keep
// running while Meta supports them, and moving them is a separate, approved
// migration.
//
// Fail-open on purpose for features the registry doesn't know: the registry
// restricts, it never has to grant. A missing row can't stop a launch.

type Blocked = { featureKey: string; name: string; reason: string; replacementKey: string | null };

let cache: { at: number; rows: Map<string, { name: string; deprecated: boolean; mairoSupport: string; replacementKey: string | null; deprecationDate: Date | null }> } | null = null;
const TTL_MS = 60_000;

async function registry() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await db.platformFeature.findMany({
    where: { platform: "META", OR: [{ deprecated: true }, { mairoSupport: { in: ["DEPRECATED", "NOT_SUPPORTED"] } }] },
    select: { featureKey: true, name: true, deprecated: true, mairoSupport: true, replacementKey: true, deprecationDate: true },
  });
  cache = { at: Date.now(), rows: new Map(rows.map((r) => [r.featureKey, r])) };
  return cache.rows;
}

/** Forget the cached registry (after an admin or pipeline change). */
export function clearRegistryCache(): void {
  cache = null;
}

/** Which of these features a NEW campaign may no longer use, and why. */
export async function blockedForNewCampaigns(featureKeys: string[]): Promise<Blocked[]> {
  const rows = await registry().catch(() => new Map());
  const out: Blocked[] = [];
  for (const key of featureKeys) {
    const r = rows.get(key);
    if (!r) continue;
    if (r.deprecated || r.mairoSupport === "DEPRECATED") {
      out.push({ featureKey: key, name: r.name, replacementKey: r.replacementKey, reason: `${r.name} is being retired by Meta${r.deprecationDate ? ` (${r.deprecationDate.toISOString().slice(0, 10)})` : ""}, so MAIRO no longer builds new campaigns with it.` });
    } else if (r.mairoSupport === "NOT_SUPPORTED") {
      out.push({ featureKey: key, name: r.name, replacementKey: r.replacementKey, reason: `${r.name} isn't currently supported by MAIRO.` });
    }
  }
  return out;
}
