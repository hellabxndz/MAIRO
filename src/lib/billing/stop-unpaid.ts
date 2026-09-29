import { db } from "@/lib/db";
import { getAdapter } from "@/lib/ad-platforms/registry";
import { notify } from "@/lib/notifications/notify";

// When a subscription ends without ever being paid — the 7-day trial ended
// and the card on file was declined, or the trial was cancelled — MAIRO stops
// everything it runs for that business:
//   - every running or waiting campaign is paused on Meta and marked paused,
//   - nothing waits to go live (launch approvals are withdrawn),
//   - paid execution is locked until a new subscription starts.
// The business's details, approved plan, connected accounts and history are
// all kept, so choosing a plan again picks up where they left off.

export const TRIAL_UNPAID_REASON =
  "Your free trial ended and the payment didn't go through, so Mairo paused your campaigns. Your plan and settings are saved — choose a plan to turn them back on.";

export const STOPPED_STATUSES = ["past_due", "unpaid", "incomplete_expired", "canceled"];

export async function stopUnpaidExecution(organizationId: string, reason = TRIAL_UNPAID_REASON): Promise<{ paused: number; failed: number }> {
  const rows = await db.platformCampaign.findMany({
    where: { mairoCampaign: { organizationId }, status: { in: ["ACTIVE", "PENDING_REVIEW"] } },
    select: { id: true, platform: true, status: true, externalCampaignId: true, mairoCampaignId: true },
  });

  let paused = 0;
  let failed = 0;
  for (const row of rows) {
    // Only something that could be delivering needs a call to Meta; a
    // campaign still waiting for launch is already switched off there.
    if (row.status === "ACTIVE" && row.externalCampaignId) {
      const adapter = getAdapter(row.platform);
      const result = adapter ? await adapter.pauseCampaign({ organizationId, externalCampaignId: row.externalCampaignId }) : null;
      if (!result?.ok) {
        failed++;
        await db.platformCampaign.update({
          where: { id: row.id },
          data: { lastError: `Mairo couldn't pause this on Meta: ${result && !result.ok ? result.error.message : "not connected"}. Pause it in Ads Manager to stop spending.` },
        });
        continue;
      }
    }
    await db.platformCampaign.update({ where: { id: row.id }, data: { status: "PAUSED", lastError: reason } });
    paused++;
  }

  const campaignIds = [...new Set(rows.map((r) => r.mairoCampaignId))];
  if (campaignIds.length) {
    await db.mairoCampaign.updateMany({
      where: { id: { in: campaignIds }, organizationId },
      data: { launchApprovedAt: null },
    });
    await db.mairoCampaign.updateMany({ where: { id: { in: campaignIds }, organizationId, status: "ACTIVE" }, data: { status: "PAUSED" } });
  }

  await db.organization.update({
    where: { id: organizationId },
    data: { executionStoppedAt: new Date(), executionStoppedReason: reason, autoLaunchHeld: true },
  });

  await notify({
    organizationId,
    kind: "PAYMENT_ISSUE",
    title: failed ? "Payment didn't go through — some campaigns need pausing in Ads Manager" : "Payment didn't go through — Mairo paused your campaigns",
    body: failed
      ? `${reason} ${failed} campaign${failed === 1 ? "" : "s"} couldn't be paused from Mairo; pause ${failed === 1 ? "it" : "them"} in Meta Ads Manager to stop spending.`
      : reason,
    actionLabel: "Choose a plan",
    actionHref: "/plan/activate",
    dedupeKey: `unpaid-stop:${new Date().toISOString().slice(0, 10)}`,
  }).catch((error) => console.error("Unpaid stop notification failed:", error));

  return { paused, failed };
}

/**
 * Backstop for a missed webhook: any business whose subscription ended or
 * failed without ever being paid, that still has something running.
 */
export async function stopUnpaidSweep(): Promise<{ organizations: number }> {
  const orgs = await db.organization.findMany({
    where: {
      hasPaid: false,
      subscriptionStatus: { in: STOPPED_STATUSES },
      mairoCampaigns: { some: { platformCampaigns: { some: { status: { in: ["ACTIVE", "PENDING_REVIEW"] } } } } },
    },
    select: { id: true },
    take: 25,
  });
  for (const o of orgs) await stopUnpaidExecution(o.id).catch((error) => console.error("Unpaid stop failed:", o.id, error));
  return { organizations: orgs.length };
}
