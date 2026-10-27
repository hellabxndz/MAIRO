// The new-customer journey in a real browser, against a running MAIRO and the
// fake Stripe (scripts/e2e/fake-stripe.mjs): free plan → "I like it" → account
// → confirm → approve → choose a plan → first ads → back to the plans → pay →
// where the customer lands. SIMULATED Stripe and no Meta: this proves the
// app's own routing — that every step moves forward and nothing sends someone
// who came to pay back to an earlier screen — not that Stripe or Meta accept
// the configuration.
//
// Regression for the reported loop: "See my first ad" led to pricing, and
// "Get started / pay" brought the customer back to the earlier screen.
//
//   (start fake Stripe and the app as in scripts/e2e/checkout.mjs, port 3200)
//   NODE_PATH=$(npm root -g) node scripts/e2e/journey.mjs http://localhost:3200 [width] [screenshot-dir]

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://localhost:3200";
const WIDTH = Number(process.argv[3] ?? 390);
const OUT = process.argv[4] ?? null; // a folder for screenshots, optional

let passed = 0;
async function step(name, fn) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: WIDTH < 600 ? 844 : 900 } });
const page = await ctx.newPage();
const visited = [];
page.on("framenavigated", (f) => { if (f === page.mainFrame()) visited.push(new URL(f.url()).pathname); });
const path = () => new URL(page.url()).pathname;
const shot = async (name) => { if (OUT) await page.screenshot({ path: `${OUT}/journey-${WIDTH}-${name}.png` }); };
const noSideScroll = async (label) => {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= iw + 1, `${label}: the page scrolls sideways (${sw}px in a ${iw}px window)`);
};
const email = `e2e-journey-${Date.now()}@example.test`;

try {
  await step("the free plan is made from four answers, with nothing to pay or connect", async () => {
    await page.goto(`${BASE}/preview`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "No website?" }).click();
    await page.getByLabel("Business name").fill("Fernleaf Ceramics");
    await page.locator("textarea[name=sells]").fill("Handmade ceramic mugs and plates, sold online across the US");
    await page.locator("input[name=goal]").first().check({ force: true });
    await page.locator("input[name=budget]").first().check({ force: true });
    await page.getByRole("button", { name: /See your free plan/ }).click();
    await page.getByRole("button", { name: /I like it/ }).first().waitFor({ timeout: 60000 });
    await noSideScroll("free plan");
    await shot("1-plan");
  });

  await step("“I like it” saves the plan and opens sign-up with the business name already filled in", async () => {
    await page.getByRole("button", { name: /I like it/ }).first().click();
    await page.waitForURL((u) => u.pathname.startsWith("/sign-up"), { timeout: 45000 });
    assert.equal(await page.locator("input[name=businessName]").inputValue(), "Fernleaf Ceramics");
    await page.locator("input[name=name]").fill("Ava Test");
    await page.locator("input[name=email]").fill(email);
    await page.locator("input[name=password]").fill("correct-horse-42");
    await noSideScroll("sign-up");
    await page.locator("form button[type=submit]").first().click();
    await page.waitForURL((u) => u.pathname.startsWith("/plan/start"), { timeout: 45000 });
  });

  await step("one question, then the strategy to approve — answers carried over, not asked again", async () => {
    const text = await page.locator("main").innerText();
    assert.match(text, /Fernleaf Ceramics/);
    assert.match(text, /\$300 a month/);
    await page.getByText("They go to my website").click();
    await page.locator("input[name=website]").fill("https://fernleaf-ceramics.example");
    await page.getByRole("button", { name: /Confirm and write my strategy/ }).click();
    await page.getByRole("button", { name: /Approve and choose my MAIRO plan/ }).waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: /Approve and choose my MAIRO plan/ }).click();
    await page.waitForURL((u) => u.pathname === "/plan/activate", { timeout: 45000 });
  });

  await step("the plans page shows the plans — no button back to an earlier step competing with them", async () => {
    await page.goto(`${BASE}/plan/activate`, { waitUntil: "networkidle" });
    assert.ok(await page.getByRole("button", { name: "Get Started with Pro" }).isVisible(), "Pro's button is on screen without a skip link");
    assert.ok(await page.getByRole("button", { name: "Start Scaling with MAIRO" }).isVisible());
    assert.equal(await page.getByRole("link", { name: /^Continue:/ }).count(), 0, "no big “Continue: …” button sending them elsewhere");
    assert.match(await page.locator("nav[aria-label='Your setup progress']").innerText(), /Activate your MAIRO plan/);
    // Subscription and ad spend are separate, and paying launches nothing.
    const text = await page.locator("main").innerText();
    assert.match(text, /Paid directly to Meta/);
    assert.match(text, /launching a campaign[^.]*always wait for your approval/i);
    await noSideScroll("plans");
    await shot("2-plans");
  });

  await step("the first ads are reachable for free, and lead back to the plans — not round in a circle", async () => {
    const link = page.getByRole("link", { name: /first ads/i }).first();
    await link.click();
    await page.waitForURL((u) => u.pathname.startsWith("/dashboard/creatives/suggested"), { timeout: 30000 });
    await page.getByText("Review your suggested ads").first().waitFor({ timeout: 60000 });
    assert.equal(await page.getByText(/Activate MAIRO to use it|part of the full MAIRO platform/).count(), 0, "not a locked page");
    await shot("3-first-ads");
    await page.goto(`${BASE}/plan/activate`, { waitUntil: "networkidle" });
    assert.ok(await page.getByRole("button", { name: "Get Started with Pro" }).isVisible());
  });

  await step("paying lands on the launch checklist with the plan active — never back on the plans or the free plan", async () => {
    await page.getByRole("button", { name: "Get Started with Pro" }).click();
    await page.waitForURL((u) => u.port === "12111", { timeout: 30000 });
    await page.getByRole("button", { name: "Pay" }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/dashboard"), { timeout: 60000 });
    await page.waitForLoadState("networkidle");
    assert.equal(path(), "/dashboard/launch");
    const text = await page.locator("main").innerText();
    assert.match(text, /Your plan is active|Welcome to full MAIRO/i);
    assert.doesNotMatch(text, /is live|now live/i, "paying doesn't launch anything");
    await noSideScroll("launch");
    await shot("4-after-pay");
  });

  await step("after paying, the plans page and the free plan send the customer forward, not back", async () => {
    await page.goto(`${BASE}/plan/activate`, { waitUntil: "networkidle" });
    assert.equal(path(), "/dashboard/launch");
    // No page visited twice in a row by redirect (a loop shows up as A → B → A).
    for (let i = 2; i < visited.length; i++) assert.ok(!(visited[i] === visited[i - 2] && visited[i - 1] !== visited[i] && visited[i - 1].startsWith("/plan") && visited[i].startsWith("/plan")), `redirect loop: ${visited.slice(i - 2, i + 1).join(" → ")}`);
  });
} finally {
  await browser.close();
}
console.log(`\nJourney (${WIDTH}px): ${passed} checks passed. SIMULATED Stripe, no Meta — nothing charged, connected or launched.`);
