// Checks that shipping can't change production by accident:
//
//   - a Preview build (any branch other than production) never migrates the
//     database, whatever DATABASE_URL it was given; only VERCEL_ENV=production
//     does, or a Preview that explicitly has its own database;
//   - the build migrates before it builds, so a failed migration leaves the
//     previous deployment serving;
//   - the newest migrations only add: no DROP, no RENAME, no type change, no
//     NOT NULL without a default, no DELETE or UPDATE of existing rows.
//
//   npm run check:release-safety   (no database, no network)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// A database URL that can't be reached: if the guard failed, prisma would try it and fail loudly.
const NOWHERE = "postgresql://nobody:nothing@127.0.0.1:1/none";
const run = (env: Record<string, string>) =>
  spawnSync("node", ["scripts/migrate-deploy.mjs"], { encoding: "utf8", timeout: 20_000, env: { ...process.env, DATABASE_URL: NOWHERE, DIRECT_URL: NOWHERE, ...env } });

check("a Preview or development build skips migrations, whatever database it's pointed at", () => {
  for (const VERCEL_ENV of ["preview", "development"]) {
    const r = run({ VERCEL_ENV, MIGRATE_PREVIEW_DATABASE: "" });
    assert.equal(r.status, 0, VERCEL_ENV);
    assert.match(r.stdout, /Skipping database migrations: this is a (preview|development) build/);
  }
});

check("a production build does try to migrate (and a Preview only when it opts in)", () => {
  const prod = run({ VERCEL_ENV: "production", MIGRATE_PREVIEW_DATABASE: "" });
  assert.doesNotMatch(prod.stdout, /Skipping database migrations/);
  const optIn = run({ VERCEL_ENV: "preview", MIGRATE_PREVIEW_DATABASE: "1" });
  assert.doesNotMatch(optIn.stdout, /Skipping database migrations/);
});

check("the build migrates before it builds", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  const steps = pkg.scripts["vercel-build"].split("&&").map((s) => s.trim());
  assert.ok(steps.indexOf("node scripts/migrate-deploy.mjs") >= 0);
  assert.ok(steps.indexOf("node scripts/migrate-deploy.mjs") < steps.findIndex((s) => s.startsWith("next build")));
});

check("the managed-platform migrations, and every one after them, only add", () => {
  const dir = "prisma/migrations";
  const recent = readdirSync(dir).filter((d) => /^\d{14}_/.test(d) && d >= "20261210120000").sort();
  // These two, and every migration written after them, must only add.
  for (const m of ["20261210120000_tracking_health", "20261210130000_notify_email"]) assert.ok(recent.includes(m), m);
  for (const m of recent) {
    const sql = readFileSync(join(dir, m, "migration.sql"), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    assert.doesNotMatch(sql, /\b(DROP|RENAME|TRUNCATE|DELETE\s+FROM|UPDATE\s+")/i, m);
    assert.doesNotMatch(sql, /ALTER\s+COLUMN/i, `${m}: changes an existing column`);
    for (const add of sql.matchAll(/ADD COLUMN "(\w+)" ([^;]+);/g)) {
      const def = add[2];
      assert.ok(!/NOT NULL/i.test(def) || /DEFAULT/i.test(def), `${m}: ${add[1]} is NOT NULL without a default`);
    }
    for (const v of sql.matchAll(/ALTER TYPE "(\w+)" ([^;]+);/g)) assert.match(v[2], /^ADD VALUE /, `${m}: ${v[1]}`);
  }
});

check("scheduled jobs run only on production deployments (Vercel runs crons for production only)", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] };
  for (const c of vercel.crons) {
    const route = readFileSync(join("src/app", c.path, "route.ts"), "utf8");
    assert.match(route, /CRON_SECRET/, `${c.path} must refuse callers without the cron secret`);
  }
});

console.log(`\nRelease safety: ${passed} checks passed.`);
