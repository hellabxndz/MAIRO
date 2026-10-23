// The whole customer journey on a phone, in a real (headless Chromium)
// browser: the homepage's free plan → the plan → sign-up → the quick start →
// choosing MAIRO Pro → checkout → back in MAIRO → connecting Meta. At every
// screen it checks nothing runs off the side, and saves a screenshot.
//
// Stripe is the local fake (scripts/e2e/fake-stripe.mjs): SIMULATED. Nothing
// is charged, and Meta is never reached.
//
//   node scripts/mobile/journey.mjs http://localhost:3300 <out dir> [width]

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:3300";
const OUT = process.argv[3] ?? "mobile-journey";
const WIDTH = Number(process.argv[4] ?? 390);
const HEIGHTS = { 320: 640, 360: 740, 375: 812, 390: 844, 414: 896, 430: 932 };
mkdirSync(OUT, { recursive: true });

let n = 0;
async function screen(page, name) {
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const file = join(OUT, `${String(++n).padStart(2, "0")}-${WIDTH}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`${overflow > 0 ? "✗" : "✓"} ${name.padEnd(28)} ${new URL(page.url()).pathname}${overflow > 0 ? `  OVERFLOW ${overflow}px` : ""}`);
  assert.equal(overflow, 0, `${name} scrolls sideways by ${overflow}px`);
}

/** The element is fully on screen once scrolled to, and big enough to tap. */
async function tappable(locator, name) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const vw = WIDTH;
  assert.ok(box, `${name}: not on the page`);
  assert.ok(box.x >= 0 && box.x + box.width <= vw + 1, `${name}: runs off the screen (${Math.round(box.x)}→${Math.round(box.x + box.width)})`);
  assert.ok(box.height >= 40, `${name}: only ${Math.round(box.height)}px tall`);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHTS[WIDTH] ?? 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const email = `mobile-journey-${Date.now()}@example.test`;

  // 1. The homepage, and the free plan from a sentence.
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await screen(page, "home");
  await page.getByRole("button", { name: "Open menu" }).click();
  await screen(page, "home-menu-open");
  await page.getByRole("button", { name: "Close menu" }).click();
  await page.getByRole("button", { name: "No website" }).click();
  await page.locator("#hero-first").fill("Handmade ceramic mugs, sold online across the US");
  const build = page.getByRole("button", { name: /Build My Free AI Ad Plan/ }).first();
  await tappable(build, "Build My Free AI Ad Plan");
  await build.click();
  await page.locator("#hero-name").waitFor();
  await screen(page, "plan-questions");
  // Submitting with nothing chosen shows what's missing, on screen.
  await page.getByRole("button", { name: /Build My Free AI Ad Plan/ }).last().click();
  await screen(page, "plan-questions-errors");
  await page.locator("#hero-name").fill("Nova Ceramics");
  await page.locator("fieldset").filter({ hasText: "What should your ads do?" }).locator("label").first().click();
  await page.locator("fieldset").filter({ hasText: "Monthly Meta ad budget" }).locator("label").nth(1).click();
  await page.getByRole("button", { name: /Build My Free AI Ad Plan/ }).last().click();

  // 2. The plan.
  await page.waitForURL(/\/preview/, { timeout: 30_000 });
  const like = page.getByRole("button", { name: /I like it — get started/ }).first();
  await like.waitFor({ timeout: 120_000 });
  await screen(page, "plan-ready");
  await tappable(like, "I like it — get started");
  await like.click();

  // 3. The account.
  await page.waitForURL(/\/sign-up/, { timeout: 30_000 });
  await screen(page, "sign-up");
  await page.locator("#field-name").fill("Nova Tester");
  if (await page.locator("#field-businessName").isVisible()) await page.locator("#field-businessName").fill("Nova Ceramics");
  await page.locator("#field-email").fill(email);
  await page.locator("#field-password").fill("correct-horse-42-ceramic");
  await page.locator("form").getByRole("button", { name: /create|sign up|get started|continue/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-up"), { timeout: 60_000 });

  // 4. The quick start: one question, then MAIRO writes the strategy for approval.
  await page.waitForURL(/\/plan\/start|\/onboarding|\/plan/, { timeout: 60_000 });
  if (!/\/plan\/start/.test(page.url())) await page.goto(BASE + "/plan/start");
  await screen(page, "quick-start");
  const message = page.locator('input[name=destinationType][value="DIRECT_MESSAGE"]');
  if (await message.count()) await message.check({ force: true });
  else await page.locator("input[name=destinationType]").first().check({ force: true });
  if (await page.locator("input[name=phone]").isVisible().catch(() => false)) await page.locator("input[name=phone]").fill("(555) 123-4567");
  if (await page.locator("input[name=website]").isVisible().catch(() => false)) await page.locator("input[name=website]").fill("novaceramics.example");
  await page.getByRole("button", { name: /Confirm and write my strategy/ }).click();
  const approve = page.getByRole("button", { name: /Approve and choose my MAIRO plan/ });
  await approve.waitFor({ timeout: 120_000 });
  await screen(page, "strategy-to-approve");
  await tappable(approve, "Approve and choose my MAIRO plan");
  await approve.click();

  // 5. Choosing MAIRO Pro, and checkout — never sent back to the plan screen.
  await page.waitForURL(/\/plan\/activate/, { timeout: 60_000 });
  await screen(page, "choose-plan");
  const pro = page.getByRole("button", { name: "Get Started with Pro" });
  await tappable(pro, "Get Started with Pro");
  await pro.click();
  await page.waitForURL(/\/pay\/cs_test_/, { timeout: 30_000 });
  await screen(page, "checkout-simulated");
  await page.getByRole("button", { name: "Pay" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/dashboard"), { timeout: 60_000 });
  assert.ok(!/\/plan/.test(new URL(page.url()).pathname), "after paying: the dashboard, not a plan screen");
  await screen(page, "after-payment");

  // 6. Connecting Meta (the screen; Meta itself isn't reachable from here).
  await page.goto(BASE + "/dashboard/meta", { waitUntil: "domcontentloaded" });
  await screen(page, "connect-meta");

  await browser.close();
  console.log(`\nJourney complete at ${WIDTH}px, ${n} screens. Stripe was the local fake — nothing charged.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
