import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/notify";
import { runningMetaCampaigns } from "@/lib/billing/running-campaigns";
import { cancellationNotice } from "@/lib/billing/cancellation-notice";

// Telling the business what a cancellation means, the moment Stripe confirms
// it — and again when the plan actually ends. Each notice names the campaigns
// still running in Meta, because cancelling MAIRO never pauses them.
//
// Called from the Stripe webhook with the state before and after the event.
// Keyed by subscription, so a redelivered event says nothing twice; undoing a
// cancellation clears its notice, so cancelling again is announced again.

export async function announceCancellation(input: {
  organizationId: string;
  subscriptionId: string;
  cancelAtBefore: Date | null;
  cancelAtNow: Date | null;
  ended: boolean;
  /** Whether the business ever paid. A trial that ends unpaid is paused for them, and told elsewhere. */
  hadPaid: boolean;
}): Promise<void> {
  const scheduledKey = `sub-cancelling:${input.subscriptionId}`;
  const endedKey = `sub-ended:${input.subscriptionId}`;
  const href = "/dashboard/billing/cancel#campaigns";

  if (!input.ended && !input.cancelAtNow && input.cancelAtBefore) {
    await db.notification.deleteMany({ where: { organizationId: input.organizationId, dedupeKey: scheduledKey } });
    return;
  }

  const announceScheduled = !input.ended && input.cancelAtNow && !input.cancelAtBefore;
  const announceEnded = input.ended && input.hadPaid;
  if (!announceScheduled && !announceEnded) return;

  const running = (await runningMetaCampaigns([input.organizationId])).length;
  const n = cancellationNotice({ kind: announceEnded ? "ended" : "scheduled", endsOn: input.cancelAtNow, running });
  await notify({
    organizationId: input.organizationId,
    kind: "SUBSCRIPTION_CHANGE",
    dedupeKey: announceEnded ? endedKey : scheduledKey,
    title: n.title,
    body: n.body,
    actionLabel: running > 0 ? "Review running campaigns" : "View billing",
    actionHref: running > 0 ? href : "/dashboard/billing",
    evidence: { subscriptionId: input.subscriptionId, running },
    smsBody: n.sms,
  });
}
