// The MAIRO audit: runs every check suite and reports the result against the
// fifteen questions a paying customer's business depends on.
//
//   npm run audit            (needs DATABASE_URL; makes no network calls)
//
// What this proves, and what it can't: every suite runs MAIRO's real code —
// its rules, its database writes, and the exact requests it sends Meta —
// against a simulated Meta. It never calls Meta, never spends and never
// publishes. Whether the real Meta accepts those requests for a real account
// is what AIOS → Live Meta check answers (read-only), and what a first
// approved launch confirms.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const QUESTIONS: { n: number; q: string; suites: string[]; production: string }[] = [
  { n: 1, q: "Connects to a real Meta account", suites: ["account-history", "graph-cache", "live-meta", "meta-contract"], production: "Live Meta check: token, permissions, ad account, Page." },
  { n: 2, q: "Understands the business and builds a strategy", suites: ["business", "brain", "strategy-plan", "engine", "mission", "memory"], production: "Needs ANTHROPIC_API_KEY for the AI reading; without it, the literal page reading still runs." },
  { n: 3, q: "Specialists coordinate on real work", suites: ["team", "decisions", "coach-db"], production: "AI Team activity shows each recorded run." },
  { n: 4, q: "Builds campaigns and submits them for approval", suites: ["campaign-wizard", "ads", "ad-score", "readiness", "schedule", "creative-studio"], production: "A first campaign built (switched off) on a real account." },
  { n: 5, q: "Publishes through Meta's real API", suites: ["meta-contract", "payment-gate", "decision-claim", "readiness"], production: "Only a real, approved launch proves Meta accepts it — not done in this audit (it would spend)." },
  { n: 6, q: "Analytics reads real data", suites: ["analytics", "graph-cache", "account-history", "reports", "weekly-report"], production: "Live Meta check: campaigns and results readable." },
  { n: 7, q: "Optimization finds real problems", suites: ["decisions", "intelligence", "engine", "coach", "coach-db"], production: "Needs a live campaign past its learning period." },
  { n: 8, q: "Budget Guardian protects the budget", suites: ["budget", "readiness", "automation", "decisions", "team"], production: "Spend Protection runs nightly and on every Overview visit." },
  { n: 9, q: "Tracks leads, purchases and conversions", suites: ["tracking", "gtm", "leads", "lead-report", "live-meta"], production: "Live Meta check: pixel firing in the last week." },
  { n: 10, q: "Separates what Meta reports from verified results", suites: ["lead-outcomes", "tracking", "analytics", "success", "decisions", "coach"], production: "Depends on the owner marking leads and connecting a store." },
  { n: 11, q: "Task statuses are genuine", suites: ["team", "notifications"], production: "AIOS → Customers lists failed and stuck runs." },
  { n: 12, q: "The Daily Brief uses only real data", suites: ["team", "intelligence", "weekly-report"], production: "Brief appears after the first daily review of a live campaign." },
  { n: 13, q: "Ask your AI team answers from facts", suites: ["assistant", "team", "memory"], production: "Needs ANTHROPIC_API_KEY." },
  { n: 14, q: "Subscriptions, permissions and data isolation", suites: ["entitlements", "payment-gate", "social-manager", "google", "decision-claim", "env", "coach-db"], production: "Needs Stripe keys, prices and BILLING_ENFORCED before charging anyone." },
  { n: 15, q: "Works for owners with no advertising experience", suites: ["simple-ui", "success", "campaign-wizard", "ad-score"], production: "Only real owners can prove this — watch first-30-days progress in AIOS." },
];

const scripts = Object.keys((JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts)
  .filter((k) => k.startsWith("check:"))
  .map((k) => k.slice("check:".length));

const results = new Map<string, { ok: boolean; ms: number; tail: string }>();
console.log(`Running ${scripts.length} suites…\n`);
for (const s of scripts) {
  const t = Date.now();
  const r = spawnSync("npm", ["run", "-s", `check:${s}`], { encoding: "utf8", env: process.env, timeout: 300_000 });
  const ok = r.status === 0;
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n");
  results.set(s, { ok, ms: Date.now() - t, tail: ok ? "" : out.slice(-6).join("\n") });
  console.log(`  ${ok ? "pass" : "FAIL"}  ${s.padEnd(20)} ${String(Date.now() - t).padStart(6)} ms`);
}

const unknown = QUESTIONS.flatMap((q) => q.suites).filter((s) => !results.has(s));
if (unknown.length) {
  console.error(`\nThe audit names suites that don't exist: ${[...new Set(unknown)].join(", ")}`);
  process.exit(1);
}

console.log("\nThe fifteen questions\n");
for (const q of QUESTIONS) {
  const failed = q.suites.filter((s) => !results.get(s)!.ok);
  console.log(`${String(q.n).padStart(2)}. ${failed.length ? "FAIL" : "pass"}  ${q.q}`);
  console.log(`      tested by: ${q.suites.join(", ")}${failed.length ? `  — failing: ${failed.join(", ")}` : ""}`);
  console.log(`      in production: ${q.production}`);
}

const failing = [...results].filter(([, r]) => !r.ok);
for (const [s, r] of failing) console.log(`\n--- ${s} ---\n${r.tail}`);
console.log(`\n${results.size - failing.length} of ${results.size} suites passed. Simulated Meta only — nothing was sent to Meta, spent or published.`);
process.exit(failing.length ? 1 : 0);
