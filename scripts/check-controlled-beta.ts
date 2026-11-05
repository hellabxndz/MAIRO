// The controlled-beta guarantees (docs/PILOT-WALKTHROUGH.md), against the real
// code and the local database. No AI model, no Meta, no Stripe:
//
//   - an approval covers the exact terms it was given: a budget, schedule,
//     audience or destination change afterwards needs approving again, and the
//     Approval Center shows it; Meta's object ids aren't terms;
//   - a create request runs once: a repeat of the same form's submit is
//     refused, from two tabs at once too; a failed one can be retried; keys are
//     per business;
//   - status says what is verified: the owner's approval, Meta accepting the
//     switch-on, Meta's review and actual delivery are four different words;
//   - a purchase campaign launches only once Meta has seen a purchase, with a
//     value and a currency where Meta says which fields arrived;
//   - spending copy distinguishes Meta's daily budgets, MAIRO's checks and a
//     hard account limit; results say where they came from.
//
//   npm run check:controlled-beta   (local database)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { approvalCoversNow, approvalHash, approvalState, recordLaunchApproval, type ApprovalTermsInput } from "../src/lib/campaigns/approval";
import { claimOnce, finishOnce, releaseOnce } from "../src/lib/requests/once";
import { deliveredFrom, statusLabel } from "../src/lib/dashboard/campaigns";
import { launchGate, type PixelState } from "../src/lib/tracking/pixel-rules";
import { otherApprovals } from "../src/lib/approvals/queue";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-beta";
const A = `${TAG}-a`;
const B = `${TAG}-b`;
const NOW = new Date("2026-11-05T12:00:00Z");
const read = (f: string) => readFileSync(f, "utf8");

const terms = (over: Partial<ApprovalTermsInput> = {}): ApprovalTermsInput => ({
  objective: "LEADS", budgetType: "DAILY", totalDailyBudgetCents: 4000, lifetimeBudgetCents: null, startDate: null, endDate: null,
  geoKey: "2418779", geoRadius: 20, ageMin: 25, ageMax: 65, genders: 0, destinationType: "LEAD_FORM", destinationUrl: null, destinationPhone: null,
  placements: [], specialAdCategory: null, advantageAudience: false, platformCampaigns: [{ platform: "META", dailyBudgetCents: 4000, lifetimeBudgetCents: null }], ...over,
});

async function cleanup() {
  await db.idempotencyKey.deleteMany({ where: { organizationId: { startsWith: TAG } } });
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function builtCampaign(organizationId: string) {
  return db.mairoCampaign.create({
    data: {
      organizationId, name: "Spring cleanups", objective: "LEADS", status: "PENDING_REVIEW", totalDailyBudgetCents: 4000, geoKey: "2418779", geoRadius: 20, ageMin: 25, destinationType: "LEAD_FORM",
      platformCampaigns: { create: { platform: "META", status: "PENDING_REVIEW", externalCampaignId: `${organizationId}-c`, externalAdGroupId: `${organizationId}-as`, externalAdId: `${organizationId}-ad`, budgetPercent: 100, dailyBudgetCents: 4000 } },
    },
  });
}

async function main() {
  await cleanup();
  await db.organization.create({ data: { id: A, name: "Green Fern Landscaping" } });
  await db.organization.create({ data: { id: B, name: "Other Business" } });

  console.log("— an approval covers what was approved —");
  await check("the fingerprint is stable, and every material term changes it", () => {
    const base = approvalHash(terms());
    assert.equal(approvalHash(terms()), base);
    for (const over of [
      { totalDailyBudgetCents: 8000 }, { budgetType: "LIFETIME", lifetimeBudgetCents: 50000 }, { startDate: new Date("2026-12-01") }, { endDate: new Date("2026-12-31") },
      { geoRadius: 50 }, { geoKey: "999" }, { ageMin: 18 }, { genders: 2 }, { destinationType: "WEBSITE", destinationUrl: "https://x.example" }, { placements: ["INSTAGRAM_FEED"] },
      { objective: "SALES" }, { advantageAudience: true }, { platformCampaigns: [{ platform: "META", dailyBudgetCents: 6000, lifetimeBudgetCents: null }] },
    ] as Partial<ApprovalTermsInput>[]) assert.notEqual(approvalHash(terms(over)), base, JSON.stringify(over));
  });
  await check("never approved, approved and unchanged, approved then changed — and old approvals without a fingerprint still stand", () => {
    assert.equal(approvalState({ ...terms(), launchApprovedAt: null, launchApprovalHash: null }), "none");
    assert.equal(approvalState({ ...terms(), launchApprovedAt: NOW, launchApprovalHash: approvalHash(terms()) }), "covers");
    assert.equal(approvalState({ ...terms({ totalDailyBudgetCents: 9000 }), launchApprovedAt: NOW, launchApprovalHash: approvalHash(terms()) }), "changed");
    assert.equal(approvalState({ ...terms(), launchApprovedAt: NOW, launchApprovalHash: null }), "covers");
  });
  await check("in the database: approve, raise the budget, and the approval no longer covers it; MAIRO's own ids don't matter", async () => {
    const c = await builtCampaign(A);
    assert.equal(await approvalCoversNow(A, c.id), "none");
    await recordLaunchApproval(A, c.id);
    assert.equal(await approvalCoversNow(A, c.id), "covers");
    await db.platformCampaign.updateMany({ where: { mairoCampaignId: c.id }, data: { externalAdId: "another-ad-id" } });
    assert.equal(await approvalCoversNow(A, c.id), "covers", "finishing the build isn't a change of terms");
    await db.mairoCampaign.update({ where: { id: c.id }, data: { totalDailyBudgetCents: 8000 } });
    await db.platformCampaign.updateMany({ where: { mairoCampaignId: c.id }, data: { dailyBudgetCents: 8000 } });
    assert.equal(await approvalCoversNow(A, c.id), "changed");
    const queue = await otherApprovals(A, NOW);
    const item = queue.find((q) => q.kind === "launch" && q.launch?.campaignId === c.id);
    assert.ok(item, "the changed campaign is back in the Approval Center");
    assert.match(item!.text, /Changed after you approved it/);
    assert.match(item!.budget, /\$80/);
    const row = await db.mairoCampaign.findUniqueOrThrow({ where: { id: c.id }, include: { platformCampaigns: true } });
    assert.equal(statusLabel(row, NOW).text, "Changed since you approved — approve again");
    await recordLaunchApproval(A, c.id);
    assert.equal(await approvalCoversNow(A, c.id), "covers", "approving again covers the new terms");
    assert.equal(await approvalCoversNow(B, c.id), "none", "another business can't read or approve it");
    assert.equal(await recordLaunchApproval(B, c.id), false);
  });
  await check("every launch path records approvals through recordLaunchApproval, and the launch loop checks them (source)", () => {
    const actions = read("src/lib/actions/campaign-actions.ts");
    assert.doesNotMatch(actions, /launchApprovedAt: new Date\(\)/);
    assert.equal((actions.match(/recordLaunchApproval\(/g) ?? []).length, 2);
    assert.doesNotMatch(read("src/lib/onboarding/launch.ts"), /launchApprovedAt: new Date\(\)/);
    const live = read("src/lib/campaigns/auto-launch.ts");
    assert.match(live, /approvalCoversNow\(organizationId, mc\.id\)/);
    assert.ok(live.indexOf("approvalCoversNow(organizationId, mc.id)") < live.indexOf("const claim = await db.platformCampaign.updateMany"), "checked before claiming");
  });

  console.log("\n— a create request runs once —");
  await check("the same submit twice at once: one goes ahead, the other is refused before anything is built", async () => {
    const key = "k-0123456789abcdef";
    const [x, y] = await Promise.all([claimOnce(A, "create-campaign", key), claimOnce(A, "create-campaign", key)]);
    assert.equal([x, y].filter((r) => r.ok).length, 1);
    const dup = [x, y].find((r) => !r.ok)!;
    assert.ok(!dup.ok && dup.reason === "duplicate" && dup.resultId === null, "refused as still being built");
  });
  await check("a failed attempt can be retried; a finished one says what it made; keys are per business", async () => {
    const key = "k-fedcba9876543210";
    const first = await claimOnce(A, "create-campaign", key);
    assert.ok(first.ok);
    await releaseOnce(first.key);
    const retry = await claimOnce(A, "create-campaign", key);
    assert.ok(retry.ok, "retry after a failure goes ahead");
    await finishOnce(retry.key, "mc_123");
    const again = await claimOnce(A, "create-campaign", key);
    assert.ok(!again.ok && again.reason === "duplicate" && again.resultId === "mc_123");
    assert.ok((await claimOnce(B, "create-campaign", key)).ok, "another business's key is its own");
    const bad = await claimOnce(A, "create-campaign", "short");
    assert.ok(!bad.ok && bad.reason === "invalid");
  });
  await check("both create forms send a one-time key, and the action claims it when there's no draft (source)", () => {
    const action = read("src/lib/actions/campaign-actions.ts");
    assert.match(action, /claimOnce\(organizationId, "create-campaign", formData\.get\("submissionKey"\)\)/);
    assert.ok(action.indexOf("claimOnce(") < action.indexOf("outcome = await createMairoCampaign"), "claimed before building");
    assert.match(read("src/app/dashboard/campaigns/new-campaign-form.tsx"), /name="submissionKey"/);
    assert.match(read("src/app/dashboard/create/[service]/campaign-wizard.tsx"), /fd\.append\("submissionKey"/);
  });

  console.log("\n— status says what is verified —");
  await check("approval, switched on, Meta's review and delivery are four different states", () => {
    const pc = (s: string | null, err: string | null = null) => ({ status: "ACTIVE" as const, endDate: null, platformCampaigns: [{ adReviewState: s, lastError: err }] });
    assert.equal(statusLabel({ status: "PENDING_REVIEW", endDate: null }, NOW).text, "Waiting for your approval");
    assert.equal(statusLabel({ status: "PENDING_REVIEW", endDate: null, launchApprovedAt: NOW }, NOW).text, "Approved by you — waiting for Meta");
    assert.equal(statusLabel({ status: "ACTIVE", endDate: null }, NOW).text, "Switched on — waiting for Meta's review");
    assert.equal(statusLabel(pc("PENDING"), NOW).text, "Under Meta review");
    assert.equal(statusLabel(pc("APPROVED"), NOW).text, "Approved by Meta — delivery not confirmed yet");
    assert.equal(statusLabel(pc("APPROVED"), NOW, { delivered: false }).text, "Approved by Meta — no delivery yet");
    assert.equal(statusLabel(pc("APPROVED"), NOW, { delivered: true }).text, "Running");
    assert.equal(statusLabel(pc("REJECTED"), NOW, { delivered: true }).text, "Rejected by Meta — see why");
    assert.equal(statusLabel(pc("APPROVED", "Token expired"), NOW, { delivered: true }).text, "Needs attention — see why");
    assert.equal(statusLabel({ status: "PAUSED", endDate: null }, NOW).text, "Paused");
    // Only verified delivery is green.
    assert.equal(statusLabel(pc("APPROVED"), NOW, { delivered: true }).tone, "green");
    for (const s of ["PENDING", "APPROVED", null]) assert.notEqual(statusLabel(pc(s), NOW).tone, "green", String(s));
  });
  await check("delivered means Meta reported impressions; unread figures are unknown, not 'no'", () => {
    assert.equal(deliveredFrom(null), null);
    assert.equal(deliveredFrom({ hasData: false, total: { impressions: null } }), false);
    assert.equal(deliveredFrom({ hasData: true, total: { impressions: 0 } }), false);
    assert.equal(deliveredFrom({ hasData: true, total: { impressions: 12 } }), true);
  });

  console.log("\n— purchase tracking before a purchase launch —");
  const px = (over: Partial<PixelState> = {}): PixelState => ({ decision: "use", pixel: { id: "1", name: "p", lastFiredAt: NOW, installDetected: true, accessLost: false, otherAdAccount: false }, purchaseVerified: false, ...over });
  await check("page views alone don't launch a purchase campaign; a purchase does; one Meta says has no value or currency doesn't", () => {
    const need = "required_for_purchases" as const;
    const noPurchase = launchGate(need, px());
    assert.ok(!noPurchase.ok && noPurchase.code === "no_purchase_seen" && noPurchase.fixes.some((f) => f.href === "/dashboard/pixel"));
    assert.deepEqual(launchGate(need, px({ purchaseVerified: true, purchaseParams: "verified" })), { ok: true });
    assert.deepEqual(launchGate(need, px({ purchaseVerified: true, purchaseParams: "unknown" })), { ok: true }, "Meta not saying isn't a refusal");
    const noValue = launchGate(need, px({ purchaseVerified: true, purchaseParams: "missing" }));
    assert.ok(!noValue.ok && noValue.code === "purchase_no_value" && /value and currency/.test(noValue.title));
    assert.deepEqual(launchGate("recommended", px()), { ok: true }, "a leads campaign isn't held for purchases");
  });

  console.log("\n— spending copy is honest —");
  await check("daily maximum, monthly check and hard limit are each called what they are", () => {
    const auto = read("src/app/dashboard/settings/automation-section.tsx");
    assert.doesNotMatch(auto, /never take total spend above/);
    assert.match(auto, /up to 75% more/);
    assert.match(auto, /account spending limit in Meta/);
    const protect = read("src/app/dashboard/settings/spend-protection-section.tsx");
    assert.doesNotMatch(protect, /Don&rsquo;t spend more than/);
    assert.match(protect, /not a cap Meta enforces/);
    assert.match(protect, /account spending limit/);
  });
  await check("results say where they came from and how fresh they are (source)", () => {
    const r = read("src/app/dashboard/results/page.tsx");
    assert.match(r, /Source: your Meta ad account, read just now/);
    assert.match(r, /missing, not zero|unknown, not zero/);
  });

  await cleanup();
  console.log(`\nControlled beta: ${passed} checks passed. No AI model, Meta or Stripe was called.`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => undefined);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
