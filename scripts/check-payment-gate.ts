// Checks the paid line: a free-plan account can't build, change budgets,
// launch or generate creatives until it subscribes; the Meta adapter refuses
// the writes itself; a trial that ends unpaid stops everything.
//
//   npm run check:payment-gate   (needs DATABASE_URL; makes no network calls)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { hasActivePlan } from "../src/lib/readiness";
import { executionBlock } from "../src/lib/billing/execution";
import { getAdapter } from "../src/lib/ad-platforms/registry";
import { entitlementsFor } from "../src/lib/entitlements";
import { stopUnpaidExecution, stopUnpaidSweep } from "../src/lib/billing/stop-unpaid";
import { safeReturnTo } from "../src/lib/meta/return-to";
import { isFreePage } from "../src/components/strategy/free-access";
import { ALL_PLANS, trialDaysFor } from "../src/lib/plans";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = `zz-gate-${Date.now()}`;

async function org(id: string, data: Record<string, unknown>) {
  await db.organization.create({ data: { id: `${TAG}-${id}`, name: `Gate ${id}`, ...data } });
  return `${TAG}-${id}`;
}

async function campaign(organizationId: string, status: "ACTIVE" | "PENDING_REVIEW") {
  const c = await db.mairoCampaign.create({
    data: { organizationId, name: "Gate test", objective: "LEADS", status: "ACTIVE", totalDailyBudgetCents: 2000, launchApprovedAt: new Date() },
  });
  const pc = await db.platformCampaign.create({
    data: { mairoCampaignId: c.id, platform: "META", externalCampaignId: null, budgetPercent: 100, dailyBudgetCents: 2000, status },
  });
  return { campaignId: c.id, platformId: pc.id };
}

async function main() {
  await check("only Starter has a free trial — 7 days; every other plan bills from day one", () => {
    assert.equal(trialDaysFor("STARTER"), 7);
    for (const p of ALL_PLANS.filter((x) => x.tier !== "STARTER")) assert.equal(trialDaysFor(p.tier), 0, p.tier);
    assert.equal(trialDaysFor("NONE"), 0);
  });
  const billingOff = process.env.BILLING_ENFORCED?.trim() !== "1";

  await check("free-plan accounts need a live subscription, whatever BILLING_ENFORCED says", () => {
    assert.equal(hasActivePlan({ subscriptionTier: "NONE", subscriptionStatus: null, paymentRequired: true }), false);
    assert.equal(hasActivePlan({ subscriptionTier: "GROWTH", subscriptionStatus: "active", paymentRequired: true }), true);
    assert.equal(hasActivePlan({ subscriptionTier: "GROWTH", subscriptionStatus: "trialing", paymentRequired: true }), true);
    assert.equal(hasActivePlan({ subscriptionTier: "GROWTH", subscriptionStatus: "past_due", paymentRequired: true }), false);
    if (billingOff) assert.equal(hasActivePlan({ subscriptionTier: "NONE", subscriptionStatus: null }), true, "older accounts keep BILLING_ENFORCED behaviour");
  });

  const unpaid = await org("unpaid", { paymentRequired: true });
  const trialing = await org("trial", { paymentRequired: true, subscriptionTier: "GROWTH", subscriptionStatus: "trialing" });
  const legacy = await org("legacy", {});

  try {
    await check("an unpaid free-plan account is refused paid execution", async () => {
      assert.match((await executionBlock(unpaid)) ?? "", /Choose a Mairo plan/);
      assert.equal(await executionBlock(trialing), null);
      if (billingOff) assert.equal(await executionBlock(legacy), null);
    });

    await check("the Meta adapter refuses writes for an unpaid account before any network call", async () => {
      const meta = getAdapter("META")!;
      const created = await meta.createCampaign({ organizationId: unpaid } as never);
      assert.equal(created.ok, false);
      if (!created.ok) assert.equal(created.error.kind, "rejected");
      for (const r of [
        await meta.updateBudget({ organizationId: unpaid, externalCampaignId: "x", dailyBudgetCents: 5000 }),
        await meta.resumeCampaign({ organizationId: unpaid, externalCampaignId: "x" }),
        await meta.createAdGroup({ organizationId: unpaid } as never),
        await meta.createAd({ organizationId: unpaid } as never),
        await meta.updateSchedule({ organizationId: unpaid, externalAdGroupId: "x", startAt: null }),
      ]) assert.equal(r.ok, false);
      // Reads and pausing aren't wrapped.
      assert.equal(typeof meta.pauseCampaign, "function");
    });

    await check("no creative allowance before subscribing; a trial gets its plan's", async () => {
      assert.equal((await entitlementsFor(unpaid)).studio_credits_monthly, 0);
      assert.equal((await entitlementsFor(unpaid)).meta_ads, false);
      assert.equal((await entitlementsFor(trialing)).studio_credits_monthly, 150);
    });

    await check("a trial that ends unpaid stops everything and keeps the plan", async () => {
      const failed = await org("failed", { paymentRequired: true, subscriptionTier: "GROWTH", subscriptionStatus: "past_due", hasPaid: false });
      const { campaignId, platformId } = await campaign(failed, "PENDING_REVIEW");
      const r = await stopUnpaidExecution(failed);
      assert.equal(r.paused, 1);
      const pc = await db.platformCampaign.findUniqueOrThrow({ where: { id: platformId } });
      assert.equal(pc.status, "PAUSED");
      const c = await db.mairoCampaign.findUniqueOrThrow({ where: { id: campaignId } });
      assert.equal(c.launchApprovedAt, null);
      assert.equal(c.status, "PAUSED");
      const o = await db.organization.findUniqueOrThrow({ where: { id: failed } });
      assert.ok(o.executionStoppedAt && o.autoLaunchHeld);
      assert.match((await executionBlock(failed)) ?? "", /trial ended/);
      assert.equal(await db.notification.count({ where: { organizationId: failed, kind: "PAYMENT_ISSUE" } }), 1);
    });

    await check("the daily sweep catches a missed webhook, and leaves paying customers alone", async () => {
      const missed = await org("missed", { paymentRequired: true, subscriptionTier: "GROWTH", subscriptionStatus: "canceled", hasPaid: false });
      const paidBefore = await org("paidbefore", { subscriptionTier: "GROWTH", subscriptionStatus: "past_due", hasPaid: true });
      const a = await campaign(missed, "PENDING_REVIEW");
      const b = await campaign(paidBefore, "PENDING_REVIEW");
      await stopUnpaidSweep();
      assert.equal((await db.platformCampaign.findUniqueOrThrow({ where: { id: a.platformId } })).status, "PAUSED");
      assert.equal((await db.platformCampaign.findUniqueOrThrow({ where: { id: b.platformId } })).status, "PENDING_REVIEW");
    });

    await check("connecting Meta can return to the subscription step, and nowhere else outside the dashboard", () => {
      assert.equal(safeReturnTo("/plan/activate?connected=1"), "/plan/activate?connected=1");
      assert.equal(safeReturnTo("/plan/other"), null);
      assert.equal(safeReturnTo("/plan/activate?x=\r\nSet-Cookie"), null);
      assert.equal(safeReturnTo("https://evil.test/plan/activate"), null);
    });

    await check("free pages are open, paid pages are locked", () => {
      for (const p of ["/dashboard", "/dashboard/business", "/dashboard/meta", "/dashboard/integrations", "/dashboard/billing", "/dashboard/settings"]) assert.equal(isFreePage(p), true, p);
      for (const p of ["/dashboard/campaigns", "/dashboard/create/meta", "/dashboard/analytics", "/dashboard/decisions", "/dashboard/creative-studio", "/dashboard/reports", "/dashboard/businessx"]) assert.equal(isFreePage(p), false, p);
    });
  } finally {
    await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  }
  console.log(`\n${passed} payment gate checks passed.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } }).catch(() => undefined);
  process.exit(1);
});
