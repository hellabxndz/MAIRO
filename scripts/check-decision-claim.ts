// Checks that one approval can't be carried out twice.
//
//   npm run check:decision-claim   (needs the database)
//
// A double click, two open tabs, or MAIRO's automatic run landing at the same
// moment as a person's approval must reach Meta once, not twice. applyDecision
// claims the decision before anything runs; an approval that died part-way
// frees it after the lease.

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { APPLY_LEASE_MS, applyDecision } from "../src/lib/decisions/apply";

const ORG = "check-claim-org";
let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

async function decision(extra: Partial<{ status: "PENDING" | "FAILED" | "APPLIED"; applyingAt: Date | null }> = {}) {
  return db.mairoDecision.create({
    data: {
      organizationId: ORG,
      kind: "check",
      category: "NEEDS_ATTENTION",
      title: "Check",
      noticed: "n",
      noticedAdvanced: "n",
      whyItMatters: "w",
      recommendation: "r",
      impact: "i",
      risk: "LOW",
      confidence: "HIGH",
      evidenceJson: "[]",
      // A "guide" change never reaches a network, so the claim can be
      // exercised without Meta.
      changesJson: JSON.stringify([{ type: "guide", label: "Open settings", href: "/dashboard/settings" }]),
      dedupeKey: `check-${Math.random()}`,
      ...extra,
    },
  });
}

async function main() {
  await db.organization.upsert({ where: { id: ORG }, create: { id: ORG, name: "Claim check" }, update: {} });
  try {
    await check("two approvals at once: exactly one is carried out", async () => {
      const d = await decision();
      const results = await Promise.all([1, 2, 3].map(() => applyDecision({ organizationId: ORG, decisionId: d.id, userId: null, automatic: false })));
      assert.equal(results.filter((r) => r.ok).length, 1, JSON.stringify(results));
      assert.ok(results.filter((r) => !r.ok).every((r) => !r.ok && /already/.test(r.error)));
      const after = await db.mairoDecision.findUniqueOrThrow({ where: { id: d.id } });
      assert.equal(after.status, "APPLIED");
      assert.equal(after.applyingAt, null, "the claim is released");
    });

    await check("an approval in progress holds the decision", async () => {
      const d = await decision({ applyingAt: new Date() });
      const r = await applyDecision({ organizationId: ORG, decisionId: d.id, userId: null, automatic: false });
      assert.ok(!r.ok && /already making this change/.test(r.error));
    });

    await check("one that died part-way frees it after the lease", async () => {
      const d = await decision({ applyingAt: new Date(Date.now() - APPLY_LEASE_MS - 1000) });
      const r = await applyDecision({ organizationId: ORG, decisionId: d.id, userId: null, automatic: false });
      assert.ok(r.ok);
    });

    await check("another business's decision is never carried out", async () => {
      const d = await decision();
      const r = await applyDecision({ organizationId: "someone-else", decisionId: d.id, userId: null, automatic: false });
      assert.ok(!r.ok);
      assert.equal((await db.mairoDecision.findUniqueOrThrow({ where: { id: d.id } })).status, "PENDING");
    });

    await check("an applied decision can't be applied again", async () => {
      const d = await decision({ status: "APPLIED" });
      const r = await applyDecision({ organizationId: ORG, decisionId: d.id, userId: null, automatic: false });
      assert.ok(!r.ok && /already been dealt with/.test(r.error));
    });
  } finally {
    await db.organization.delete({ where: { id: ORG } }).catch(() => undefined);
  }
  console.log(`\n${passed} checks passed.\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
