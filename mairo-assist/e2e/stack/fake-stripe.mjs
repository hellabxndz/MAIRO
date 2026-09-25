// E2E ONLY: a stand-in for the parts of Stripe's API the app uses, plus a
// hosted "checkout page". Webhooks are signed with the webhook secret exactly
// like Stripe (t=..., v1=HMAC-SHA256("t.body")).
//   POST /v1/checkout/sessions           GET /v1/checkout/sessions/:id
//   GET|POST /v1/subscriptions/:id        POST /v1/billing_portal/sessions
//   GET  /pay/:id  (Pay / Decline / Cancel)   POST /pay/:id
//   POST /__cancel {subscription}  -> ends a subscription (customer.subscription.deleted)
//   GET  /__requests               -> API calls received
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.FAKE_STRIPE_PORT ?? 54329);
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_e2e";
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e";
const WEBHOOK_URL = process.env.APP_STRIPE_WEBHOOK_URL ?? "http://localhost:3100/api/webhooks/stripe";
const AMOUNTS = { price_e2e_starter: 14900, price_e2e_growth: 29900, price_e2e_pro: 49900 };

const sessions = new Map();
const subs = new Map();
const requests = [];
const id = (p) => `${p}_${randomBytes(8).toString("hex")}`;
const json = (res, status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
const now = () => Math.floor(Date.now() / 1000);

function sendWebhook(type, object) {
  const body = JSON.stringify({ id: id("evt"), type, data: { object } });
  const t = now();
  const sig = createHmac("sha256", WHSEC).update(`${t}.${body}`).digest("hex");
  setTimeout(() => {
    fetch(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${sig}` }, body }).catch(() => {});
  }, 50);
}

function subscription(price, customer, metadata) {
  const start = now();
  return {
    id: id("sub"),
    object: "subscription",
    customer,
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    metadata,
    items: { data: [{ id: id("si"), price: { id: price, unit_amount: AMOUNTS[price] ?? 0, currency: "usd" }, current_period_start: start, current_period_end: start + 30 * 86400 }] },
  };
}

function page(s, error) {
  return `<!doctype html><html><head><title>Fake Stripe Checkout</title></head><body style="font-family:sans-serif;padding:40px">
<h1>Fake Stripe Checkout</h1><p>Plan: <strong>${s.metadata.plan_key}</strong> · ${(AMOUNTS[s.price] / 100).toFixed(2)} USD / month</p>
${error ? `<p role="alert" style="color:#b00">${error}</p>` : ""}
<form method="post" action="/pay/${s.id}"><button type="submit">Pay</button></form>
<form method="post" action="/pay/${s.id}?decline=1"><button type="submit">Decline card</button></form>
<a href="${s.cancel_url}">Cancel and go back</a></body></html>`;
}

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url, BASE);
      const form = new URLSearchParams(raw);
      const p = url.pathname;

      if (p === "/__requests") return json(res, 200, requests);
      if (p === "/__cancel") {
        const body = JSON.parse(raw || "{}");
        const sub = subs.get(body.subscription);
        if (!sub) return json(res, 404, {});
        Object.assign(sub, { status: "canceled", canceled_at: now() });
        sendWebhook("customer.subscription.deleted", sub);
        return json(res, 200, sub);
      }

      const pay = /^\/pay\/(cs_\w+)$/.exec(p);
      if (pay) {
        const s = sessions.get(pay[1]);
        if (!s) return res.writeHead(404).end("No such session");
        if (req.method === "GET") return res.writeHead(200, { "content-type": "text/html" }).end(page(s));
        if (url.searchParams.get("decline")) return res.writeHead(200, { "content-type": "text/html" }).end(page(s, "Your card was declined."));
        const customer = s.customer ?? id("cus");
        const sub = subscription(s.price, customer, s.metadata);
        subs.set(sub.id, sub);
        Object.assign(s, { status: "complete", payment_status: "paid", customer, subscription: sub.id });
        sendWebhook("checkout.session.completed", { ...s });
        return res.writeHead(303, { location: s.success_url.replace("{CHECKOUT_SESSION_ID}", s.id) }).end();
      }

      if (!p.startsWith("/v1/")) return json(res, 404, {});
      if (req.headers.authorization !== `Bearer ${KEY}`) return json(res, 401, { error: { message: "Invalid API Key provided" } });
      requests.push({ method: req.method, path: p, params: Object.fromEntries(form) });

      if (p === "/v1/checkout/sessions" && req.method === "POST") {
        const s = {
          id: id("cs_test"),
          object: "checkout.session",
          status: "open",
          payment_status: "unpaid",
          client_reference_id: form.get("client_reference_id"),
          customer: form.get("customer"),
          subscription: null,
          metadata: { business_id: form.get("metadata[business_id]"), plan_key: form.get("metadata[plan_key]") },
          success_url: form.get("success_url"),
          cancel_url: form.get("cancel_url"),
          price: form.get("line_items[0][price]"),
        };
        if (!AMOUNTS[s.price]) return json(res, 400, { error: { message: "No such price" } });
        s.url = `${BASE}/pay/${s.id}`;
        sessions.set(s.id, s);
        return json(res, 200, s);
      }
      const cs = /^\/v1\/checkout\/sessions\/(cs_\w+)$/.exec(p);
      if (cs && req.method === "GET") {
        const s = sessions.get(cs[1]);
        if (!s) return json(res, 404, { error: { message: "No such checkout.session" } });
        const expand = url.searchParams.getAll("expand[0]").includes("subscription");
        return json(res, 200, { ...s, subscription: expand && s.subscription ? subs.get(s.subscription) : s.subscription });
      }
      const sm = /^\/v1\/subscriptions\/(sub_\w+)$/.exec(p);
      if (sm) {
        const sub = subs.get(sm[1]);
        if (!sub) return json(res, 404, { error: { message: "No such subscription" } });
        if (req.method === "POST") {
          const price = form.get("items[0][price]");
          if (price) sub.items.data[0].price = { id: price, unit_amount: AMOUNTS[price] ?? 0, currency: "usd" };
          if (form.has("cancel_at_period_end")) sub.cancel_at_period_end = form.get("cancel_at_period_end") === "true";
          if (form.get("metadata[plan_key]")) sub.metadata = { ...sub.metadata, plan_key: form.get("metadata[plan_key]") };
          sendWebhook("customer.subscription.updated", sub);
        }
        return json(res, 200, sub);
      }
      if (p === "/v1/billing_portal/sessions" && req.method === "POST") return json(res, 200, { id: id("bps"), url: `${BASE}/portal?customer=${form.get("customer")}` });
      return json(res, 404, { error: { message: "Unknown endpoint" } });
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fake stripe on ${PORT}`));
