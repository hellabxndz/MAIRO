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

  // A couple of campaigns so the dashboard's campaign table has something to
  // lay out. They carry no performance figures — those come from a live ad
  // account, and inventing them locally would defeat the point of checking
  // that the screen renders "no data" honestly.
  for (const [i, c] of [
    { name: "Summer Collection", objective: "SALES", status: "ACTIVE" },
    { name: "Sneaker Drop", objective: "SALES", status: "ACTIVE" },
    { name: "Beanie Campaign", objective: "AWARENESS", status: "PAUSED" },
  ].entries()) {
    await db.mairoCampaign.upsert({
      where: { id: `demo-campaign-${i}` },
      update: { name: c.name, status: c.status as never },
      create: {
        id: `demo-campaign-${i}`,
        organizationId: org.id,
        name: c.name,
        objective: c.objective as never,
        status: c.status as never,
        totalDailyBudgetCents: 2000,
      },
    });
  }

  console.log("client@mairo.test / TestPass123! -> org", org.id);
}

main().finally(() => db.$disconnect());
