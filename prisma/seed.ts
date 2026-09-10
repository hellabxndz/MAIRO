// Creates (or updates) the first OWNER account so you can access the AIOS
// dashboard. Public sign-up always creates CLIENT accounts, so this is the
// only way to get an OWNER user.
//
// Usage: OWNER_EMAIL=you@myro.com OWNER_PASSWORD=... npm run db:seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { seedPlanConfig } from "@/lib/plan-config";

async function main() {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Set OWNER_EMAIL and OWNER_PASSWORD environment variables before running the seed script."
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await db.user.upsert({
    where: { email },
    create: { email, passwordHash, role: "OWNER", name: "MAIRO Owner" },
    update: { passwordHash, role: "OWNER" },
  });

  console.log(`OWNER account ready: ${user.email}`);

  // Pricing and feature permissions. Inserted only where a row is missing, so
  // a price edited in the database survives the next seed — see
  // src/lib/plan-config.ts for why that matters.
  const plans = await seedPlanConfig();
  if (plans.created.length > 0) {
    console.log(`Plan config seeded: ${plans.created.join(", ")}`);
  }
  if (plans.skipped.length > 0) {
    console.log(`Plan config already present, left alone: ${plans.skipped.join(", ")}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
