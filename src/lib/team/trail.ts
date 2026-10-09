import type { AgentRole, DecisionStatus } from "@/generated/prisma/enums";
import type { DecisionChange } from "@/lib/decisions/types";
import { agentForDecision, AGENT } from "./agents";

// How the AI team arrived at one recommendation, and what happened to it —
// step by step, from what was recorded: the daily review's own steps (the
// results read, the proposal, the limit check), the business's answer, what
// was carried out and what Meta confirmed, and what followed two weeks later.
// Nothing is inferred: a step with no record isn't shown. Pure; pinned by
// scripts/check-command-center.ts.

export type TrailActor = AgentRole | "OWNER" | "META";

export type TrailStep = {
  who: TrailActor;
  /** What it did, in a sentence from its own record. */
  did: string;
  at: Date | null;
  state: "done" | "waiting" | "failed";
  detail: string | null;
};

export type TrailRun = { id: string; agent: AgentRole; task: string; status: "RUNNING" | "DONE" | "NOTHING" | "FAILED"; summary: string | null; detail: string | null; decisionId: string | null; startedAt: Date; finishedAt: Date | null };

export type TrailDecision = {
  id: string;
  kind: string;
  category: string;
  title: string;
  status: DecisionStatus;
  automatic: boolean;
  source: string;
  createdAt: Date;
  decidedAt: Date | null;
  changes: DecisionChange[];
  result: { label: string; ok: boolean; error: string | null }[] | null;
  verdict: string | null;
  verdictNote: string | null;
  verdictAt: Date | null;
};

const at = (r: TrailRun) => r.finishedAt ?? r.startedAt;
const step = (who: TrailActor, did: string, when: Date | null, state: TrailStep["state"] = "done", detail: string | null = null): TrailStep => ({ who, did, at: when, state, detail });

/** Every specialist that contributed, in order, with what each did. */
export function buildTrail(d: TrailDecision, reviewSteps: TrailRun[], decisionRuns: TrailRun[]): TrailStep[] {
  const owner = agentForDecision(d.kind, d.category);
  const out: TrailStep[] = [];
  const touchesMoney = d.changes.some((c) => c.type === "set-budget");

  // 1. The results it was based on.
  const read = reviewSteps.find((r) => r.agent === "ANALYST" && r.task === "read-results" && r.summary);
  if (read) out.push(step("ANALYST", read.summary!, at(read), "done", read.detail));

  // 2. Who proposed it — the review's own line, or the step that names it.
  const named = reviewSteps.filter((r) => r.decisionId === d.id && r.summary);
  const proposal = reviewSteps.find((r) => r.agent === owner && r.task === "recommend" && r.summary);
  if (proposal) out.push(step(owner, proposal.summary!, at(proposal)));
  else if (!named.some((r) => r.agent === owner)) out.push(step(owner, d.source === "assistant" ? `Proposed this when you asked: ${d.title}` : `Recommended: ${d.title}`, d.createdAt));
  for (const r of named) out.push(step(r.agent, r.summary!, at(r), r.status === "FAILED" ? "failed" : "done", r.detail));

  // 3. The Budget Guardian's check of the proposals against the limits.
  const guard = reviewSteps.find((r) => r.agent === "GUARDIAN" && r.task === "check-limits" && r.summary);
  if (guard && (touchesMoney || !named.some((r) => r.agent === "GUARDIAN"))) out.push(step("GUARDIAN", guard.summary!, at(guard), "done", guard.detail));

  // 4. The business's answer.
  if (d.status === "PENDING") out.push(step("OWNER", "Waiting for your approval. Nothing changes on Meta until you approve.", null, "waiting"));
  else if (d.status === "REJECTED") out.push(step("OWNER", "You declined it.", d.decidedAt));
  else if (d.status === "IGNORED") out.push(step("OWNER", "You set it aside.", d.decidedAt));
  else if (d.status === "EXPIRED") out.push(step("OWNER", "The situation passed before it was decided, so it was withdrawn.", d.decidedAt));
  else if (d.automatic) out.push(step("OWNER", "Allowed by the automation level you chose — made within your limits.", d.decidedAt));
  else out.push(step("OWNER", "You approved it.", d.decidedAt));

  // 5. Carrying it out: the checks and changes recorded against it.
  for (const r of decisionRuns.filter((x) => x.summary && !named.some((n) => n.id === x.id))) {
    out.push(step(r.agent, r.summary!, at(r), r.status === "FAILED" ? "failed" : "done", r.detail));
  }

  // 6. What Meta confirmed — success is only ever what Meta accepted.
  if ((d.status === "APPLIED" || d.status === "FAILED") && d.result?.length) {
    const ok = d.result.filter((r) => r.ok).length;
    const refused = d.result.find((r) => !r.ok);
    if (ok) out.push(step("META", `Meta confirmed ${ok === 1 ? "the change" : `${ok} changes`}.`, d.decidedAt));
    if (refused) out.push(step("META", `Meta refused ${refused.label.toLowerCase()}: ${refused.error ?? "no reason given"}. Nothing was left half-changed.`, d.decidedAt, "failed"));
  }

  // 7. What followed.
  if (d.verdictAt) out.push(step("ANALYST", d.verdictNote ?? "Compared the two weeks before with the two weeks after.", d.verdictAt));
  else if (d.status === "APPLIED") out.push(step("ANALYST", "Compares results two weeks after the change, and tells you what followed.", null, "waiting"));

  return out;
}

/** The specialists that contributed, in order of first appearance. */
export function contributors(trail: TrailStep[]): AgentRole[] {
  const seen: AgentRole[] = [];
  for (const s of trail) if (s.who !== "OWNER" && s.who !== "META" && !seen.includes(s.who)) seen.push(s.who);
  return seen;
}

export const actorName = (who: TrailActor) => (who === "OWNER" ? "You" : who === "META" ? "Meta" : AGENT[who].name);
