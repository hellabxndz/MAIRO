// Checks the MAIRO manager's "where this business stands" brief against the
// database: it describes only the active business (never another's
// campaigns), says plainly when purchase tracking isn't verified, and keeps
// the approval rule in front of the model.
//
//   npm run check:right-now-db   (needs DATABASE_URL; makes no network calls)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { managerStatusBrief } from "../src/lib/dashboard/manager-brief";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "e2e-rightnowdb";
const SHOP = `${TAG}-shop`;
const OTHER = `${TAG}-other`;

async function setup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  await db.organization.create({ data: { id: SHOP, name: "Clay & Kiln", website: "https://clay.example" } });
  await db.organization.create({ data: { id: OTHER, name: "Someone Else" } });
  await db.onboardingIntake.create({ data: { organizationId: SHOP, primaryGoal: "SALES", monthlyBudgetCents: 60_000, offering: "Mugs", customerLocation: "United States" } });
  await db.trackingProfile.create({ data: { organizationId: SHOP, nicheId: "ecommerce", nicheConfirmed: true } });
  await db.mairoCampaign.create({ data: { id: `${TAG}-c1`, organizationId: SHOP, name: "Holiday mugs", objective: "SALES", status: "PENDING_REVIEW", totalDailyBudgetCents: 2_000 } });
  await db.mairoCampaign.create({ data: { id: `${TAG}-c2`, organizationId: OTHER, name: "Secret other campaign", objective: "LEADS", status: "ACTIVE", totalDailyBudgetCents: 9_900 } });
}

async function main() {
  if (/neon\.tech|vercel|amazonaws/.test(process.env.DATABASE_URL ?? "")) throw new Error("Local database only.");
  await setup();
  try {
    const brief = await managerStatusBrief(SHOP);
    await check("states the goal and budget the business gave", () => {
      assert.match(brief, /Goal given at setup: sales/);
      assert.match(brief, /\$600/);
    });
    await check("lists this business's campaign with its plain status", () => {
      assert.match(brief, /Holiday mugs: Waiting for your approval; \$20\/day/);
    });
    await check("never includes another business's campaigns", () => {
      assert.doesNotMatch(brief, /Secret other campaign/);
      assert.doesNotMatch(brief, /\$99\/day/);
    });
    await check("a shop's unverified purchase tracking is said, not assumed", () => {
      assert.match(brief, /Purchase tracking: NOT verified/);
    });
    await check("keeps approvals and missing-not-zero in front of the model", () => {
      assert.match(brief, /always need the owner's approval/);
      assert.match(brief, /never zero/);
    });
    const other = await managerStatusBrief(OTHER);
    await check("the other business sees only its own", () => {
      assert.match(other, /Secret other campaign/);
      assert.doesNotMatch(other, /Holiday mugs/);
      assert.doesNotMatch(other, /Purchase tracking/);
    });
  } finally {
    await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  }
  console.log(`\nAll ${passed} right-now-db checks passed.`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
