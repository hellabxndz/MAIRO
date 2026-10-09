"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { mayRunNow, runCoach } from "@/lib/coach/run";
import type { PlanStep, StepStatus } from "@/lib/coach/types";

// What the Performance Coach page calls. Every one is scoped to the business
// asking — a finding's id is guessable, and this is what makes guessing
// useless. A change on Meta is never made here: it goes through Mairo
// Decisions' approval (preview, limits, permissions, one-at-a-time claim).

async function context() {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  return { organizationId: (await activeOrganizationId()) ?? session.user.organizationId };
}

const done = () => {
  revalidatePath("/dashboard/coach");
  revalidatePath("/dashboard/team");
};

const DAY = 86_400_000;
/** How long after approving a plan before its figure is looked at again. */
const CHECK_AFTER_DAYS = 14;

export async function runCoachNowAction(): Promise<{ ok: boolean; message: string }> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Not signed in." };
  if (!(await mayRunNow(ctx.organizationId))) return { ok: false, message: "Your AI team reviewed your results a few minutes ago. Try again in a little while." };
  const r = await runCoach(ctx.organizationId);
  done();
  if (!r.ok) return { ok: false, message: r.reason };
  return { ok: true, message: r.result.findings.length ? `Reviewed. ${r.result.summary}` : "Reviewed. Nothing needs changing right now." };
}

/** Accept the improvement plan. Any change on Meta still waits for its own approval. */
export async function approveFindingAction(findingId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const now = new Date();
  const r = await db.coachFinding.updateMany({
    where: { id: findingId, organizationId: ctx.organizationId, status: "OPEN" },
    data: { status: "APPROVED", decidedAt: now, checkAfter: new Date(now.getTime() + CHECK_AFTER_DAYS * DAY) },
  });
  if (r.count === 0) return { ok: false, error: "That recommendation has already been dealt with." };
  done();
  return { ok: true };
}

export async function dismissFindingAction(findingId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const r = await db.coachFinding.updateMany({
    where: { id: findingId, organizationId: ctx.organizationId, status: { in: ["OPEN", "APPROVED"] } },
    data: { status: "DISMISSED", decidedAt: new Date() },
  });
  if (r.count === 0) return { ok: false, error: "That recommendation has already been dealt with." };
  done();
  return { ok: true };
}

/** Show the next recommendation MAIRO can stand behind for this finding. */
export async function anotherRecommendationAction(findingId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const f = await db.coachFinding.findFirst({ where: { id: findingId, organizationId: ctx.organizationId }, select: { alternativesJson: true, alternativeIndex: true } });
  if (!f) return { ok: false, error: "That recommendation is no longer available." };
  let count = 0;
  try {
    count = (JSON.parse(f.alternativesJson) as unknown[]).length;
  } catch {
    count = 0;
  }
  if (count === 0) return { ok: false, error: "That's the only recommendation MAIRO can stand behind for this one." };
  await db.coachFinding.updateMany({ where: { id: findingId, organizationId: ctx.organizationId }, data: { alternativeIndex: (f.alternativeIndex + 1) % (count + 1) } });
  done();
  return { ok: true };
}

/** Mark one step of the improvement plan done, skipped or to do. */
export async function setStepStatusAction(findingId: string, stepId: string, status: StepStatus): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!["todo", "done", "skipped"].includes(status)) return { ok: false, error: "That isn't a step status." };
  const f = await db.coachFinding.findFirst({ where: { id: findingId, organizationId: ctx.organizationId }, select: { stepsJson: true } });
  if (!f) return { ok: false, error: "That plan is no longer available." };
  let steps: PlanStep[] = [];
  try {
    steps = JSON.parse(f.stepsJson) as PlanStep[];
  } catch {
    steps = [];
  }
  if (!steps.some((s) => s.id === stepId)) return { ok: false, error: "That step isn't in this plan." };
  const next = steps.map((s) => (s.id === stepId ? { ...s, status } : s));
  await db.coachFinding.updateMany({ where: { id: findingId, organizationId: ctx.organizationId }, data: { stepsJson: JSON.stringify(next) } });
  done();
  return { ok: true };
}

export async function findingFeedbackAction(findingId: string, feedback: "HELPFUL" | "NOT_HELPFUL"): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (feedback !== "HELPFUL" && feedback !== "NOT_HELPFUL") return { ok: false, error: "Unknown feedback." };
  const r = await db.coachFinding.updateMany({ where: { id: findingId, organizationId: ctx.organizationId }, data: { feedback } });
  if (r.count === 0) return { ok: false, error: "That recommendation is no longer available." };
  done();
  return { ok: true };
}
