import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Badge, Card } from "@/components/ui";
import { COMPATIBILITY_LABEL, type Compatibility } from "@/lib/platform-intelligence/types";
import { mappingOf } from "@/lib/meta-intelligence/feature-registry/store";
import { knowledgeHistory } from "@/lib/meta-intelligence/knowledge-base/store";
import { deprecationImpact } from "@/lib/meta-intelligence/deprecations";
import { flagKeyFor } from "@/lib/meta-intelligence/feature-flags";
import { ActButton, FeatureEditForm } from "../../client";

// One record in the Meta Feature Registry, with every previous version.

export const dynamic = "force-dynamic";

export default async function FeaturePage({ params }: PageProps<"/aios/meta-intelligence/features/[key]">) {
  const { key } = await params;
  const featureKey = decodeURIComponent(key);
  const f = await db.platformFeature.findUnique({ where: { platform_featureKey: { platform: "META", featureKey } } });
  if (!f) notFound();
  const [history, impact, flag, usedBy] = await Promise.all([
    knowledgeHistory("feature", featureKey),
    f.deprecated ? deprecationImpact(featureKey) : null,
    db.platformFeatureFlag.findUnique({ where: { key: flagKeyFor(featureKey) } }),
    db.mairoCampaign.count({ where: { metaFeatures: { has: featureKey }, status: { in: ["ACTIVE", "PAUSED", "PENDING_REVIEW"] } } }),
  ]);
  const map = mappingOf(f.mairoMapping);
  const rows: [string, string][] = [
    ["Feature ID", f.featureKey],
    ["Category", f.category],
    ["Meta API version", f.apiVersion ?? "—"],
    ["Campaign objectives", f.objectives.join(", ") || "—"],
    ["Optimization goals", f.optimizationGoals.join(", ") || "—"],
    ["Placements", f.placements.join(", ") || "—"],
    ["Creative formats", f.creativeFormats.join(", ") || "—"],
    ["Required permissions", f.permissions.join(", ") || "—"],
    ["Required account type", f.accountType ?? "—"],
    ["Availability", `${f.availability}${f.betaStatus ? ` (${f.betaStatus})` : ""}`],
    ["Region restrictions", f.regionRestrictions.join(", ") || "None"],
    ["Deprecated", f.deprecated ? `Yes${f.deprecationDate ? `, ${f.deprecationDate.toISOString().slice(0, 10)}` : ""}` : "No"],
    ["Replacement", f.replacementKey ?? "—"],
    ["Last verified", f.lastVerifiedAt ? f.lastVerifiedAt.toISOString().slice(0, 10) : "Not yet"],
    ["Breaking-change risk", f.breakingRisk.toLowerCase()],
    ["Goals it can serve", f.goalFit.join(", ") || "—"],
    ["MAIRO systems", map.systems.join(", ") || "—"],
    ["Code", map.code.join(", ") || "—"],
    ["Campaigns using it", String(usedBy)],
    ["Feature flag", flag ? `${flag.key} (${flag.stage.toLowerCase()})` : "None"],
    ["Registry version", `v${f.version}`],
  ];
  return (
    <div className="space-y-5">
      <Link href="/aios/meta-intelligence?tab=registry" className="text-[13px] text-violet-bright hover:underline">← Feature Registry</Link>
      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Meta Feature Registry{f.aiCapability ? " · AI / automation" : ""}</p>
        <h1 className="mt-1 text-[22px] font-semibold text-white">{f.name} <Badge tone={f.mairoSupport === "SUPPORTED" ? "green" : f.mairoSupport === "DEPRECATED" ? "red" : f.mairoSupport === "TESTING" ? "yellow" : "neutral"}>MAIRO: {COMPATIBILITY_LABEL[f.mairoSupport as Compatibility]}</Badge></h1>
        <p className="mt-2 text-[14px] text-white/85">{f.description}</p>
        {f.notes && <p className="mt-1 text-[13px] text-muted">{f.notes}</p>}
        {f.sourceUrl && <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[12.5px] text-violet-bright underline">Official documentation</a>}
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-[13px] md:grid-cols-2">
          {rows.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-faint">{k}</dt><dd className="break-words text-white/85">{v}</dd></div>)}
        </dl>
        {!flag && f.aiCapability && <div className="mt-3"><ActButton label="Create a rollout flag (off)" run={{ flag: featureKey }} /></div>}
      </Card>
      {impact && (
        <Card>
          <h2 className="text-[16px] font-semibold text-white">Deprecation impact</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-white/80">{impact.plan.map((p) => <li key={p}>{p}</li>)}</ol>
        </Card>
      )}
      <Card>
        <h2 className="mb-3 text-[16px] font-semibold text-white">Edit</h2>
        <FeatureEditForm featureKey={featureKey} initial={{ availability: f.availability, regionRestrictions: f.regionRestrictions, deprecated: f.deprecated, deprecationDate: f.deprecationDate ? f.deprecationDate.toISOString().slice(0, 10) : "", replacementKey: f.replacementKey ?? "", notes: f.notes ?? "", support: f.mairoSupport }} />
        <p className="mt-2 text-[12px] text-faint">Marking a feature supported requires a passing contract run and a passing sandbox or test-account run after its last change.</p>
      </Card>
      <Card>
        <h2 className="mb-2 text-[16px] font-semibold text-white">History</h2>
        <ol className="space-y-1.5 text-[13px] text-white/80">
          {history.map((h) => <li key={h.id}>v{h.version} · {h.createdAt.toISOString().slice(0, 10)} · {h.changeNote ?? "—"} <span className="text-faint">({h.source}{h.supersededAt ? ", superseded" : ", current"})</span></li>)}
        </ol>
      </Card>
    </div>
  );
}
