// A signed-in FREELANCER workspace for looking at /clients locally.
//
// The freelancer side is the only part of the product that lives above an
// organization — a workspace with child organizations hanging off it — and that
// shape cannot be reached by clicking through sign-up without paying Stripe. So
// it gets a seed, the same way the client dashboard does.
//
// Local only. It writes a known password, so it must never be pointed at a
// production database.
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const WORKSPACE = "demo-studio-local";

// Three clients in three different states, because the list is mostly about
// telling them apart: one fully live, one connected but not yet running, one
// that has not finished setup.
const CLIENTS = [
  { id: "demo-client-a", name: "Northgate Dental", industry: "Dentistry", meta: true, intake: true },
  { id: "demo-client-b", name: "Ridgeway Fitness", industry: "Gyms", meta: true, intake: true },
  { id: "demo-client-c", name: "Copper & Oak", industry: "Restaurants", meta: false, intake: false },
];

async function main() {
  const workspace = await db.organization.upsert({
    where: { id: WORKSPACE },
    update: {},
    create: {
      id: WORKSPACE,
      name: "Bandz Media",
      industry: "Advertising",
      subscriptionTier: "STUDIO",
    },
  });

  await db.user.upsert({
    where: { email: "studio@mairo.test" },
    update: { organizationId: workspace.id, role: "FREELANCER" },
    create: {
      email: "studio@mairo.test",
      name: "Alex Bandz",
      passwordHash: await bcrypt.hash("TestPass123!", 10),
      role: "FREELANCER",
      organizationId: workspace.id,
    },
  });

  for (const c of CLIENTS) {
    await db.organization.upsert({
      where: { id: c.id },
      update: { parentId: workspace.id },
      create: {
        id: c.id,
        name: c.name,
        industry: c.industry,
        parentId: workspace.id,
        subscriptionTier: "NONE",
      },
    });

    if (c.intake) {
      await db.onboardingIntake.upsert({
        where: { organizationId: c.id },
        update: {},
        create: { organizationId: c.id, primaryGoal: "LEADS", monthlyBudgetCents: 50000 },
      });
    }
  }

  console.log("seeded studio@mairo.test / TestPass123!");
  console.log(`workspace ${workspace.name} with ${CLIENTS.length} clients`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
