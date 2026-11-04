"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { currentMember, deniedFor } from "@/lib/members/authorize";
import { setAutopilotPaused } from "@/lib/automation/pause";

// Pause and resume Autopilot, one tap, from Home and Settings. The rules —
// who may, what's recorded, what pausing means — are in lib/automation/
// pause.ts; this finds who is asking, in which business, and their role
// there (never a business id from the browser).

export type AutopilotResult = { ok: true; message: string } | { ok: false; error: string };

export async function setAutopilotPausedAction(paused: boolean): Promise<AutopilotResult> {
  // Checked here like every action, and again in setAutopilotPaused.
  const denied = await deniedFor("budget.change");
  if (denied) return { ok: false, error: denied };
  const session = await auth();
  const member = await currentMember();
  if (!session?.user?.id || !member) return { ok: false, error: "Sign in again to continue." };
  const r = await setAutopilotPaused(member.organizationId, { userId: member.userId, name: session.user.name ?? session.user.email ?? "Someone", role: member.role }, paused);
  if (!r.ok) return r;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { ok: true, message: r.message };
}
