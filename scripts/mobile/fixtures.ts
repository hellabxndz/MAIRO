// Accounts for the mobile audit (scripts/mobile/audit.mjs), in the LOCAL
// database only: a paying business with Meta connected and a few campaigns,
// a business that has made its free plan and not yet paid, and an owner for
// AIOS. Meta is never called: pages that read it show their error states.
//
//   npx tsx scripts/mobile/fixtures.ts create | cleanup

import bcrypt from "bcryptjs";
import { db } from "../../src/lib/db";
import { saveMetaConnection } from "../../src/lib/meta/connection";

export const PASSWORD = "correct-horse-42";
const TAG = "zz-mobile";
const PAID = `${TAG}-paid`;
const FREE = `${TAG}-free`;
const EMAILS = ["mobile-paid@example.test", "mobile-free@example.test", "mobile-owner@example.test"];

async function cleanup() {
  // The audit signs in a lot; local sign-in limits from earlier runs would lock it out.
  await db.toolUsage.deleteMany({ where: { bucket: { startsWith: "login:" } } });
  await db.user.deleteMany({ where: { email: { in: EMAILS } } });
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function create() {
  if (/neon\.tech|vercel|amazonaws/.test(process.env.DATABASE_URL ?? "")) throw new Error("Local database only.");
  await cleanup();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const now = new Date();

  // The paying business.
  await db.organization.create({ data: { id: PAID, name: "Harbour Plumbing & Heating", website: "https://www.harbourplumbing.example", subscriptionTier: "PRO", subscriptionStatus: "active", hasPaid: true, currentPeriodEnd: new Date(now.getTime() + 20 * 864e5) } });
  const paid = await db.user.create({ data: { email: EMAILS[0], name: "Sam Harbour", passwordHash, role: "CLIENT", organizationId: PAID } });
  await db.organizationMember.create({ data: { organizationId: PAID, userId: paid.id, role: "OWNER" } });
  await db.onboardingIntake.create({ data: { organizationId: PAID, primaryGoal: "LEADS", monthlyBudgetCents: 120_000, offering: "Emergency plumbing, boiler repair and bathroom installs", customerLocation: "Portland, OR" } });
  await saveMetaConnection({ organizationId: PAID, metaAdAccountId: "act_100200300", pageId: "p-harbour", pageName: "Harbour Plumbing & Heating", accessToken: "fixture-token-not-real", tokenExpiresAt: null });
  await db.trackingProfile.create({ data: { organizationId: PAID, nicheId: "home_services", nicheConfirmed: true } });
  const campaigns = [
    { name: "Emergency call-outs — Portland metro", status: "PENDING_REVIEW", budget: 4_000 },
    { name: "Boiler service autumn offer", status: "ACTIVE", budget: 2_500 },
    { name: "Bathroom installs — long-form leads with a much longer campaign name to test wrapping", status: "PAUSED", budget: 1_500 },
  ] as const;
  for (const [i, c] of campaigns.entries()) {
    await db.mairoCampaign.create({
      data: {
        id: `${TAG}-c${i}`,
        organizationId: PAID,
        name: c.name,
        objective: "LEADS",
        status: c.status,
        totalDailyBudgetCents: c.budget,
        launchApprovedAt: c.status === "PENDING_REVIEW" ? null : now,
        platformCampaigns: { create: { platform: "META", status: c.status, externalCampaignId: `${TAG}-x${i}`, externalAdGroupId: `${TAG}-as${i}`, externalAdId: `${TAG}-ad${i}`, budgetPercent: 100, dailyBudgetCents: c.budget } },
      },
    });
  }
  const review = await db.agentRun.create({ data: { organizationId: PAID, agent: "STRATEGIST", task: "team-review", status: "DONE", summary: "Coordinated the daily review", startedAt: now, finishedAt: now } });
  for (const [agent, task, summary] of [
    ["ANALYST", "read-results", "Read the latest results for 2 campaigns."],
    ["OPTIMIZER", "recommend", "Recommended: move $10/day to Emergency call-outs"],
    ["GUARDIAN", "check-limits", "Checked 1 budget change against your limits — it stays within them."],
  ] as const) {
    await db.agentRun.create({ data: { organizationId: PAID, agent, task, parentId: review.id, status: "DONE", summary, startedAt: now, finishedAt: now } });
  }

  // A business that made its free plan and hasn't paid: the plan screens and checkout.
  const sample = await db.strategyPlan.findFirst({ where: { status: "APPROVED", approvedSnapshotJson: { not: null } }, select: { planJson: true, approvedSnapshotJson: true, approvedVersion: true } });
  await db.organization.create({ data: { id: FREE, name: "Nova Ceramics", paymentRequired: true } });
  const free = await db.user.create({ data: { email: EMAILS[1], name: "Nova", passwordHash, role: "CLIENT", organizationId: FREE } });
  await db.organizationMember.create({ data: { organizationId: FREE, userId: free.id, role: "OWNER" } });
  await db.onboardingIntake.create({ data: { organizationId: FREE, primaryGoal: "SALES", monthlyBudgetCents: 60_000, offering: "Handmade mugs and bowls", customerLocation: "United States" } });
  if (sample) await db.strategyPlan.create({ data: { organizationId: FREE, status: "APPROVED", planJson: sample.planJson, approvedSnapshotJson: sample.approvedSnapshotJson, approvedVersion: sample.approvedVersion ?? 0, approvedAt: now } });

  // The owner, for AIOS.
  await db.user.create({ data: { email: EMAILS[2], name: "Owner", passwordHash, role: "OWNER" } });
  console.log(JSON.stringify({ paid: EMAILS[0], free: EMAILS[1], owner: EMAILS[2], campaign: `${TAG}-c0`, freePlan: Boolean(sample) }));
}

const cmd = process.argv[2];
(cmd === "cleanup" ? cleanup() : cmd === "create" ? create() : Promise.reject(new Error("create or cleanup")))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
