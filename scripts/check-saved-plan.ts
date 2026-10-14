// Checks saved and shared free ad plans (src/lib/preview/saved-plan*.ts):
//
//   - a saved plan belongs to no business until it's claimed, and is
//     reachable only by its unguessable link;
//   - claiming gives it to one business, never moves it to another, and
//     opens setup with its answers — without overwriting answers already
//     given, without marking any screen saved, and never once setup is done;
//   - unclaimed plans expire after 30 days, claimed ones don't;
//   - what's saved is validated, so a tampered plan can't be stored.
//
//   npm run check:saved-plan   (uses the database)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { draftFromPlan, savedPlanSchema, UNCLAIMED_DAYS, type SavedPlan } from "../src/lib/preview/saved-plan";
import { claimPlan, plansFor, readSharedPlan, savePlan, sweepUnclaimedPlans } from "../src/lib/preview/saved-plan-store";
import { parseDraft } from "../src/lib/onboarding/draft";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const plan = (over: Partial<SavedPlan["inputs"]> = {}): SavedPlan =>
  savedPlanSchema.parse({
    inputs: { website: "https://shop.example", sells: "Premium streetwear for young adults", goal: "sales", monthly: 1000, ...over },
    facts: { name: "Nova Clothing", offering: "Premium streetwear for young adults", customer: "Young adults", location: "Ships across the US", offer: "Free shipping over $80", proof: "", problem: "", businessType: "ecommerce", pixelSeen: true, usesLeadForm: false, fromWebsite: ["name", "offering"] },
    findings: [],
    written: { appeal: ["Designed for young adults."], customers: "Young adults", messaging: ["Lead with free shipping."], concepts: [{ label: "The offer", headline: "Free shipping over $80", primaryText: "Premium streetwear. Free shipping over $80.", format: "Single image", visual: "Your newest piece.", cta: "Shop now", targetCustomer: "Young adults", why: "A real offer." }], first: 0, firstWhy: "A real offer." },
    source: { by: "fixture", note: "Local test fixture" },
  });

async function main() {
  const tag = `check-saved-plan-${Date.now()}`;
  const [a, b, done] = await Promise.all([
    db.organization.create({ data: { name: `${tag} A` } }),
    db.organization.create({ data: { name: `${tag} B` } }),
    db.organization.create({ data: { name: `${tag} done` } }),
  ]);
  await db.onboardingIntake.create({ data: { organizationId: done.id, primaryGoal: "LEADS", monthlyBudgetCents: 50_000 } });

  try {
    console.log("— saving and reading —");
    const saved = await savePlan(plan());
    await check("a saved plan belongs to no business and opens by its link", async () => {
      const row = await db.freeAdPlan.findUnique({ where: { id: saved.id } });
      assert.equal(row?.organizationId, null);
      assert.equal(row?.claimedAt, null);
      assert.match(saved.shareToken, /^[A-Za-z0-9_-]{24}$/);
      const read = await readSharedPlan(saved.shareToken);
      assert.equal(read?.plan.facts.name, "Nova Clothing");
    });
    await check("a malformed or unknown link opens nothing", async () => {
      assert.equal(await readSharedPlan("../../etc/passwd"), null);
      assert.equal(await readSharedPlan("x".repeat(24)), null);
    });
    await check("a tampered plan isn't accepted", () => {
      assert.equal(savedPlanSchema.safeParse({ ...plan(), inputs: { ...plan().inputs, monthly: 5 } }).success, false);
      assert.equal(savedPlanSchema.safeParse({ ...plan(), inputs: { ...plan().inputs, goal: "fame" } }).success, false);
      assert.equal(savedPlanSchema.safeParse({ ...plan(), written: { ...plan().written!, first: 7 } }).success, false);
    });

    console.log("\n— claiming —");
    await check("claiming gives it to one business and opens setup with its answers", async () => {
      assert.equal(await claimPlan(saved.shareToken, a.id), true);
      const row = await db.freeAdPlan.findUnique({ where: { id: saved.id } });
      assert.equal(row?.organizationId, a.id);
      assert.ok(row?.claimedAt);
      const draft = parseDraft((await db.organization.findUnique({ where: { id: a.id } }))!.onboardingDraft);
      assert.equal(draft.business?.website, "https://shop.example");
      assert.equal(draft.business?.offering, "Premium streetwear for young adults");
      assert.equal(draft.business?.businessType, "ecommerce");
      assert.equal(draft.goal?.primaryGoal, "SALES");
      assert.equal(draft.goal?.monthlyBudget, 1000);
      assert.equal(draft.goal?.currentOffer, "Free shipping over $80");
      assert.match(draft.goal?.notes ?? "", /Ad to test first \(from the free plan\): Free shipping over \$80/);
      assert.equal(draft.business?.savedAt, undefined, "nothing is marked saved — the owner confirms it");
      assert.deepEqual((await plansFor(a.id)).map((p) => p.shareToken), [saved.shareToken]);
    });
    await check("another business can't take a plan that's been claimed", async () => {
      assert.equal(await claimPlan(saved.shareToken, b.id), false);
      assert.equal((await db.freeAdPlan.findUnique({ where: { id: saved.id } }))?.organizationId, a.id);
      assert.equal((await db.organization.findUnique({ where: { id: b.id } }))?.onboardingDraft, null);
      assert.deepEqual(await plansFor(b.id), []);
    });
    await check("answers already given in setup win over the plan's", async () => {
      await db.organization.update({ where: { id: b.id }, data: { onboardingDraft: { business: { website: "https://mine.example", offering: "My own words" }, goal: { primaryGoal: "LEADS", monthlyBudget: 400 } } } });
      const second = await savePlan(plan({ goal: "traffic", monthly: 2500 }));
      assert.equal(await claimPlan(second.shareToken, b.id), true);
      const draft = parseDraft((await db.organization.findUnique({ where: { id: b.id } }))!.onboardingDraft);
      assert.equal(draft.business?.website, "https://mine.example");
      assert.equal(draft.business?.offering, "My own words");
      assert.equal(draft.goal?.primaryGoal, "LEADS");
      assert.equal(draft.goal?.monthlyBudget, 400);
      assert.equal(draft.business?.businessType, "ecommerce", "an empty answer is filled");
    });
    await check("a business that finished setup keeps its plan, but setup isn't reopened", async () => {
      const third = await savePlan(plan(), done.id);
      assert.equal((await db.freeAdPlan.findFirst({ where: { shareToken: third.shareToken } }))?.organizationId, done.id);
      assert.equal((await db.organization.findUnique({ where: { id: done.id } }))?.onboardingDraft, null);
    });
    await check("each goal opens setup on the matching setup goal", () => {
      const goals = { sales: "SALES", leads: "LEADS", bookings: "LEADS", traffic: "TRAFFIC", awareness: "AWARENESS" } as const;
      for (const [goal, setup] of Object.entries(goals)) assert.equal(draftFromPlan(plan({ goal: goal as SavedPlan["inputs"]["goal"] }), {}).goal?.primaryGoal, setup);
    });

    console.log("\n— expiry —");
    await check(`unclaimed plans expire after ${UNCLAIMED_DAYS} days; claimed ones are kept`, async () => {
      const old = await savePlan(plan());
      const past = new Date(Date.now() - (UNCLAIMED_DAYS + 1) * 864e5);
      await db.freeAdPlan.updateMany({ where: { shareToken: { in: [old.shareToken, saved.shareToken] } }, data: { createdAt: past } });
      assert.equal(await readSharedPlan(old.shareToken), null, "an expired link opens nothing even before the sweep");
      assert.ok(await readSharedPlan(saved.shareToken), "a claimed plan's link keeps working");
      assert.equal(await claimPlan(old.shareToken, b.id), false, "nor can it be claimed");
      assert.ok((await sweepUnclaimedPlans()) >= 1);
      assert.equal(await db.freeAdPlan.findUnique({ where: { shareToken: old.shareToken } }), null);
      assert.ok(await db.freeAdPlan.findUnique({ where: { shareToken: saved.shareToken } }));
    });
    await check("closing a business deletes its plans with it", async () => {
      await db.organization.delete({ where: { id: a.id } });
      assert.equal(await db.freeAdPlan.findUnique({ where: { shareToken: saved.shareToken } }), null);
    });
  } finally {
    await db.organization.deleteMany({ where: { name: { startsWith: tag } } });
  }

  console.log(`\nSaved plans: ${passed} checks passed`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
