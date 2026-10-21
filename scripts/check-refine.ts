// Checks "Do you like it? What would you change?" under the free AI ad plan,
// and "I like it — get started" (the quick start from a liked plan):
//
//   - MAIRO's rules read a budget, a goal, an area and "I like it";
//   - nothing proposed is trusted: a budget the owner didn't write, a figure
//     outside the planner's range, a number or wording that isn't theirs, or
//     a guarantee is refused and said;
//   - a change is applied to the plan (the website no longer claims a fact
//     the owner changed), and only a goal or fact change rewrites concepts;
//   - the refine route answers from the rules (labelled) when the AI is off;
//   - the quick start saves the same setup record the full setup does, MAIRO
//     writes the strategy from it, and approving it records the approval —
//     nothing launches, nothing is charged.
//
//   npm run check:refine   (uses the database; no AI, Meta or Stripe call)

import assert from "node:assert/strict";
import { applyChanges, describeChanges, figureWritten, hasChanges, ownWords, readRequest, settleChanges, withWriting } from "../src/lib/preview/refine";
import { savedPlanSchema, type SavedPlan } from "../src/lib/preview/saved-plan";
import { buildReport } from "../src/lib/preview/report";
import { destinationsForStart, suggestedDestination } from "../src/lib/onboarding/quick-start";
import { intakeSchema, writeIntake } from "../src/lib/onboarding/intake";
import { approve, createStrategy, loadStrategy } from "../src/lib/strategy/store";
import { db } from "../src/lib/db";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const plan: SavedPlan = savedPlanSchema.parse({
  inputs: { website: "https://simplylandscapes.example/", sells: "Landscaping services in Miami", goal: "sales", monthly: 500 },
  facts: { name: "Simply Landscapes Miami LLC", offering: "Landscaping services offered locally in Miami", customer: "", location: "Miami", offer: "A free landscaping quote", proof: "", problem: "", businessType: "home_services", fromWebsite: ["name", "offering", "location", "offer"], destinations: { booking: null, form: true, phone: true, checkout: false } },
  site: { url: "https://simplylandscapes.example/", pagesRead: 4, platform: null },
  findings: [],
  written: null,
  source: { by: "templates", why: "off" },
});

async function main() {
  // No model calls from this check, whatever the environment has.
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.MAIRO_PLAN_FIXTURE;

  console.log("— MAIRO's rules read the request —");
  await check("a monthly budget, a daily one (×30) and \"2k\"", () => {
    assert.equal(readRequest("Lower my budget to $300 a month").raw.monthly, 300);
    assert.equal(readRequest("I can do $20 a day").raw.monthly, 600);
    assert.equal(readRequest("make it 2k a month").raw.monthly, 2000);
    assert.equal(readRequest("make it cheaper").raw.monthly, undefined);
  });
  await check("a goal only when one is asked for, and not when it's refused", () => {
    assert.equal(readRequest("Focus on bookings instead").raw.goal, "bookings");
    assert.equal(readRequest("I want more phone calls").raw.goal, "leads");
    assert.equal(readRequest("I don't want sales").raw.goal, undefined);
    assert.equal(readRequest("make the ads mention our free quotes").raw.goal, undefined);
  });
  await check("an area, named", () => {
    assert.equal(readRequest("Only advertise in Miami-Dade").raw.facts?.location, "Miami-Dade");
    assert.equal(readRequest("target people in Fort Lauderdale please").raw.facts?.location, "Fort Lauderdale");
    assert.equal(readRequest("only advertise in my city").raw.facts?.location, undefined);
  });
  await check("\"I like it\" is a yes, with no changes", () => {
    const r = readRequest("I love it, looks great");
    assert.equal(r.likes, true);
    assert.equal(hasChanges(settleChanges(r.raw, plan, "I love it, looks great").changes), false);
    assert.equal(readRequest("I like it but make it $300 a month").likes, false);
  });

  console.log("— nothing proposed is trusted —");
  await check("a budget the owner didn't write is refused; one they did is kept", () => {
    assert.equal(figureWritten(600, "$20 a day"), true);
    assert.equal(figureWritten(400, "lower it a bit"), false);
    const r = settleChanges({ monthly: 400 }, plan, "lower it a bit");
    assert.equal(r.changes.monthly, null);
    assert.match(r.dropped[0], /didn't write/);
    assert.equal(settleChanges({ monthly: 300 }, plan, "make it $300").changes.monthly, 300);
  });
  await check("a budget outside the planner's range is refused", () => {
    const r = settleChanges({ monthly: 50 }, plan, "only $50 a month");
    assert.equal(r.changes.monthly, null);
    assert.match(r.dropped[0], /between \$100/);
  });
  await check("a number the owner didn't give is refused", () => {
    const r = settleChanges({ facts: { offer: "20% off your first visit" } }, plan, "add an offer");
    assert.equal(r.changes.facts.offer, undefined);
    assert.match(r.dropped[0], /number you didn't give/);
    // …and one they did is kept.
    assert.equal(settleChanges({ facts: { offer: "20% off your first visit" } }, plan, "say 20% off your first visit").changes.facts.offer, "20% off your first visit");
  });
  await check("wording that isn't the owner's is refused; theirs is kept", () => {
    assert.equal(ownWords("Luxury estate owners", "target homeowners"), false);
    const r = settleChanges({ facts: { customer: "Luxury estate owners" } }, plan, "target homeowners");
    assert.equal(r.changes.facts.customer, undefined);
    assert.match(r.dropped[0], /wasn't yours/);
    assert.equal(settleChanges({ facts: { customer: "homeowners with big yards" } }, plan, "it's for homeowners with big yards").changes.facts.customer, "Homeowners with big yards");
  });
  await check("a guarantee is refused even when the owner asks for it", () => {
    const r = settleChanges({ facts: { proof: "Guaranteed results" } }, plan, "say guaranteed results");
    assert.equal(r.changes.facts.proof, undefined);
    assert.match(r.dropped[0], /guarantee/);
  });
  await check("the name and what they sell can be changed, never removed", () => {
    const r = settleChanges({ remove: ["name", "offering", "offer"] }, plan, "drop the offer");
    assert.deepEqual(r.changes.remove, ["offer"]);
  });

  console.log("— applying a change —");
  await check("a budget change keeps the concepts; a goal change rewrites them", () => {
    const b = applyChanges(plan, { monthly: 300, goal: null, facts: {}, remove: [] })!;
    assert.equal(b.plan.inputs.monthly, 300);
    assert.equal(b.rewrite, false);
    assert.equal(buildReport(b.plan)!.budget.monthly, 300);
    const g = applyChanges(plan, { monthly: null, goal: "leads", facts: {}, remove: [] })!;
    assert.equal(g.plan.inputs.goal, "leads");
    assert.equal(g.rewrite, true);
    // The website already has a form, so leads go there rather than to a Meta form.
    assert.equal(g.plan.facts.usesLeadForm, false);
  });
  await check("a fact the owner changes is theirs, no longer the website's", () => {
    const f = applyChanges(plan, { monthly: null, goal: null, facts: { location: "Miami-Dade" }, remove: ["offer"] })!;
    assert.equal(f.plan.facts.location, "Miami-Dade");
    assert.equal(f.plan.facts.offer, "");
    assert.deepEqual(f.plan.facts.fromWebsite, ["name", "offering"]);
    assert.equal(f.rewrite, true);
    const line = buildReport(f.plan)!.business.facts.find((x) => x.key === "location");
    assert.deepEqual([line?.value, line?.from], ["Miami-Dade", "you"]);
  });
  await check("new writing is labelled for what it is", () => {
    const w = withWriting(plan, { source: { by: "templates", why: "failed" }, plan: null, dropped: [], filled: 0 });
    assert.deepEqual(w.source, { by: "templates", why: "failed" });
  });
  await check("the conversation lists each change in plain words", () => {
    assert.deepEqual(describeChanges(plan, { monthly: 300, goal: "bookings", facts: { location: "Miami-Dade" }, remove: ["offer"] }), [
      "Budget: $500 → $300 a month",
      "Goal: More online sales → Get more bookings",
      "Where you work or sell: Miami-Dade",
      "A current offer: taken out",
    ]);
  });

  console.log("— the refine route —");
  const { POST } = await import("../src/app/api/free-plan/refine/route");
  const call = (body: unknown) => POST(new Request("http://localhost/api/free-plan/refine", { method: "POST", body: JSON.stringify(body) }));
  await check("without the AI, MAIRO's rules answer, and say so", async () => {
    const res = await call({ plan, message: "Lower my budget to $300 a month and focus on bookings" });
    const j = await res.json();
    assert.equal(res.status, 200);
    assert.equal(j.by, "rules");
    assert.deepEqual([j.changes.monthly, j.changes.goal], [300, "bookings"]);
    assert.match(j.reply, /updated your plan/);
  });
  await check("an empty or oversized request is refused", async () => {
    assert.equal((await call({ plan, message: "" })).status, 400);
    assert.equal((await call({ plan, message: "x".repeat(501) })).status, 400);
    assert.equal((await call({ plan: { nope: 1 }, message: "hi" })).status, 400);
  });

  console.log("— the quick start from a liked plan —");
  await check("one question, with the full setup's choices and a sensible first answer", () => {
    assert.deepEqual(destinationsForStart("SALES").map((d) => d.key), ["WEBSITE", "PHONE_CALL"]);
    assert.deepEqual(destinationsForStart("LEADS").map((d) => d.key), ["LEAD_FORM", "PHONE_CALL", "DIRECT_MESSAGE", "WEBSITE"]);
    assert.equal(suggestedDestination(plan), "WEBSITE");
    assert.equal(suggestedDestination({ ...plan, inputs: { ...plan.inputs, website: null } }), "PHONE_CALL");
    assert.equal(suggestedDestination({ ...plan, inputs: { ...plan.inputs, goal: "leads", website: null }, facts: { ...plan.facts, usesLeadForm: true } }), "LEAD_FORM");
  });

  const tag = `zz-refine-${Date.now()}`;
  const org = await db.organization.create({ data: { name: `${tag} Simply Landscapes` } });
  try {
    await check("the setup record is the full setup's; a phone MAIRO can't dial is refused", async () => {
      const bad = await writeIntake(org.id, intakeSchema.parse({ primaryGoal: "SALES", monthlyBudget: 500, destinationType: "PHONE_CALL", phone: "12" }));
      assert.equal(bad.ok, false);
      const ok = await writeIntake(org.id, intakeSchema.parse({ primaryGoal: "SALES", monthlyBudget: plan.inputs.monthly, website: plan.inputs.website, destinationType: "WEBSITE", offering: plan.facts.offering, customerLocation: plan.facts.location, currentOffer: plan.facts.offer }));
      assert.equal(ok.ok, true);
      const intake = await db.onboardingIntake.findUniqueOrThrow({ where: { organizationId: org.id } });
      assert.deepEqual([intake.primaryGoal, intake.monthlyBudgetCents, intake.customerLocation], ["SALES", 50_000, "Miami"]);
      const o = await db.organization.findUniqueOrThrow({ where: { id: org.id }, select: { website: true, defaultDestination: true } });
      assert.deepEqual([o.website, o.defaultDestination], ["https://simplylandscapes.example/", "WEBSITE"]);
    });
    await check("MAIRO writes the strategy, and approving it records the approval — nothing launched or charged", async () => {
      const s = await createStrategy(org.id);
      assert.equal(s.ok, true);
      const loaded = await loadStrategy(org.id);
      assert.ok(loaded);
      assert.equal(loaded.row.status, "DRAFT");
      const r = await approve(org.id, loaded.row.version);
      assert.equal(r.ok, true);
      const row = await db.strategyPlan.findUniqueOrThrow({ where: { organizationId: org.id } });
      assert.equal(row.status, "APPROVED");
      assert.ok(row.approvedAt);
      assert.equal(row.activatedAt, null);
      const o = await db.organization.findUniqueOrThrow({ where: { id: org.id }, select: { paymentRequired: true, subscriptionTier: true, stripeSubscriptionId: true } });
      assert.deepEqual([o.paymentRequired, o.subscriptionTier, o.stripeSubscriptionId], [true, "NONE", null]);
      assert.equal(await db.platformCampaign.count({ where: { mairoCampaign: { organizationId: org.id } } }), 0);
    });
  } finally {
    await db.organization.delete({ where: { id: org.id } }).catch(() => null);
  }

  console.log(`\nRefine & quick start: ${passed} checks passed. No AI, Meta or Stripe call was made.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
