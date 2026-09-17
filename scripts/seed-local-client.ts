// A signed-in CLIENT account for looking at the dashboard locally. Public
// sign-up creates these too — this exists so the logged-in screens can be
// opened and screenshotted without going through the funnel every time.
//
// Local only. It writes a known password, so it must never be pointed at a
// production database.
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const org = await db.organization.upsert({
    where: { id: "demo-org-local" },
    update: {},
    create: {
      id: "demo-org-local",
      name: "Sunrise Dental",
      website: "https://sunrisedental.example",
      industry: "Dentistry",
      subscriptionTier: "GROWTH",
    },
  });

  await db.onboardingIntake.upsert({
    where: { organizationId: org.id },
    update: {},
    create: { organizationId: org.id, primaryGoal: "LEADS", monthlyBudgetCents: 60000 },
  });

  await db.user.upsert({
    where: { email: "client@mairo.test" },
    update: { organizationId: org.id },
    create: {
      email: "client@mairo.test",
      passwordHash: await bcrypt.hash("TestPass123!", 10),
      name: "Alex Carter",
      role: "CLIENT",
      organizationId: org.id,
    },
  });

  console.log("client@mairo.test / TestPass123! -> org", org.id);
}

main().finally(() => db.$disconnect());
