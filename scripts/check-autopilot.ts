// Checks what MAIRO may do on its own, against the real code and the local
// database — the deterministic rules no conversation or setting can talk past:
//
//   - pausing and resuming Autopilot is limited to the roles that may change
//     budgets, keeps the chosen level, is idempotent, and is written to the
//     activity history and the audit log with who did it;
//   - while paused, both automatic paths act as Manual;
//   - at every level, raising the total budget, launching, spending past the
//     ceiling and connecting a platform need a person;
//   - spending limits: no change over the daily maximum, the daily increase
//     or decrease, or below $1 a day;
//   - approval switches hold new creatives and audience changes back;
//   - one business's pause never touches another's.
//
//   npm run check:autopilot   (local database; no Meta, no network)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { setAutopilotPaused } from "../src/lib/automation/pause";
import { ALWAYS_NEEDS_APPROVAL, mayDoAutomatically } from "../src/lib/automation/levels";
import { effectiveLevel } from "../src/lib/decisions/store";
import { runAutoOptimize } from "../src/lib/budget/recommendations";
import { limitProblem, mayAutoApply } from "../src/lib/decisions/guardrails";
import { ROLES, type Role } from "../src/lib/members/roles";
import type { DecisionChange } from "../src/lib/decisions/types";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-auto";
const A = `${TAG}-a`;
const B = `${TAG}-b`;
const actor = (role: Role | null) => ({ userId: null, name: `A ${role ?? "stranger"}`, role });
const budget = (from: number, to: number, name = "Spring"): DecisionChange => ({ type: "set-budget", platform: "META", mairoCampaignId: "c", platformCampaignId: "p", externalCampaignId: "e", campaignName: name, fromCents: from, toCents: to });
const G = { maxDailyBudgetCents: 10_000, maxDailyIncreasePercent: 20, maxDailyDecreasePercent: 30, maxBudgetShiftPercent: 15, minRoas: null, maxCpaCents: null };
const ALL_ON = { requireApprovalNewCreatives: true, requireApprovalAudience: true, requireApprovalPlatformShift: true };
const ALL_OFF = { requireApprovalNewCreatives: false, requireApprovalAudience: false, requireApprovalPlatformShift: false };

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function main() {
  await cleanup();
  for (const id of [A, B]) {
    await db.organization.create({ data: { id, name: id, subscriptionTier: "SCALE_V2", subscriptionStatus: "active", hasPaid: true } });
    await db.autoOptimizeSettings.create({ data: { organizationId: id, level: "ASSISTED", enabled: true, maxDailyBudgetCents: 10_000 } });
  }

  console.log("— pause and resume —");
  await check("only the roles that may change budgets can pause; the others are refused and nothing changes", async () => {
    const allowed: Role[] = ["OWNER", "ADMIN", "MARKETING_MANAGER"];
    for (const role of ROLES.filter((r) => !allowed.includes(r))) {
      const r = await setAutopilotPaused(A, actor(role), true);
      assert.equal(r.ok, false, role);
    }
    assert.equal((await setAutopilotPaused(A, actor(null), true)).ok, false, "no role at all");
    assert.equal((await db.autoOptimizeSettings.findUniqueOrThrow({ where: { organizationId: A } })).pausedAt, null);
    assert.equal(await db.auditLog.count({ where: { organizationId: A } }), 0);
  });
  await check("a marketing manager pauses: level kept, Manual in effect, recorded and audited", async () => {
    const r = await setAutopilotPaused(A, actor("MARKETING_MANAGER"), true);
    assert.equal(r.ok && r.changed, true);
    const s = await db.autoOptimizeSettings.findUniqueOrThrow({ where: { organizationId: A } });
    assert.ok(s.pausedAt);
    assert.equal(s.level, "ASSISTED");
    assert.equal(await effectiveLevel(A), "MANUAL");
    assert.deepEqual(await runAutoOptimize(A), { applied: 0, refused: [] });
    const act = await db.mairoActivity.findFirstOrThrow({ where: { organizationId: A, action: "autopilot.paused" } });
    assert.equal(act.automatic, false);
    assert.match(act.reason, /Paused by A MARKETING_MANAGER/);
    assert.equal((await db.auditLog.findFirstOrThrow({ where: { organizationId: A } })).action, "autopilot.pause");
  });
  await check("pausing twice changes nothing more", async () => {
    const r = await setAutopilotPaused(A, actor("OWNER"), true);
    assert.equal(r.ok && r.changed, false);
    assert.equal(await db.mairoActivity.count({ where: { organizationId: A, action: "autopilot.paused" } }), 1);
  });
  await check("another business is untouched by A's pause", async () => {
    assert.equal(await effectiveLevel(B), "ASSISTED");
    assert.equal((await db.autoOptimizeSettings.findUniqueOrThrow({ where: { organizationId: B } })).pausedAt, null);
  });
  await check("resuming restores the chosen level, and is recorded too", async () => {
    const r = await setAutopilotPaused(A, actor("OWNER"), false);
    assert.equal(r.ok && r.changed, true);
    assert.equal(await effectiveLevel(A), "ASSISTED");
    assert.equal(await db.auditLog.count({ where: { organizationId: A, action: "autopilot.resume" } }), 1);
  });
  await check("Manual (Approval mode) can't be 'paused': there's nothing automatic to stop", async () => {
    await db.autoOptimizeSettings.update({ where: { organizationId: B }, data: { level: "MANUAL", enabled: false } });
    assert.equal((await setAutopilotPaused(B, actor("OWNER"), true)).ok, false);
    assert.equal(await effectiveLevel(B), "MANUAL");
  });

  console.log("\n— what always needs a person —");
  await check("raising the total budget, launching, overspending and new platforms are never automatic, at any level", () => {
    for (const level of ["MANUAL", "ASSISTED", "AUTOPILOT"] as const) {
      for (const a of ALWAYS_NEEDS_APPROVAL) assert.equal(mayDoAutomatically(level, a), false, `${level} ${a}`);
    }
  });
  await check("a budget rise is held for approval even on Full Autopilot with every switch off", () => {
    assert.equal(mayAutoApply("AUTOPILOT", [budget(5_000, 5_500)], ALL_OFF), false);
    // Moving money between campaigns (same total) is allowed on AI Assist; lowering is the cheapest change.
    assert.equal(mayAutoApply("ASSISTED", [budget(5_000, 4_500, "A"), budget(3_000, 3_500, "B")], ALL_OFF), true);
    assert.equal(mayAutoApply("MANUAL", [budget(5_000, 4_500)], ALL_OFF), false);
  });
  await check("the approval switches hold new creatives and audience changes back", () => {
    const creative: DecisionChange = { type: "new-ad-variation", platform: "META", mairoCampaignId: "c", campaignName: "Spring", basedOnLabel: "Ad 1" } as unknown as DecisionChange;
    assert.equal(mayAutoApply("AUTOPILOT", [creative], ALL_ON), false);
  });

  console.log("\n— spending limits —");
  await check("no change takes daily spend over the maximum the owner set", () => {
    assert.match(limitProblem([budget(5_000, 6_000)], G, 9_500) ?? "", /over the \$100 maximum/);
    assert.equal(limitProblem([budget(5_000, 5_900)], G, 4_000), null);
  });
  await check("no single change beyond the daily increase or decrease, and never below $1 a day", () => {
    assert.match(limitProblem([budget(5_000, 6_500)], G, 0) ?? "", /more than the 20% daily increase/);
    assert.match(limitProblem([budget(5_000, 3_000)], G, 0) ?? "", /more than the 30% daily decrease/);
    assert.match(limitProblem([budget(150, 90)], { ...G, maxDailyDecreasePercent: 90 }, 0) ?? "", /can't go below \$1 a day/);
  });

  await cleanup();
  console.log(`\nAutopilot: ${passed} checks passed. Nothing was sent to Meta.`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => undefined);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
