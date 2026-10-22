// A stand-in for Stripe's API and hosted Checkout page, for browser tests of
// the checkout journey on a machine that can't (or mustn't) reach Stripe.
//
// SIMULATED. Passing a test against this is not a Stripe test-mode purchase.
// It implements only what MAIRO's checkout uses, with Stripe's request and
// response shapes; the app is pointed at it with STRIPE_FAKE_API, which the
// client honours only with an sk_test_ key (src/lib/stripe/client.ts).
//
//   node scripts/e2e/fake-stripe.mjs 12111

import http from "node:http";

const port = Number(process.argv[2] ?? 12111);
const base = `http://localhost:${port}`;
const customers = new Map();
const sessions = new Map();
const subscriptions = new Map();
let n = 0;
const id = (prefix) => `${prefix}_${Date.now().toString(36)}${(++n).toString(36)}`;
const now = () => Math.floor(Date.now() / 1000);

/** Stripe's form encoding (a[b][0][c]=d) into nested objects. */
function parseForm(text) {
  const out = {};
  for (const [key, value] of new URLSearchParams(text)) {
    const path = key.replace(/\]/g, "").split("[");
    let at = out;
    path.forEach((k, i) => {
      if (i === path.length - 1) at[k] = value;
      else at = at[k] ??= /^\d+$/.test(path[i + 1]) ? [] : {};
    });
  }
  return out;
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "request-id": id("req") });
  res.end(JSON.stringify(body));
}
const missing = (res, what) => json(res, 404, { error: { type: "invalid_request_error", code: "resource_missing", message: `No such ${what}` } });

function withSubscription(s, expand) {
  return expand && s.subscription ? { ...s, subscription: subscriptions.get(s.subscription) } : s;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, base);
  const body = await new Promise((r) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => r(d));
  });
  const form = parseForm(body);
  const expand = [...url.searchParams.keys()].some((k) => k.startsWith("expand")) || JSON.stringify(form.expand ?? "").includes("subscription");
  const parts = url.pathname.split("/").filter(Boolean);
  console.log(req.method, url.pathname);

  // ——— the API ———
  if (parts[0] === "v1") {
    const [, a, b, c, d] = parts;
    if (a === "customers" && req.method === "POST" && !b) {
      const cust = { id: id("cus"), object: "customer", email: form.email, name: form.name, metadata: form.metadata ?? {} };
      customers.set(cust.id, cust);
      return json(res, 200, cust);
    }
    if (a === "customers" && b) return customers.has(b) ? json(res, 200, customers.get(b)) : missing(res, `customer: '${b}'`);
    if (a === "checkout" && b === "sessions") {
      if (req.method === "POST" && !c) {
        const sid = `cs_test_${Date.now().toString(36)}${(++n).toString(36)}fake`;
        const s = {
          id: sid,
          object: "checkout.session",
          mode: form.mode,
          status: "open",
          payment_status: "unpaid",
          customer: form.customer,
          client_reference_id: form.client_reference_id ?? null,
          metadata: form.metadata ?? {},
          success_url: form.success_url,
          cancel_url: form.cancel_url,
          url: `${base}/pay/${sid}`,
          expires_at: now() + 86400,
          subscription: null,
          _price: form.line_items?.[0]?.price,
          _trial: Number(form.subscription_data?.trial_period_days ?? 0),
          _subMetadata: form.subscription_data?.metadata ?? {},
        };
        sessions.set(sid, s);
        console.log(`  checkout ${form.mode} for ${s._price}, trial ${s._trial} days, idempotency ${req.headers["idempotency-key"] ? "yes" : "no"}`);
        return json(res, 200, s);
      }
      if (req.method === "GET" && !c) {
        const list = [...sessions.values()].filter(
          (s) => s.customer === url.searchParams.get("customer") && (!url.searchParams.get("status") || s.status === url.searchParams.get("status"))
        );
        return json(res, 200, { object: "list", data: list, has_more: false, url: "/v1/checkout/sessions" });
      }
      if (c && d === "expire") {
        const s = sessions.get(c);
        if (!s) return missing(res, `checkout.session: '${c}'`);
        s.status = "expired";
        return json(res, 200, s);
      }
      if (c) return sessions.has(c) ? json(res, 200, withSubscription(sessions.get(c), expand)) : missing(res, `checkout.session: '${c}'`);
    }
    if (a === "subscriptions" && b) {
      const sub = subscriptions.get(b);
      if (!sub) return missing(res, `subscription: '${b}'`);
      if (req.method === "DELETE") sub.status = "canceled";
      return json(res, 200, sub);
    }
    return json(res, 400, { error: { type: "invalid_request_error", message: `fake Stripe doesn't do ${req.method} ${url.pathname}` } });
  }

  // ——— the hosted Checkout page ———
  if (parts[0] === "pay" && parts[1]) {
    const s = sessions.get(parts[1]);
    if (!s) {
      res.writeHead(404);
      return res.end("No such checkout");
    }
    if (req.method === "POST") {
      if (s.status !== "open") {
        res.writeHead(410);
        return res.end("This checkout is no longer open.");
      }
      const subId = id("sub");
      const end = now() + (s._trial > 0 ? s._trial : 30) * 86400;
      subscriptions.set(subId, {
        id: subId,
        object: "subscription",
        status: s._trial > 0 ? "trialing" : "active",
        customer: s.customer,
        metadata: s._subMetadata,
        cancel_at_period_end: false,
        cancel_at: null,
        trial_end: s._trial > 0 ? end : null,
        items: { object: "list", data: [{ id: `si_${subId}`, price: { id: s._price }, current_period_end: end }] },
      });
      Object.assign(s, { status: "complete", payment_status: s._trial > 0 ? "no_payment_required" : "paid", subscription: subId });
      res.writeHead(303, { location: s.success_url.replace("{CHECKOUT_SESSION_ID}", s.id) });
      return res.end();
    }
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(`<!doctype html><title>Fake Stripe Checkout</title><h1>Fake Stripe Checkout</h1>
      <p data-price>${s._price}</p><p data-trial>${s._trial > 0 ? `${s._trial} days free` : "Due today"}</p>
      <form method="post"><button>Pay</button></form><a href="${s.cancel_url}">Back</a>`);
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, () => console.log(`fake Stripe on ${base}`));
