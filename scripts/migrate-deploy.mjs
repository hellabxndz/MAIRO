// Runs `prisma migrate deploy` with retries.
//
// Neon's free tier suspends a database that has been idle, and the first
// connection after that has to wait for it to wake. Prisma gives that wait
// about 10 seconds before failing the whole build with P1002 ("the database
// server was reached but timed out"), so a deploy after a quiet period fails
// for no reason other than bad timing — and succeeds if you click Redeploy,
// because the first attempt woke the database.
//
// Retrying turns that manual retry into an automatic one. The delays are
// generous because a cold start is the thing being waited on, not a fast
// transient.

import { spawn } from "node:child_process";

const ATTEMPT_DELAYS_MS = [5000, 10000, 20000, 30000];

// Failures worth retrying: the database is unreachable or slow to wake, not
// a broken migration. A bad migration fails identically every time, so
// retrying it just burns build minutes before reporting the same error.
const RETRYABLE = [
  "P1001", // Can't reach database server
  "P1002", // Database server reached but timed out
  "P1017", // Server has closed the connection
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
];

function runMigrate() {
  return new Promise((resolve) => {
    const child = spawn("npx", ["prisma", "migrate", "deploy"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let output = "";
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        const text = chunk.toString();
        output += text;
        process.stdout.write(text);
      });
    }

    child.on("close", (code) => resolve({ code, output }));
    child.on("error", (err) => resolve({ code: 1, output: String(err) }));
  });
}

const totalAttempts = ATTEMPT_DELAYS_MS.length + 1;

for (let attempt = 1; attempt <= totalAttempts; attempt++) {
  const { code, output } = await runMigrate();

  if (code === 0) {
    if (attempt > 1) console.log(`\nMigrations applied on attempt ${attempt}.`);
    process.exit(0);
  }

  const retryable = RETRYABLE.some((marker) => output.includes(marker));

  if (!retryable) {
    console.error(
      "\nMigration failed for a reason retrying won't fix. See the error above."
    );
    process.exit(code ?? 1);
  }

  if (attempt === totalAttempts) {
    console.error(
      `\nDatabase still unreachable after ${totalAttempts} attempts. If this is ` +
        "Neon, open the Neon dashboard to confirm the project isn't suspended " +
        "or over its limits, then redeploy."
    );
    process.exit(code ?? 1);
  }

  const waitMs = ATTEMPT_DELAYS_MS[attempt - 1];
  console.log(
    `\nDatabase not ready (attempt ${attempt}/${totalAttempts}). ` +
      `This is normal on a suspended free-tier database. Retrying in ${waitMs / 1000}s...\n`
  );
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}
