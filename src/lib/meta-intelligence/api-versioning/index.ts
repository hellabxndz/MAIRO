import { db } from "@/lib/db";
import { graphApiVersion } from "@/lib/meta/client";
import { raiseAlert } from "../alerts";
import { versionAlerts, versionNumber } from "./rules";

// Meta API version tracking: what production runs, what's available, what
// retires when, and how far migration testing has got. Dates are only ever
// taken from an official source's own words or entered by an admin.

export async function ensureProductionVersion(): Promise<string> {
  const production = graphApiVersion();
  await db.platformApiVersion.upsert({
    where: { platform_version: { platform: "META", version: production } },
    create: { platform: "META", version: production, status: "PRODUCTION", migrationStatus: "MIGRATED" },
    update: { status: "PRODUCTION" },
  });
  // Anything else marked PRODUCTION is from a previous deployment.
  await db.platformApiVersion.updateMany({ where: { platform: "META", status: "PRODUCTION", version: { not: production } }, data: { status: "AVAILABLE" } });
  return production;
}

/** Records version facts found in an official source. Never overwrites an admin's date with nothing. */
export async function recordVersionFacts(facts: { version: string; releasedAt: string | null; retiresAt: string | null }[], source: string): Promise<number> {
  let changed = 0;
  for (const f of facts) {
    const row = await db.platformApiVersion.findUnique({ where: { platform_version: { platform: "META", version: f.version } } });
    const releasedAt = f.releasedAt ? new Date(`${f.releasedAt}T00:00:00Z`) : null;
    const retiresAt = f.retiresAt ? new Date(`${f.retiresAt}T00:00:00Z`) : null;
    if (!row) {
      await db.platformApiVersion.create({ data: { platform: "META", version: f.version, releasedAt, retiresAt, retiresSource: retiresAt ? source : null, status: retiresAt && retiresAt < new Date() ? "RETIRED" : "AVAILABLE" } });
      changed++;
    } else if ((retiresAt && row.retiresAt?.getTime() !== retiresAt.getTime()) || (releasedAt && !row.releasedAt)) {
      await db.platformApiVersion.update({ where: { id: row.id }, data: { ...(retiresAt ? { retiresAt, retiresSource: source } : {}), ...(releasedAt && !row.releasedAt ? { releasedAt } : {}) } });
      changed++;
    }
  }
  return changed;
}

export async function versionSweep(now = new Date()): Promise<number> {
  const production = await ensureProductionVersion();
  const rows = await db.platformApiVersion.findMany({ where: { platform: "META" } });
  let raised = 0;
  for (const a of versionAlerts(rows, production, now)) {
    if (await raiseAlert({ key: a.key, severity: a.severity, title: a.title, body: a.body, href: "/aios/meta-intelligence?tab=versions" })) raised++;
  }
  return raised;
}

export async function listVersions() {
  const rows = await db.platformApiVersion.findMany({ where: { platform: "META" } });
  return rows.sort((a, b) => versionNumber(b.version) - versionNumber(a.version));
}
