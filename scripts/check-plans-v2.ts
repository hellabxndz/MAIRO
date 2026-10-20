// Checks the move to two plans, MAIRO Pro and MAIRO Scale, against the real
// webhook handler and database:
//
//   - only Pro and Scale can be bought; earlier plans keep their prices and
//     their Stripe price ids still map back to them;
//   - a Pro trial, an upgrade to Scale, a renewal, a failed payment, a
//     downgrade back to Pro and a cancellation each land where they should,
//     with one confirmation notice per plan and none on a renewal;
//   - the businesses a Scale owner adds follow the plan — covered on Scale,
//     locked (never paused) on Pro or after cancelling, oldest first — and a
//     freelancer's clients are left alone;
//   - the Scale-only gates hold on the server: team seats, the Performance
//     Coach, advanced tracking, Social Manager.
//
//   npm run check:plans-v2   (needs DATABASE_URL; Stripe is stubbed — nothing
//                             reaches Stripe or Meta, nobody is contacted)

import assert from "node:assert/strict";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { stripe, purchasableTiers, tierForPriceId } from "../src/lib/stripe/client";
import { PLANS, SOLD_TIERS, isSoldTier, planFor } from "../src/lib/plans";
import { can, entitlementsFor } from "../src/lib/entitlements";
import { hasActivePlan } from "../src/lib/readiness";
import { brandsOf, extraBusinessesFor, payingBusinessOf, syncBrands } from "../src/lib/brands";
import { seatProblem } from "../src/lib/members/store";
import { COACH_LOCKED, runCoach } from "../src/lib/coach/run";
import { socialAccess } from "../src/lib/social/access";

const TAG = `zz-plans2-${Date.now()}`;
const SECRET = "whsec_test_plans_v2";
const PRICE = { PRO: "price_test_pro", SCALE_V2: "price_test_scale_v2", STARTER: "price_test_starter", GROWTH: "price_test_growth", SCALE: "price_test_scale_old" } as const;

// Test values only, set before anything reads them. No real key or price.
process.env.STRIPE_SECRET_KEY = "sk_test_plans_v2_stub";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_PRICE_PRO = PRICE.PRO;
process.env.STRIPE_PRICE_SCALE_V2 = PRICE.SCALE_V2;
process.env.STRIPE_PRICE_STARTER = PRICE.STARTER;
process.env.STRIPE_PRICE_GROWTH = PRICE.GROWTH;
process.env.STRIPE_PRICE_SCALE = PRICE.SCALE;
delete process.env.STRIPE_PRICE_STUDIO;
delete process.env.STRIPE_PRICE_AGENCY;

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// Stripe, stubbed: the webhook reads the live subscription and may cancel an
// unpaid one. Both answer from here, so nothing leaves this machine.
const live = new Map<string, Stripe.Subscription>();
const cancelled: string[] = [];
const client = stripe() as unknown as { subscriptions: Record<string, unknown> };
client.subscriptions.retrieve = async (id: string) => {
  const s = live.get(id);
  if (!s) throw new Error(`no stub for ${id}`);
  return s;
};
client.subscriptions.cancel = async (id: string) => {
  cancelled.push(id);
  return { id, status: "canceled" };
};

function subscription(id: string, organizationId: string, price: string, status: Stripe.Subscription.Status, periodEnd: number, extra: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id,
    object: "subscription",
    status,
    customer: `cus_${id}`,
    metadata: { organizationId },
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: status === "trialing" ? periodEnd : null,
    items: { object: "list", data: [{ id: `si_${id}`, price: { id: price }, current_period_end: periodEnd }] },
    ...extra,
  } as unknown as Stripe.Subscription;
}

let POST: (req: NextRequest) => Promise<Response>;

/** Delivers a signed event to the real webhook handler. */
async function deliver(type: string, sub: Stripe.Subscription): Promise<number> {
  live.set(sub.id, sub);
  const payload = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, object: "event", type, data: { object: sub } });
  const header = stripe().webhooks.generateTestHeaderString({ payload, secret: SECRET });
  const res = await POST(new NextRequest("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header, "content-type": "application/json" } }));
  return res.status;
}

const orgRow = (id: string) =>
  db.organization.findUniqueOrThrow({ where: { id }, select: { subscriptionTier: true, subscriptionStatus: true, hasPaid: true, paymentRequired: true, executionStoppedAt: true, stripeSubscriptionId: true } });
const notices = (id: string) => db.notification.findMany({ where: { organizationId: id, kind: "SUBSCRIPTION_CHANGE", dedupeKey: { startsWith: "sub-plan:" } }, select: { title: true } });

async function org(id: string, data: Record<string, unknown> = {}) {
  await db.organization.create({ data: { id: `${TAG}-${id}`, name: `Plans ${id}`, paymentRequired: true, ...data } });
  return `${TAG}-${id}`;
}

async function runningCampaign(organizationId: string) {
  const c = await db.mairoCampaign.create({ data: { organizationId, name: "Running", objective: "LEADS", status: "ACTIVE", totalDailyBudgetCents: 2000, launchApprovedAt: new Date() } });
  return db.platformCampaign.create({ data: { mairoCampaignId: c.id, platform: "META", externalCampaignId: `ext-${c.id}`, budgetPercent: 100, dailyBudgetCents: 2000, status: "ACTIVE" }, select: { id: true } });
}

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG }, parentId: { not: null } } });
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  await db.user.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  POST = (await import("../src/app/api/stripe/webhook/route")).POST;
  const day = 86_400;
  const now = Math.floor(Date.now() / 1000);

  console.log("— what can be bought —");
  await check("only MAIRO Pro and MAIRO Scale are sold, and only they are purchasable", () => {
    assert.deepEqual(SOLD_TIERS, ["PRO", "SCALE_V2"]);
    assert.deepEqual(purchasableTiers(), ["PRO", "SCALE_V2"]);
    for (const t of ["STARTER", "GROWTH", "SCALE", "STUDIO", "AGENCY", "NONE"] as const) assert.equal(isSoldTier(t), false, t);
  });
  await check("every price id maps back to its own plan — the new two and each earlier one", () => {
    for (const [tier, id] of Object.entries(PRICE)) assert.equal(tierForPriceId(id), tier, tier);
    assert.equal(tierForPriceId("price_nobody_knows"), null);
  });
  await check("the earlier Scale keeps its own price and allowances, separate from MAIRO Scale", () => {
    assert.equal(planFor("SCALE").priceMonthly, 499.99);
    assert.equal(planFor("SCALE_V2").priceMonthly, 299);
    assert.equal(extraBusinessesFor("SCALE"), 0, "the earlier Scale never had extra ad accounts");
    assert.equal(extraBusinessesFor("SCALE_V2"), 2);
    assert.equal(extraBusinessesFor("PRO"), 0);
  });

  console.log("— a business through Pro, Scale and back —");
  const home = await org("home");
  const subId = `sub_${TAG}`;
  await check("a Pro checkout starts a 7-day trial and says so once", async () => {
    assert.equal(await deliver("customer.subscription.created", subscription(subId, home, PRICE.PRO, "trialing", now + 7 * day)), 200);
    const o = await orgRow(home);
    assert.deepEqual([o.subscriptionTier, o.subscriptionStatus, o.hasPaid], ["PRO", "trialing", false]);
    assert.ok(hasActivePlan(o));
    assert.deepEqual((await notices(home)).map((n) => n.title), ["Welcome to MAIRO Pro"]);
    // A redelivered event changes nothing and says nothing again.
    await deliver("customer.subscription.created", subscription(subId, home, PRICE.PRO, "trialing", now + 7 * day));
    assert.equal((await notices(home)).length, 1);
  });
  await check("on Pro: one ad account, no team, no Coach, no advanced tracking, no Social Manager", async () => {
    const e = await entitlementsFor(home);
    assert.deepEqual([e.ad_account_limit, e.member_limit, e.studio_credits_monthly], [1, 1, 50]);
    assert.equal(await can(home, "advanced_tracking"), false);
    assert.equal(await can(home, "advanced_analytics"), false);
    assert.equal(await can(home, "autopilot"), false);
    assert.equal((await socialAccess(home)).ok, false);
    const coach = await runCoach(home);
    assert.ok(!coach.ok && coach.reason === COACH_LOCKED, "the Coach doesn't run on Pro");
    // The owner is the one seat Pro has.
    const owner = await db.user.create({ data: { email: `${TAG}-owner@example.test`, name: "Owner", role: "CLIENT", organizationId: home } });
    await db.organizationMember.create({ data: { organizationId: home, userId: owner.id, role: "OWNER" } });
    assert.match((await seatProblem(home)) ?? "", /part of MAIRO Scale/);
  });
  await check("upgrading to Scale unlocks everything Scale includes, and says so", async () => {
    assert.equal(await deliver("customer.subscription.updated", subscription(subId, home, PRICE.SCALE_V2, "active", now + 30 * day)), 200);
    const o = await orgRow(home);
    assert.deepEqual([o.subscriptionTier, o.subscriptionStatus, o.hasPaid], ["SCALE_V2", "active", true]);
    const e = await entitlementsFor(home);
    assert.deepEqual([e.ad_account_limit, e.member_limit, e.studio_credits_monthly], [3, Infinity, 200]);
    for (const f of ["advanced_tracking", "advanced_analytics", "auto_optimize", "autopilot", "growth_coach", "social_posting"] as const) assert.equal(await can(home, f), true, f);
    assert.equal((await socialAccess(home)).ok, true);
    assert.equal(await seatProblem(home), null);
    assert.deepEqual((await notices(home)).map((n) => n.title).sort(), ["Welcome to MAIRO Pro", "You're now on MAIRO Scale"]);
  });

  const brandA = await org("brand-a", { parentId: home, subscriptionTier: "NONE" });
  const brandB = await org("brand-b", { parentId: home, subscriptionTier: "NONE" });
  // A third one can't be added through the app; made here to prove the
  // allowance covers the oldest two and no more.
  const brandC = await org("brand-c", { parentId: home, subscriptionTier: "NONE" });
  const running = await runningCampaign(brandA);

  await check("Scale covers two more businesses, oldest first; a third isn't covered", async () => {
    const r = await syncBrands(home);
    assert.deepEqual(r, { covered: 2, uncovered: 1 });
    for (const b of [brandA, brandB]) {
      const o = await orgRow(b);
      assert.deepEqual([o.subscriptionTier, o.subscriptionStatus], ["SCALE_V2", "active"], b);
      assert.ok(hasActivePlan(o));
      assert.equal((await entitlementsFor(b)).social_posting, true);
      assert.equal((await payingBusinessOf(b))?.id, home);
    }
    const c = await orgRow(brandC);
    assert.equal(c.subscriptionTier, "NONE");
    assert.equal(hasActivePlan(c), false);
    assert.equal(c.stripeSubscriptionId, null, "an added business never has a subscription of its own");
    assert.equal((await brandsOf(home)).length, 3);
  });
  await check("a renewal keeps the plan and the businesses, and sends no new notice", async () => {
    const before = (await notices(home)).length;
    assert.equal(await deliver("customer.subscription.updated", subscription(subId, home, PRICE.SCALE_V2, "active", now + 60 * day)), 200);
    assert.equal((await orgRow(home)).subscriptionTier, "SCALE_V2");
    assert.equal((await orgRow(brandB)).subscriptionTier, "SCALE_V2");
    assert.equal((await notices(home)).length, before);
  });
  await check("a failed renewal keeps the plan and pauses nothing — the card can be fixed", async () => {
    assert.equal(await deliver("customer.subscription.updated", subscription(subId, home, PRICE.SCALE_V2, "past_due", now + 60 * day)), 200);
    const o = await orgRow(home);
    assert.deepEqual([o.subscriptionTier, o.subscriptionStatus, o.executionStoppedAt], ["SCALE_V2", "past_due", null]);
    assert.equal((await orgRow(brandA)).subscriptionStatus, "past_due");
    assert.equal((await db.platformCampaign.findUniqueOrThrow({ where: { id: running.id } })).status, "ACTIVE");
    assert.equal(cancelled.length, 0, "a business that has paid is never cancelled for a failed card");
    await deliver("customer.subscription.updated", subscription(subId, home, PRICE.SCALE_V2, "active", now + 60 * day));
  });
  await check("moving to Pro locks the added businesses without pausing what they run", async () => {
    assert.equal(await deliver("customer.subscription.updated", subscription(subId, home, PRICE.PRO, "active", now + 60 * day)), 200);
    assert.equal((await orgRow(home)).subscriptionTier, "PRO");
    for (const b of [brandA, brandB, brandC]) {
      const o = await orgRow(b);
      assert.equal(o.subscriptionTier, "NONE", b);
      assert.equal(hasActivePlan(o), false, b);
      assert.equal((await socialAccess(b)).ok, false);
    }
    assert.equal((await db.platformCampaign.findUniqueOrThrow({ where: { id: running.id } })).status, "ACTIVE", "running campaigns keep running until the owner pauses them");
    assert.equal((await brandsOf(home)).length, 3, "nothing is deleted");
    // Team members already there stay; new ones wait for Scale.
    assert.equal(await db.organizationMember.count({ where: { organizationId: home } }), 1);
    assert.match((await seatProblem(home)) ?? "", /part of MAIRO Scale/);
  });
  await check("back on Scale, the same two are covered again", async () => {
    await deliver("customer.subscription.updated", subscription(subId, home, PRICE.SCALE_V2, "active", now + 60 * day));
    assert.equal((await orgRow(brandA)).subscriptionTier, "SCALE_V2");
    assert.equal((await orgRow(brandB)).subscriptionTier, "SCALE_V2");
    assert.equal((await orgRow(brandC)).subscriptionTier, "NONE");
  });
  await check("cancelling ends the plan everywhere, and still pauses nothing", async () => {
    assert.equal(await deliver("customer.subscription.deleted", subscription(subId, home, PRICE.SCALE_V2, "canceled", now + 60 * day)), 200);
    const o = await orgRow(home);
    assert.deepEqual([o.subscriptionTier, o.stripeSubscriptionId], ["NONE", null]);
    for (const b of [brandA, brandB]) assert.equal((await orgRow(b)).subscriptionTier, "NONE");
    assert.equal((await db.platformCampaign.findUniqueOrThrow({ where: { id: running.id } })).status, "ACTIVE");
  });

  console.log("— the edges —");
  await check("a Pro trial that ends unpaid stops what MAIRO runs, as before", async () => {
    const t = await org("trial");
    const tid = `sub_${TAG}_trial`;
    await deliver("customer.subscription.created", subscription(tid, t, PRICE.PRO, "trialing", now + 7 * day));
    const c = await db.mairoCampaign.create({ data: { organizationId: t, name: "Waiting", objective: "LEADS", status: "ACTIVE", totalDailyBudgetCents: 1000, launchApprovedAt: new Date() } });
    const pc = await db.platformCampaign.create({ data: { mairoCampaignId: c.id, platform: "META", externalCampaignId: null, budgetPercent: 100, dailyBudgetCents: 1000, status: "PENDING_REVIEW" } });
    await deliver("customer.subscription.updated", subscription(tid, t, PRICE.PRO, "past_due", now));
    assert.ok((await orgRow(t)).executionStoppedAt, "stopped");
    assert.equal((await db.platformCampaign.findUniqueOrThrow({ where: { id: pc.id } })).status, "PAUSED");
    assert.ok(cancelled.includes(tid), "and the unpaid subscription is cancelled rather than retried");
  });
  await check("a subscriber on an earlier plan keeps it, and its allowances, through renewals", async () => {
    const legacy = await org("legacy", { paymentRequired: false });
    const lid = `sub_${TAG}_legacy`;
    await deliver("customer.subscription.updated", subscription(lid, legacy, PRICE.SCALE, "active", now + 30 * day));
    const o = await orgRow(legacy);
    assert.equal(o.subscriptionTier, "SCALE");
    const e = await entitlementsFor(legacy);
    assert.deepEqual([e.studio_credits_monthly, e.member_limit, e.growth_coach, e.social_posting], [400, Infinity, true, true]);
    assert.equal((await socialAccess(legacy)).ok, true);
    // A Growth subscriber, likewise.
    const g = await org("legacy-growth", { paymentRequired: false });
    await deliver("customer.subscription.updated", subscription(`${lid}_g`, g, PRICE.GROWTH, "active", now + 30 * day));
    assert.equal((await orgRow(g)).subscriptionTier, "GROWTH");
    assert.equal(await can(g, "auto_optimize"), true);
  });
  await check("an unrecognised price leaves a paying customer's plan alone", async () => {
    const u = await org("unknown");
    const uid = `sub_${TAG}_unknown`;
    await deliver("customer.subscription.created", subscription(uid, u, PRICE.SCALE_V2, "active", now + 30 * day));
    await deliver("customer.subscription.updated", subscription(uid, u, "price_typo", "active", now + 30 * day));
    assert.equal((await orgRow(u)).subscriptionTier, "SCALE_V2");
  });
  await check("a forged event is refused", async () => {
    const payload = JSON.stringify({ type: "customer.subscription.updated", data: { object: subscription("sub_forged", home, PRICE.SCALE_V2, "active", now) } });
    const res = await POST(new NextRequest("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": "t=1,v1=forged" } }));
    assert.equal(res.status, 400);
  });
  await check("a freelancer's client businesses are never treated as Scale brands", async () => {
    const ws = await org("workspace", { kind: "WORKSPACE", subscriptionTier: "AGENCY", subscriptionStatus: "active" });
    const client = await org("client", { parentId: ws, subscriptionTier: "NONE" });
    assert.deepEqual(await syncBrands(ws), { covered: 0, uncovered: 0 });
    assert.equal((await orgRow(client)).subscriptionTier, "NONE");
    assert.equal(await payingBusinessOf(client), null);
  });
  await check("the pricing shown is the pricing sold", () => {
    assert.deepEqual(PLANS.map((p) => `${p.name} $${p.priceMonthly}`), ["MAIRO Pro $139", "MAIRO Scale $299"]);
  });

  await cleanup();
  console.log(`\nPlans: ${passed} checks passed. Stripe was stubbed; nothing reached Stripe or Meta, and nobody was contacted.`);
}

main()
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => undefined);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
