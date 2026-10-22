// The checkout journey in a real browser, against a running MAIRO and the
// fake Stripe (scripts/e2e/fake-stripe.mjs). SIMULATED Stripe: this proves the
// app's side of the journey — buttons, redirects, the return page, the
// dashboard after — not that Stripe itself accepts the configuration.
//
//   node scripts/e2e/fake-stripe.mjs 12111 &
//   STRIPE_SECRET_KEY=sk_test_e2e STRIPE_FAKE_API=http://localhost:12111 \
//     STRIPE_PRICE_PRO=price_e2e_pro STRIPE_PRICE_SCALE_V2=price_e2e_scale … npx next start -p 3200
//   npx tsx scripts/e2e/checkout-fixtures.ts create
//   NODE_PATH=$(npm root -g) node scripts/e2e/checkout.mjs http://localhost:3200

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://localhost:3200";
const PASSWORD = "correct-horse-42";

let passed = 0;
async function step(name, fn) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

async function signedIn(browser, who) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(`e2e-checkout-${who}@example.test`);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
  return page;
}

const path = (page) => new URL(page.url()).pathname;

async function main() {
  const browser = await chromium.launch();
  try {
    await step("signed out, the plans and the return page send you to sign in (and back)", async () => {
      const page = await (await browser.newContext()).newPage();
      await page.goto(`${BASE}/plan/activate?skip=1`);
      assert.equal(path(page), "/sign-in");
      await page.goto(`${BASE}/billing/return?session_id=cs_test_abc`);
      assert.equal(path(page), "/sign-in");
      assert.match(new URL(page.url()).searchParams.get("callbackUrl") ?? "", /^\/billing\/return\?session_id=cs_test_abc/);
    });

    await step("Pro: one press on the plan opens Stripe Checkout for Pro's price, with the 7-day trial", async () => {
      const page = await signedIn(browser, "pro");
      await page.goto(`${BASE}/plan/activate?skip=1#plans`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Get Started with Pro" }).click();
      await page.waitForURL(/\/pay\/cs_test_/, { timeout: 20_000 });
      assert.equal(await page.locator("[data-price]").innerText(), "price_e2e_pro");
      assert.equal(await page.locator("[data-trial]").innerText(), "7 days free");
      await page.getByRole("button", { name: "Pay" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/dashboard"), { timeout: 30_000 });
      assert.equal(path(page), "/dashboard/launch", "after paying: the campaign step, not the plans");
      await page.goto(`${BASE}/plan/activate?skip=1#plans`);
      assert.ok(path(page).startsWith("/dashboard"), "a subscriber is never sent back to choose a plan");
      await page.goto(`${BASE}/dashboard/billing`, { waitUntil: "networkidle" });
      assert.match(await page.locator("body").innerText(), /MAIRO Pro/);
    });

    await step("Scale: opens Checkout for Scale's own price, billed today, and lands on the dashboard", async () => {
      const page = await signedIn(browser, "scale");
      await page.goto(`${BASE}/plan/activate?skip=1#plans`, { waitUntil: "networkidle" });
      const body = await page.locator("body").innerText();
      assert.ok(!/can.t be bought/i.test(body), "Scale is buyable when its price is configured");
      await page.getByRole("button", { name: "Start Scaling with MAIRO" }).click();
      await page.waitForURL(/\/pay\/cs_test_/, { timeout: 20_000 });
      assert.equal(await page.locator("[data-price]").innerText(), "price_e2e_scale");
      assert.equal(await page.locator("[data-trial]").innerText(), "Due today");
      await page.getByRole("button", { name: "Pay" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/dashboard"), { timeout: 30_000 });
      assert.equal(path(page), "/dashboard/launch");
    });

    await step("cancelling on Stripe returns to the plans with a working button, and unlocks nothing", async () => {
      const page = await signedIn(browser, "cancel");
      await page.goto(`${BASE}/plan/activate?skip=1#plans`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Get Started with Pro" }).click();
      await page.waitForURL(/\/pay\/cs_test_/, { timeout: 20_000 });
      const payUrl = page.url();
      await page.getByRole("link", { name: "Back" }).click();
      await page.waitForURL((u) => u.pathname === "/plan/activate");
      assert.equal(new URL(page.url()).searchParams.get("checkout"), "cancelled");
      assert.ok(await page.getByRole("button", { name: "Get Started with Pro" }).isVisible(), "the plans are on screen");
      // The success URL typed by hand, for a checkout that was never paid.
      const sessionId = new URL(payUrl).pathname.split("/").pop();
      await page.goto(`${BASE}/billing/return?session_id=${sessionId}`, { waitUntil: "networkidle" });
      assert.match(await page.locator("[data-checkout-return]").innerText(), /Checkout wasn.t finished/);
      assert.ok(await page.getByRole("link", { name: "Retry checkout" }).isVisible());
      await page.goto(`${BASE}/dashboard/launch`);
      assert.equal(path(page), "/plan/activate", "still unpaid: the dashboard's paid steps stay locked");
    });

    await step("pressing again reuses the open checkout instead of opening a second", async () => {
      const page = await signedIn(browser, "retry");
      await page.goto(`${BASE}/plan/activate?skip=1#plans`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Get Started with Pro" }).click();
      await page.waitForURL(/\/pay\/cs_test_/, { timeout: 20_000 });
      const first = page.url();
      await page.goto(`${BASE}/plan/activate?skip=1#plans`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Get Started with Pro" }).click();
      await page.waitForURL(/\/pay\/cs_test_/, { timeout: 20_000 });
      assert.equal(page.url(), first);
    });
  } finally {
    await browser.close();
  }
  console.log(`\n${passed} browser steps passed. (Stripe was the local fake — not a real test-mode purchase.)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
