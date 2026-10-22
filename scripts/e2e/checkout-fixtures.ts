// Accounts for the browser checkout test (scripts/e2e/checkout.mjs): each a
// business that signed up through the free plan, approved it and hasn't paid.
// Local database only — run with the local .env, never against production.
//
//   npx tsx scripts/e2e/checkout-fixtures.ts create
//   npx tsx scripts/e2e/checkout-fixtures.ts cleanup

import bcrypt from "bcryptjs";
import { db } from "../../src/lib/db";

export const E2E_PASSWORD = "correct-horse-42";
const ACCOUNTS = ["pro", "scale", "cancel", "retry"];
const email = (who: string) => `e2e-checkout-${who}@example.test`;

async function cleanup() {
  const users = await db.user.findMany({ where: { email: { startsWith: "e2e-checkout-" } }, select: { organizationId: true } });
  await db.user.deleteMany({ where: { email: { startsWith: "e2e-checkout-" } } });
  await db.organization.deleteMany({ where: { id: { in: users.map((u) => u.organizationId).filter((x): x is string => !!x) } } });
}

async function create() {
  if (/neon\.tech|vercel|amazonaws/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing to create test accounts in a hosted database.");
  await cleanup();
  // A real approved plan to copy, so the activation page has something true to show.
  const sample = await db.strategyPlan.findFirst({ where: { status: "APPROVED", approvedSnapshotJson: { not: null } }, select: { planJson: true, approvedSnapshotJson: true, approvedVersion: true } });
  if (!sample) throw new Error("No approved plan in the local database to copy. Approve one in the app first.");
  const passwordHash = await bcrypt.hash(E2E_PASSWORD, 10);
  for (const who of ACCOUNTS) {
    const org = await db.organization.create({ data: { name: `E2E ${who}`, paymentRequired: true } });
    const user = await db.user.create({ data: { email: email(who), name: `E2E ${who}`, passwordHash, role: "CLIENT", organizationId: org.id } });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
    await db.onboardingIntake.create({ data: { organizationId: org.id, primaryGoal: "LEADS", monthlyBudgetCents: 90_000, offering: "Roof repair", customerLocation: "Austin, TX" } });
    await db.strategyPlan.create({ data: { organizationId: org.id, status: "APPROVED", planJson: sample.planJson, approvedSnapshotJson: sample.approvedSnapshotJson, approvedVersion: sample.approvedVersion ?? 0, approvedAt: new Date() } });
    console.log(email(who));
  }
}

const command = process.argv[2];
(command === "cleanup" ? cleanup() : command === "create" ? create() : Promise.reject(new Error("create or cleanup")))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
