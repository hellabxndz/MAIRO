import { db } from "@/lib/db";
import { getAdapter, platformName } from "@/lib/ad-platforms/registry";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { notify } from "@/lib/notifications/notify";
import { checkMonthlyCap, checkStopLoss, usd } from "@/lib/protection/rules";

// Spend Protection, applied. Runs with the scheduled detector (hourly), and
// works at every automation level: protecting money isn't optimising it, so
// it never waits for Assisted or Autopilot to be switched on.
//
// It can only do two things: tell the customer, or pause. It never raises a
// budget, never starts anything, and every pause is logged with the figures
// that caused it and can be undone with one click.

export const DEFAULT_PROTECTION = {
  stopLossCents: 5000 as number | null,
  stopLossAction: "NOTIFY" as "NOTIFY" | "PAUSE",
  monthlyCapCents: null as number | null,
  warnAtPercent: 80,
};

export async function protectionSettings(organizationId: string) {
  const row = await db.spendProtection.findUnique({ where: { organizationId } });
  return row ?? { ...DEFAULT_PROTECTION, organizationId };
}

export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Pauses a campaign on every network it runs on. */
export async function pauseMairoCampaign(
  organizationId: string,
  mairoCampaignId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const children = await db.platformCampaign.findMany({
    where: { mairoCampaignId, mairoCampaign: { organizationId }, externalCampaignId: { not: null }, status: { in: ["ACTIVE", "PENDING_REVIEW"] } },
  });
  const errors: string[] = [];
  for (const child of children) {
    const adapter = getAdapter(child.platform);
    if (!adapter) continue;
    const result = await adapter.pauseCampaign({ organizationId, externalCampaignId: child.externalCampaignId! });
    if (result.ok) await db.platformCampaign.update({ where: { id: child.id }, data: { status: "PAUSED" } });
    else errors.push(`${platformName(child.platform)}: ${result.error.message}`);
  }
  if (errors.length === 0) {
    await db.mairoCampaign.updateMany({ where: { id: mairoCampaignId, organizationId }, data: { status: "PAUSED" } });
    return { ok: true };
  }
  return { ok: false, error: errors.join(" ") };
}

/** Switches a paused campaign back on, everywhere it was paused. */
export async function resumeMairoCampaign(
  organizationId: string,
  mairoCampaignId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const children = await db.platformCampaign.findMany({
    where: { mairoCampaignId, mairoCampaign: { organizationId }, externalCampaignId: { not: null }, status: "PAUSED" },
  });
  const errors: string[] = [];
  for (const child of children) {
    const adapter = getAdapter(child.platform);
    if (!adapter) continue;
    const result = await adapter.resumeCampaign({
      organizationId,
      externalCampaignId: child.externalCampaignId!,
      externalAdGroupId: child.externalAdGroupId,
      externalAdId: child.externalAdId,
      extraExternalAdIds: child.extraExternalAdIds,
    });
    if (result.ok) await db.platformCampaign.update({ where: { id: child.id }, data: { status: "ACTIVE" } });
    else errors.push(`${platformName(child.platform)}: ${result.error.message}`);
  }
  if (children.length === 0) return { ok: false, error: "There's nothing paused to switch back on." };
  // Active as soon as any network is running it again.
  if (errors.length < children.length) {
    await db.mairoCampaign.updateMany({ where: { id: mairoCampaignId, organizationId }, data: { status: "ACTIVE" } });
  }
  return errors.length ? { ok: false, error: errors.join(" ") } : { ok: true };
}

/** Whether this month's cap has been reached, so a resume can be refused. */
export async function monthlyCapReached(organizationId: string): Promise<{ reached: boolean; message?: string }> {
  const settings = await protectionSettings(organizationId);
  if (!settings.monthlyCapCents) return { reached: false };
  const month = await fetchOrganizationPerformance(organizationId, { since: monthStart(), until: new Date() });
  const cap = checkMonthlyCap({ monthlyCapCents: settings.monthlyCapCents, warnAtPercent: settings.warnAtPercent, monthSpendCents: month.total.spendCents });
  return cap.state === "reached" ? { reached: true, message: cap.message } : { reached: false };
}

export async function runSpendProtection(organizationId: string): Promise<number> {
  const settings = await protectionSettings(organizationId);
  const live = await db.mairoCampaign.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { id: true, name: true, objective: true },
  });
  if (live.length === 0) return 0;
  let acted = 0;

  // --- the monthly cap, account-wide ---
  if (settings.monthlyCapCents) {
    const month = await fetchOrganizationPerformance(organizationId, { since: monthStart(), until: new Date() });
    const cap = checkMonthlyCap({
      monthlyCapCents: settings.monthlyCapCents,
      warnAtPercent: settings.warnAtPercent,
      monthSpendCents: month.total.spendCents,
    });
    const key = monthStart().toISOString().slice(0, 7);
    if (cap.state === "reached") {
      const paused: string[] = [];
      for (const c of live) {
        const result = await pauseMairoCampaign(organizationId, c.id);
        if (result.ok) paused.push(c.name);
        await db.protectionEvent.create({
          data: {
            organizationId,
            mairoCampaignId: c.id,
            kind: "MONTHLY_CAP_REACHED",
            action: result.ok ? "PAUSED" : "NOTIFIED",
            message: result.ok ? `${cap.message} MAIRO paused this campaign.` : `${cap.message} MAIRO couldn't pause it: ${result.error}`,
            amountCents: cap.spendCents,
          },
        });
      }
      await notify({
        organizationId,
        kind: "NEEDS_ATTENTION",
        dedupeKey: `protection:cap:${key}`,
        title: "Monthly ad limit reached — campaigns paused",
        body: `${cap.message} MAIRO paused ${paused.length} campaign${paused.length === 1 ? "" : "s"}. Raise the limit in Settings to resume, or they stay paused until next month.`,
        actionLabel: "Spend Protection settings",
        actionHref: "/dashboard/settings#spend-protection",
        evidence: { spendCents: cap.spendCents, capCents: cap.capCents },
        smsBody: `MAIRO: you reached your ${usd(cap.capCents)} monthly ad limit, so your campaigns are paused.`,
      });
      return live.length;
    }
    if (cap.state === "warn") {
      const written = await notify({
        organizationId,
        kind: "NEEDS_ATTENTION",
        dedupeKey: `protection:capwarn:${key}`,
        title: "Approaching your monthly ad limit",
        body: `${cap.message} When it's reached, MAIRO pauses your campaigns until next month.`,
        actionLabel: "Spend Protection settings",
        actionHref: "/dashboard/settings#spend-protection",
        evidence: { spendCents: cap.spendCents, capCents: cap.capCents },
      });
      if (written.created) {
        await db.protectionEvent.create({
          data: { organizationId, kind: "MONTHLY_CAP_WARNING", action: "NOTIFIED", message: cap.message, amountCents: cap.spendCents },
        });
      }
    }
  }

  // --- the stop-loss, per campaign ---
  if (settings.stopLossCents) {
    const report = await fetchOrganizationPerformance(organizationId);
    for (const c of live) {
      const metrics = report.campaigns.find((r) => r.mairoCampaignId === c.id)?.total ?? null;
      const check = checkStopLoss({ stopLossCents: settings.stopLossCents, objective: c.objective, metrics, campaignName: c.name });
      if (!check.tripped) continue;

      if (settings.stopLossAction === "PAUSE") {
        const result = await pauseMairoCampaign(organizationId, c.id);
        const written = await notify({
          organizationId,
          kind: "NEEDS_ATTENTION",
          dedupeKey: `protection:stoploss:${c.id}:${Math.floor(check.spendCents / settings.stopLossCents)}`,
          title: result.ok ? `Paused “${c.name}” — no results yet` : `“${c.name}” is past your limit`,
          body: result.ok
            ? `${check.message} MAIRO paused it so it stops spending. Look at the advice on the campaign, then resume it when you're ready.`
            : `${check.message} MAIRO tried to pause it and couldn't — pause it in Ads Manager.`,
          actionLabel: "Open the campaign",
          actionHref: `/dashboard/campaigns/${c.id}`,
          mairoCampaignId: c.id,
          evidence: { spendCents: check.spendCents },
          smsBody: `MAIRO: "${c.name}" spent ${usd(check.spendCents)} with no results${result.ok ? " and was paused" : ""}.`,
        });
        // A pause that keeps failing is logged once, not every hour.
        if (result.ok || written.created) {
          await db.protectionEvent.create({
            data: {
              organizationId,
              mairoCampaignId: c.id,
              kind: "STOP_LOSS",
              action: result.ok ? "PAUSED" : "NOTIFIED",
              message: result.ok ? `${check.message} MAIRO paused it.` : `${check.message} MAIRO couldn't pause it: ${result.error}`,
              amountCents: check.spendCents,
            },
          });
          acted += 1;
        }
      } else {
        const written = await notify({
          organizationId,
          kind: "NEEDS_ATTENTION",
          // Again each time it spends another full limit's worth.
          dedupeKey: `protection:stoploss:${c.id}:${Math.floor(check.spendCents / settings.stopLossCents)}`,
          title: `“${c.name}” has no results yet`,
          body: `${check.message} It's still running. Pause it, or change it, from the campaign page.`,
          actionLabel: "Open the campaign",
          actionHref: `/dashboard/campaigns/${c.id}`,
          mairoCampaignId: c.id,
          evidence: { spendCents: check.spendCents },
        });
        if (written.created) {
          await db.protectionEvent.create({
            data: { organizationId, mairoCampaignId: c.id, kind: "STOP_LOSS", action: "NOTIFIED", message: check.message, amountCents: check.spendCents },
          });
          acted += 1;
        }
      }
    }
  }
  return acted;
}
