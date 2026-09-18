import { db } from "@/lib/db";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { campaignHealth } from "@/lib/campaigns/health";
import { sendSms } from "@/lib/sms/send";

// The two updates that nothing else can trigger.
//
// "A campaign went live" and "MAIRO moved budget" are events — something
// happens in the product and a text goes out beside it. "Something needs
// attention" and "here is your week" are not events; they are the absence of
// one, which means somebody has to go and look. That is this.
//
// It runs on the daily cron, and it is written to cost almost nothing on an
// account that has not asked for either. The candidate query is the filter:
// only organizations with a verified, un-opted-out number and at least one of
// the two switches on are looked at, so the expensive part — one live
// performance fetch per business — never runs for anybody who would not be
// texted at the end of it.
//
// It will not send the same kind of text twice in a day. `lastSentAt` is the
// guard, and it is deliberately across all kinds rather than per kind: two
// texts from the same product in the same morning is the thing that makes
// somebody turn all of them off.

/** Business hours, roughly, in the deployment's zone. Nobody wants a 3am buzz. */
const EARLIEST_HOUR = 8;
const LATEST_HOUR = 21;

/** Which day the weekly summary goes out. 1 = Monday. */
const SUMMARY_DAY = 1;

export type SweepResult = {
  considered: number;
  attention: number;
  summaries: number;
  skipped: number;
};

export async function sweepSmsNotifications(
  opts: { limit?: number; now?: Date } = {},
): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const result: SweepResult = { considered: 0, attention: 0, summaries: 0, skipped: 0 };

  const hour = now.getHours();
  if (hour < EARLIEST_HOUR || hour > LATEST_HOUR) return result;

  const candidates = await db.smsPreference.findMany({
    where: {
      verifiedAt: { not: null },
      optedOutAt: null,
      OR: [{ onNeedsAttention: true }, { onWeeklySummary: true }],
    },
    take: opts.limit ?? 50,
  });

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const isSummaryDay = now.getDay() === SUMMARY_DAY;

  for (const pref of candidates) {
    result.considered += 1;

    // One text a day at most, whatever it would have said.
    if (pref.lastSentAt && pref.lastSentAt >= startOfToday) {
      result.skipped += 1;
      continue;
    }

    const wantsAttention = pref.onNeedsAttention;
    const wantsSummary = pref.onWeeklySummary && isSummaryDay;
    if (!wantsAttention && !wantsSummary) {
      result.skipped += 1;
      continue;
    }

    const live = await db.mairoCampaign.count({
      where: { organizationId: pref.organizationId, status: "ACTIVE" },
    });
    // Nothing running is not a problem to report and not a week to summarise.
    if (live === 0) {
      result.skipped += 1;
      continue;
    }

    // Written never to throw, but this loop runs inside a cron that must
    // finish — one unhappy network must not cost every other business their
    // notification.
    let report;
    try {
      report = await fetchOrganizationPerformance(pref.organizationId);
    } catch (error) {
      console.error("SMS sweep could not read performance:", error);
      result.skipped += 1;
      continue;
    }

    const health = campaignHealth(report.total, { live: true, scope: "account" });

    if (wantsAttention && health.level === "attention") {
      const sent = await sendSms(
        pref.organizationId,
        "needs-attention",
        `Heads up — your advertising needs a look. ${health.summary} ${health.note}`,
      );
      if (sent.sent) {
        result.attention += 1;
        continue;
      }
    }

    // Only when there was nothing urgent to say. A week summary sent on the
    // same morning as a problem alert buries the problem.
    if (wantsSummary) {
      const sent = await sendSms(
        pref.organizationId,
        "weekly-summary",
        `Your week with MAIRO: ${live} ${live === 1 ? "campaign" : "campaigns"} running. ${health.summary}`,
      );
      if (sent.sent) {
        result.summaries += 1;
        continue;
      }
    }

    result.skipped += 1;
  }

  return result;
}
