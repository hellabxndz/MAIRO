import { db } from "@/lib/db";
import { raiseAlert } from "../alerts";
import { mappingOf } from "../feature-registry/store";

// When Meta retires something MAIRO uses: what's affected, which customer
// campaigns use it, what replaces it, and the migration plan. MAIRO stops
// building NEW campaigns with it (feature-registry/guard.ts) and leaves
// existing ones running while Meta supports them. Live campaigns move only
// when it's safe and appropriate — never automatically from here.

export type DeprecationImpact = {
  featureKey: string;
  name: string;
  deprecationDate: string | null;
  replacement: { featureKey: string; name: string; support: string } | null;
  systems: string[];
  code: string[];
  campaigns: { active: number; paused: number; organizations: number };
  plan: string[];
};

export async function deprecationImpact(featureKey: string): Promise<DeprecationImpact | null> {
  const f = await db.platformFeature.findUnique({ where: { platform_featureKey: { platform: "META", featureKey } } });
  if (!f) return null;
  const [replacement, campaigns] = await Promise.all([
    f.replacementKey ? db.platformFeature.findUnique({ where: { platform_featureKey: { platform: "META", featureKey: f.replacementKey } } }) : null,
    db.mairoCampaign.findMany({ where: { metaFeatures: { has: featureKey }, status: { in: ["ACTIVE", "PAUSED", "PENDING_REVIEW"] } }, select: { status: true, organizationId: true } }),
  ]);
  const map = mappingOf(f.mairoMapping);
  const date = f.deprecationDate?.toISOString().slice(0, 10) ?? null;
  return {
    featureKey,
    name: f.name,
    deprecationDate: date,
    replacement: replacement ? { featureKey: replacement.featureKey, name: replacement.name, support: replacement.mairoSupport } : null,
    systems: map.systems,
    code: map.code,
    campaigns: { active: campaigns.filter((c) => c.status === "ACTIVE").length, paused: campaigns.filter((c) => c.status !== "ACTIVE").length, organizations: new Set(campaigns.map((c) => c.organizationId)).size },
    plan: [
      "New campaigns no longer use it (enforced by the Feature Registry guard).",
      "Existing campaigns keep running unchanged while Meta still supports it.",
      replacement ? `Build and validate support for ${replacement.name}${replacement.mairoSupport === "SUPPORTED" ? " (already supported)" : ""} behind a feature flag.` : "Find a replacement in Meta's official documentation and add it to the registry.",
      `Update the code paths that use it: ${map.code.join(", ") || "none mapped yet"}.`,
      "Run the Meta contract tests and a sandbox run on the replacement.",
      date ? `Migrate affected live campaigns before ${date}, each one only after its owner approves or within already-approved optimization rules.` : "Migrate affected live campaigns only once Meta sets a date, with the owner's approval.",
    ],
  };
}

/** The daily look at deprecated features MAIRO's customers still run. */
export async function deprecationSweep(now = new Date()): Promise<number> {
  const deprecated = await db.platformFeature.findMany({ where: { platform: "META", deprecated: true }, select: { featureKey: true } });
  let raised = 0;
  for (const d of deprecated) {
    const impact = await deprecationImpact(d.featureKey);
    if (!impact || impact.campaigns.active + impact.campaigns.paused === 0) continue;
    const days = impact.deprecationDate ? Math.ceil((Date.parse(impact.deprecationDate) - now.getTime()) / 86_400_000) : null;
    const severity = days !== null && days <= 30 ? "CRITICAL" : days !== null && days <= 90 ? "HIGH" : "MEDIUM";
    if (
      await raiseAlert({
        key: `deprecation:${d.featureKey}:${severity}`,
        severity,
        title: `${impact.name} is retiring and ${impact.campaigns.active + impact.campaigns.paused} customer campaigns use it`,
        body: `${impact.campaigns.organizations} businesses affected${impact.deprecationDate ? `; Meta's date is ${impact.deprecationDate}` : ""}. ${impact.replacement ? `Replacement: ${impact.replacement.name}.` : "No replacement recorded yet."} New campaigns already avoid it; existing ones are untouched.`,
        href: "/aios/meta-intelligence?tab=deprecations",
      })
    )
      raised++;
  }
  return raised;
}
