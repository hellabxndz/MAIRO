// Screen-by-screen screenshots of one page at one width, for looking at:
// what a person on that phone sees as they scroll, one screenful per file.
//
//   node scripts/mobile/shots.mjs http://localhost:3300 / 390 <out dir> [email] [--max 12] [--landscape]

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const [base, route, width, out, email] = process.argv.slice(2);
const maxI = process.argv.indexOf("--max");
const max = maxI > -1 ? Number(process.argv[maxI + 1]) : 12;
const landscape = process.argv.includes("--landscape");
const heights = { 320: 640, 360: 740, 375: 812, 390: 844, 393: 852, 414: 896, 430: 932, 768: 1024, 1440: 900 };
const w = Number(width);
const viewport = landscape ? { width: heights[w] ?? 844, height: w } : { width: w, height: heights[w] ?? 844 };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: w < 768 || landscape, hasTouch: true, reducedMotion: "reduce" });
// The session is kept in the out dir and reused, so repeated runs don't trip
// MAIRO's limit on sign-in attempts.
const statePath = email && !email.startsWith("--") ? join(out, `.session-${email}.json`) : null;
if (statePath && existsSync(statePath)) {
  await context.addCookies(JSON.parse(readFileSync(statePath, "utf8")));
} else if (statePath) {
  const p = await context.newPage();
  await p.goto(`${base}/sign-in`);
  await p.getByLabel("Email").fill(email);
  await p.locator("input[name=password]").fill("correct-horse-42");
  await p.getByRole("button", { name: /sign in/i }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60_000, waitUntil: "commit" });
  mkdirSync(out, { recursive: true });
  writeFileSync(statePath, JSON.stringify(await context.cookies()));
  await p.close();
}
const page = await context.newPage();
await page.goto(base + route, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(600);
mkdirSync(out, { recursive: true });
const total = await page.evaluate(() => document.documentElement.scrollHeight);
const name = (route === "/" ? "home" : route.replace(/^\//, "").replace(/[/?=&]/g, "_")) + `-${viewport.width}x${viewport.height}`;
let i = 0;
for (let y = 0; y < total && i < max; y += viewport.height, i++) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(out, `${name}-${String(i).padStart(2, "0")}.png`) });
}
console.log(`${i} screens of ${Math.ceil(total / viewport.height)} (${total}px) → ${out}/${name}-*.png`);
await browser.close();
