"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { MISSION_GOAL_KEYS } from "@/lib/mission/goals";
import { activeMission, approveMission, startMission, tellMairo, type StartResult, type TellResult } from "@/lib/mission/store";

// The MAIRO mission, from the owner's side: say what you want, review the
// plan MAIRO built, approve it, and tell MAIRO when something changes.
// Planning never spends: approving prefills a campaign whose budget is
// confirmed in Create, and Social Manager stays Scale-only (it checks for
// itself).

type Fail = { ok: false; error: string };

async function org(): Promise<{ organizationId: string; userId: string | null } | { error: string }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not signed in." };
  return { organizationId: (await activeOrganizationId()) ?? session.user.organizationId, userId: session.user.id ?? null };
}

function refresh() {
  revalidatePath("/dashboard/mission");
  revalidatePath("/dashboard");
}

const startSchema = z.object({
  goal: z.enum(MISSION_GOAL_KEYS).nullable().optional(),
  secondary: z.enum(MISSION_GOAL_KEYS).nullable().optional(),
  request: z.string().max(1000).optional(),
  answers: z.record(z.string().max(40), z.string().max(300)).optional(),
});

export async function startMissionAction(input: z.input<typeof startSchema>): Promise<({ ok: true } & StartResult) | Fail> {
  const ctx = await org();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check what you entered." };
  if (!parsed.data.goal && !parsed.data.request?.trim()) return { ok: false, error: "Choose a goal or tell MAIRO in your own words." };
  if (parsed.data.secondary && parsed.data.secondary === parsed.data.goal) return { ok: false, error: "Pick a different second goal." };
  try {
    const result = await startMission(ctx.organizationId, parsed.data);
    refresh();
    return { ok: true, ...result };
  } catch (error) {
    console.error("Mission planning failed:", error);
    return { ok: false, error: "MAIRO couldn't build the plan just now. Try again in a moment." };
  }
}

export async function approveMissionAction(missionId: string): Promise<{ ok: true; draftId: string | null; social: boolean } | Fail> {
  const ctx = await org();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  try {
    const r = await approveMission(ctx.organizationId, z.string().max(64).parse(missionId), ctx.userId);
    refresh();
    revalidatePath("/dashboard/social", "layout");
    return { ok: true, ...r };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't approve the plan." };
  }
}

export async function discardProposalAction(missionId: string): Promise<{ ok: true } | Fail> {
  const ctx = await org();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  await db.marketingMission.deleteMany({ where: { id: missionId, organizationId: ctx.organizationId, status: "PROPOSED" } });
  refresh();
  return { ok: true };
}

/** "Add secondary goal": MAIRO re-plans with both, and the owner approves. */
export async function secondaryGoalAction(goal: string | null): Promise<({ ok: true } & StartResult) | Fail> {
  const ctx = await org();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const current = await activeMission(ctx.organizationId);
  if (!current) return { ok: false, error: "Set your main goal first." };
  const secondary = goal ? z.enum(MISSION_GOAL_KEYS).safeParse(goal) : null;
  if (secondary && !secondary.success) return { ok: false, error: "That isn't a goal MAIRO knows." };
  if (secondary?.data === current.primaryGoal) return { ok: false, error: "That's already your main goal." };
  const result = await startMission(ctx.organizationId, { goal: current.primaryGoal, secondary: secondary?.data ?? null, request: current.request });
  refresh();
  return { ok: true, ...result };
}

export async function tellMairoAction(text: string): Promise<({ ok: true } & TellResult) | Fail> {
  const ctx = await org();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const clean = text.trim().slice(0, 1000);
  if (clean.length < 3) return { ok: false, error: "Tell MAIRO a little more." };
  try {
    const result = await tellMairo(ctx.organizationId, clean);
    refresh();
    revalidatePath("/dashboard/social", "layout");
    return { ok: true, ...result };
  } catch (error) {
    console.error("Tell MAIRO failed:", error);
    return { ok: false, error: "MAIRO couldn't take that in just now. Try again in a moment." };
  }
}

/** "This isn't true any more" — e.g. the item is back in stock, or the sale is over. */
export async function endNoteAction(noteId: string): Promise<{ ok: true } | Fail> {
  const ctx = await org();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  await db.missionNote.updateMany({ where: { id: noteId, organizationId: ctx.organizationId }, data: { active: false } });
  refresh();
  return { ok: true };
}
