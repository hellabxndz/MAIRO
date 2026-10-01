// Checks the MAIRO mission: reading what an owner says, mapping goals to
// what customers should do and to the right ad, industry-specific plans,
// results that match the goal (never another goal's metric), objective tags,
// the plan → approval → Create draft path, "Tell MAIRO something new"
// (promotions, sold out), and that Social Manager still needs Scale.
//
//   npm run check:mission   (needs DATABASE_URL; no AI key or network needed)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { EMPTY_METRICS } from "../src/lib/ad-platforms/types";
import {
  MISSION_GOALS,
  adSetupFor,
  businessCategory,
  dateIn,
  missingQuestions,
  objectiveFor,
  playbookFor,
  readRequest,
  recommendMissionGoal,
  resultsForGoal,
} from "../src/lib/mission/goals";
import { activeMission, approveMission, missionRecommendations, proposedMission, startMission, tellMairo } from "../src/lib/mission/store";

delete process.env.ANTHROPIC_API_KEY;

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TODAY = "2026-10-01"; // a Thursday
const TAG = `zz-mission-${Date.now()}`;

async function main() {
  console.log("\n— what the owner says —");
  await check("plain requests become goals", () => {
    const g = (t: string) => readRequest(t, TODAY).goal;
    assert.equal(g("I need more sales."), "INCREASE_SALES");
    assert.equal(g("I need more appointments."), "GET_BOOKINGS");
    assert.equal(g("I want more leads."), "GENERATE_LEADS");
    assert.equal(g("I want more people coming into my restaurant."), "FOOT_TRAFFIC");
    assert.equal(g("I need more website traffic."), "WEBSITE_TRAFFIC");
    assert.equal(g("I need more customers this month."), "RECOMMEND");
    assert.equal(g("We want the phone ringing — more calls"), "GET_CALLS");
  });
  await check("a detailing shop wanting ceramic coating bookings", () => {
    const r = readRequest("We're a car detailing business and want more ceramic coating bookings.", TODAY);
    assert.equal(r.goal, "GET_BOOKINGS");
    assert.equal(r.item, "ceramic coating");
    assert.equal(businessCategory("car detailing business"), "auto");
  });
  await check("one sentence → a launch with item, price and date", () => {
    const r = readRequest("We're launching a new hoodie Friday for $80.", TODAY);
    assert.equal(r.intent, "launch");
    assert.equal(r.goal, "NEW_PRODUCT");
    assert.equal(r.item, "hoodie");
    assert.equal(r.price, "$80");
    assert.equal(r.date, "2026-10-02");
    assert.equal(readRequest("I'm launching a new product.", TODAY).item, null, "nothing named → MAIRO asks");
  });
  await check("promotions and sold-out items are news, not goals", () => {
    const p = readRequest("We're doing 20% off this weekend.", TODAY);
    assert.equal(p.intent, "promotion");
    assert.equal(p.discount, "20% off");
    assert.deepEqual([p.date, p.endDate], ["2026-10-03", "2026-10-04"]);
    const until = readRequest("20% off all jackets until Sunday", TODAY);
    assert.deepEqual([until.item, until.date, until.endDate], ["jackets", TODAY, "2026-10-04"]);
    const s = readRequest("We sold out of the blue hoodie.", TODAY);
    assert.equal(s.intent, "unavailable");
    assert.equal(s.item, "blue hoodie");
    assert.equal(readRequest("We want more sales", TODAY).intent, "goal", "'sales' alone isn't a promotion");
  });
  await check("dates: weekdays, tomorrow, next week", () => {
    assert.equal(dateIn("Friday", TODAY).start, "2026-10-02");
    assert.equal(dateIn("on Thursday", TODAY).start, TODAY);
    assert.equal(dateIn("next Thursday", TODAY).start, "2026-10-08");
    assert.equal(dateIn("tomorrow", TODAY).start, "2026-10-02");
  });
  await check("at most two simple questions, and only when needed", () => {
    assert.deepEqual(missingQuestions({ goal: "INCREASE_SALES", sells: true, location: false }), []);
    assert.equal(missingQuestions({ goal: "GET_BOOKINGS", sells: false, location: false }).length, 2);
    assert.equal(missingQuestions({ goal: "NEW_PRODUCT", sells: true, location: true, launch: { item: "hoodie", date: null, price: null } })[0].key, "date");
  });

  console.log("\n— MAIRO decides the tactics —");
  await check("'What do you want customers to do?' maps to the right ad", () => {
    const o = { hasWebsite: true, hasPhone: true, pixelActive: false };
    assert.deepEqual([adSetupFor("BUY", o).goal, adSetupFor("BUY", o).destination], ["SALES", "WEBSITE"]);
    assert.deepEqual([adSetupFor("CONTACT", o).goal, adSetupFor("CONTACT", o).destination], ["LEADS", "LEAD_FORM"]);
    assert.deepEqual([adSetupFor("CALL", o).goal, adSetupFor("CALL", o).destination], ["LEADS", "PHONE_CALL"]);
    assert.deepEqual([adSetupFor("VISIT_WEBSITE", o).goal, adSetupFor("VISIT_WEBSITE", o).destination], ["TRAFFIC", "WEBSITE"]);
    assert.equal(adSetupFor("BUY", { ...o, hasWebsite: false }).destination, "DIRECT_MESSAGE", "no site to buy on → message to order");
    assert.equal(adSetupFor("CALL", { ...o, hasPhone: false }).destination, "DIRECT_MESSAGE");
  });
  await check("every goal has a customer action and a way to measure it", () => {
    assert.equal(MISSION_GOALS.length, 14);
    for (const g of MISSION_GOALS) assert.ok(g.action && g.metrics && g.title && g.sentence, g.key);
  });
  await check("plans differ by industry: clothing, restaurant, contractor, barber, real estate", () => {
    const f = (goal: Parameters<typeof playbookFor>[0], c: Parameters<typeof playbookFor>[1]) => playbookFor(goal, c).focus.join("|");
    assert.match(f("INCREASE_SALES", "retail"), /Lifestyle|Product drops|UGC/);
    assert.match(f("FOOT_TRAFFIC", "food"), /Food videos|Menu highlights/);
    assert.match(f("GENERATE_LEADS", "trades"), /Before and after/);
    assert.match(f("GET_BOOKINGS", "beauty_fitness"), /Transformations|Availability/);
    assert.match(f("GENERATE_LEADS", "realestate"), /Neighborhood|Property/);
    assert.notEqual(f("INCREASE_SALES", "retail"), f("INCREASE_SALES", "food"));
    assert.equal(playbookFor("GENERATE_LEADS", "trades").cta, "Get a free quote");
    for (const c of ["retail", "food", "trades", "auto", "beauty_fitness", "realestate", "health", "services", "general"] as const) {
      const objectives = playbookFor("GET_BOOKINGS", c).creative.map((x) => x.objective);
      assert.equal(new Set(objectives).size, objectives.length, `${c}: each ad concept has a different job`);
    }
  });
  await check("a new product always gets the launch sequence", () => {
    assert.deepEqual(playbookFor("NEW_PRODUCT", "retail").focus.slice(0, 5), ["Teaser", "Reveal", "Benefits", "Demonstration", "Proof"]);
  });
  await check("'Let MAIRO recommend' fits the business", () => {
    assert.equal(recommendMissionGoal("auto", false), "GET_BOOKINGS");
    assert.equal(recommendMissionGoal("trades", false), "GENERATE_LEADS");
    assert.equal(recommendMissionGoal("food", false), "FOOT_TRAFFIC");
  });
  await check("every marketing item gets an objective", () => {
    assert.equal(objectiveFor({ contentType: "Before and after" }), "Trust");
    assert.equal(objectiveFor({ contentType: "Free estimate", promotional: true }), "Lead generation");
    assert.equal(objectiveFor({ contentType: "Last chance", promotional: true }), "Promotion");
    assert.equal(objectiveFor({ contentType: "Teaser", step: "Teaser", goal: "NEW_PRODUCT" }), "Product launch");
    assert.equal(objectiveFor({ contentType: "Warning signs" }), "Education");
    assert.equal(objectiveFor({ contentType: "Openings this week" }), "Booking");
  });

  console.log("\n— results match the goal —");
  await check("each goal shows its own results; untracked stays untracked", () => {
    const m = { ...EMPTY_METRICS, spendCents: 50_000, clicks: 400, reach: 9000, impressions: 20000, purchases: 18, revenueCents: 142_000, costPerPurchaseCents: 2778, roas: 2.84, leads: 34 };
    const labels = (f: Parameters<typeof resultsForGoal>[0]) => resultsForGoal(f, m).map((t) => t.label);
    assert.deepEqual(labels("sales"), ["Revenue tracked", "Purchases", "Cost per purchase", "ROAS"]);
    assert.deepEqual(labels("leads").slice(0, 2), ["Leads", "Cost per lead"]);
    assert.equal(resultsForGoal("leads", m)[1].value, "$14.71");
    const bookings = resultsForGoal("bookings", m);
    assert.equal(bookings[0].value, null, "no booking events tracked → not tracked, not leads or clicks");
    assert.deepEqual(labels("awareness").slice(0, 2), ["Reach", "Impressions"]);
    assert.ok(!labels("leads").includes("Purchases") && !labels("awareness").includes("Revenue tracked"));
    assert.equal(resultsForGoal("traffic", m)[0].value, null, "clicks aren't shown as landing page views");
  });

  // --- With the database ---------------------------------------------------
  const orgId = `${TAG}-org`;
  const growthId = `${TAG}-growth`;
  await db.organization.create({ data: { id: orgId, name: "Shine Auto Spa", industry: "Car detailing", website: "https://shine.example", subscriptionTier: "SCALE", subscriptionStatus: "active", hasPaid: true } });
  await db.organization.create({ data: { id: growthId, name: "Hoodie Co", industry: "Clothing boutique", website: "https://hoodie.example", subscriptionTier: "GROWTH", subscriptionStatus: "active" } });

  try {
    console.log("\n— the database side —");
    await check("a goal with missing basics asks a question first", async () => {
      const r = await startMission(orgId, { goal: "GET_BOOKINGS" });
      assert.equal(r.kind, "questions");
    });
    await check("answered once, MAIRO builds the plan (PROPOSED, not active)", async () => {
      const r = await startMission(orgId, { request: "We want more ceramic coating bookings.", answers: { sells: "Ceramic coating and detailing", location: "Austin, TX" } });
      assert.equal(r.kind, "plan");
      const p = await proposedMission(orgId);
      assert.ok(p);
      assert.equal(p.primaryGoal, "GET_BOOKINGS");
      assert.match(p.title, /Ceramic Coating/);
      assert.equal(p.plan.category, "auto");
      assert.ok(p.plan.adConcepts.every((c) => c.objective && c.why.length > 10), "every ad has a reason");
      assert.ok(p.plan.focus.some((f) => /transformation/i.test(f)));
      assert.equal(p.plan.scale, true);
      assert.ok(p.plan.organic, "Scale plan includes social");
      assert.equal(await activeMission(orgId), null, "nothing active until approved");
      // Asked once, never again.
      assert.equal((await startMission(orgId, { goal: "GET_BOOKINGS" })).kind, "plan");
    });
    await check("approving: active mission, prefilled Create draft, Social Manager on the same goal (Scale)", async () => {
      const p = (await proposedMission(orgId))!;
      const r = await approveMission(orgId, p.id, null);
      assert.ok(r.draftId);
      assert.equal(r.social, true);
      const draft = await db.campaignDraft.findUniqueOrThrow({ where: { id: r.draftId! } });
      const data = draft.data as { goal: string; destinationType: string | null; dailyAmount: number };
      assert.equal(data.goal, "LEADS");
      assert.equal(data.destinationType, "WEBSITE");
      assert.ok(data.dailyAmount >= 5);
      assert.equal((await activeMission(orgId))?.id, p.id);
      const social = await db.socialStrategy.findUniqueOrThrow({ where: { organizationId: orgId } });
      assert.equal(social.goal, "GET_BOOKINGS");
      assert.equal(await db.marketingMission.count({ where: { organizationId: orgId, status: "PROPOSED" } }), 0);
    });
    await check("no running campaign → MAIRO's next action is the planned campaign", async () => {
      const recs = await missionRecommendations(orgId, await activeMission(orgId));
      assert.ok(recs.some((r) => r.href.includes("draft=")));
    });
    await check("'We're doing 20% off this weekend' becomes part of the plan (and Scale posts)", async () => {
      const r = await tellMairo(orgId, "We're doing 20% off this weekend.", new Date("2026-10-01T15:00:00Z"));
      assert.equal(r.kind, "promotion");
      assert.ok(r.actions.some((a) => /urgency/i.test(a)));
      assert.ok(r.actions.some((a) => /Scale: Social Manager/.test(a)));
      assert.equal(await db.missionNote.count({ where: { organizationId: orgId, kind: "PROMOTION" } }), 1);
      assert.equal(await db.socialPromotion.count({ where: { organizationId: orgId, kind: "SALE" } }), 1);
    });
    await check("'We sold out of the blue hoodie' stops planned posts that promote it", async () => {
      const post = await db.instagramPost.create({ data: { organizationId: orgId, caption: "Our Blue Hoodie is back — grab yours", status: "SUGGESTED", suggestedByMairo: true } });
      const other = await db.instagramPost.create({ data: { organizationId: orgId, caption: "Fresh ceramic coat, look at that shine", status: "SUGGESTED", suggestedByMairo: true } });
      const r = await tellMairo(orgId, "We sold out of the blue hoodie.");
      assert.equal(r.kind, "unavailable");
      assert.equal((await db.instagramPost.findUniqueOrThrow({ where: { id: post.id } })).status, "SKIPPED");
      assert.equal((await db.instagramPost.findUniqueOrThrow({ where: { id: other.id } })).status, "SUGGESTED");
    });
    await check("'I need more customers this month' proposes a change; the current mission stays until approved", async () => {
      const before = (await activeMission(orgId))!.id;
      const r = await tellMairo(orgId, "I need more leads this month.");
      assert.equal(r.kind, "proposal");
      assert.match(r.message, /Your current goal is getting more bookings\. MAIRO recommends changing it to generating leads/);
      assert.equal((await activeMission(orgId))?.id, before);
      assert.equal((await proposedMission(orgId))?.primaryGoal, "GENERATE_LEADS");
    });
    await check("a launch in one sentence → a launch plan with a timeline", async () => {
      await db.missionNote.create({ data: { organizationId: growthId, kind: "INFO", text: "We sell: hoodies", detailsJson: JSON.stringify({ sells: "hoodies" }) } });
      const r = await tellMairo(growthId, "We're launching a new hoodie Friday for $80.", new Date("2026-10-01T15:00:00Z"));
      assert.equal(r.kind, "proposal");
      const p = (await proposedMission(growthId))!;
      assert.equal(p.primaryGoal, "NEW_PRODUCT");
      assert.equal(p.plan.launch?.price, "$80");
      assert.ok(p.plan.timeline.length >= 3, "launch timeline");
      assert.equal(p.plan.scale, false);
      assert.equal(p.plan.organic, null, "no social for a Growth account");
    });
    await check("Growth approving a plan gets no Social Manager", async () => {
      const p = (await proposedMission(growthId))!;
      const r = await approveMission(growthId, p.id, null);
      assert.equal(r.social, false);
      assert.equal(await db.socialStrategy.count({ where: { organizationId: growthId } }), 0);
    });
  } finally {
    await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  }
  console.log(`\n${passed} mission checks passed.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } }).catch(() => undefined);
  process.exit(1);
});


