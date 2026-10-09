import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Badge, Card } from "@/components/ui";
import { COMPATIBILITY_LABEL, PIPELINE, PIPELINE_LABEL, type Compatibility, type PipelineStatus } from "@/lib/platform-intelligence/types";
import { gateContext, parseAnalysis, parseProposal } from "@/lib/meta-intelligence/pipeline";
import { canMove, fastTrack, nextStep, sensitive } from "@/lib/meta-intelligence/pipeline/rules";
import { sandboxConfigured } from "@/lib/meta-intelligence/testing/run";
import { ActButton, ManualTestForm, MoveUpdate, SandboxForm } from "../../client";

// One Meta update: what changed, MAIRO's reading of it, the proposal, the
// test evidence, and where it is in the pipeline. The excerpt is shown as
// plain text — it's untrusted content from a web page.

export const dynamic = "force-dynamic";

const yes = (b: boolean) => (b ? "Yes" : "No");

export default async function UpdatePage({ params }: PageProps<"/aios/meta-intelligence/updates/[id]">) {
  const { id } = await params;
  const u = await db.platformUpdate.findUnique({ where: { id }, include: { source: true } });
  if (!u) notFound();
  const a = parseAnalysis(u.analysisJson);
  const p = parseProposal(u.proposalJson);
  const ctx = await gateContext(u);
  const stages = [...PIPELINE, "DISMISSED" as const]
    .filter((s) => s !== u.status)
    .map((s) => ({ value: s, label: `${PIPELINE_LABEL[s]}${canMove(ctx, s).ok ? "" : " (blocked)"}` }));
  const next = nextStep(ctx);
  const blocked = next ? canMove(ctx, next) : null;
  const history = JSON.parse(u.historyJson || "[]") as { at: string; by: string; from?: string; to: string; note?: string }[];
  return (
    <div className="space-y-5">
      <Link href="/aios/meta-intelligence?tab=updates" className="text-[13px] text-violet-bright hover:underline">← All updates</Link>
      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Meta update</p>
        <h1 className="mt-1 text-[22px] font-semibold text-white">{u.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-[12.5px]">
          <Badge tone={u.urgency === "CRITICAL" ? "red" : u.urgency === "HIGH" ? "yellow" : "neutral"}>Urgency: {u.urgency.toLowerCase()}</Badge>
          <Badge tone={u.risk === "BREAKING" ? "red" : u.risk === "POTENTIALLY_BREAKING" ? "yellow" : "neutral"}>Risk: {u.risk.toLowerCase().replace("_", " ")}</Badge>
          <Badge tone="blue">{PIPELINE_LABEL[u.status as PipelineStatus]}</Badge>
          <Badge tone={u.compatibility === "SUPPORTED" ? "green" : u.compatibility === "DEPRECATED" ? "red" : u.compatibility === "TESTING" ? "yellow" : "neutral"}>MAIRO: {COMPATIBILITY_LABEL[u.compatibility as Compatibility]}</Badge>
          {u.featureKey && <Link href={`/aios/meta-intelligence/features/${encodeURIComponent(u.featureKey)}`}><Badge>{u.featureKey}</Badge></Link>}
        </div>
        <p className="mt-3 text-[12.5px] text-faint">Detected {u.detectedAt.toLocaleString("en-US")} · {u.source ? <>{u.source.name} ({u.source.authority.toLowerCase()})</> : "MAIRO error monitoring"} {u.sourceUrl && <a href={u.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">source</a>}</p>
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] text-white/85">What the source says (untrusted text)</summary>
          <pre className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg bg-field-2 p-3 text-[12.5px] text-white/75">{u.excerpt}</pre>
        </details>
      </Card>

      {a ? (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold text-white">MAIRO&rsquo;s reading <span className="text-[12px] font-normal text-faint">({a.by === "ai" ? "AI interpretation" : "rule-based — AI unavailable"})</span></h2>
            <ActButton label="Re-analyze" run={{ analyze: u.id }} />
          </div>
          {a.suspicious && <p className="mt-2 rounded-lg bg-alert/10 px-3 py-2 text-[13px] text-alert">This text contains instructions aimed at software. MAIRO ignored them — check the source is genuine.</p>}
          <dl className="mt-3 grid gap-x-6 gap-y-3 text-[13.5px] md:grid-cols-2">
            <div><dt className="text-faint">What changed?</dt><dd className="text-white/90">{a.whatChanged}</dd></div>
            <div><dt className="text-faint">Why does it matter?</dt><dd className="text-white/90">{a.whyItMatters}</dd></div>
            <div><dt className="text-faint">Does MAIRO use this feature?</dt><dd className="text-white/90">{a.mairoUsesIt}</dd></div>
            <div><dt className="text-faint">Which MAIRO systems could be affected?</dt><dd className="text-white/90">{a.affectedSystems.join(", ") || "None identified"}</dd></div>
            <div><dt className="text-faint">Customer behaviour / backend / campaign logic / UI / strategy knowledge must change?</dt><dd className="text-white/90">{[a.needsChange.customerBehavior, a.needsChange.backendCode, a.needsChange.campaignLogic, a.needsChange.ui, a.needsChange.strategyKnowledge].map(yes).join(" / ")}</dd></div>
            <div><dt className="text-faint">Areas</dt><dd className="text-white/90">{u.areas.join(", ") || "—"}{sensitive(u.areas) ? " — sensitive: needs sandbox testing" : ""}</dd></div>
          </dl>
          <h3 className="mt-5 text-[14px] font-medium text-white">Evaluation</h3>
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-[13px] md:grid-cols-3">
            <div><dt className="text-faint">Available through the API?</dt><dd className="text-white/85">{a.evaluation.availableViaApi}</dd></div>
            <div><dt className="text-faint">Supported by MAIRO&rsquo;s API version?</dt><dd className="text-white/85">{a.evaluation.supportedByCurrentApiVersion}</dd></div>
            <div><dt className="text-faint">Availability</dt><dd className="text-white/85">{a.evaluation.availability}</dd></div>
            <div><dt className="text-faint">Goals it could help</dt><dd className="text-white/85">{a.evaluation.goalFit.join(", ") || "None stated"}</dd></div>
            <div><dt className="text-faint">Replaces something?</dt><dd className="text-white/85">{a.evaluation.replacesExisting ?? "No"}</dd></div>
            <div><dt className="text-faint">New permissions</dt><dd className="text-white/85">{a.evaluation.newPermissions.join(", ") || "None"}</dd></div>
            <div><dt className="text-faint">Expose to customers?</dt><dd className="text-white/85">{yes(a.evaluation.exposeToCustomers)}</dd></div>
            <div><dt className="text-faint">Reduces customer control?</dt><dd className="text-white/85">{yes(a.evaluation.reducesCustomerControl)}</dd></div>
            <div><dt className="text-faint">Conflicts with a MAIRO system?</dt><dd className="text-white/85">{a.evaluation.conflictsWithMairo ?? "No"}</dd></div>
          </dl>
          <p className="mt-2 text-[12px] text-faint">MAIRO never turns a new Meta feature on for customers automatically, whatever the analysis says.</p>
        </Card>
      ) : (
        <Card><p className="text-[13.5px] text-muted">Not analyzed yet.</p><div className="mt-2"><ActButton label="Analyze now" run={{ analyze: u.id }} primary /></div></Card>
      )}

      {p && (
        <Card>
          <h2 className="text-[16px] font-semibold text-white">Proposed integration plan <span className="text-[12px] font-normal text-faint">({p.kind}{fastTrack({ areas: u.areas, risk: u.risk as never, proposalKind: p.kind }) ? " · fast-track eligible" : ""})</span></h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px] text-white/85">{p.integrationPlan.map((s) => <li key={s}>{s}</li>)}</ol>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13px] md:grid-cols-2">
            <div><dt className="text-faint">Registry change on production</dt><dd className="text-white/85">{p.registry ? `${p.registry.action} ${p.registry.name} (${p.registry.featureKey})` : "None"}</dd></div>
            <div><dt className="text-faint">Knowledge on production</dt><dd className="text-white/85">{p.knowledge ? `${p.knowledge.topic}: ${p.knowledge.summary}` : "None"}</dd></div>
            <div><dt className="text-faint">Feature flag</dt><dd className="font-mono text-[12px] text-white/85">{p.flagKey ?? "None"}</dd></div>
            <div><dt className="text-faint">Strategy Engine lesson</dt><dd className="text-white/85">{p.strategyLesson ?? "None"}</dd></div>
          </dl>
          {p.suggestedCodeChanges && (
            <details className="mt-3"><summary className="cursor-pointer text-[13px] text-white/85">Suggested code changes (for developers — never executed)</summary><pre className="mt-2 whitespace-pre-wrap rounded-lg bg-field-2 p-3 text-[12.5px] text-white/75">{p.suggestedCodeChanges}</pre></details>
          )}
        </Card>
      )}

      <Card>
        <h2 className="text-[16px] font-semibold text-white">Pipeline</h2>
        <ol className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
          {PIPELINE.map((s) => {
            const i = PIPELINE.indexOf(s);
            const cur = PIPELINE.indexOf(u.status as (typeof PIPELINE)[number]);
            return <li key={s} className={`rounded-full px-2.5 py-1 ${s === u.status ? "bg-violet-500/30 text-white" : i < cur ? "bg-white/[0.06] text-white/70" : "border border-[color:var(--mairo-line)] text-faint"}`}>{PIPELINE_LABEL[s]}</li>;
          })}
        </ol>
        {next && <p className="mt-3 text-[13px] text-white/80">Next: <strong>{PIPELINE_LABEL[next]}</strong>{blocked && !blocked.ok ? <span className="text-amber-200/90"> — {blocked.reason}</span> : " — ready."}</p>}
        <div className="mt-3"><MoveUpdate id={u.id} next={next} stages={stages} /></div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div><h3 className="mb-2 text-[13.5px] font-medium text-white">Automated tests</h3><ActButton label="Run Meta contract tests" run="contract" /></div>
          <div><h3 className="mb-2 text-[13.5px] font-medium text-white">Sandbox / test account</h3><SandboxForm configured={sandboxConfigured()} updateId={u.id} /><div className="mt-3"><ManualTestForm updateId={u.id} /></div></div>
        </div>
        <p className="mt-4 text-[12px] text-faint">Production applies only the structured registry and knowledge changes above, creates any flag switched off, and writes the Update Log. It never changes code or a customer&rsquo;s live campaign.</p>
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-white">History</h2>
        <ol className="mt-2 space-y-1 text-[13px] text-white/80">
          {history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString("en-US")} — {h.by}: {h.from ? `${PIPELINE_LABEL[h.from as PipelineStatus] ?? h.from} → ` : ""}{PIPELINE_LABEL[h.to as PipelineStatus] ?? h.to}{h.note ? ` (${h.note})` : ""}</li>)}
        </ol>
      </Card>
    </div>
  );
}
