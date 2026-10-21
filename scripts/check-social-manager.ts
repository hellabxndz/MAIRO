// Checks MAIRO Social Manager: who may use it (active Scale only), that every
// planned post comes from a goal and fits the kind of business, how sales and
// launches are sequenced without spamming, approval modes, pausing on a
// downgrade without publishing or deleting anything, resuming, and learning
// from results.
//
//   npm run check:social-manager   (needs DATABASE_URL; no network calls, no AI key needed)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { socialAccess, socialAccessFrom } from "../src/lib/social/access";
import {
  MAX_PROMO_SHARE,
  adjustMix,
  businessCategory,
  calendarStatus,
  contentMix,
  learningsFrom,
  planSchedule,
  promotionSequence,
  recommendGoal,
} from "../src/lib/social/goals";
import { pauseSocialSweep } from "../src/lib/social/pause";
import { publishPost } from "../src/lib/instagram/scheduler";

delete process.env.ANTHROPIC_API_KEY;

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// A pretend Graph API for reading likes and comments back.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== "graph.facebook.com") return realFetch(input, init);
  const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
  if (url.searchParams.get("fields") === "like_count,comments_count") return json({ like_count: url.pathname.endsWith("-m1") ? 40 : 12, comments_count: 3 });
  return json({});
}) as typeof fetch;

const TAG = `zz-socmgr-${Date.now()}`;

async function main() {
  console.log("\n— who may use Social Manager —");
  await check("nobody: social posting was discontinued for every plan", () => {
    for (const tier of ["NONE", "PRO", "SCALE_V2", "SCALE", "STARTER", "GROWTH", "STUDIO", "AGENCY"] as const) {
      for (const status of ["active", "trialing"]) {
        const a = socialAccessFrom({ subscriptionTier: tier, subscriptionStatus: status });
        assert.equal(a.ok, false, `${tier} ${status}`);
      }
    }
    assert.equal(socialAccessFrom(null).ok, false);
  });

  console.log("\n— goal-based, and different per business —");
  await check("the kind of business is recognised", () => {
    assert.equal(businessCategory("Sunrise Dental clinic"), "health");
    assert.equal(businessCategory("Roofing contractor"), "trades");
    assert.equal(businessCategory("Clothing boutique"), "retail");
    assert.equal(businessCategory("Pizza restaurant"), "food");
    assert.equal(businessCategory("Hair salon and spa"), "beauty_fitness");
    assert.equal(businessCategory("Something else entirely"), "general");
  });
  await check("a sales strategy differs for a clothing shop, a restaurant and a dentist", () => {
    const retail = contentMix("INCREASE_SALES", "retail").map((c) => c.type);
    const food = contentMix("INCREASE_SALES", "food").map((c) => c.type);
    const health = contentMix("INCREASE_SALES", "health").map((c) => c.type);
    assert.notDeepEqual(retail, food);
    assert.notDeepEqual(food, health);
    assert.ok(retail.includes("New arrivals") && retail.includes("Product demonstration"));
  });
  await check("a roofer looking for leads gets warning signs and a free estimate", () => {
    const leads = contentMix("GENERATE_LEADS", "trades");
    assert.ok(leads.some((c) => /signs/i.test(c.type) && /roof/i.test(c.purpose)));
    assert.ok(leads.some((c) => c.type === "Free estimate" && c.promotional));
  });
  await check("every goal has a mix with useful, non-selling posts", () => {
    for (const goal of ["INCREASE_SALES", "GENERATE_LEADS", "GET_BOOKINGS", "NEW_PRODUCT", "NEW_SERVICE", "GROW_FOLLOWERS", "BRAND_AWARENESS", "WEBSITE_TRAFFIC", "PROMOTE_SALE", "PROMOTE_EVENT", "REPEAT_CUSTOMERS", "LAUNCH", "RECOMMEND"] as const) {
      for (const cat of ["retail", "food", "health", "trades", "general"] as const) {
        const mix = contentMix(goal, cat);
        assert.ok(mix.length >= 3, `${goal}/${cat}`);
        assert.ok(mix.some((m) => !m.promotional), `${goal}/${cat} has value posts`);
      }
    }
  });
  await check("'Let MAIRO recommend' picks a goal that fits", () => {
    assert.equal(recommendGoal("retail", true), "INCREASE_SALES");
    assert.equal(recommendGoal("trades", false), "GENERATE_LEADS");
    assert.equal(recommendGoal("beauty_fitness", false), "GET_BOOKINGS");
  });

  console.log("\n— promotions and launches —");
  await check("a sale: teaser, launch, showcase, reminder, ending soon, last chance", () => {
    const seq = promotionSequence("SALE", { start: "2026-10-10", end: "2026-10-16", today: "2026-10-02" });
    assert.deepEqual(seq.map((s) => s.step), ["Teaser", "Launch", "Showcase", "Reminder", "Ending soon", "Last chance"]);
    assert.deepEqual(seq.map((s) => s.date), ["2026-10-08", "2026-10-10", "2026-10-11", "2026-10-13", "2026-10-15", "2026-10-16"]);
  });
  await check("a sale starting today skips the teaser; one post per day", () => {
    const seq = promotionSequence("SALE", { start: "2026-10-02", end: "2026-10-03", today: "2026-10-02" });
    assert.ok(!seq.some((s) => s.step === "Teaser"));
    assert.equal(new Set(seq.map((s) => s.date)).size, seq.length);
  });
  await check("a new product: teaser → reveal → benefits → demo → lifestyle → social proof → buy now", () => {
    const seq = promotionSequence("NEW_PRODUCT", { start: "2026-10-10", today: "2026-10-01" });
    assert.deepEqual(seq.map((s) => s.step), ["Teaser", "Product reveal", "Benefits", "Demonstration", "Lifestyle", "Social proof", "Buy now"]);
    assert.ok(!seq.some((s) => s.step === "Last chance"), "no urgency without an end date");
  });
  await check("a promotion week never turns into mostly selling", () => {
    const steps = promotionSequence("SALE", { start: "2026-10-03", end: "2026-10-08", today: "2026-10-02" });
    const slots = planSchedule({ start: "2026-10-02", days: 7, postsPerWeek: 4, mix: contentMix("INCREASE_SALES", "retail"), promotions: [{ id: "p1", steps }] });
    const selling = slots.filter((s) => s.promotional).length;
    assert.ok(selling / slots.length <= MAX_PROMO_SHARE + 1e-9, `${selling}/${slots.length}`);
    assert.ok(slots.some((s) => s.step === "Launch") && slots.some((s) => s.step === "Last chance"), "the key steps survive");
    assert.ok(slots.some((s) => s.kind === "value"), "useful posts mixed in");
    assert.equal(new Set(slots.map((s) => s.date)).size, slots.length, "one post a day");
  });
  await check("planning again leaves taken days and done steps alone", () => {
    const steps = promotionSequence("SALE", { start: "2026-10-03", end: "2026-10-08", today: "2026-10-02" });
    const slots = planSchedule({ start: "2026-10-02", days: 7, postsPerWeek: 4, mix: contentMix("GENERATE_LEADS", "health"), promotions: [{ id: "p1", steps }], taken: ["2026-10-03", "2026-10-04"], done: ["p1:Last chance"] });
    assert.ok(!slots.some((s) => s.date === "2026-10-03" || s.date === "2026-10-04"));
    assert.ok(!slots.some((s) => s.step === "Last chance"));
  });

  console.log("\n— learning and statuses —");
  await check("results: best and weakest need two posts each; skipped kinds are noted", () => {
    const rows = [
      { contentType: "Testimonial", objective: "Sales", status: "PUBLISHED", likeCount: 50, commentCount: 6 },
      { contentType: "Testimonial", objective: "Sales", status: "PUBLISHED", likeCount: 40, commentCount: 4 },
      { contentType: "Offer", objective: "Sales", status: "PUBLISHED", likeCount: 5, commentCount: 0 },
      { contentType: "Offer", objective: "Sales", status: "PUBLISHED", likeCount: 7, commentCount: 1 },
      { contentType: "Lifestyle", objective: "Sales", status: "SKIPPED", likeCount: null, commentCount: null },
      { contentType: "Lifestyle", objective: "Sales", status: "SKIPPED", likeCount: null, commentCount: null },
    ];
    const l = learningsFrom(rows);
    assert.equal(l.best, "Testimonial");
    assert.equal(l.weakest, "Offer");
    assert.deepEqual(l.skippedTypes, ["Lifestyle"]);
    const mix = adjustMix([{ type: "Lifestyle", purpose: "x" }, { type: "Offer", purpose: "y" }, { type: "Testimonial", purpose: "z" }], l);
    assert.equal(mix[0].type, "Testimonial");
    assert.ok(!mix.some((m) => m.type === "Lifestyle"));
    assert.equal(learningsFrom(rows.slice(0, 3)).best, null, "one Offer post isn't a conclusion");
  });
  await check("calendar statuses: Draft, Awaiting approval, Approved, Scheduled, Published, Skipped", () => {
    const at = new Date();
    assert.equal(calendarStatus({ status: "DRAFT", scheduledFor: at }).label, "Draft");
    assert.equal(calendarStatus({ status: "SUGGESTED", scheduledFor: at }).label, "Awaiting approval");
    assert.equal(calendarStatus({ status: "SCHEDULED", scheduledFor: null }).label, "Approved");
    assert.equal(calendarStatus({ status: "SCHEDULED", scheduledFor: at }).label, "Scheduled");
    assert.equal(calendarStatus({ status: "PUBLISHED", scheduledFor: at }).label, "Published");
    assert.equal(calendarStatus({ status: "SKIPPED", scheduledFor: at }).label, "Skipped");
    assert.equal(calendarStatus({ status: "PAUSED", scheduledFor: at }).label, "Paused");
  });

  // --- With the database --------------------------------------------------
  // An earlier-Scale subscriber with Social Manager history: a strategy on
  // Autopilot and approved posts due now. Since the feature was discontinued,
  // none of it may go out.
  const scaleId = `${TAG}-scale`;
  await db.organization.create({ data: { id: scaleId, name: "Threadline Apparel", industry: "Clothing boutique", subscriptionTier: "SCALE", subscriptionStatus: "active", hasPaid: true, timezone: "America/New_York" } });
  await db.socialStrategy.create({ data: { organizationId: scaleId, goal: "INCREASE_SALES", platforms: ["INSTAGRAM", "FACEBOOK"], approvalMode: "AUTOPILOT", strategyJson: "{}" } });
  const due = new Date(Date.now() - 60_000);
  const [ig, fb] = await Promise.all([
    db.instagramPost.create({ data: { organizationId: scaleId, caption: "New jackets are in", status: "SCHEDULED", approvedAt: new Date(), scheduledFor: due, network: "INSTAGRAM" } }),
    db.instagramPost.create({ data: { organizationId: scaleId, caption: "New jackets are in", status: "SCHEDULED", approvedAt: new Date(), scheduledFor: due, network: "FACEBOOK" } }),
  ]);

  try {
    console.log("\n— the database side —");
    await check("an active earlier-Scale subscriber is refused, read fresh", async () => {
      assert.equal((await socialAccess(scaleId)).ok, false);
    });

    await check("approved posts that are due never go out, on either network", async () => {
      // The first refusal pauses everything the business had waiting.
      assert.equal((await publishPost(ig.id, { budgetMs: 2_000 })).status, "PAUSED");
      assert.notEqual((await publishPost(fb.id, { budgetMs: 2_000 })).status, "PUBLISHED");
      for (const p of [ig, fb]) {
        const row = await db.instagramPost.findUniqueOrThrow({ where: { id: p.id } });
        assert.equal(row.status, "PAUSED", p.network);
        assert.equal(row.postedAt, null);
      }
    });

    await check("the daily sweep pauses what's left and turns Autopilot off — nothing deleted", async () => {
      await db.instagramPost.update({ where: { id: ig.id }, data: { status: "SCHEDULED" } });
      const r = await pauseSocialSweep();
      assert.ok(r.organizations >= 1);
      assert.equal(await db.instagramPost.count({ where: { organizationId: scaleId, status: "SCHEDULED" } }), 0);
      assert.equal(await db.instagramPost.count({ where: { organizationId: scaleId } }), 2, "history kept");
      const strategy = await db.socialStrategy.findUniqueOrThrow({ where: { organizationId: scaleId } });
      assert.ok(strategy.pausedAt);
      assert.equal(strategy.approvalMode, "APPROVAL_REQUIRED");
    });

    await check("the daily job no longer publishes or plans social posts", () => {
      const cron = readFileSync("src/app/api/cron/launch/route.ts", "utf8");
      assert.doesNotMatch(cron, /publishDuePosts|socialAutopilotRun/);
    });
  } finally {
    await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  }
  console.log(`\n${passed} Social Manager checks passed.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } }).catch(() => undefined);
  process.exit(1);
});
