// A paying shop with one live campaign and two ads, one clearly winning, in
// the LOCAL database only — for the Results loop browser test with the fake
// Meta (scripts/e2e/fake-meta.mjs). Nothing here talks to Meta or Stripe.
//
//   npx tsx scripts/e2e/loop-fixtures.ts create | cleanup
//   → loop-shop@example.test / correct-horse-42

import bcrypt from "bcryptjs";
import { db } from "../../src/lib/db";
import { saveMetaConnection } from "../../src/lib/meta/connection";

const ORG = "zz-loop-shop";
const EMAIL = "loop-shop@example.test";
const PASSWORD = "correct-horse-42";

async function cleanup() {
  await db.toolUsage.deleteMany({ where: { bucket: { startsWith: "login:" } } });
  await db.user.deleteMany({ where: { email: EMAIL } });
  await db.organization.deleteMany({ where: { id: ORG } });
}

async function create() {
  if (/neon\.tech|vercel|amazonaws/.test(process.env.DATABASE_URL ?? "")) throw new Error("Local database only.");
  await cleanup();
  const now = Date.now();
  const twoWeeks = new Date(now - 14 * 86_400_000);
  await db.organization.create({ data: { id: ORG, name: "Kiln & Co", website: "https://kiln.example", subscriptionTier: "PRO", subscriptionStatus: "active", hasPaid: true, currentPeriodEnd: new Date(now + 20 * 86_400_000) } });
  const user = await db.user.create({ data: { email: EMAIL, name: "Rae Kiln", passwordHash: await bcrypt.hash(PASSWORD, 10), role: "CLIENT", organizationId: ORG } });
  await db.organizationMember.create({ data: { organizationId: ORG, userId: user.id, role: "OWNER" } });
  await db.onboardingIntake.create({ data: { organizationId: ORG, primaryGoal: "SALES", monthlyBudgetCents: 120_000, offering: "Handmade stoneware mugs and bowls", customerLocation: "United States" } });
  await saveMetaConnection({ organizationId: ORG, metaAdAccountId: "act_loop", pageId: "p-loop", pageName: "Kiln & Co", accessToken: "fixture-token-not-real", tokenExpiresAt: null });
  await db.mairoCampaign.create({
    data: {
      id: `${ORG}-c1`,
      organizationId: ORG,
      name: "Holiday mugs",
      objective: "SALES",
      status: "ACTIVE",
      totalDailyBudgetCents: 3_500,
      launchApprovedAt: twoWeeks,
      createdAt: twoWeeks,
      ads: {
        create: [
          { position: 0, kind: "IMAGE", headline: "The gift that gets used every morning", primaryText: "Handmade stoneware, boxed and ready to give.", imageUrl: "https://kiln.example/a.jpg" },
          { position: 1, kind: "IMAGE", headline: "Stoneware, made by hand", primaryText: "Small-batch mugs and bowls from our studio.", imageUrl: "https://kiln.example/b.jpg" },
        ],
      },
      platformCampaigns: { create: { platform: "META", status: "ACTIVE", externalCampaignId: "loop-camp", externalAdGroupId: "loop-set", externalAdId: "loop-ad-0", extraExternalAdIds: ["loop-ad-1"], budgetPercent: 100, dailyBudgetCents: 3_500, adReviewState: "APPROVED" } },
    },
  });
  console.log(JSON.stringify({ email: EMAIL, organizationId: ORG }));
}

const cmd = process.argv[2];
(cmd === "cleanup" ? cleanup() : create()).then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
