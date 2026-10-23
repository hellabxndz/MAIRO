// MAIRO's own ad measurement (lib/site-tracking.ts, components/site-pixel.tsx):
// where the pixel may run, when it's on at all, and exactly what the
// Conversions API is sent. Meta is stubbed: nothing leaves this machine.
//
//   npm run check:site-pixel

import assert from "node:assert/strict";
import { withGraphTransport } from "../src/lib/meta/client";
import { pixelAllowedOn, queryAllowed } from "../src/lib/site-pixel-paths";
import { later, reportSiteEvent, siteConversionsConfigured, sitePixelId } from "../src/lib/site-tracking";
import { hashEmail } from "../src/lib/tracking/hash";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

type Sent = { url: URL; data: Record<string, unknown>[] };
function stubMeta(answer: (url: URL) => Response = () => Response.json({ events_received: 1, messages: [] })) {
  const sent: Sent[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const form = new URLSearchParams(String(init?.body ?? ""));
    const raw = url.searchParams.get("data") ?? form.get("data") ?? "[]";
    sent.push({ url, data: JSON.parse(raw) as Record<string, unknown>[] });
    return answer(url);
  }) as typeof globalThis.fetch;
  return { sent, fetch };
}

function setEnv(pixel: string | undefined, token: string | undefined) {
  if (pixel === undefined) delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
  else process.env.NEXT_PUBLIC_META_PIXEL_ID = pixel;
  if (token === undefined) delete process.env.META_CONVERSIONS_TOKEN;
  else process.env.META_CONVERSIONS_TOKEN = token;
  delete process.env.META_CONVERSIONS_TEST_CODE;
}

async function main() {
  await check("the pixel runs on the public pages only", () => {
    for (const p of ["/", "/pricing", "/help", "/help/billing", "/tools/roas-calculator", "/solutions/local-services", "/sign-up", "/privacy", "/pricing/"]) {
      assert.equal(pixelAllowedOn(p), true, p);
    }
    for (const p of ["/dashboard", "/dashboard/launch", "/sign-in", "/aios", "/aios/setup", "/preview", "/onboarding", "/plan/activate", "/billing/return", "/s/abc123", "/r/tok", "/f/slug", "/clients", "/invite", "/reset-password", "/api/events", "/pricingx", "/helpdesk"]) {
      assert.equal(pixelAllowedOn(p), false, p);
    }
  });

  await check("…and only with ad-tracking parameters in the address", () => {
    for (const q of ["", "?fbclid=AbC", "?utm_source=facebook&utm_campaign=launch&fbclid=x", "?gclid=1"]) assert.equal(queryAllowed(q), true, q);
    for (const q of ["?website=example.com", "?type=shop", "?utm_source=fb&website=x", "?callbackUrl=/billing/return", "?error=1"]) assert.equal(queryAllowed(q), false, q);
  });

  await check("off unless a numeric pixel id is set; conversions need the token too", () => {
    setEnv(undefined, undefined);
    assert.equal(sitePixelId(), null);
    setEnv("<script>fbq()</script>", "tok");
    assert.equal(sitePixelId(), null, "a pasted snippet is not an id");
    assert.equal(siteConversionsConfigured(), false);
    setEnv("1234567890123", undefined);
    assert.equal(sitePixelId(), "1234567890123");
    assert.equal(siteConversionsConfigured(), false, "pixel alone: page views only");
    setEnv("1234567890123", "tok");
    assert.equal(siteConversionsConfigured(), true);
  });

  await check("no token: nothing is sent to Meta", async () => {
    setEnv("1234567890123", undefined);
    const meta = stubMeta();
    await withGraphTransport({ fetch: meta.fetch }, () => reportSiteEvent({ event: "Subscribe", eventId: "sub-x", path: "/billing/return", email: "a@b.co", fromRequest: false }));
    assert.equal(meta.sent.length, 0);
  });

  await check("a subscription goes to the pixel with a hashed email, the click ids and the plan's value", async () => {
    setEnv("1234567890123", "tok");
    const meta = stubMeta();
    await withGraphTransport({ fetch: meta.fetch }, () =>
      reportSiteEvent({
        event: "StartTrial",
        eventId: "sub-sub_123",
        path: "/billing/return",
        email: " Owner@Example.com ",
        clickIds: { fbp: "fb.1.1700000000000.123456789", fbc: "fb.1.1700000000000.AbCdEf" },
        valueCents: 13999,
        fromRequest: false,
      })
    );
    assert.equal(meta.sent.length, 1);
    const { url, data } = meta.sent[0];
    assert.match(url.pathname, /\/1234567890123\/events$/);
    const e = data[0] as { event_name: string; event_id: string; action_source: string; event_source_url: string; user_data: Record<string, unknown>; custom_data: { value: number; currency: string } };
    assert.equal(e.event_name, "StartTrial");
    assert.equal(e.event_id, "sub-sub_123", "stable id: a retry is the same event to Meta");
    assert.equal(e.action_source, "website");
    assert.match(e.event_source_url, /\/billing\/return$/);
    assert.deepEqual(e.user_data.em, [hashEmail("owner@example.com")]);
    assert.ok(!JSON.stringify(data).includes("Owner@Example.com") && !JSON.stringify(data).toLowerCase().includes("owner@example.com"), "never the email itself");
    assert.equal(e.user_data.fbp, "fb.1.1700000000000.123456789");
    assert.equal(e.user_data.fbc, "fb.1.1700000000000.AbCdEf");
    assert.equal(e.custom_data.value, 139.99);
    assert.equal(e.custom_data.currency, "USD");
    assert.equal(e.user_data.client_ip_address, undefined, "a webhook has no visitor IP to send");
  });

  await check("Meta failing never throws into a sign-up or a payment", async () => {
    setEnv("1234567890123", "tok");
    const meta = stubMeta(() => Response.json({ error: { message: "Invalid OAuth access token", code: 190 } }, { status: 400 }));
    await withGraphTransport({ fetch: meta.fetch }, () => reportSiteEvent({ event: "CompleteRegistration", eventId: "reg-x", path: "/sign-up", email: "a@b.co", fromRequest: false }));
    assert.equal(meta.sent.length, 1);
  });

  await check("later(): skipped when off, run in the background outside a request when on", async () => {
    let ran = 0;
    setEnv("1234567890123", undefined);
    later(async () => void ran++);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(ran, 0);
    setEnv("1234567890123", "tok");
    later(async () => void ran++);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(ran, 1);
  });

  setEnv(undefined, undefined);
  console.log(`\n${passed} site-pixel checks passed. (Meta stubbed — whether events arrive is checked in Events Manager → Test events.)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
