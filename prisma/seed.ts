// Creates (or updates) the first OWNER account so you can access the AIOS
// dashboard. Public sign-up always creates CLIENT accounts, so this is the
// only way to get an OWNER user.
//
// Usage: OWNER_EMAIL=you@myro.com OWNER_PASSWORD=... npm run db:seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";

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
    create: { email, passwordHash, role: "OWNER", name: "MyRo Owner" },
    update: { passwordHash, role: "OWNER" },
  });

  console.log(`OWNER account ready: ${user.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
