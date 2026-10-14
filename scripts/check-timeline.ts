// Checks the campaign timeline — no Meta call: every event is a record that
// exists, with its time and who did it (the owner, MAIRO, Spend Protection
// or Meta), approvals shown as approvals, and one business's campaign never
// readable by another.
//
//   npm run check:timeline   (needs the local database)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { campaignJourney } from "../src/lib/intelligence/timeline";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-tl";
const A = `${TAG}-a`;
const B = `${TAG}-b`;
const H = 3_600_000;

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

const decision = (organizationId: string, mairoCampaignId: string, key: string, over: Record<string, unknown>) =>
  db.mairoDecision.create({
    data: {
      organizationId,
      mairoCampaignId,
      kind: "scale-winner",
      category: "BUDGET",
      title: `Raise the budget (${key})`,
      noticed: "Leads are coming in below your target cost.",
      noticedAdvanced: "Cost per lead $18 against a $25 target over 7 days.",
      whyItMatters: "More of the budget where it works.",
      recommendation: "Raise the daily budget from $20 to $25.",
      impact: "+$5 a day",
      risk: "LOW",
      confidence: "MEDIUM",
      evidenceJson: "[]",
      changesJson: "[]",
      dedupeKey: `${TAG}:${key}`,
      ...over,
    },
  });

async function main() {
  await cleanup();
  await db.organization.create({ data: { id: A, name: "Timeline Plumbing" } });
  await db.organization.create({ data: { id: B, name: "Other Co" } });
  const user = await db.user.create({ data: { email: `${TAG}-${Date.now()}@mairo.test`, name: "Sam Owner", organizationId: A } }).catch(() => null);
  const t0 = new Date(Date.now() - 10 * 24 * H);
  const c = await db.mairoCampaign.create({ data: { organizationId: A, name: "Spring leads", objective: "LEADS", totalDailyBudgetCents: 2000, createdAt: t0, launchApprovedAt: new Date(t0.getTime() + 2 * H) } });
  await decision(A, c.id, "approved", { status: "APPLIED", createdAt: new Date(t0.getTime() + 3 * 24 * H), approvedAt: new Date(t0.getTime() + 3 * 24 * H + H), approvedById: user?.id ?? "owner", decidedAt: new Date(t0.getTime() + 3 * 24 * H + H) });
  await decision(A, c.id, "declined", { status: "REJECTED", createdAt: new Date(t0.getTime() + 4 * 24 * H), decidedAt: new Date(t0.getTime() + 4 * 24 * H + H) });
  await decision(A, c.id, "auto", { status: "APPLIED", createdAt: new Date(t0.getTime() + 5 * 24 * H), decidedAt: new Date(t0.getTime() + 5 * 24 * H + 60_000) });
  await db.protectionEvent.create({ data: { organizationId: A, mairoCampaignId: c.id, kind: "PAUSED_BY_YOU", action: "PAUSED", message: "You paused the campaign.", createdAt: new Date(t0.getTime() + 6 * 24 * H) } });
  await db.protectionEvent.create({ data: { organizationId: A, mairoCampaignId: c.id, kind: "DAILY_CAP", action: "WARNED", message: "Today's spend reached 90% of your daily limit.", createdAt: new Date(t0.getTime() + 7 * 24 * H) } });
  await db.mairoActivity.create({ data: { organizationId: A, mairoCampaignId: c.id, action: "Budget raised", summary: "Daily budget from $20 to $25.", reason: "Approved recommendation.", automatic: false, createdAt: new Date(t0.getTime() + 3 * 24 * H + 2 * H) } });

  const j = (await campaignJourney(A, c.id))!;
  const by = (title: string) => j.events.find((e) => e.title === title || e.title.startsWith(title));

  await check("every event has a time and who did it", () => {
    assert.ok(j.events.length >= 7, String(j.events.length));
    for (const e of j.events) {
      assert.ok(!Number.isNaN(Date.parse(e.at)), e.title);
      assert.ok(e.actor && e.actor.length > 1, `${e.title}: actor`);
    }
    const ats = j.events.map((e) => e.at);
    assert.deepEqual(ats, [...ats].sort(), "in time order");
  });
  await check("created by the owner, and the launch approval is the owner's", () => {
    assert.equal(by("Campaign created")!.actor, "You");
    assert.equal(by("Launch approved")!.actor, "You");
  });
  await check("a recommendation is MAIRO's; approving it, or declining it, is the owner's", () => {
    assert.equal(by("Raise the budget (approved)")!.actor, "MAIRO recommended");
    assert.equal(by("Recommendation approved")!.actor, "You");
    assert.equal(by("Recommendation declined")!.actor, "You");
  });
  await check("a change applied without an approver says MAIRO did it within the owner's limits", () => {
    const auto = by("Applied within your limits")!;
    assert.equal(auto.actor, "MAIRO");
    assert.ok(auto.ai);
  });
  await check("pausing by the owner and a Spend Protection warning are told apart", () => {
    const paused = j.events.find((e) => e.body === "You paused the campaign.")!;
    assert.equal(paused.actor, "You");
    assert.equal(j.events.find((e) => /90% of your daily limit/.test(e.body))!.actor, "Spend Protection");
  });
  await check("a change MAIRO made after approval says so", () => {
    assert.equal(by("Budget raised")!.actor, "MAIRO, with your approval");
  });
  await check("another business can't read this campaign's timeline", async () => {
    assert.equal(await campaignJourney(B, c.id), null);
  });

  if (user) await db.user.delete({ where: { id: user.id } }).catch(() => null);
  await cleanup();
  console.log(`\nCampaign timeline: ${passed} checks passed. Nothing was sent to Meta.`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => null);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
