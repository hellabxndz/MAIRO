import { db } from "@/lib/db";
import type { AgentRole } from "@/generated/prisma/enums";
import { limitProblem } from "@/lib/decisions/guardrails";
import { persistDrafts } from "@/lib/decisions/store";
import type { DecisionInput } from "@/lib/decisions/types";
import { notify } from "@/lib/notifications/notify";
import { discardRun, finishRun, recordRun, startRun } from "@/lib/team/runs";
import { CoachReadError, gatherCoachInput } from "./gather";
import { diagnose } from "./diagnose";
import { judgeApprovedPlans, judgeAppliedChanges } from "./history";
import { persistFindings } from "./store";
import type { CoachResult, Finding } from "./types";

// One Performance Coach review: read the journey, investigate, save what was
// found, put any change on Meta up for approval through Mairo Decisions, look
// at what followed earlier changes — and record which specialists did what.
//
// The activity log is the work itself: a specialist appears only when a
// finding needed it, and its line says what it actually contributed. Inside
// the daily team review the lines join that review (and so the Daily Brief);
// run from the Coach page they sit under their own "coach-review".

const HREF = "/dashboard/coach";
const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** What each specialist did for the findings it worked on, in its own words. */
export function specialistLines(findings: Finding[], extra: { guardian?: string | null; architect?: string | null } = {}): { agent: AgentRole; summary: string }[] {
  const by = (role: AgentRole) => findings.filter((f) => f.agents.includes(role));
  const titles = (fs: Finding[]) => fs.slice(0, 2).map((f) => `"${f.title}"`).join(" and ") + (fs.length > 2 ? `, and ${fs.length - 2} more` : "");
  const out: { agent: AgentRole; summary: string }[] = [];
  const creative = by("CREATIVE");
  if (creative.length) out.push({ agent: "CREATIVE", summary: `Looked at the ads for ${titles(creative)} — a fresh version can be prepared; nothing runs without your approval.` });
  const audience = by("AUDIENCE");
  if (audience.length) out.push({ agent: "AUDIENCE", summary: `Checked who the ads reach for ${titles(audience)}.` });
  const optimizer = by("OPTIMIZER");
  if (optimizer.length) out.push({ agent: "OPTIMIZER", summary: `Traced where results change between the ad and the lead for ${titles(optimizer)}.` });
  const strategist = by("STRATEGIST");
  if (strategist.length) out.push({ agent: "STRATEGIST", summary: `Reviewed the approach behind ${titles(strategist)}, including what happens after someone becomes a lead.` });
  const growth = by("GROWTH");
  if (growth.length) {
    const hold = growth.find((f) => f.steps.some((s) => /hold off/i.test(s.title)));
    const up = growth.find((f) => f.severity === "OPPORTUNITY");
    out.push({ agent: "GROWTH", summary: hold ? `Recommends holding off on more budget while ${lower(hold.title)}.` : up ? `Watching whether "${up.title}" holds before suggesting more budget.` : `Considered whether more budget makes sense for ${titles(growth)}.` });
  }
  if (extra.guardian) out.push({ agent: "GUARDIAN", summary: extra.guardian });
  if (extra.architect) out.push({ agent: "ARCHITECT", summary: extra.architect });
  return out;
}

export type CoachRun = { ok: true; result: CoachResult; created: number; decisionIds: string[] } | { ok: false; reason: string };

export async function runCoach(organizationId: string, opts: { parentRunId?: string | null; decisionInput?: DecisionInput | null; now?: Date } = {}): Promise<CoachRun> {
  const now = opts.now ?? new Date();
  const own = opts.parentRunId ? null : await startRun({ organizationId, agent: "STRATEGIST", task: "coach-review" });
  const parentId = opts.parentRunId ?? own;

  let input;
  try {
    input = await gatherCoachInput(organizationId, { now, decisionInput: opts.decisionInput });
  } catch (error) {
    const reason = error instanceof CoachReadError ? error.message : "Couldn't gather your results this time.";
    if (own) await finishRun(own, { status: "FAILED", summary: `${reason} The Performance Coach tries again at the next review.`, detail: error instanceof Error ? error.message : String(error) });
    return { ok: false, reason };
  }
  if (input.campaigns.length === 0 && input.leads.length === 0) {
    await discardRun(own);
    return { ok: false, reason: "Nothing to review yet — no campaigns and no leads." };
  }

  const result = diagnose(input);
  const step = (agent: AgentRole, task: string, summary: string, extra: { detail?: string | null; decisionId?: string | null } = {}) =>
    recordRun({ organizationId, agent, task, parentId, status: "DONE", summary, detail: extra.detail ?? null, href: HREF, decisionId: extra.decisionId ?? null });

  await step("ANALYST", "coach-funnel", result.funnelLine ?? "Followed your results from ad to customer; nothing came in during the last two weeks to follow.", {
    detail: [result.whereItDrops, ...result.steps.map((s) => `${s.label}: ${Math.round(s.current * 100)}%${s.previous !== null ? ` (was ${Math.round(s.previous * 100)}%)` : ""}`)].filter(Boolean).join("\n") || null,
  });

  // A change on Meta goes through Budget Guardian, then waits for approval.
  const running = await db.mairoCampaign.aggregate({ where: { organizationId, status: "ACTIVE" }, _sum: { totalDailyBudgetCents: true } });
  const proposals = result.findings.filter((f) => f.change);
  let guardian: string | null = null;
  let architect: string | null = null;
  const decisionIds: string[] = [];
  const keep: Finding[] = [];
  for (const f of result.findings) {
    if (!f.change) {
      keep.push(f);
      continue;
    }
    const problem = limitProblem(f.change.changes, input.guardrails, running._sum.totalDailyBudgetCents ?? 0);
    if (problem) {
      guardian = `Checked a proposed budget move against your limits: ${lower(problem)} So it won't be suggested.`;
      continue;
    }
    keep.push(f);
  }
  if (proposals.length && !guardian) guardian = "Checked the proposed budget move against your limits: it stays within them, and your total daily budget doesn't change.";

  const saved = await persistFindings(organizationId, keep, { now, complete: true });
  for (const f of keep.filter((x) => x.change)) {
    const [decisionId] = await persistDrafts(organizationId, [f.change!], "daily", { reviewRunId: parentId });
    const findingId = saved.ids.get(f.key);
    if (decisionId && findingId) {
      decisionIds.push(decisionId);
      await db.coachFinding.updateMany({ where: { id: findingId, organizationId }, data: { decisionId } });
      await db.mairoDecision.updateMany({ where: { id: decisionId, organizationId }, data: { findingId } });
      architect = "Prepared the budget move as a recommendation waiting for your approval. Nothing changes on Meta until you approve it.";
    }
  }

  for (const line of specialistLines(keep, { guardian, architect })) {
    await step(line.agent, "coach-investigate", line.summary, { decisionId: line.agent === "ARCHITECT" ? (decisionIds[0] ?? null) : null });
  }

  // What followed earlier changes and approved plans, once there's enough to say.
  const plans = await judgeApprovedPlans(organizationId, input).catch(() => []);
  const changes = await judgeAppliedChanges(organizationId, now).catch(() => []);
  for (const v of [...plans, ...changes]) await step("ANALYST", "coach-verdict", `Checked what followed "${v.title}": ${v.note}`);

  // Tell the business about something new — only when the records support it.
  for (const c of saved.created) {
    const f = c.finding;
    if (f.confidence === "EARLY" || f.severity === "WATCH") continue;
    await notify({
      organizationId,
      kind: "COACH_ALERT",
      title: f.title,
      body: `${f.plain} ${f.severity === "OPPORTUNITY" ? "" : "Your AI team has prepared a recommendation."}`.trim(),
      actionLabel: "See what your AI team found",
      actionHref: `${HREF}#${c.id}`,
      mairoCampaignId: f.mairoCampaignId ?? undefined,
      evidence: f.evidence.slice(0, 4),
      dedupeKey: `coach:${f.key}:${now.toISOString().slice(0, 10)}`,
    }).catch((error) => console.error("Coach alert failed:", error));
  }

  if (own) {
    const attention = keep.filter((f) => f.severity === "ATTENTION").length;
    await finishRun(own, {
      status: keep.length ? "DONE" : "NOTHING",
      summary: keep.length ? `Performance Coach reviewed your results from ad to customer: ${n(attention, "thing")} worth your attention${keep.length > attention ? `, ${keep.length - attention} to keep an eye on` : ""}.` : "Performance Coach reviewed your results from ad to customer and found nothing that needs changing right now.",
      href: HREF,
    });
  }
  return { ok: true, result, created: saved.created.length, decisionIds };
}

/** The Coach page's "Review now": at most every ten minutes per business. */
export async function mayRunNow(organizationId: string, now = new Date()): Promise<boolean> {
  const last = await db.agentRun.findFirst({ where: { organizationId, task: { in: ["coach-review", "coach-funnel"] } }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
  return !last || now.getTime() - last.startedAt.getTime() > 10 * 60_000;
}
