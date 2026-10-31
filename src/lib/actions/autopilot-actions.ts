"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { deniedFor } from "@/lib/members/authorize";
import { audit } from "@/lib/members/audit";

// Pause and resume Autopilot, one tap, from Home and Settings.
//
// Pausing keeps the level the owner chose (AutoOptimizeSettings.level) and
// sets pausedAt; while it's set, effectiveLevel() reads MANUAL and
// runAutoOptimize() does nothing, so MAIRO only recommends. Resuming clears
// it. Both are written to the activity history and the audit log, so "who
// stopped it, and when" is never a mystery.
//
// The same role that may change budgets (budget.change) may pause. Pausing
// is allowed whatever the plan: turning automation off must never be gated.

export type AutopilotResult = { ok: true; message: string } | { ok: false; error: string };

async function context() {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  return { organizationId, userId: session.user.id ?? null, name: session.user.name ?? session.user.email ?? "Someone" };
}

export async function setAutopilotPausedAction(paused: boolean): Promise<AutopilotResult> {
  const denied = await deniedFor("budget.change");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Sign in again to continue." };
  const settings = await db.autoOptimizeSettings.findUnique({ where: { organizationId: ctx.organizationId }, select: { level: true, pausedAt: true } });
  if (!settings || settings.level === "MANUAL") return { ok: false, error: "Autopilot isn't on. Turn it on in Settings first." };
  if (paused === Boolean(settings.pausedAt)) return { ok: true, message: paused ? "Autopilot is already paused." : "Autopilot is already running." };

  await db.autoOptimizeSettings.update({
    where: { organizationId: ctx.organizationId },
    data: paused ? { pausedAt: new Date(), pausedById: ctx.userId } : { pausedAt: null, pausedById: null },
  });
  await db.mairoActivity.create({
    data: {
      organizationId: ctx.organizationId,
      action: paused ? "autopilot.paused" : "autopilot.resumed",
      summary: paused ? "Autopilot paused" : "Autopilot resumed",
      reason: paused
        ? `Paused by ${ctx.name}. MAIRO won't change anything on its own until it's resumed; it still checks your campaigns and recommends.`
        : `Resumed by ${ctx.name}. MAIRO may make the changes your Autopilot level allows again, inside your limits.`,
      automatic: false,
      actorUserId: ctx.userId,
    },
  });
  await audit(ctx.organizationId, ctx.userId, paused ? "autopilot.pause" : "autopilot.resume", "AutoOptimizeSettings", settings.level);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { ok: true, message: paused ? "Autopilot paused. MAIRO will only recommend until you resume it." : "Autopilot resumed." };
}
