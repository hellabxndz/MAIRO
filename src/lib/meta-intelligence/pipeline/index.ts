import { db } from "@/lib/db";
import { graphApiVersion } from "@/lib/meta/client";
import { PIPELINE, type PipelineStatus, type Risk, type Urgency } from "@/lib/platform-intelligence/types";
import { raiseAlert } from "../alerts";
import { compatibilityFor } from "../compatibility";
import { classify } from "../change-detector/diff";
import { ensureFlag } from "../feature-flags";
import { BASELINE_FEATURES, featuresMentioned } from "../feature-registry/baseline";
import { mappingOf, upsertFeature } from "../feature-registry/store";
import { recordKnowledge } from "../knowledge-base/store";
import { analyzeChange, proposalFrom, type Analysis, type Proposal, type RegistryEntry } from "../interpretation/analyze";
import { appendRelease } from "../release-log";
import { canMove, type GateContext, type TestEvidence } from "./rules";

// The safe update pipeline, stored. Each move is checked against the gates in
// rules.ts and written to the update's history with who made it. Production
// applies the structured proposal to the Feature Registry and the knowledge
// base — never code, never a customer's campaign — and writes the release log.

type History = { at: string; by: string; from?: string; to: string; note?: string }[];

function historyOf(json: string): History {
  try {
    return JSON.parse(json) as History;
  } catch {
    return [];
  }
}

export function parseAnalysis(json: string | null): Analysis | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Analysis;
  } catch {
    return null;
  }
}

export function parseProposal(json: string | null): Proposal | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Proposal;
  } catch {
    return null;
  }
}

async function registryEntries(): Promise<RegistryEntry[]> {
  const rows = await db.platformFeature.findMany({ where: { platform: "META" }, select: { featureKey: true, name: true, mairoSupport: true, mairoMapping: true, deprecated: true } });
  return rows.map((r) => ({ featureKey: r.featureKey, name: r.name, mairoSupport: r.mairoSupport, systems: mappingOf(r.mairoMapping).systems, deprecated: r.deprecated }));
}

/** Analyzes a detected update and writes its proposal: DETECTED → ANALYZED → PROPOSED. */
export async function analyzeUpdate(id: string, by = "meta-intelligence"): Promise<void> {
  const u = await db.platformUpdate.findUnique({ where: { id }, include: { source: true } });
  if (!u || !["DETECTED", "ANALYZED"].includes(u.status)) return;
  const registry = await registryEntries();
  const baseline = new Map(BASELINE_FEATURES.map((f) => [f.featureKey, f.terms]));
  const found = featuresMentioned(u.excerpt, registry.map((r) => ({ featureKey: r.featureKey, name: r.name, terms: baseline.get(r.featureKey) ?? [] })));
  // A feature already linked to the update (by the detector or an admin) leads.
  const mentioned = u.featureKey ? [u.featureKey, ...found.filter((k) => k !== u.featureKey)] : found;
  const analysis = await analyzeChange({ excerpt: u.excerpt, sourceName: u.source?.name ?? "MAIRO error monitoring", authority: u.source?.authority ?? "OFFICIAL", registry, mentioned, productionVersion: graphApiVersion() });
  const proposal = proposalFrom(analysis, registry, classify(u.excerpt).dates);
  const feature = registry.find((r) => r.featureKey === (analysis.featureKey ?? u.featureKey));
  const used = Boolean(feature && ["SUPPORTED", "PARTIALLY_SUPPORTED"].includes(feature.mairoSupport));
  // An error spike keeps its own type; everything else takes the analysis's reading.
  const changeType = u.changeType === "ERROR_SPIKE" ? u.changeType : analysis.changeType;
  const now = new Date().toISOString();
  const history = historyOf(u.historyJson);
  history.push({ at: now, by, from: u.status, to: "ANALYZED", note: analysis.by === "ai" ? "AI interpretation" : "Rule-based interpretation" });
  history.push({ at: now, by, from: "ANALYZED", to: "PROPOSED", note: `Proposal: ${proposal.kind}` });
  await db.platformUpdate.update({
    where: { id },
    data: {
      status: "PROPOSED",
      analysisJson: JSON.stringify(analysis),
      analyzedBy: analysis.by,
      proposalJson: JSON.stringify(proposal),
      changeType,
      // Retiring a feature changes what new campaigns are built with: that is
      // campaign creation, and it gets campaign-creation's testing.
      areas: [...new Set([...u.areas, ...analysis.areas, ...(proposal.registry?.action === "deprecate" ? ["campaign-creation", "live-campaigns"] : [])])],
      urgency: analysis.urgency,
      risk: analysis.risk,
      featureKey: analysis.featureKey ?? u.featureKey,
      compatibility: compatibilityFor({ changeType: changeType as never, status: "PROPOSED", featureSupport: (feature?.mairoSupport as never) ?? null, used }),
      historyJson: JSON.stringify(history),
    },
  });
  if (analysis.suspicious) {
    await raiseAlert({ key: `suspicious:${id}`, severity: "MEDIUM", title: "A monitored page contains instructions aimed at software", body: `"${u.title}" includes text that tries to instruct a reader. MAIRO ignored it; check the source is genuine.`, href: `/aios/meta-intelligence/updates/${id}` });
  }
  if (analysis.urgency === "CRITICAL" || analysis.urgency === "HIGH") {
    await raiseAlert({ key: `analysis:${id}:${analysis.urgency}`, severity: analysis.urgency, title: `Meta update needs review: ${u.title}`, body: analysis.whyItMatters, href: `/aios/meta-intelligence/updates/${id}` });
  }
}

/** Analyzes waiting updates, most urgent first. */
export async function analyzePending(limit = 5): Promise<number> {
  const rows = await db.platformUpdate.findMany({ where: { platform: "META", status: "DETECTED" }, orderBy: [{ detectedAt: "asc" }], take: 50, select: { id: true, urgency: true } });
  const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const picked = rows.sort((a, b) => (rank[a.urgency] ?? 9) - (rank[b.urgency] ?? 9)).slice(0, limit);
  for (const r of picked) await analyzeUpdate(r.id);
  return picked.length;
}

async function latestRuns(): Promise<{ contract: TestEvidence | null; sandbox: TestEvidence | null }> {
  const [contract, sandbox] = await Promise.all([
    db.platformTestRun.findFirst({ where: { platform: "META", mode: "CONTRACT", finishedAt: { not: null } }, orderBy: { startedAt: "desc" } }),
    db.platformTestRun.findFirst({ where: { platform: "META", mode: { in: ["SANDBOX", "MANUAL"] }, finishedAt: { not: null } }, orderBy: { startedAt: "desc" } }),
  ]);
  const ev = (r: typeof contract): TestEvidence | null => (r ? { at: r.finishedAt ?? r.startedAt, failed: r.failed, criticalFailed: r.criticalFailed, mode: r.mode as TestEvidence["mode"] } : null);
  return { contract: ev(contract), sandbox: ev(sandbox) };
}

export async function gateContext(u: { status: string; areas: string[]; risk: string; urgency: string; analysisJson: string | null; proposalJson: string | null; historyJson: string; detectedAt: Date }, now = new Date()): Promise<GateContext> {
  const runs = await latestRuns();
  const history = historyOf(u.historyJson);
  const entered = [...history].reverse().find((h) => h.to === u.status);
  return {
    status: u.status as PipelineStatus,
    areas: u.areas,
    risk: u.risk as Risk,
    urgency: u.urgency as Urgency,
    hasAnalysis: Boolean(u.analysisJson),
    proposalKind: parseProposal(u.proposalJson)?.kind ?? null,
    enteredAt: entered ? new Date(entered.at) : u.detectedAt,
    latestContract: runs.contract,
    latestSandbox: runs.sandbox,
    now,
  };
}

/** Moves an update through the pipeline, if the gates allow it. */
export async function moveUpdate(id: string, to: PipelineStatus, by: string, note?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = await db.platformUpdate.findUnique({ where: { id } });
  if (!u) return { ok: false, error: "No such update." };
  if (![...PIPELINE, "DISMISSED"].includes(to)) return { ok: false, error: "Unknown stage." };
  const gate = canMove(await gateContext(u), to);
  if (!gate.ok) return { ok: false, error: gate.reason };
  if (to === "PRODUCTION") {
    const applied = await applyToProduction(u.id, by);
    if (!applied.ok) return applied;
  }
  const history = historyOf(u.historyJson);
  history.push({ at: new Date().toISOString(), by, from: u.status, to, note: note?.slice(0, 500) });
  const feature = u.featureKey ? await db.platformFeature.findUnique({ where: { platform_featureKey: { platform: "META", featureKey: u.featureKey } }, select: { mairoSupport: true } }) : null;
  await db.platformUpdate.update({
    where: { id },
    data: { status: to, historyJson: JSON.stringify(history), compatibility: compatibilityFor({ changeType: u.changeType as never, status: to, featureSupport: (feature?.mairoSupport as never) ?? null, used: feature?.mairoSupport === "SUPPORTED" || feature?.mairoSupport === "PARTIALLY_SUPPORTED" }) },
  });
  return { ok: true };
}

/**
 * Production: the proposal's registry and knowledge changes, a flag (OFF) for
 * anything new, and a release-log entry. Nothing else — no code, no campaign.
 */
async function applyToProduction(id: string, by: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = await db.platformUpdate.findUnique({ where: { id } });
  const proposal = parseProposal(u?.proposalJson ?? null);
  if (!u || !proposal) return { ok: false, error: "There's no proposal to apply." };
  const mairoChanges: string[] = [];
  const r = proposal.registry;
  if (r) {
    if (r.action === "add") {
      await upsertFeature(r.featureKey, { name: r.name, category: u.changeType.replace(/_/g, " ").toLowerCase(), description: u.title, availability: r.availability, goalFit: r.goalFit, aiCapability: r.aiCapability, permissions: r.permissions, sourceUrl: u.sourceUrl, mairoSupport: "NOT_SUPPORTED", notes: "Added from a validated Meta update. Not used for customers until built, tested and flagged on." }, { source: u.sourceUrl ?? "Meta Intelligence", changeNote: `Added from update "${u.title}"`, updateId: u.id });
      mairoChanges.push(`Feature Registry: added ${r.name} (not supported yet).`);
    } else if (r.action === "deprecate") {
      await upsertFeature(r.featureKey, { deprecated: true, mairoSupport: "DEPRECATED", deprecationDate: r.deprecationDate ? new Date(`${r.deprecationDate}T00:00:00Z`) : null }, { source: u.sourceUrl ?? "Meta Intelligence", changeNote: `Deprecated per update "${u.title}"`, updateId: u.id });
      mairoChanges.push(`Feature Registry: ${r.name} deprecated — new campaigns no longer use it; existing campaigns are untouched.`);
    } else if (r.action === "update") {
      await upsertFeature(r.featureKey, { ...(r.availability !== "UNKNOWN" ? { availability: r.availability } : {}), ...(r.goalFit.length ? { goalFit: r.goalFit } : {}), sourceUrl: u.sourceUrl }, { source: u.sourceUrl ?? "Meta Intelligence", changeNote: `Updated per update "${u.title}"`, updateId: u.id });
      mairoChanges.push(`Feature Registry: ${r.name} updated.`);
    }
  }
  if (proposal.knowledge) {
    const k = await recordKnowledge({ topic: proposal.knowledge.topic, key: proposal.knowledge.key, summary: proposal.knowledge.summary, data: { updateId: u.id, sourceUrl: u.sourceUrl }, source: u.sourceUrl ?? "Meta Intelligence", confidence: "MEDIUM", changeNote: `From update "${u.title}"`, updateId: u.id, verifiedAt: new Date() });
    if (k.changed) mairoChanges.push(proposal.knowledge.topic === "strategy" ? `Strategy Engine knowledge: ${proposal.knowledge.summary}` : `Knowledge base: ${proposal.knowledge.key} v${k.version}.`);
  }
  if (proposal.flagKey) {
    await ensureFlag({ key: proposal.flagKey, featureKey: r?.featureKey ?? null, description: `Rollout of ${r?.name ?? u.title}. Off until built and validated.` });
    mairoChanges.push(`Feature flag ${proposal.flagKey} created (off).`);
  }
  await appendRelease({ metaChanges: [u.title], mairoChanges: mairoChanges.length ? mairoChanges : ["No behaviour change; recorded for reference."], updateIds: [u.id], by });
  return { ok: true };
}

/**
 * Marks a registry feature as supported — only after it was validated: a
 * passing contract run with no critical failures and a passing sandbox or
 * recorded test-account run, both after the feature last changed.
 */
export async function validateFeature(featureKey: string, by: string, support: "SUPPORTED" | "PARTIALLY_SUPPORTED"): Promise<{ ok: true } | { ok: false; error: string }> {
  const f = await db.platformFeature.findUnique({ where: { platform_featureKey: { platform: "META", featureKey } } });
  if (!f) return { ok: false, error: "No such feature." };
  if (f.deprecated) return { ok: false, error: "A deprecated feature can't be marked supported." };
  const runs = await latestRuns();
  if (!runs.contract || runs.contract.criticalFailed > 0 || runs.contract.at < f.updatedAt) return { ok: false, error: "Run the Meta contract tests (no critical failures) after the feature's last change." };
  if (!runs.sandbox || runs.sandbox.failed > 0 || runs.sandbox.at < f.updatedAt) return { ok: false, error: "Record a passing sandbox or test-account run after the feature's last change." };
  await upsertFeature(featureKey, { mairoSupport: support, lastVerifiedAt: new Date() }, { source: `Validated by ${by}`, changeNote: `Marked ${support.toLowerCase().replace("_", " ")} after contract and sandbox tests.` });
  return { ok: true };
}
