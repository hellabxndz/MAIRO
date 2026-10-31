import { db } from "@/lib/db";
import { entitlementsFor } from "@/lib/entitlements";
import { automaticActions, levelInfo } from "@/lib/automation/levels";
import type { AutomationLevel } from "@/generated/prisma/enums";
import type { HealthStatus } from "@/lib/tracking/health";

// "What is MAIRO doing for me?" — the three lines on Home that make MAIRO
// read like a manager rather than a dashboard: whether tracking works, what
// MAIRO is allowed to do on its own (and whether that's paused), and what it
// last did. Every line comes from a stored record: the daily tracking check
// (TrackingProfile.health*), the automation settings, and MairoActivity.
// Nothing here is estimated, and a check that hasn't run says so.

export type ModeKey = "approval" | "autopilot" | "paused";

export type ModeView = {
  key: ModeKey;
  label: string;
  detail: string;
  /** The pause/resume button applies (an Autopilot level is chosen and the plan allows it). */
  canToggle: boolean;
};

/** Pure: the mode in words, from the settings and what the plan allows. Pinned by scripts/check-manager.ts. */
export function modeView(
  settings: { level: AutomationLevel; enabled: boolean; pausedAt: Date | null } | null,
  allowed: { assist: boolean; autopilot: boolean },
): ModeView {
  const approval: ModeView = { key: "approval", label: "Approval mode", detail: "MAIRO checks your campaigns every day and recommends changes. Nothing changes until you approve it.", canToggle: false };
  if (!settings || settings.level === "MANUAL" || !settings.enabled) return approval;
  // The level that would actually apply on this plan (as effectiveLevel() works it out).
  const level: AutomationLevel | null = settings.level === "AUTOPILOT" && allowed.autopilot ? "AUTOPILOT" : allowed.assist ? "ASSISTED" : null;
  if (!level) return { ...approval, detail: `${approval.detail} Autopilot isn't part of your plan, so MAIRO only recommends.` };
  if (settings.pausedAt) {
    return {
      key: "paused",
      label: "Autopilot paused",
      detail: `Paused on ${settings.pausedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}. MAIRO still checks and recommends, but changes nothing on its own until you resume.`,
      canToggle: true,
    };
  }
  const does = automaticActions(level).map((a) => a.label.toLowerCase());
  return {
    key: "autopilot",
    label: `Autopilot on · ${levelInfo(level).label}`,
    detail: `On its own, inside your limits, MAIRO may ${does.length > 1 ? `${does.slice(0, -1).join(", ")} and ${does[does.length - 1]}` : does[0]}. New campaigns and a bigger total budget always wait for you.`,
    canToggle: true,
  };
}

/** Who did it, in the owner's words: MAIRO on its own, or a person (a setting, or an approved change). */
export function byWhom(action: string, automatic: boolean): string {
  if (automatic) return "by MAIRO";
  return action.startsWith("autopilot.") ? "by your team" : "you approved";
}

export type TrackingLine = { status: HealthStatus | "pending"; headline: string; detail: string; checkedAt: Date | null };

export type ManagerStatus = {
  tracking: TrackingLine;
  mode: ModeView;
  recent: { id: string; summary: string; reason: string; at: Date; automatic: boolean; by: string }[];
  /** Changes MAIRO tried to make in the last week that Meta refused. Shown, never hidden. */
  failed: number;
};

export async function loadManagerStatus(organizationId: string, now = new Date()): Promise<ManagerStatus> {
  const [profile, settings, ent, recent, failed] = await Promise.all([
    db.trackingProfile.findUnique({ where: { organizationId }, select: { healthStatus: true, healthHeadline: true, healthDetail: true, healthCheckedAt: true } }),
    db.autoOptimizeSettings.findUnique({ where: { organizationId }, select: { level: true, enabled: true, pausedAt: true } }),
    entitlementsFor(organizationId),
    db.mairoActivity.findMany({
      where: { organizationId, createdAt: { gte: new Date(now.getTime() - 14 * 864e5) } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, action: true, summary: true, reason: true, createdAt: true, automatic: true },
    }),
    db.mairoDecision.count({ where: { organizationId, status: "FAILED", updatedAt: { gte: new Date(now.getTime() - 7 * 864e5) } } }),
  ]);
  const tracking: TrackingLine = profile?.healthStatus
    ? { status: profile.healthStatus as HealthStatus, headline: profile.healthHeadline ?? "", detail: profile.healthDetail ?? "", checkedAt: profile.healthCheckedAt }
    : { status: "pending", headline: "Tracking not checked yet", detail: "MAIRO checks your tracking with Meta every day. The first check hasn't run yet.", checkedAt: profile?.healthCheckedAt ?? null };
  return {
    tracking,
    mode: modeView(settings, { assist: ent.auto_optimize, autopilot: ent.autopilot }),
    recent: recent.map((r) => ({ id: r.id, summary: r.summary, reason: r.reason, at: r.createdAt, automatic: r.automatic, by: byWhom(r.action, r.automatic) })),
    failed,
  };
}
