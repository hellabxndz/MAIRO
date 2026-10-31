import { db } from "@/lib/db";
import { loadCredentials } from "@/lib/ad-platforms/connections";
import { notify } from "@/lib/notifications/notify";
import { reportError } from "@/lib/monitoring/report";
import { ensureTrackingProfile } from "./profile";
import { recheckPixelAccess } from "./pixel-setup";
import { businessPixelNeed, leadMeasurementFrom, pixelDecisionFrom } from "./pixel-rules";
import { checkEvents, requiredEventFor } from "./setup";
import { eventsFor, goalsFrom } from "./measurement";
import { transition, trackingHealth, type EventCheck, type Health, type HealthInput, type Transition } from "./health";
import type { CheckStatus } from "./state";

// The daily tracking-health check: MAIRO asks Meta about each business's
// Pixel, decides whether tracking is working (health.ts), keeps the verdict
// on the TrackingProfile, and tells the owner when it changes — the first
// time it works, when it stops, when it recovers. Never every day.
//
// Everything it reads comes from Meta through the same calls the Pixel page
// uses (recheckPixelAccess, checkEvents), so each check is also stored in
// TrackingVerification like a manual one. It changes nothing in Meta and
// nothing on the customer's website.
//
// A day Meta doesn't answer leaves the last verdict in place (only
// healthCheckedAt moves): a failed check is not news, good or bad.

export type HealthRun = { health: Health; transition: Transition; checkedMeta: boolean };

export async function checkTrackingHealth(organizationId: string, now = new Date()): Promise<HealthRun> {
  const [profile, pixel, intake, live] = await Promise.all([
    ensureTrackingProfile(organizationId),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } } }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { primaryGoal: true } }),
    db.mairoCampaign.count({ where: { organizationId, status: "ACTIVE" } }),
  ]);
  const creds = await loadCredentials(organizationId, "META");
  const connected = Boolean(creds && creds.status === "CONNECTED");
  const leadMeasurement = leadMeasurementFrom(profile.leadMeasurement);
  const need: HealthInput["need"] =
    leadMeasurement === "meta_forms" && businessPixelNeed({ nicheId: profile.nicheId, goal: intake?.primaryGoal ?? null }) === "optional"
      ? "not_needed"
      : businessPixelNeed({ nicheId: profile.nicheId, goal: intake?.primaryGoal ?? null });

  // Which events this business tracks: the ones the owner chose, or the one its campaigns are judged on.
  const goals = profile.measurementGoalsSavedAt ? goalsFrom(profile.measurementGoals) : [];
  const chosen: string[] = goals.length ? eventsFor(goals) : need === "not_needed" ? [] : [requiredEventFor(profile.nicheId) ?? "Lead"].filter((e) => e !== "PageView");

  let accessible: boolean | null = null;
  let lastFiredAt: Date | null = pixel?.lastFiredAt ?? null;
  let events: EventCheck[] = [];
  let checkedMeta = false;

  if (pixel && connected) {
    checkedMeta = true;
    const access = await recheckPixelAccess(organizationId);
    if (access.ok) {
      accessible = access.data.accessible;
      lastFiredAt = access.data.lastFiredAt;
    } else if (access.reason === "missing_permission") {
      accessible = false;
    }
    if (accessible !== false && chosen.length) {
      // Whether each event was ever verified before today, so "stopped" and "not yet" stay apart.
      const before = await db.trackingVerification.findMany({
        where: { organizationId, pixelId: pixel.externalPixelId, check: { in: chosen.map((e) => `event:${e}`) }, status: "VERIFIED", checkedAt: { lt: now } },
        select: { check: true },
        distinct: ["check"],
      });
      const ever = new Set(before.map((b) => b.check.slice("event:".length)));
      const counted = await checkEvents(organizationId, chosen);
      events = chosen.map((e) => {
        const r = counted.ok ? counted.data[e] : null;
        return { event: e, status: (r?.status ?? "FAILED") as CheckStatus, count: r?.count ?? null, everVerified: ever.has(e) };
      });
    }
  }

  const health = trackingHealth({
    now,
    hasPixel: Boolean(pixel),
    declined: pixelDecisionFrom(profile.pixelDecision) === "declined",
    need,
    metaConnected: connected,
    accessible,
    lastFiredAt,
    events,
    liveCampaigns: live,
  });

  const before = (profile.healthStatus ?? null) as Health["status"] | null;
  const t = transition(before, health.status, profile.healthHeadline ?? null, health.headline);
  if (health.status === "unknown") {
    await db.trackingProfile.update({ where: { organizationId }, data: { healthCheckedAt: now } });
    return { health, transition: null, checkedMeta };
  }
  const changed = before !== health.status || profile.healthHeadline !== health.headline;
  const changedAt = changed ? now : (profile.healthChangedAt ?? now);
  await db.trackingProfile.update({
    where: { organizationId },
    data: { healthStatus: health.status, healthHeadline: health.headline, healthDetail: health.detail, healthCheckedAt: now, healthChangedAt: changedAt },
  });

  if (t) {
    const working = t.kind !== "problem";
    await notify({
      organizationId,
      kind: working ? "TRACKING_WORKING" : "TRACKING_PROBLEM",
      dedupeKey: `tracking:${t.situation}:${changedAt.toISOString()}`,
      title: t.kind === "recovered" ? "Tracking is working again" : working ? "Your tracking is working" : health.headline,
      body: health.detail,
      actionLabel: health.fix?.label ?? (working ? "See tracking" : undefined),
      actionHref: health.fix?.href ?? "/dashboard/pixel",
      evidence: { status: health.status, before, lastFiredAt, events: events.map((e) => ({ event: e.event, status: e.status, count: e.count })) },
      smsBody: working ? undefined : `MAIRO: ${health.headline}. Open MAIRO to fix it.`,
    });
  }
  return { health, transition: t, checkedMeta };
}

export type MonitorResult = { checked: number; working: number; problems: number; unknown: number; failed: number; notified: number };

/**
 * The cron's sweep: every business with Meta connected or a Pixel chosen,
 * oldest check first, until the time budget is spent. One business failing
 * never stops the rest; it is reported and counted.
 */
export async function monitorAllTracking(limit = 100, budgetMs = Number.POSITIVE_INFINITY, now = new Date()): Promise<MonitorResult> {
  const started = Date.now();
  const orgs = await db.organization.findMany({
    where: { OR: [{ metaAdAccount: { isNot: null } }, { trackingPixels: { some: { platform: "META" } } }] },
    select: { id: true, trackingProfile: { select: { healthCheckedAt: true } } },
    take: limit * 3,
  });
  orgs.sort((a, b) => (a.trackingProfile?.healthCheckedAt?.getTime() ?? 0) - (b.trackingProfile?.healthCheckedAt?.getTime() ?? 0));
  const out: MonitorResult = { checked: 0, working: 0, problems: 0, unknown: 0, failed: 0, notified: 0 };
  for (const o of orgs.slice(0, limit)) {
    if (Date.now() - started > budgetMs) break;
    try {
      const r = await checkTrackingHealth(o.id, now);
      out.checked++;
      if (r.health.status === "working") out.working++;
      else if (r.health.status === "unknown") out.unknown++;
      else if (r.health.status === "attention" || r.health.status === "broken") out.problems++;
      if (r.transition) out.notified++;
    } catch (error) {
      out.failed++;
      await reportError(error, { where: "cron/review: tracking health", tags: { organizationId: o.id } }).catch(() => undefined);
    }
  }
  return out;
}
