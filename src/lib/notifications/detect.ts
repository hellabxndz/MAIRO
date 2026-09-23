import { db } from "@/lib/db";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { platformName } from "@/lib/ad-platforms/registry";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { notify } from "./notify";
import { syncAdReviews } from "@/lib/campaigns/ad-review-sync";
import { runSpendProtection } from "@/lib/protection/run";

// MAIRO noticing things nobody asked it to look at.
//
// This is the difference between a dashboard and an employee. A dashboard
// waits to be opened and then shows you numbers; an employee tells you the
// cost per purchase has been climbing for three days and has already drafted
// replacements. Everything in here is the second one.
//
// Three rules, and they are what keeps it from becoming noise:
//
//   It must be true. Every detector reads real figures and refuses on thin
//   data. Nothing is inferred from an absence — a platform that reported
//   nothing has reported nothing, which is not the same as zero.
//
//   It must be specific. "Your ads need attention" is a notification people
//   learn to ignore. "You have spent $340 without a purchase since Tuesday"
//   is one they act on, so every body string is written from the account's
//   own numbers rather than from a template with a noun slotted in.
//
//   It must be worth interrupting somebody. The bar is a decision they would
//   make differently if they knew. Everything else is the activity log.

/**
 * Enough money spent for a comparison to mean anything.
 *
 * The same threshold the health grade uses, for the same reason: under a few
 * dollars, one click swings every ratio, and a notification built on that
 * tells somebody to move real money for no reason.
 */
const MIN_SPEND_CENTS = 2000;

/** How much cheaper one platform has to be before it is worth saying so. */
const MEANINGFUL_GAP = 0.25;

export type DetectResult = {
  /** Situations found, whether or not they were new. */
  found: number;
  /** Rows actually written — the rest were already known. */
  created: number;
};

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Look at one business and write down anything worth telling them.
 *
 * Safe to call repeatedly. Every notification is keyed on the situation rather
 * than the moment, so running this hourly and running it daily produce the same
 * notifications — just sooner.
 */
export async function detectFor(organizationId: string): Promise<DetectResult> {
  const result: DetectResult = { found: 0, created: 0 };

  const campaigns = await db.mairoCampaign.findMany({
    where: { organizationId, status: { not: "ARCHIVED" } },
    select: { id: true, name: true, status: true },
  });
  const live = campaigns.filter((c) => c.status === "ACTIVE");

  // A disconnected account is worth saying even with nothing running, because
  // it is the one problem that silently stops everything else from working.
  await detectDisconnected(organizationId, live.length > 0, result);

  // Meta's verdict on each ad, including ones not live yet — a rejection is
  // exactly what stops a waiting campaign from ever starting.
  try {
    result.found += await syncAdReviews(organizationId);
  } catch (error) {
    console.error("Ad review sync failed:", error);
  }

  if (live.length === 0) return result;

  // Spend Protection first: a limit that's been hit matters more than an insight.
  try {
    result.found += await runSpendProtection(organizationId);
  } catch (error) {
    console.error("Spend Protection run failed:", error);
  }

  let report;
  try {
    report = await fetchOrganizationPerformance(organizationId);
  } catch (error) {
    // A network being unreachable is not a thing to notify a business owner
    // about — it is an operator's problem, and it will be there next run.
    console.error("Insight detection could not read performance:", error);
    return result;
  }

  await detectSpendingWithoutResults(organizationId, report, result);
  await detectPlatformGap(organizationId, report, result);

  return result;
}

type Report = Awaited<ReturnType<typeof fetchOrganizationPerformance>>;

/**
 * Spending with nothing coming back.
 *
 * The one state worth interrupting somebody about, and the only one that does
 * not need a revenue figure to be certain of — zero purchases on real spend is
 * zero however you value them.
 */
async function detectSpendingWithoutResults(
  organizationId: string,
  report: Report,
  result: DetectResult,
) {
  for (const campaign of report.campaigns) {
    const spend = campaign.total.spendCents;
    const purchases = campaign.total.purchases ?? campaign.total.conversions;
    if (spend === null || spend < MIN_SPEND_CENTS) continue;
    if (purchases === null || purchases > 0) continue;

    result.found += 1;
    // Keyed on the campaign and the rough size of the problem, so it says so
    // once — and again if the situation materially worsens, which is a
    // different thing worth hearing about.
    const band = Math.floor(spend / 5000);
    const written = await notify({
      organizationId,
      kind: "NEEDS_ATTENTION",
      dedupeKey: `no-results:${campaign.mairoCampaignId}:${band}`,
      mairoCampaignId: campaign.mairoCampaignId,
      title: `${campaign.name} has spent ${money(spend)} without a result`,
      body: `Nothing has come back from it yet. MAIRO is narrowing the audience and testing different creative; if it stays flat it will propose pausing it. Nothing about this changes what you are spending in total.`,
      actionLabel: "Look at the campaign",
      actionHref: `/dashboard/campaigns/${campaign.mairoCampaignId}`,
      evidence: { spendCents: spend, purchases },
      smsBody: `${campaign.name} has spent ${money(spend)} without a result. MAIRO is working on it.`,
    });
    if (written.created) result.created += 1;
  }
}

/**
 * One platform doing meaningfully better than another.
 *
 * Stated as an opportunity rather than acted on, because moving money between
 * platforms is a change the customer's automation level governs — and at
 * Manual, which is the default, MAIRO's job here is to say so and wait.
 */
async function detectPlatformGap(
  organizationId: string,
  report: Report,
  result: DetectResult,
) {
  const comparable = report.byPlatform.filter(
    (p) =>
      p.metrics.spendCents !== null &&
      p.metrics.spendCents >= MIN_SPEND_CENTS &&
      p.metrics.costPerPurchaseCents !== null &&
      (p.metrics.purchases ?? 0) > 0,
  );
  if (comparable.length < 2) return;

  const sorted = [...comparable].sort(
    (a, b) => (a.metrics.costPerPurchaseCents ?? 0) - (b.metrics.costPerPurchaseCents ?? 0),
  );
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const bestCost = best.metrics.costPerPurchaseCents!;
  const worstCost = worst.metrics.costPerPurchaseCents!;
  if (bestCost <= 0) return;

  const gap = (worstCost - bestCost) / worstCost;
  if (gap < MEANINGFUL_GAP) return;

  result.found += 1;
  const percent = Math.round(gap * 100);
  const written = await notify({
    organizationId,
    kind: "BUDGET_OPPORTUNITY",
    // Banded, so a gap that drifts a point either way does not re-announce
    // itself, but one that widens substantially does.
    dedupeKey: `platform-gap:${best.platform}:${worst.platform}:${Math.floor(percent / 10)}`,
    title: `${platformName(best.platform)} is producing results ${percent}% cheaper than ${platformName(worst.platform)}`,
    body: `${platformName(best.platform)} is costing you ${money(bestCost)} a result against ${money(worstCost)} on ${platformName(worst.platform)}. Moving some budget across would likely buy more for the same money. MAIRO will not move it without you unless you have set it to.`,
    actionLabel: "See the numbers",
    actionHref: "/dashboard/analytics",
    evidence: {
      best: { platform: best.platform, costPerPurchaseCents: bestCost },
      worst: { platform: worst.platform, costPerPurchaseCents: worstCost },
    },
    smsBody: `${platformName(best.platform)} is producing results ${percent}% cheaper than ${platformName(worst.platform)} right now.`,
  });
  if (written.created) result.created += 1;
}

/**
 * An ad account that has stopped being connected.
 *
 * Worth a notification even on an account with nothing running, because the
 * next thing the customer tries to do will fail and this is the reason.
 */
async function detectDisconnected(
  organizationId: string,
  hasLive: boolean,
  result: DetectResult,
) {
  let connections;
  try {
    connections = await connectionSummaries(organizationId);
  } catch (error) {
    console.error("Insight detection could not read connections:", error);
    return;
  }

  for (const summary of connections.values()) {
    // Never connected is not disconnected. Somebody who has not linked TikTok
    // does not need telling that TikTok is not linked — and the map only
    // carries platforms that have a row at all, so `connectedAt` being set is
    // what distinguishes "was working and stopped" from "never started".
    if (summary.connected || !summary.connectedAt) continue;

    result.found += 1;
    const name = platformName(summary.platform);
    const written = await notify({
      organizationId,
      kind: "ACCOUNT_DISCONNECTED",
      dedupeKey: `disconnected:${summary.platform}`,
      title: `Your ${name} account is no longer connected`,
      body: hasLive
        ? `MAIRO cannot read results from ${name} or make changes there until it is reconnected. Anything running on ${name} keeps spending in the meantime — the platform is still delivering it, MAIRO just cannot see it.`
        : `Reconnect it whenever you are ready. Nothing is running on ${name} at the moment, so nothing is being spent.`,
      actionLabel: "Reconnect",
      actionHref: "/dashboard/integrations",
      evidence: { platform: summary.platform },
      smsBody: `Your ${name} ad account disconnected from MAIRO. Reconnect it so MAIRO can keep managing it.`,
    });
    if (written.created) result.created += 1;
  }
}

/**
 * Every business with something running.
 *
 * For the daily cron. Bounded and sequential — each business costs a live
 * performance fetch, and a parallel sweep across every account is how an
 * operator discovers a rate limit.
 */
export async function detectAll(limit = 50): Promise<DetectResult> {
  const total: DetectResult = { found: 0, created: 0 };

  const organizations = await db.organization.findMany({
    where: { mairoCampaigns: { some: { status: "ACTIVE" } } },
    select: { id: true },
    take: limit,
  });

  for (const org of organizations) {
    try {
      const one = await detectFor(org.id);
      total.found += one.found;
      total.created += one.created;
    } catch (error) {
      // One unhappy account must not cost every other one its notifications.
      console.error(`Insight detection failed for ${org.id}:`, error);
    }
  }

  return total;
}
