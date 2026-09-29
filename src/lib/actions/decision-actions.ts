"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { applyDecision, type AppliedChange } from "@/lib/decisions/apply";
import { refreshDecisions } from "@/lib/decisions/run";
import type { DecisionChange } from "@/lib/decisions/types";

// What the Decisions page, the dashboard and One-Click Fix call.
//
// Every one checks the decision belongs to the account asking — ids are
// guessable, and this is what makes guessing useless.

async function context() {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  return { organizationId, userId: session.user.id ?? null };
}

function revalidate() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/decisions");
  revalidatePath("/dashboard/activity");
  revalidatePath("/dashboard/campaigns");
}

export type ApproveResult =
  | { ok: true; applied: AppliedChange[]; partial: boolean }
  | { ok: false; error: string; applied?: AppliedChange[] };

const changeSchema = z.array(z.record(z.string(), z.unknown())).max(10);

/** Approve one or more decisions, optionally with edited amounts. */
export async function approveDecisionsAction(input: {
  decisionIds: string[];
  edits?: Record<string, unknown[]>;
}): Promise<ApproveResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const ids = z.array(z.string().min(1).max(64)).min(1).max(10).safeParse(input.decisionIds);
  if (!ids.success) return { ok: false, error: "Nothing to approve." };

  const applied: AppliedChange[] = [];
  let partial = false;
  const errors: string[] = [];
  for (const id of ids.data) {
    const edited = input.edits?.[id];
    const parsedEdit = edited ? changeSchema.safeParse(edited) : null;
    if (parsedEdit && !parsedEdit.success) {
      errors.push("Those edits couldn't be read.");
      continue;
    }
    const outcome = await applyDecision({
      organizationId: ctx.organizationId,
      decisionId: id,
      userId: ctx.userId,
      automatic: false,
      edited: parsedEdit?.success ? (parsedEdit.data as unknown as DecisionChange[]) : undefined,
    });
    applied.push(...outcome.applied);
    if (!outcome.ok) errors.push(outcome.error);
    else if (outcome.partial) partial = true;
  }
  revalidate();
  if (applied.every((a) => !a.ok) && errors.length > 0) return { ok: false, error: errors[0], applied };
  return { ok: true, applied, partial: partial || errors.length > 0 };
}

async function setStatus(decisionId: string, status: "REJECTED" | "IGNORED"): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const row = await db.mairoDecision.findUnique({ where: { id: decisionId } });
  if (!row || row.organizationId !== ctx.organizationId) return { ok: false, error: "That decision is no longer available." };
  if (row.status !== "PENDING" && row.status !== "FAILED") return { ok: false, error: "That decision has already been dealt with." };
  await db.mairoDecision.update({
    where: { id: decisionId },
    data: { status, decidedAt: new Date(), decidedById: ctx.userId },
  });
  revalidate();
  return { ok: true };
}

export async function rejectDecisionAction(decisionId: string) {
  return setStatus(decisionId, "REJECTED");
}

export async function ignoreDecisionAction(decisionId: string) {
  return setStatus(decisionId, "IGNORED");
}

/** For a decision that only points somewhere: the customer says they dealt with it. */
export async function markDecisionDoneAction(decisionId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const row = await db.mairoDecision.findUnique({ where: { id: decisionId } });
  if (!row || row.organizationId !== ctx.organizationId || row.status !== "PENDING") {
    return { ok: false, error: "That decision is no longer available." };
  }
  await db.mairoDecision.update({
    where: { id: decisionId },
    data: { status: "APPLIED", decidedAt: new Date(), decidedById: ctx.userId, resultJson: "[]" },
  });
  revalidate();
  return { ok: true };
}

/** "Check again now", ignoring the six-hour wait. */
export async function refreshDecisionsAction(): Promise<{ ok: boolean; pending: number }> {
  const ctx = await context();
  if (!ctx) return { ok: false, pending: 0 };
  const r = await refreshDecisions(ctx.organizationId, { force: true });
  revalidate();
  return { ok: true, pending: r.pending };
}

/** The decisions One-Click Fix proposed, for its confirmation panel. */
export async function loadDecisionsAction(ids: string[]): Promise<import("@/lib/decisions/store").DecisionView[]> {
  const ctx = await context();
  if (!ctx) return [];
  const { toView } = await import("@/lib/decisions/store");
  const rows = await db.mairoDecision.findMany({
    where: { id: { in: ids.slice(0, 10) }, organizationId: ctx.organizationId, status: "PENDING" },
  });
  return rows.map(toView);
}
