import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { graphApiVersion } from "@/lib/meta/client";
import { COMPATIBILITY_LABEL, FLAG_STAGES, FLAG_STAGE_LABEL, PIPELINE_LABEL, type Compatibility, type PipelineStatus } from "@/lib/platform-intelligence/types";
import { listVersions } from "@/lib/meta-intelligence/api-versioning";
import { deprecationImpact } from "@/lib/meta-intelligence/deprecations";
import { sandboxConfigured } from "@/lib/meta-intelligence/testing/run";
import { CONTRACT_TESTS } from "@/lib/meta-intelligence/testing/contract";
import { ActButton, FlagForm, ManualTestForm, SandboxForm, SourceForms } from "./client";

// AIOS → Meta Intelligence: what Meta changed, what it means for MAIRO, where
// each change is in the safe update pipeline, and the controls (tests, flags,
// versions, registry) that decide when MAIRO uses anything new.

export const dynamic = "force-dynamic";

const TABS = [
  ["overview", "Overview"],
  ["updates", "Updates"],
  ["registry", "Feature Registry"],
  ["testing", "Testing"],
  ["flags", "Feature Flags"],
  ["versions", "API Versions"],
  ["deprecations", "Deprecations"],
  ["errors", "Errors"],
  ["sources", "Sources"],
  ["log", "Update Log"],
] as const;

const FILTERS = [
  ["all", "Latest"],
  ["critical", "Critical"],
  ["new", "New features"],
  ["api", "API changes"],
  ["deprecations", "Deprecations"],
  ["ai", "AI advertising"],
  ["permissions", "Permissions"],
  ["pending", "Pending integrations"],
] as const;

const TONE: Record<string, "red" | "yellow" | "blue" | "neutral" | "green"> = { CRITICAL: "red", HIGH: "yellow", MEDIUM: "blue", LOW: "neutral" };
const COMPAT_TONE: Record<string, "red" | "yellow" | "blue" | "neutral" | "green"> = { SUPPORTED: "green", PARTIALLY_SUPPORTED: "blue", TESTING: "yellow", NOT_SUPPORTED: "neutral", DEPRECATED: "red", NOT_APPLICABLE: "neutral" };
const fmt = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

function updateWhere(filter: string) {
  const open = { status: { notIn: ["PRODUCTION", "DISMISSED"] } };
  switch (filter) {
    case "critical":
      return { urgency: { in: ["CRITICAL", "HIGH"] }, ...open };
    case "new":
      return { changeType: { in: ["NEW_FEATURE", "NEW_FIELD", "NEW_ENDPOINT", "AUTOMATION_OPTION"] } };
    case "api":
      return { changeType: { in: ["API_VERSION_RELEASE", "API_VERSION_DEPRECATION", "NEW_ENDPOINT", "REMOVED_ENDPOINT", "NEW_FIELD", "REMOVED_FIELD", "ERROR_SPIKE"] } };
    case "deprecations":
      return { changeType: { in: ["DEPRECATED_FEATURE", "REMOVED_FEATURE", "RENAMED_FEATURE", "API_VERSION_DEPRECATION"] } };
    case "ai":
      return { changeType: { in: ["AI_CAPABILITY", "ADVANTAGE_PLUS_CHANGE", "AUTOMATION_OPTION"] } };
    case "permissions":
      return { changeType: "PERMISSION_CHANGE" };
    case "pending":
      return { status: { in: ["PROPOSED", "DEVELOPMENT", "AUTOMATED_TESTING", "SANDBOX_TESTING", "APPROVED"] } };
    default:
      return {};
  }
}

export default async function MetaIntelligencePage({ searchParams }: PageProps<"/aios/meta-intelligence">) {
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" ? sp.tab : "overview") as (typeof TABS)[number][0];
  const filter = typeof sp.filter === "string" ? sp.filter : "all";
  const ready = (await db.platformSource.count({ where: { platform: "META" } })) > 0;

  return (
    <div>
      <PageHeader
        title="Meta Intelligence"
        description="Keeps MAIRO aligned with Meta: detects changes in official sources, explains what they mean for MAIRO, and moves each one through testing before anything changes — never touching customers' live campaigns."
        action={<ActButton label={ready ? "Re-check setup" : "Set up Meta Intelligence"} run="setup" primary={!ready} />}
      />
      <nav aria-label="Meta Intelligence sections" className="mb-6 flex flex-wrap gap-1.5">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`/aios/meta-intelligence?tab=${key}`} aria-current={tab === key ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-[13px] ${tab === key ? "bg-white/[0.12] text-white" : "text-muted hover:text-white"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {!ready ? (
        <EmptyState title="Not set up yet" description="Set it up to seed Meta's official sources, the Feature Registry (every Meta capability MAIRO relies on) and the production API version." />
      ) : tab === "updates" ? (
        <Updates filter={filter} />
      ) : tab === "registry" ? (
        <Registry />
      ) : tab === "testing" ? (
        <Testing />
      ) : tab === "flags" ? (
        <Flags />
      ) : tab === "versions" ? (
        <Versions />
      ) : tab === "deprecations" ? (
        <Deprecations />
      ) : tab === "errors" ? (
        <Errors />
      ) : tab === "sources" ? (
        <Sources />
      ) : tab === "log" ? (
        <Log />
      ) : (
        <Overview />
      )}
    </div>
  );
}

function UpdateCard({ u }: { u: { id: string; title: string; detectedAt: Date; status: string; urgency: string; compatibility: string; areas: string[]; changeType: string; analysisJson: string | null } }) {
  let recommendation = "";
  try {
    const a = u.analysisJson ? (JSON.parse(u.analysisJson) as { whyItMatters?: string }) : null;
    recommendation = a?.whyItMatters ?? "";
  } catch {
    recommendation = "";
  }
  return (
    <Link href={`/aios/meta-intelligence/updates/${u.id}`} className="block rounded-xl border border-[color:var(--mairo-line)] p-4 transition hover:border-[color:var(--mairo-line-lit)]">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Meta update · {u.changeType.replace(/_/g, " ").toLowerCase()}</p>
      <p className="mt-1 text-[14.5px] font-medium text-white">{u.title}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-4">
        <div><dt className="text-faint">Detected</dt><dd className="text-white/85">{fmt(u.detectedAt)}</dd></div>
        <div><dt className="text-faint">Status</dt><dd className="text-white/85">{PIPELINE_LABEL[u.status as PipelineStatus] ?? u.status}</dd></div>
        <div><dt className="text-faint">Impact</dt><dd className="text-white/85">{u.areas.slice(0, 2).join(", ") || "—"}</dd></div>
        <div><dt className="text-faint">MAIRO compatibility</dt><dd><Badge tone={COMPAT_TONE[u.compatibility]}>{COMPATIBILITY_LABEL[u.compatibility as Compatibility] ?? u.compatibility}</Badge></dd></div>
      </dl>
      <div className="mt-2 flex items-center gap-2">
        <Badge tone={TONE[u.urgency]}>{u.urgency.toLowerCase()}</Badge>
        {recommendation && <p className="line-clamp-1 text-[12.5px] text-muted">{recommendation}</p>}
      </div>
    </Link>
  );
}

async function Overview() {
  const [critical, latest, alerts, lastContract, features, open] = await Promise.all([
    db.platformUpdate.findMany({ where: { platform: "META", urgency: { in: ["CRITICAL", "HIGH"] }, status: { notIn: ["PRODUCTION", "DISMISSED"] } }, orderBy: { detectedAt: "desc" }, take: 5 }),
    db.platformUpdate.findMany({ where: { platform: "META" }, orderBy: { detectedAt: "desc" }, take: 6 }),
    db.platformAdminAlert.findMany({ where: { platform: "META", readAt: null }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.platformTestRun.findFirst({ where: { platform: "META", mode: "CONTRACT", finishedAt: { not: null } }, orderBy: { startedAt: "desc" } }),
    db.platformFeature.groupBy({ by: ["mairoSupport"], where: { platform: "META" }, _count: { _all: true } }),
    db.platformUpdate.count({ where: { platform: "META", status: { notIn: ["PRODUCTION", "DISMISSED"] } } }),
  ]);
  const versions = await listVersions();
  const prod = versions.find((v) => v.version === graphApiVersion());
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-[12.5px] text-muted">Open updates</p><p className="mt-1 text-[26px] font-semibold text-white">{open}</p><p className="text-[12px] text-faint">{critical.length} critical or high</p></Card>
        <Card><p className="text-[12.5px] text-muted">Production API</p><p className="mt-1 text-[26px] font-semibold text-white">{graphApiVersion()}</p><p className="text-[12px] text-faint">{prod?.retiresAt ? `Retires ${fmt(prod.retiresAt)}` : "Retirement date not known yet"}</p></Card>
        <Card><p className="text-[12.5px] text-muted">Meta contract tests</p><p className="mt-1 text-[26px] font-semibold text-white">{lastContract ? `${lastContract.passed}/${lastContract.passed + lastContract.failed}` : "—"}</p><p className={`text-[12px] ${lastContract?.criticalFailed ? "text-alert" : "text-faint"}`}>{lastContract ? (lastContract.criticalFailed ? `${lastContract.criticalFailed} critical failing — production blocked` : `Passed ${fmt(lastContract.finishedAt)}`) : "Not run yet"}</p></Card>
        <Card><p className="text-[12.5px] text-muted">MAIRO compatibility</p><div className="mt-2 flex flex-wrap gap-1.5">{features.map((f) => <Badge key={f.mairoSupport} tone={COMPAT_TONE[f.mairoSupport]}>{f._count._all} {COMPATIBILITY_LABEL[f.mairoSupport as Compatibility]?.toLowerCase()}</Badge>)}</div></Card>
      </div>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-white">Alerts</h2>
          {alerts.length > 0 && <ActButton label="Mark all read" run="alerts-read" />}
        </div>
        {alerts.length === 0 ? <p className="mt-2 text-[13px] text-muted">Nothing needs attention.</p> : (
          <ul className="mt-3 space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-lg bg-white/[0.03] px-3 py-2">
                <p className="flex items-center gap-2 text-[13.5px] text-white"><Badge tone={TONE[a.severity]}>{a.severity.toLowerCase()}</Badge>{a.href ? <Link href={a.href} className="hover:underline">{a.title}</Link> : a.title}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <section>
        <h2 className="mb-3 text-[16px] font-semibold text-white">Critical updates</h2>
        {critical.length === 0 ? <p className="text-[13px] text-muted">None open.</p> : <div className="grid gap-3 lg:grid-cols-2">{critical.map((u) => <UpdateCard key={u.id} u={u} />)}</div>}
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[16px] font-semibold text-white">Latest updates</h2><Link href="/aios/meta-intelligence?tab=updates" className="text-[13px] text-violet-bright hover:underline">All updates</Link></div>
        {latest.length === 0 ? <EmptyState title="No changes detected yet" description="The first check of each source stores a baseline; changes are filed from the next check. Run a check from Sources, or wait for the daily run." /> : <div className="grid gap-3 lg:grid-cols-2">{latest.map((u) => <UpdateCard key={u.id} u={u} />)}</div>}
      </section>
    </div>
  );
}

async function Updates({ filter }: { filter: string }) {
  const rows = await db.platformUpdate.findMany({ where: { platform: "META", ...updateWhere(filter) }, orderBy: { detectedAt: "desc" }, take: 60 });
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map(([key, label]) => (
          <Link key={key} href={`/aios/meta-intelligence?tab=updates&filter=${key}`} className={`rounded-full border px-3 py-1 text-[12.5px] ${filter === key ? "border-violet-400 text-white" : "border-[color:var(--mairo-line)] text-muted hover:text-white"}`}>{label}</Link>
        ))}
      </div>
      {rows.length === 0 ? <EmptyState title="Nothing here" /> : <div className="grid gap-3 lg:grid-cols-2">{rows.map((u) => <UpdateCard key={u.id} u={u} />)}</div>}
    </div>
  );
}

async function Registry() {
  const rows = await db.platformFeature.findMany({ where: { platform: "META" }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[860px] text-left text-[13px]">
        <thead className="text-[11px] uppercase tracking-[0.12em] text-faint">
          <tr>{["Feature", "Category", "Availability", "MAIRO support", "Breaking risk", "Last verified", "Goals"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id} className="border-t border-[color:var(--mairo-line)]">
              <td className="px-4 py-2.5"><Link href={`/aios/meta-intelligence/features/${encodeURIComponent(f.featureKey)}`} className="font-medium text-white hover:underline">{f.name}</Link><p className="font-mono text-[11px] text-faint">{f.featureKey}{f.aiCapability ? " · AI" : ""}</p></td>
              <td className="px-4 py-2.5 text-white/80">{f.category}</td>
              <td className="px-4 py-2.5 text-white/80">{f.availability}{f.deprecated ? " · deprecated" : ""}</td>
              <td className="px-4 py-2.5"><Badge tone={COMPAT_TONE[f.mairoSupport]}>{COMPATIBILITY_LABEL[f.mairoSupport as Compatibility]}</Badge></td>
              <td className="px-4 py-2.5 text-white/80">{f.breakingRisk.toLowerCase()}</td>
              <td className="px-4 py-2.5 text-white/80">{fmt(f.lastVerifiedAt)}</td>
              <td className="px-4 py-2.5 text-white/70">{f.goalFit.join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

async function Testing() {
  const runs = await db.platformTestRun.findMany({ where: { platform: "META" }, orderBy: { startedAt: "desc" }, take: 12 });
  const last = runs.find((r) => r.mode === "CONTRACT" && r.finishedAt);
  const results = last ? (JSON.parse(last.resultsJson) as { name: string; ok: boolean; critical: boolean; error: string | null; area: string }[]) : [];
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-white">Meta contract tests</h2>
            <p className="text-[12.5px] text-muted">{CONTRACT_TESTS.length} tests of MAIRO&rsquo;s real Meta request code against a stubbed Meta: authentication, permissions, ad account, campaign, ad set, creative and ad creation, status, budgets, optimization, placements, media, insights, pagination, tokens, errors and API version. Critical failures block production — and the deploy build.</p>
          </div>
          <ActButton label="Run contract tests" run="contract" primary />
        </div>
        {results.length > 0 && (
          <ul className="mt-4 grid gap-1.5 md:grid-cols-2">
            {results.map((r) => (
              <li key={r.name} className="flex items-start gap-2 text-[13px]">
                <span aria-hidden className={r.ok ? "text-emerald-300" : r.critical ? "text-alert" : "text-amber-200"}>{r.ok ? "✓" : "✕"}</span>
                <span className="min-w-0 text-white/85">{r.name}{!r.ok && <span className="block text-[12px] text-alert">{r.error}</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="text-[16px] font-semibold text-white">Sandbox / test account</h2>
        <p className="mb-3 text-[12.5px] text-muted">Live checks on a Meta test or sandbox ad account: permissions, account, create and delete a paused campaign, insights. Optionally against a candidate API version. Never a customer&rsquo;s account.</p>
        <SandboxForm configured={sandboxConfigured()} />
        <div className="mt-5"><ManualTestForm /></div>
      </Card>
      <Card>
        <h2 className="mb-3 text-[16px] font-semibold text-white">Recent runs</h2>
        {runs.length === 0 ? <p className="text-[13px] text-muted">No runs yet.</p> : (
          <ul className="space-y-1.5 text-[13px]">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-white/85">
                <Badge tone={r.criticalFailed ? "red" : r.failed ? "yellow" : "green"}>{r.mode.toLowerCase()}</Badge>
                {fmt(r.startedAt)} · {r.apiVersion} · {r.passed} passed, {r.failed} failed{r.ranBy ? ` · ${r.ranBy}` : ""}{r.notes ? ` · ${r.notes.slice(0, 80)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

async function Flags() {
  const [flags, features] = await Promise.all([
    db.platformFeatureFlag.findMany({ where: { platform: "META" }, orderBy: { key: "asc" } }),
    db.platformFeature.findMany({ where: { platform: "META", aiCapability: true }, select: { featureKey: true, name: true } }),
  ]);
  const flagged = new Set(flags.map((f) => f.featureKey));
  const stages = FLAG_STAGES.map((s) => ({ value: s, label: FLAG_STAGE_LABEL[s] }));
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">Every new Meta capability ships off, then Internal testing → Selected accounts → All eligible accounts. Setting a flag back to Off is the rollback. A flag never makes an ineligible account eligible.</p>
      {flags.length === 0 && <EmptyState title="No flags yet" description="A flag is created (off) when a new capability's update reaches production, or from a registry feature below." />}
      {flags.map((f) => (
        <Card key={f.id}>
          <p className="font-mono text-[13px] text-white">{f.key} <Badge tone={f.stage === "OFF" ? "neutral" : f.stage === "ALL_ELIGIBLE" ? "green" : "yellow"}>{FLAG_STAGE_LABEL[f.stage as keyof typeof FLAG_STAGE_LABEL]}</Badge></p>
          <p className="mb-3 mt-1 text-[12.5px] text-muted">{f.description}{f.updatedBy ? ` · last changed by ${f.updatedBy}` : ""}</p>
          <FlagForm flagKey={f.key} stage={f.stage} internal={f.internalOrgIds} selected={f.selectedOrgIds} stages={stages} />
        </Card>
      ))}
      <Card>
        <h3 className="text-[14px] font-medium text-white">Create a flag for a Meta AI / automation feature</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {features.filter((f) => !flagged.has(f.featureKey)).map((f) => <li key={f.featureKey}><ActButton label={f.name} run={{ flag: f.featureKey }} /></li>)}
        </ul>
      </Card>
    </div>
  );
}

async function Versions() {
  const rows = await listVersions();
  const production = graphApiVersion();
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">MAIRO runs Meta API <strong className="text-white">{production}</strong> (META_GRAPH_API_VERSION, default in metaCapabilities). Dates come only from Meta&rsquo;s official version page or an administrator. Upgrades happen by deployment after contract and sandbox tests pass on the new version.</p>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-[0.12em] text-faint"><tr>{["Version", "Status", "Released", "Retires", "Migration", "Source"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className="border-t border-[color:var(--mairo-line)]">
                <td className="px-4 py-2.5 font-mono text-white">{v.version}</td>
                <td className="px-4 py-2.5"><Badge tone={v.status === "PRODUCTION" ? "green" : v.status === "RETIRED" ? "red" : v.status === "CANDIDATE" ? "yellow" : "neutral"}>{v.status.toLowerCase()}</Badge></td>
                <td className="px-4 py-2.5 text-white/80">{fmt(v.releasedAt)}</td>
                <td className="px-4 py-2.5 text-white/80">{fmt(v.retiresAt)}</td>
                <td className="px-4 py-2.5 text-white/80">{v.migrationStatus.toLowerCase().replace("_", " ")}</td>
                <td className="max-w-[240px] truncate px-4 py-2.5 text-faint">{v.retiresSource ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <h3 className="text-[14px] font-medium text-white">Record a retirement date or migration status</h3>
        <VersionFormServer production={production} />
      </Card>
    </div>
  );
}

function VersionFormServer({ production }: { production: string }) {
  return (
    <form
      action={async (fd: FormData) => {
        "use server";
        const { setVersionDatesAction } = await import("@/lib/actions/meta-intelligence-actions");
        await setVersionDatesAction(String(fd.get("version") ?? ""), String(fd.get("retiresAt") ?? ""), String(fd.get("migration") ?? "NOT_STARTED"));
      }}
      className="mt-2 grid gap-2 md:grid-cols-[140px_180px_180px_auto]"
    >
      <input name="version" defaultValue={production} className="rounded-xl border border-[color:var(--mairo-line)] bg-[rgba(var(--mairo-bg-rgb),0.6)] px-3 py-2 text-sm text-white" aria-label="Version" />
      <input name="retiresAt" placeholder="Retires YYYY-MM-DD" className="rounded-xl border border-[color:var(--mairo-line)] bg-[rgba(var(--mairo-bg-rgb),0.6)] px-3 py-2 text-sm text-white" aria-label="Retirement date" />
      <select name="migration" className="rounded-xl border border-[color:var(--mairo-line)] bg-[rgba(var(--mairo-bg-rgb),0.6)] px-3 py-2 text-sm text-white" aria-label="Migration status">{["NOT_STARTED", "TESTING", "PASSED", "MIGRATED"].map((m) => <option key={m}>{m}</option>)}</select>
      <button className="rounded-full border border-[color:var(--mairo-line)] px-4 py-2 text-sm text-white/85 hover:text-white">Save</button>
    </form>
  );
}

async function Deprecations() {
  const rows = await db.platformFeature.findMany({ where: { platform: "META", deprecated: true }, select: { featureKey: true } });
  const impacts = (await Promise.all(rows.map((r) => deprecationImpact(r.featureKey)))).filter(Boolean);
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">When Meta retires something, new campaigns stop using it immediately; existing campaigns keep running while Meta supports them and move only with approval.</p>
      {impacts.length === 0 ? <EmptyState title="No deprecated features" /> : impacts.map((d) => (
        <Card key={d!.featureKey}>
          <p className="text-[15px] font-semibold text-white">{d!.name} <span className="font-mono text-[12px] text-faint">{d!.featureKey}</span></p>
          <dl className="mt-2 grid gap-2 text-[13px] sm:grid-cols-4">
            <div><dt className="text-faint">Meta&rsquo;s date</dt><dd className="text-white/85">{d!.deprecationDate ?? "Not announced"}</dd></div>
            <div><dt className="text-faint">Replacement</dt><dd className="text-white/85">{d!.replacement ? `${d!.replacement.name} (${d!.replacement.support.toLowerCase()})` : "None recorded"}</dd></div>
            <div><dt className="text-faint">Customer campaigns</dt><dd className="text-white/85">{d!.campaigns.active} active, {d!.campaigns.paused} other ({d!.campaigns.organizations} businesses)</dd></div>
            <div><dt className="text-faint">Systems</dt><dd className="text-white/85">{d!.systems.join(", ") || "—"}</dd></div>
          </dl>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] text-white/80">{d!.plan.map((p) => <li key={p}>{p}</li>)}</ol>
        </Card>
      ))}
    </div>
  );
}

async function Errors() {
  const rows = await db.platformApiError.findMany({ where: { platform: "META" }, orderBy: { lastAt: "desc" }, take: 50 });
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">Every Graph error MAIRO receives, grouped by code, endpoint and method, with how many accounts it hit (hashed — never a token). An unfamiliar error spreading across accounts is flagged as a possible Meta API behavior change.</p>
      {rows.length === 0 ? <EmptyState title="No Meta errors recorded" /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[880px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-faint"><tr>{["Error", "Endpoint", "Version", "Count", "Accounts", "First", "Last", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-t border-[color:var(--mairo-line)] align-top">
                  <td className="max-w-[300px] px-4 py-2.5 text-white/85"><span className="font-mono text-[12px] text-faint">{e.code ?? "?"}{e.subcode ? `/${e.subcode}` : ""}</span> {e.message.slice(0, 140)}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-white/75">{e.method} {e.endpoint}</td>
                  <td className="px-4 py-2.5 text-white/75">{e.apiVersion}</td>
                  <td className="px-4 py-2.5 text-white/85">{e.count}</td>
                  <td className="px-4 py-2.5 text-white/85">{new Set(e.accountKeys).size}</td>
                  <td className="px-4 py-2.5 text-white/75">{fmt(e.firstAt)}</td>
                  <td className="px-4 py-2.5 text-white/75">{fmt(e.lastAt)}</td>
                  <td className="px-4 py-2.5">{e.flagged && (e.updateId ? <Link href={`/aios/meta-intelligence/updates/${e.updateId}`}><Badge tone="red">possible change</Badge></Link> : <Badge tone="red">possible change</Badge>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

async function Sources() {
  const rows = await db.platformSource.findMany({ where: { platform: "META" }, orderBy: [{ authority: "asc" }, { name: "asc" }] });
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">Official Meta sources have the highest authority. Pages are fetched over https from allowlisted hosts only, as plain text, and never followed or obeyed. Nothing changes MAIRO&rsquo;s behaviour based on a blog, a social post or a rumor.</p>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-[0.12em] text-faint"><tr>{["Source", "Kind", "Authority", "Last checked", "Last changed", "", ""].map((h, i) => <th key={i} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-[color:var(--mairo-line)] align-top">
                <td className="px-4 py-2.5"><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-white hover:underline">{s.name}</a>{s.lastError && <p className="text-[12px] text-amber-200/90">{s.lastError}</p>}{!s.active && <p className="text-[12px] text-faint">Paused</p>}</td>
                <td className="px-4 py-2.5 text-white/75">{s.kind.toLowerCase().replace("_", " ")}</td>
                <td className="px-4 py-2.5"><Badge tone={s.authority === "OFFICIAL" ? "green" : "blue"}>{s.authority.toLowerCase()}</Badge></td>
                <td className="px-4 py-2.5 text-white/75">{fmt(s.lastCheckedAt)}</td>
                <td className="px-4 py-2.5 text-white/75">{fmt(s.lastChangedAt)}</td>
                <td className="px-4 py-2.5"><ActButton label="Check now" run={{ check: s.id }} /></td>
                <td className="px-4 py-2.5"><ActButton label={s.active ? "Pause" : "Resume"} run={{ toggleSource: s.id, active: !s.active }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card><SourceForms sources={rows.map((s) => ({ id: s.id, name: s.name }))} /></Card>
    </div>
  );
}

async function Log() {
  const rows = await db.platformReleaseLog.findMany({ where: { platform: "META" }, orderBy: { createdAt: "desc" }, take: 40 });
  return rows.length === 0 ? <EmptyState title="No releases yet" description="Each update that reaches production adds a version here: what Meta changed, and what MAIRO changed because of it." /> : (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.id}>
          <p className="text-[15px] font-semibold text-white">Version {r.version} <span className="text-[12px] font-normal text-faint">· {fmt(r.createdAt)}{r.createdBy ? ` · ${r.createdBy}` : ""}</span></p>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <div><p className="text-[11px] uppercase tracking-[0.12em] text-faint">Meta changes</p><ul className="mt-1 space-y-1 text-[13px] text-white/85">{r.metaChanges.map((c) => <li key={c}>• {c}</li>)}</ul></div>
            <div><p className="text-[11px] uppercase tracking-[0.12em] text-faint">MAIRO changes</p><ul className="mt-1 space-y-1 text-[13px] text-white/85">{r.mairoChanges.map((c) => <li key={c}>• {c}</li>)}</ul></div>
          </div>
        </Card>
      ))}
    </div>
  );
}
