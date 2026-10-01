// The Meta contract suite (Meta Intelligence): MAIRO's real Meta request code
// against a stubbed Meta. No network, no token, no database. Exits non-zero
// when a critical test fails, so a build that runs it can't ship a broken
// Meta integration.
//
//   npm run check:meta-contract

import { runContractTests } from "../src/lib/meta-intelligence/testing/contract";

async function main() {
  const results = await runContractTests();
  for (const r of results) console.log(`  ${r.ok ? "ok  " : r.critical ? "FAIL" : "warn"} ${r.name}${r.ok ? "" : ` — ${r.error}`}`);
  const critical = results.filter((r) => !r.ok && r.critical).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} Meta contract tests passed${critical ? `; ${critical} CRITICAL failure(s)` : ""}.\n`);
  if (critical) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
