// Restore drill verification: is a restored copy of MAIRO's database usable?
//
// Read-only. Every query runs inside a READ ONLY transaction, so this can be
// pointed at production for the comparison counts without changing anything.
// It prints aggregates only — never a connection string, a row, an email or a
// token.
//
//   RESTORE_URL=<restored branch>  [PROD_URL=<production, read-only>]  \
//   [AS_OF=2026-11-23T12:00:00Z]  node scripts/ops/restore-check.mjs
//
// Checks, each PASS / FAIL / WARN:
//   1. Accepts connections; server version.
//   2. Schema: the public schema, plpgsql, and every table prisma/schema.prisma
//      defines.
//   3. Migration history: every migration in prisma/migrations applied and
//      finished, none rolled back, none unknown to this code.
//   4. Critical tables: counts; with PROD_URL, the same counts on production
//      for rows created at or before AS_OF (rows created later can't be in the
//      restore and are reported separately).
//   5. Relationships: no orphaned rows across the links that matter.
//   6. Freshness: the newest createdAt is at or before AS_OF.
//
// Exit 0 only when nothing FAILs.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = new URL("../..", import.meta.url).pathname;
const restoreUrl = process.env.RESTORE_URL;
const prodUrl = process.env.PROD_URL || null;
const asOf = process.env.AS_OF ? new Date(process.env.AS_OF) : null;
if (!restoreUrl) {
  console.error("Set RESTORE_URL to the restored branch's connection string.");
  process.exit(2);
}
if (asOf && Number.isNaN(asOf.getTime())) {
  console.error("AS_OF isn't a timestamp.");
  process.exit(2);
}

// The tables MAIRO can't run without: who the customers are, what they pay
// for, their Meta connection, campaigns and ads, approvals, tracking, leads,
// the assistant's memory, and the safeguards (idempotency, audit).
const CRITICAL = [
  "Organization", "User", "OrganizationMember", "OnboardingIntake", "StrategyPlan",
  "MetaAdAccount", "MairoCampaign", "PlatformCampaign", "CampaignAd", "CreativeApproval",
  "MairoDecision", "IdempotencyKey", "TrackingProfile", "TrackingPixel", "TrackingVerification",
  "LeadForm", "Lead", "AgentThread", "AgentMessage", "Notification", "AuditLog", "FunnelEvent", "WeeklyReport",
];
// child table, its column, parent table — rows whose parent is missing.
const LINKS = [
  ["User", "organizationId", "Organization"],
  ["OrganizationMember", "organizationId", "Organization"],
  ["OrganizationMember", "userId", "User"],
  ["MetaAdAccount", "organizationId", "Organization"],
  ["MairoCampaign", "organizationId", "Organization"],
  ["PlatformCampaign", "mairoCampaignId", "MairoCampaign"],
  ["CampaignAd", "mairoCampaignId", "MairoCampaign"],
  ["MairoDecision", "organizationId", "Organization"],
  ["Lead", "organizationId", "Organization"],
  ["AgentMessage", "threadId", "AgentThread"],
];

const models = [...readFileSync(join(root, "prisma/schema.prisma"), "utf8").matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);
const migrations = readdirSync(join(root, "prisma/migrations"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

let failed = 0;
const line = (status, name, detail = "") => {
  if (status === "FAIL") failed++;
  console.log(`${status.padEnd(4)}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function open(url) {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20_000, statement_timeout: 60_000 });
  await c.connect();
  await c.query("BEGIN READ ONLY");
  return c;
}
const q = async (c, sql, params = []) => (await c.query(sql, params)).rows;
const ident = (s) => `"${s.replace(/"/g, '""')}"`;

const started = Date.now();
let r;
try {
  r = await open(restoreUrl);
} catch (e) {
  line("FAIL", "1. Accepts connections", e.code ?? e.message?.split("\n")[0] ?? "refused");
  process.exit(1);
}
const [{ version }] = await q(r, "select current_setting('server_version') as version");
const [{ ro }] = await q(r, "select current_setting('transaction_read_only') as ro");
line("PASS", "1. Accepts connections", `PostgreSQL ${version}, session read-only=${ro}, ${Date.now() - started} ms`);

// 2. Schema
const tables = new Set((await q(r, "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")).map((x) => x.table_name));
const exts = (await q(r, "select extname from pg_extension")).map((x) => x.extname);
const missingTables = models.filter((m) => !tables.has(m));
line(tables.size ? "PASS" : "FAIL", "2a. public schema", `${tables.size} tables`);
line(exts.includes("plpgsql") ? "PASS" : "FAIL", "2b. extensions", exts.sort().join(", ") + " (the schema needs plpgsql only)");
line(missingTables.length ? "FAIL" : "PASS", "2c. every Prisma model has its table", missingTables.length ? `missing: ${missingTables.join(", ")}` : `${models.length} of ${models.length}`);

// 3. Migration history
if (!tables.has("_prisma_migrations")) {
  line("FAIL", "3. migration history", "_prisma_migrations is missing");
} else {
  const rows = await q(r, 'select migration_name, finished_at, rolled_back_at from "_prisma_migrations"');
  const applied = new Set(rows.filter((x) => x.finished_at && !x.rolled_back_at).map((x) => x.migration_name));
  const unfinished = rows.filter((x) => !x.finished_at && !x.rolled_back_at).map((x) => x.migration_name);
  const notApplied = migrations.filter((m) => !applied.has(m));
  const unknown = [...applied].filter((m) => !migrations.includes(m));
  const newest = rows.filter((x) => x.finished_at).sort((a, b) => b.finished_at - a.finished_at)[0];
  line(unfinished.length ? "FAIL" : "PASS", "3a. no migration left half-applied", unfinished.join(", "));
  line(unknown.length ? "FAIL" : "PASS", "3b. no migration this code doesn't know", unknown.join(", "));
  // A restore from before a deploy legitimately lacks that deploy's migrations: a WARN, with which.
  line(notApplied.length ? "WARN" : "PASS", "3c. every migration in this code is applied", notApplied.length ? `not applied (expected if the recovery point predates them): ${notApplied.join(", ")}` : `${migrations.length} of ${migrations.length}`);
  if (newest) console.log(`      newest applied: ${newest.migration_name} at ${newest.finished_at.toISOString()}`);
}

// 4. Critical tables, and the same counts on production as of the recovery point
let p = null;
if (prodUrl) {
  try {
    p = await open(prodUrl);
  } catch (e) {
    line("WARN", "4. production comparison", `couldn't connect (${e.code ?? "error"}); counts shown without it`);
  }
}
const createdCol = async (c, t) => (await q(c, "select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name='createdAt'", [t])).length > 0;
console.log(`\n      ${"table".padEnd(22)} ${"restored".padStart(9)}${p ? `  ${"prod ≤ as-of".padStart(12)}  ${"prod after".padStart(10)}` : ""}`);
for (const t of CRITICAL) {
  if (!tables.has(t)) {
    line("FAIL", `4. ${t}`, "table missing");
    continue;
  }
  const [{ n }] = await q(r, `select count(*)::int as n from ${ident(t)}`);
  let cmp = "";
  let status = "PASS";
  if (p) {
    const hasCreated = await createdCol(p, t);
    if (hasCreated && asOf) {
      const [{ before, after }] = await q(p, `select count(*) filter (where "createdAt" <= $1)::int as before, count(*) filter (where "createdAt" > $1)::int as after from ${ident(t)}`, [asOf]);
      cmp = `  ${String(before).padStart(12)}  ${String(after).padStart(10)}`;
      // Rows deleted on production since the recovery point make the restore larger; fewer is a loss.
      if (n < before) status = "FAIL";
      else if (n > before) status = "WARN";
    } else {
      const [{ all }] = await q(p, `select count(*)::int as all from ${ident(t)}`);
      cmp = `  ${String(all).padStart(12)}  ${"n/a".padStart(10)}`;
      if (n < all) status = "WARN";
    }
  }
  console.log(`${status.padEnd(4)}  ${t.padEnd(22)} ${String(n).padStart(9)}${cmp}`);
  if (status === "FAIL") failed++;
}

// 5. Relationships
for (const [child, col, parent] of LINKS) {
  if (!tables.has(child) || !tables.has(parent)) continue;
  const [{ n }] = await q(r, `select count(*)::int as n from ${ident(child)} c where c.${ident(col)} is not null and not exists (select 1 from ${ident(parent)} x where x.id = c.${ident(col)})`);
  line(n ? "FAIL" : "PASS", `5. ${child}.${col} → ${parent}`, n ? `${n} orphaned` : "");
}

// 6. Freshness
const newestRows = [];
for (const t of ["Organization", "User", "MairoCampaign", "AuditLog", "FunnelEvent"]) {
  if (tables.has(t) && (await createdCol(r, t))) {
    const [{ m }] = await q(r, `select max("createdAt") as m from ${ident(t)}`);
    if (m) newestRows.push([t, m]);
  }
}
const newest = newestRows.sort((a, b) => b[1] - a[1])[0];
if (!newest) line("WARN", "6. freshness", "no rows with createdAt");
else if (asOf && newest[1] > asOf) line("FAIL", "6. newest row is at or before the recovery point", `${newest[0]} at ${newest[1].toISOString()} is after ${asOf.toISOString()}`);
else line("PASS", "6. newest row", `${newest[0]} at ${newest[1].toISOString()}${asOf ? ` (recovery point ${asOf.toISOString()}, ${Math.round((asOf - newest[1]) / 60000)} min earlier)` : ""}`);

await r.query("ROLLBACK");
await r.end();
if (p) {
  await p.query("ROLLBACK");
  await p.end();
}
console.log(`\n${failed ? `FAIL — ${failed} check(s) failed` : "PASS — no check failed"} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);
