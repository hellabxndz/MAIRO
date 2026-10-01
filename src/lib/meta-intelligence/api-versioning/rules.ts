// API version management, pure: which alerts the version registry warrants.
// Retirement dates come only from an official source or an admin — never a guess.

export type VersionRow = { version: string; status: string; retiresAt: Date | null; releasedAt: Date | null; migrationStatus: string };

export type VersionAlert = { severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; key: string; title: string; body: string };

const DAY = 86_400_000;
export const versionNumber = (v: string) => Number(/^v(\d+)/.exec(v)?.[1] ?? 0);

export function versionAlerts(rows: VersionRow[], production: string, now: Date): VersionAlert[] {
  const out: VersionAlert[] = [];
  const prod = rows.find((r) => r.version === production);
  if (prod?.retiresAt) {
    const days = Math.ceil((prod.retiresAt.getTime() - now.getTime()) / DAY);
    const date = prod.retiresAt.toISOString().slice(0, 10);
    const body = `MAIRO is currently using Meta API ${production}. Meta plans to retire this version on ${date}. ${prod.migrationStatus === "PASSED" || prod.migrationStatus === "MIGRATED" ? "Migration testing has passed — schedule the switch." : "Migration testing should begin."}`;
    if (days <= 0) out.push({ severity: "CRITICAL", key: `version-retired:${production}`, title: `Meta API ${production} has reached its retirement date`, body });
    else if (days <= 30) out.push({ severity: "CRITICAL", key: `version-30:${production}`, title: `Meta API ${production} retires in ${days} days`, body });
    else if (days <= 90) out.push({ severity: "HIGH", key: `version-90:${production}`, title: `Meta API ${production} retires in ${days} days`, body });
    else if (days <= 180) out.push({ severity: "MEDIUM", key: `version-180:${production}`, title: `Meta API ${production} retires on ${date}`, body });
  }
  const newest = rows.filter((r) => r.status !== "RETIRED").sort((a, b) => versionNumber(b.version) - versionNumber(a.version))[0];
  if (newest && versionNumber(newest.version) > versionNumber(production)) {
    out.push({ severity: "LOW", key: `version-available:${newest.version}`, title: `Meta API ${newest.version} is available`, body: `MAIRO runs ${production}. Test ${newest.version} with the contract and sandbox suites before switching META_GRAPH_API_VERSION through a normal deployment.` });
  }
  return out;
}
