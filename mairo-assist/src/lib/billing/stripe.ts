import "server-only";
import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/security/tokens";
import { isPaidSelfServe, type PlanKey } from "./plans";

/*
 * A small Stripe client over the REST API (form-encoded). Only what self-serve
 * billing needs: Checkout for the first purchase, subscription updates for
 * plan changes, the Billing Portal, and webhook signature checks.
 */

type PaidKey = "starter" | "growth" | "pro";

export function stripeConfig() {
  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const prices: Record<PaidKey, string> = {
    starter: process.env.STRIPE_PRICE_STARTER ?? "",
    growth: process.env.STRIPE_PRICE_GROWTH ?? "",
    pro: process.env.STRIPE_PRICE_PRO ?? "",
  };
  return { secretKey, webhookSecret, prices };
}

/** Paid plans can be bought only when Stripe is fully configured. */
export function isStripeConfigured() {
  const c = stripeConfig();
  return Boolean(c.secretKey && c.webhookSecret && c.prices.starter && c.prices.growth && c.prices.pro);
}

/** In automated tests only, requests go to a local fake Stripe; refused on production deployments. */
function apiBase() {
  const test = process.env.STRIPE_TEST_API_BASE_URL;
  if (test && process.env.VERCEL_ENV !== "production") return test.replace(/\/+$/, "");
  return "https://api.stripe.com";
}

export function priceFor(plan: PaidKey) {
  return stripeConfig().prices[plan];
}

export function planForPrice(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null;
  const { prices } = stripeConfig();
  const hit = (Object.keys(prices) as PaidKey[]).find((k) => prices[k] === priceId);
  return hit && isPaidSelfServe(hit) ? hit : null;
}

export class StripeError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

/** Flatten {a: {b: 1}, c: [x]} into Stripe's a[b]=1&c[0]=x form encoding. */
export function encodeForm(params: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === "object" ? encodeForm(item as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === "object") encodeForm(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe<T>(method: "GET" | "POST", path: string, params: Record<string, unknown> = {}, idempotencyKey?: string): Promise<T> {
  const { secretKey } = stripeConfig();
  if (!secretKey) throw new StripeError("Stripe is not configured", 503);
  const form = encodeForm(params);
  const url = method === "GET" && [...form].length ? `${apiBase()}${path}?${form}` : `${apiBase()}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: method === "POST" ? form.toString() : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
  if (!res.ok) throw new StripeError(json.error?.message ?? `Stripe returned ${res.status}`, res.status, json.error?.code);
  return json as T;
}

export type StripeSubscription = {
  id: string;
  customer: string;
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "incomplete_expired" | "unpaid" | "paused";
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  current_period_start?: number;
  current_period_end?: number;
  metadata: Record<string, string>;
  items: { data: { id: string; price: { id: string; unit_amount: number | null; currency: string }; current_period_start?: number; current_period_end?: number }[] };
};

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  client_reference_id: string | null;
  customer: string | null;
  subscription: string | StripeSubscription | null;
  metadata: Record<string, string>;
};

export function createCheckoutSession(opts: {
  businessId: string;
  plan: PaidKey;
  email: string;
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}) {
  const meta = { business_id: opts.businessId, plan_key: opts.plan };
  return stripe<StripeCheckoutSession>(
    "POST",
    "/v1/checkout/sessions",
    {
      mode: "subscription",
      line_items: [{ price: priceFor(opts.plan), quantity: 1 }],
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      client_reference_id: opts.businessId,
      ...(opts.customerId ? { customer: opts.customerId } : { customer_email: opts.email }),
      metadata: meta,
      subscription_data: { metadata: meta },
    },
    opts.idempotencyKey,
  );
}

export function retrieveCheckoutSession(id: string) {
  return stripe<StripeCheckoutSession>("GET", `/v1/checkout/sessions/${encodeURIComponent(id)}`, { expand: ["subscription"] });
}

export function retrieveSubscription(id: string) {
  return stripe<StripeSubscription>("GET", `/v1/subscriptions/${encodeURIComponent(id)}`);
}

/**
 * Move an existing subscription to another plan. The change only takes effect
 * if the prorated invoice is paid (pending_if_incomplete), so an upgrade is
 * never granted on a failed payment.
 */
export function changeSubscriptionPlan(sub: StripeSubscription, plan: PaidKey, idempotencyKey: string) {
  return stripe<StripeSubscription>(
    "POST",
    `/v1/subscriptions/${encodeURIComponent(sub.id)}`,
    {
      items: [{ id: sub.items.data[0].id, price: priceFor(plan) }],
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
      cancel_at_period_end: false,
      metadata: { ...sub.metadata, plan_key: plan },
    },
    idempotencyKey,
  );
}

/** Downgrade to Free at the end of the paid period (nothing more is charged). */
export function cancelAtPeriodEnd(subscriptionId: string, cancel: boolean) {
  return stripe<StripeSubscription>("POST", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, { cancel_at_period_end: cancel });
}

export function createPortalSession(customerId: string, returnUrl: string) {
  return stripe<{ url: string }>("POST", "/v1/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
}

/** Stripe-Signature: t=<unix>,v1=<hex hmac of "t.body">; several v1 values may be present. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSeconds = 300, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!t || !sigs.length || !/^\d+$/.test(t)) return false;
  if (Math.abs(now / 1000 - Number(t)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return sigs.some((s) => safeEqual(expected, s));
}

/** Sign a payload like Stripe does (tests and the local fake). */
export function signStripePayload(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`;
}

export function periodOf(sub: StripeSubscription) {
  const item = sub.items.data[0];
  const start = sub.current_period_start ?? item?.current_period_start;
  const end = sub.current_period_end ?? item?.current_period_end;
  return {
    start: start ? new Date(start * 1000).toISOString() : null,
    end: end ? new Date(end * 1000).toISOString() : null,
  };
}
