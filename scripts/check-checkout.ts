// Checks buying MAIRO Pro and MAIRO Scale end to end, against the real
// checkout code, the real return page logic, the real webhook handler and the
// database — with Stripe replaced by an in-memory fake:
//
//   - each plan opens a subscription-mode Checkout Session for its own price,
//     Pro with its 7-day trial and Scale with none; nothing is substituted;
//   - a plan whose price isn't configured, or a Stripe that rejects the key
//     or the price, is an explicit error for the customer (no secrets, no
//     operator jargon) and never a silent return to the same page;
//   - repeated clicks reuse one open session, and switching plan expires the
//     other, so two subscriptions can't be paid for at once;
//   - the return from Stripe is believed only after the session has been read
//     back from Stripe and found to belong to this business; a success URL
//     on its own unlocks nothing;
//   - the webhook and the return agree, the approved plan is activated, a
//     returning subscriber isn't sent to choose a plan again, and the plan,
//     business details and Meta connection survive the whole trip.
//
// SIMULATED: no request reaches Stripe. Passing here is not a real test-mode
// purchase — that needs Stripe test keys and a browser (docs/LAUNCH-AUDIT).
//
//   npm run check:checkout   (needs DATABASE_URL)

import assert from "node:assert/strict";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { stripe, purchasableTiers } from "../src/lib/stripe/client";
import { encryptSecret } from "../src/lib/crypto/secret-box";

const TAG = `zz-checkout-${Date.now()}`;
const SECRET = "whsec_test_checkout";
const PRICE = { PRO: "price_test_checkout_pro", SCALE_V2: "price_test_checkout_scale" };

// Test values only, set before anything reads them. No real key or price.
process.env.STRIPE_SECRET_KEY = "sk_test_checkout_stub";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_PRICE_PRO = PRICE.PRO;
process.env.STRIPE_PRICE_SCALE_V2 = PRICE.SCALE_V2;
process.env.NEXT_PUBLIC_APP_URL = "https://www.mairo.test";
delete process.env.SENTRY_DSN;

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// ——— the fake Stripe ———————————————————————————————————————————————

type Session = Stripe.Checkout.Session;
const customers = new Map<string, { id: string; metadata: Record<string, string> }>();
const sessions = new Map<string, Session>();
const subscriptions = new Map<string, Stripe.Subscription>();
const paramsOf = new Map<string, Stripe.Checkout.SessionCreateParams>();
const created: { params: Stripe.Checkout.SessionCreateParams; key?: string }[] = [];
const expired: string[] = [];
let failCreateWith: Error | null = null;
let n = 0;

const client = stripe() as unknown as Record<string, Record<string, unknown>>;
client.customers.retrieve = async (id: string) => {
  const c = customers.get(id);
  if (!c) throw Object.assign(new Stripe.errors.StripeInvalidRequestError({ message: `No such customer: '${id}'`, code: "resource_missing" } as never), {});
  return c;
};
client.customers.create = async (params: { metadata: Record<string, string> }) => {
  const c = { id: `cus_${TAG}_${++n}`, metadata: params.metadata };
  customers.set(c.id, c);
  return c;
};
(client.checkout as Record<string, unknown>).sessions = {
  list: async ({ customer, status }: { customer: string; status: string }) => ({ data: [...sessions.values()].filter((s) => s.customer === customer && s.status === status) }),
  expire: async (id: string) => {
    const s = sessions.get(id)!;
    s.status = "expired";
    expired.push(id);
    return s;
  },
  create: async (params: Stripe.Checkout.SessionCreateParams, options?: { idempotencyKey?: string }) => {
    created.push({ params, key: options?.idempotencyKey });
    if (failCreateWith) throw failCreateWith;
    const id = `cs_test_${TAG.replace(/\W/g, "")}${++n}`;
    const s = {
      id,
      object: "checkout.session",
      mode: params.mode,
      status: "open",
      payment_status: "unpaid",
      customer: params.customer,
      client_reference_id: params.client_reference_id,
      metadata: params.metadata,
      success_url: params.success_url,
      cancel_url: params.cancel_url,
      url: `https://checkout.stripe.test/c/pay/${id}`,
      expires_at: Math.floor(Date.now() / 1000) + 86_400,
      subscription: null,
    } as unknown as Session;
    sessions.set(id, s);
    paramsOf.set(id, params);
    return s;
  },
  retrieve: async (id: string) => {
    const s = sessions.get(id);
    if (!s) throw new Stripe.errors.StripeInvalidRequestError({ message: `No such checkout.session: '${id}'`, code: "resource_missing" } as never);
    // expand: ["subscription"]
    return { ...s, subscription: typeof s.subscription === "string" ? subscriptions.get(s.subscription) ?? null : s.subscription };
  },
};
client.subscriptions.retrieve = async (id: string) => {
  const s = subscriptions.get(id);
  if (!s) throw new Error(`no stub for ${id}`);
  return s;
};
client.subscriptions.cancel = async (id: string) => ({ id, status: "canceled" });

/** What Stripe does when the customer finishes paying on its page. */
function pay(sessionId: string, status: Stripe.Subscription.Status, paymentStatus: "paid" | "unpaid" | "no_payment_required" = status === "trialing" ? "no_payment_required" : "paid") {
  const s = sessions.get(sessionId)!;
  const params = paramsOf.get(sessionId)!;
  const subId = `sub_${sessionId}`;
  const day = 86_400;
  const now = Math.floor(Date.now() / 1000);
  const end = now + (status === "trialing" ? 7 : 30) * day;
  subscriptions.set(subId, {
    id: subId,
    object: "subscription",
    status,
    customer: s.customer,
    metadata: params.subscription_data?.metadata ?? {},
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: status === "trialing" ? end : null,
    items: { object: "list", data: [{ id: `si_${subId}`, price: { id: (params.line_items![0] as { price: string }).price }, current_period_end: end }] },
  } as unknown as Stripe.Subscription);
  s.status = "complete";
  s.payment_status = paymentStatus;
  s.subscription = subId;
  return subId;
}

// ——— fixtures ———————————————————————————————————————————————————————————

async function business(id: string, extra: Record<string, unknown> = {}) {
  const orgId = `${TAG}-${id}`;
  await db.organization.create({ data: { id: orgId, name: `Checkout ${id}`, paymentRequired: true, ...extra } });
  await db.onboardingIntake.create({ data: { organizationId: orgId, primaryGoal: "LEADS", monthlyBudgetCents: 90_000, offering: "Roof repair", customerLocation: "Austin, TX" } });
  await db.strategyPlan.create({ data: { organizationId: orgId, status: "APPROVED", planJson: JSON.stringify({ goal: "LEADS", dailyBudget: 30 }), approvedSnapshotJson: JSON.stringify({ goal: "LEADS", dailyBudget: 30 }), approvedAt: new Date(), approvedVersion: 0 } });
  await db.metaAdAccount.create({ data: { organizationId: orgId, metaAdAccountId: `act_${id}`, accessToken: encryptSecret("fake-token"), status: "CONNECTED", pageId: "1234", pageName: "Test Page" } });
  return orgId;
}

const orgRow = (id: string) =>
  db.organization.findUniqueOrThrow({ where: { id }, select: { subscriptionTier: true, subscriptionStatus: true, hasPaid: true, stripeSubscriptionId: true, stripeCustomerId: true } });

/** Everything the customer built before paying: it must come through untouched. */
async function onboardingState(id: string) {
  const [intake, plan, meta] = await Promise.all([
    db.onboardingIntake.findUnique({ where: { organizationId: id }, select: { primaryGoal: true, monthlyBudgetCents: true, offering: true, customerLocation: true } }),
    db.strategyPlan.findUnique({ where: { organizationId: id }, select: { status: true, planJson: true, approvedSnapshotJson: true, approvedVersion: true } }),
    db.metaAdAccount.findUnique({ where: { organizationId: id }, select: { metaAdAccountId: true, status: true, pageId: true, accessToken: true } }),
  ]);
  return JSON.stringify({ intake, plan, meta });
}

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function main() {
  const { beginCheckout } = await import("../src/lib/billing/checkout");
  const { confirmCheckout } = await import("../src/lib/billing/confirm-checkout");
  const { activateIfPaid } = await import("../src/lib/strategy/store");
  const { explainSubscription } = await import("../src/lib/onboarding/problems");
  const { POST } = await import("../src/app/api/stripe/webhook/route");
  const proxy = await import("../src/proxy");

  async function deliver(type: string, object: unknown, signed = true): Promise<number> {
    const payload = JSON.stringify({ id: `evt_${++n}`, object: "event", type, data: { object } });
    const header = signed ? stripe().webhooks.generateTestHeaderString({ payload, secret: SECRET }) : "t=1,v1=forged";
    const res = await POST(new NextRequest("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header, "content-type": "application/json" } }));
    return res.status;
  }

  const pro = await business("pro");
  const scale = await business("scale");
  const other = await business("other");
  const before = { pro: await onboardingState(pro), scale: await onboardingState(scale) };

  console.log("— opening checkout —");
  let proSession = "";
  await check("1. Pro opens a subscription checkout for Pro's own price, tied to the business", async () => {
    const r = await beginCheckout({ organizationId: pro, email: `${TAG}@example.test`, tier: "PRO" });
    assert.equal(r.kind, "redirect");
    assert.ok(r.kind === "redirect" && r.url.startsWith("https://checkout.stripe.test/"), "the customer is sent to Stripe's page");
    const p = created.at(-1)!.params;
    assert.equal(p.mode, "subscription");
    assert.deepEqual(p.line_items, [{ price: PRICE.PRO, quantity: 1 }]);
    assert.equal(p.client_reference_id, pro);
    assert.deepEqual(p.metadata, { organizationId: pro, tier: "PRO", returnTo: "plan" });
    assert.deepEqual(p.subscription_data?.metadata, { organizationId: pro });
    assert.equal(p.success_url, "https://www.mairo.test/billing/return?session_id={CHECKOUT_SESSION_ID}", "the return names the session, for reading back from Stripe");
    proSession = [...sessions.keys()].at(-1)!;
  });
  await check("3. Pro's checkout carries the 7-day trial", () => {
    assert.equal(created.at(-1)!.params.subscription_data?.trial_period_days, 7);
  });
  let scaleSession = "";
  await check("2/4. Scale opens a checkout for Scale's own price, billed from today with no trial", async () => {
    const r = await beginCheckout({ organizationId: scale, email: `${TAG}@example.test`, tier: "SCALE_V2" });
    assert.equal(r.kind, "redirect");
    const p = created.at(-1)!.params;
    assert.deepEqual(p.line_items, [{ price: PRICE.SCALE_V2, quantity: 1 }], "never Pro's price");
    assert.equal(p.subscription_data?.trial_period_days, undefined, "no trial field at all — Stripe rejects 0");
    scaleSession = [...sessions.keys()].at(-1)!;
  });
  await check("a plan MAIRO doesn't sell is refused before Stripe is asked", async () => {
    const count = created.length;
    for (const tier of ["GROWTH", "STARTER", "SCALE", "NONE", "", "PRO; DROP TABLE"]) {
      const r = await beginCheckout({ organizationId: other, email: "x@example.test", tier });
      assert.equal(r.kind, "error", tier);
    }
    assert.equal(created.length, count);
  });

  console.log("— configuration problems —");
  await check("6. a missing Scale price makes Scale explicitly unavailable — never Pro's price instead — and Pro still sells", async () => {
    delete process.env.STRIPE_PRICE_SCALE_V2;
    try {
      assert.deepEqual(purchasableTiers(), ["PRO"]);
      const count = created.length;
      const r = await beginCheckout({ organizationId: other, email: "x@example.test", tier: "SCALE_V2" });
      assert.equal(r.kind, "error");
      assert.ok(r.kind === "error" && r.code === "plan_unavailable");
      assert.ok(r.kind === "error" && /MAIRO Scale can't be bought right now/.test(r.message) && /Nothing was charged/.test(r.message));
      assert.ok(r.kind === "error" && !/STRIPE_|sk_|price_/.test(r.message), "no variable names or ids shown to the customer");
      assert.equal(created.length, count, "Stripe never asked");
    } finally {
      process.env.STRIPE_PRICE_SCALE_V2 = PRICE.SCALE_V2;
    }
  });
  await check("5. Stripe rejecting the key or the price is a clear, secret-free error, and the button can retry", async () => {
    const cases: [Error, string][] = [
      [new Stripe.errors.StripeAuthenticationError({ message: "Invalid API Key provided: sk_test_****stub" } as never), "stripe_config"],
      [new Stripe.errors.StripeInvalidRequestError({ message: "No such price: 'price_test_checkout_pro'", code: "resource_missing" } as never), "stripe_config"],
      [new Stripe.errors.StripeInvalidRequestError({ message: "The price specified is set to `type=one_time` but this field only accepts prices with `type=recurring`." } as never), "stripe_config"],
      [new Stripe.errors.StripeConnectionError({ message: "An error occurred with our connection to Stripe." } as never), "stripe_unavailable"],
    ];
    for (const [error, code] of cases) {
      failCreateWith = error;
      try {
        const r = await beginCheckout({ organizationId: other, email: "x@example.test", tier: "PRO" });
        assert.ok(r.kind === "error", code);
        assert.equal(r.kind === "error" && r.code, code);
        assert.ok(r.kind === "error" && /Nothing was charged/.test(r.message));
        assert.ok(r.kind === "error" && !/sk_|STRIPE_|price_/.test(r.message), `no secret or setting in: ${r.kind === "error" && r.message}`);
      } finally {
        failCreateWith = null;
      }
    }
  });
  await check("5. no secret key at all: explicitly unavailable, nothing attempted", async () => {
    const key = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const r = await beginCheckout({ organizationId: other, email: "x@example.test", tier: "PRO" });
      assert.ok(r.kind === "error" && r.code === "plan_unavailable");
    } finally {
      process.env.STRIPE_SECRET_KEY = key;
    }
  });

  console.log("— repeated clicks —");
  await check("12. a second click on the same plan reuses the open checkout instead of opening another", async () => {
    const count = created.length;
    const r = await beginCheckout({ organizationId: pro, email: `${TAG}@example.test`, tier: "PRO" });
    assert.ok(r.kind === "redirect" && r.reused && r.url.endsWith(proSession));
    assert.equal(created.length, count);
  });
  await check("12. every new checkout carries an idempotency key, so simultaneous clicks collapse into one", () => {
    for (const c of created.filter((x) => x.params.metadata?.organizationId === pro)) assert.match(c.key ?? "", new RegExp(`^checkout-${pro}-PRO-\\d+$`));
  });
  await check("12. switching plan expires the other open checkout, so Pro and Scale can't both be paid", async () => {
    const r = await beginCheckout({ organizationId: other, email: "x@example.test", tier: "PRO" });
    assert.equal(r.kind, "redirect");
    const first = [...sessions.values()].find((s) => s.metadata?.organizationId === other && s.status === "open")!.id;
    const r2 = await beginCheckout({ organizationId: other, email: "x@example.test", tier: "SCALE_V2" });
    assert.equal(r2.kind, "redirect");
    assert.ok(expired.includes(first), "the Pro checkout was expired");
    assert.equal([...sessions.values()].filter((s) => s.metadata?.organizationId === other && s.status === "open").length, 1);
  });

  console.log("— coming back from Stripe —");
  await check("8. a success URL alone proves nothing: an unpaid session unlocks nothing", async () => {
    const r = await confirmCheckout(proSession, pro);
    assert.deepEqual(r, { kind: "failed", returnTo: "plan", reason: "unfinished" });
    assert.equal((await orgRow(pro)).subscriptionTier, "NONE");
  });
  await check("8. a made-up or malformed session id unlocks nothing", async () => {
    assert.equal((await confirmCheckout("cs_test_doesnotexist0000", pro)).kind, "invalid");
    assert.equal((await confirmCheckout("../../etc", pro)).kind, "invalid");
    assert.equal((await confirmCheckout("", pro)).kind, "invalid");
  });
  await check("another business's paid session can't unlock this one", async () => {
    const otherOpen = [...sessions.values()].find((s) => s.metadata?.organizationId === other && s.status === "open")!.id;
    pay(otherOpen, "active");
    const r = await confirmCheckout(otherOpen, pro);
    assert.equal(r.kind, "not-yours");
    assert.equal((await orgRow(pro)).subscriptionTier, "NONE");
  });
  await check("3/8/13. Pro paid on Stripe: read back from Stripe, trial recorded, plan activated", async () => {
    pay(proSession, "trialing");
    const r = await confirmCheckout(proSession, pro);
    assert.deepEqual(r, { kind: "active", returnTo: "plan", status: "trialing" });
    const o = await orgRow(pro);
    assert.deepEqual([o.subscriptionTier, o.subscriptionStatus, o.hasPaid], ["PRO", "trialing", false], "a trial is not yet a payment");
    const plan = await activateIfPaid(pro);
    assert.ok(plan?.activatedAt, "the approved plan is turned into the first campaign's starting point");
  });
  await check("4/11. Scale paid: the signed webhook alone records it — active and paid from day one", async () => {
    const subId = pay(scaleSession, "active");
    assert.equal(await deliver("checkout.session.completed", { ...sessions.get(scaleSession), subscription: subId }), 200);
    const o = await orgRow(scale);
    assert.deepEqual([o.subscriptionTier, o.subscriptionStatus, o.hasPaid], ["SCALE_V2", "active", true]);
  });
  await check("11. the return after the webhook lands on the same state, with one welcome notice", async () => {
    const r = await confirmCheckout(scaleSession, scale);
    assert.deepEqual(r, { kind: "active", returnTo: "plan", status: "active" });
    const notices = await db.notification.count({ where: { organizationId: scale, dedupeKey: { startsWith: "sub-plan:" } } });
    assert.equal(notices, 1);
  });
  await check("11. a forged webhook is refused and changes nothing", async () => {
    const before = await orgRow(other);
    assert.equal(await deliver("customer.subscription.updated", { id: "sub_forged", status: "active", metadata: { organizationId: other } }, false), 400);
    assert.deepEqual(await orgRow(other), before);
  });

  console.log("— failed and cancelled checkouts —");
  const failing = await business("failing");
  const failingBefore = await onboardingState(failing);
  await check("9. a declined first payment is a failure with a retry, never an unlock", async () => {
    await beginCheckout({ organizationId: failing, email: "f@example.test", tier: "SCALE_V2" });
    const id = [...sessions.values()].find((s) => s.metadata?.organizationId === failing && s.status === "open")!.id;
    pay(id, "incomplete", "paid");
    const r = await confirmCheckout(id, failing);
    assert.deepEqual(r, { kind: "failed", returnTo: "plan", reason: "declined" });
    const o = await orgRow(failing);
    assert.equal(o.subscriptionStatus, "incomplete");
    assert.equal(o.hasPaid, false);
  });
  await check("9. a payment still processing waits — neither unlocked nor failed", async () => {
    await db.organization.update({ where: { id: failing }, data: { stripeSubscriptionId: null, subscriptionStatus: null } });
    await beginCheckout({ organizationId: failing, email: "f@example.test", tier: "PRO" });
    const id = [...sessions.values()].find((s) => s.metadata?.organizationId === failing && s.status === "open")!.id;
    pay(id, "incomplete", "unpaid");
    assert.equal((await confirmCheckout(id, failing)).kind, "pending");
  });
  await check("9. an expired checkout says so, with a retry", async () => {
    await db.organization.update({ where: { id: failing }, data: { stripeSubscriptionId: null, subscriptionStatus: null } });
    await beginCheckout({ organizationId: failing, email: "f@example.test", tier: "PRO" });
    const s = [...sessions.values()].find((x) => x.metadata?.organizationId === failing && x.status === "open")!;
    s.status = "expired";
    assert.deepEqual(await confirmCheckout(s.id, failing), { kind: "failed", returnTo: "plan", reason: "expired" });
  });
  await check("9. after a declined card, a new checkout is allowed (the incomplete one is replaced)", async () => {
    await db.organization.update({ where: { id: failing }, data: { stripeSubscriptionId: "sub_declined", subscriptionStatus: "incomplete" } });
    const r = await beginCheckout({ organizationId: failing, email: "f@example.test", tier: "PRO" });
    assert.equal(r.kind, "redirect");
  });
  await check("10. cancelling on Stripe's page returns to the plans (shown even before Meta is connected), with a way to retry", async () => {
    const p = created.at(-1)!.params;
    assert.equal(p.cancel_url, "https://www.mairo.test/plan/activate?skip=1&checkout=cancelled#plans");
    const problem = explainSubscription(null, { checkoutCancelled: true });
    assert.ok(problem && problem.fix?.href.includes("/plan/activate"), "the cancelled state offers the plans again");
    assert.equal((await orgRow(failing)).hasPaid, false);
  });

  console.log("— after paying —");
  await check("14. a returning subscriber can't open a second checkout (no second subscription, no second charge)", async () => {
    const count = created.length;
    for (const tier of ["PRO", "SCALE_V2"]) {
      const r = await beginCheckout({ organizationId: scale, email: "s@example.test", tier });
      assert.ok(r.kind === "error" && r.code === "already_subscribed", tier);
    }
    assert.equal(created.length, count);
  });
  await check("14. a returning subscriber goes to the campaign, not back to choosing a plan", async () => {
    const plan = await activateIfPaid(scale);
    assert.ok(plan?.activatedAt, "/plan/activate sends an activated plan on to /dashboard/launch");
    const again = await activateIfPaid(scale);
    assert.equal(again?.activatedAt?.getTime(), plan!.activatedAt!.getTime(), "activation happens once");
  });
  await check("15. strategy, business details and the Meta connection survive checkout, payment and return", async () => {
    assert.equal(await onboardingState(pro), before.pro);
    assert.equal(await onboardingState(scale), before.scale);
    assert.equal(await onboardingState(failing), failingBefore);
  });

  console.log("— routing —");
  await check("7. signed-out visitors to the plan screens are sent to sign in, and come back after", async () => {
    const res = await proxy.default(new NextRequest("https://www.mairo.test/plan/activate?skip=1"), {} as never);
    assert.ok(res);
    assert.equal(res!.status, 307);
    const to = new URL(res!.headers.get("location")!);
    assert.equal(to.pathname, "/sign-in");
    assert.equal(to.searchParams.get("callbackUrl"), "/plan/activate");
  });
  await check("7. nothing in the proxy stands between a customer and checkout, the return page or the webhook", () => {
    const matchers = proxy.config.matcher as string[];
    for (const m of matchers) assert.ok(!m.startsWith("/api") && !m.startsWith("/billing"), m);
  });
}

main()
  .then(() => console.log(`\n${passed} checks passed. (Stripe simulated — not a real test-mode purchase.)`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
  });
