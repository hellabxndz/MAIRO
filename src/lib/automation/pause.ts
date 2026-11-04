import { db } from "@/lib/db";
import { audit } from "@/lib/members/audit";
import { can, type Role } from "@/lib/members/roles";

// Pausing and resuming Autopilot, as a plain function so the rules can be
// checked without a browser (scripts/check-autopilot.ts). The server action
// (lib/actions/autopilot-actions.ts) only finds who is asking and their role.
//
// Pausing keeps the level the owner chose (AutoOptimizeSettings.level) and
// sets pausedAt; while it's set, effectiveLevel() reads MANUAL and
// runAutoOptimize() does nothing, so MAIRO only recommends. Resuming clears
// it. Both are written to the activity history and the audit log.
//
// Who may: the people who may change budgets (budget.change: Owner, Admin,
// Marketing manager). Pausing is allowed on any plan — turning automation
// off is never something a lapsed plan should prevent.

export type PauseResult = { ok: true; message: string; changed: boolean } | { ok: false; error: string };

export async function setAutopilotPaused(
  organizationId: string,
  actor: { userId: string | null; name: string; role: Role | null },
  paused: boolean,
  now = new Date(),
): Promise<PauseResult> {
  if (!can(actor.role, "budget.change")) return { ok: false, error: "Only an owner, admin or marketing manager can pause or resume Autopilot." };
  const settings = await db.autoOptimizeSettings.findUnique({ where: { organizationId }, select: { level: true, pausedAt: true } });
  if (!settings || settings.level === "MANUAL") return { ok: false, error: "Autopilot isn't on. Turn it on in Settings first." };
  if (paused === Boolean(settings.pausedAt)) return { ok: true, changed: false, message: paused ? "Autopilot is already paused." : "Autopilot is already running." };

  await db.autoOptimizeSettings.update({
    where: { organizationId },
    data: paused ? { pausedAt: now, pausedById: actor.userId } : { pausedAt: null, pausedById: null },
  });
  await db.mairoActivity.create({
    data: {
      organizationId,
      action: paused ? "autopilot.paused" : "autopilot.resumed",
      summary: paused ? "Autopilot paused" : "Autopilot resumed",
      reason: paused
        ? `Paused by ${actor.name}. MAIRO won't change anything on its own until it's resumed; it still checks your campaigns and recommends.`
        : `Resumed by ${actor.name}. MAIRO may make the changes your Autopilot level allows again, inside your limits.`,
      automatic: false,
      actorUserId: actor.userId,
    },
  });
  await audit(organizationId, actor.userId, paused ? "autopilot.pause" : "autopilot.resume", "AutoOptimizeSettings", settings.level);
  return { ok: true, changed: true, message: paused ? "Autopilot paused. MAIRO will only recommend until you resume it." : "Autopilot resumed." };
}
