// Checks MAIRO Social Manager: who may use it (active Scale only), that every
// planned post comes from a goal and fits the kind of business, how sales and
// launches are sequenced without spamming, approval modes, pausing on a
// downgrade without publishing or deleting anything, resuming, and learning
// from results.
//
//   npm run check:social-manager   (needs DATABASE_URL; no network calls, no AI key needed)

import assert from "node:assert/strict";
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
import { approveWeek, autopilotReady, generatePlan, loadStrategy, refreshMetrics, savePromotion, setGoal } from "../src/lib/social/manager";
import { pauseSocialIfLocked, pauseSocialSweep, resumeSocial } from "../src/lib/social/pause";
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
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function main() {
  console.log("\n— who may use Social Manager —");
  await check("only SCALE with a live subscription", () => {
    for (const tier of ["NONE", "STARTER", "GROWTH", "STUDIO", "AGENCY"] as const) {
      const a = socialAccessFrom({ subscriptionTier: tier, subscriptionStatus: "active" });
      assert.equal(a.ok, false, tier);
      assert.equal(!a.ok && a.reason, "not_scale");
    }
    assert.equal(socialAccessFrom({ subscriptionTier: "SCALE", subscriptionStatus: "active" }).ok, true);
    assert.equal(socialAccessFrom({ subscriptionTier: "SCALE", subscriptionStatus: "trialing" }).ok, true, "the card-backed trial week counts");
    for (const status of [null, "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"]) {
      const a = socialAccessFrom({ subscriptionTier: "SCALE", subscriptionStatus: status });
      assert.equal(!a.ok && a.reason, "inactive", String(status));
    }
    assert.equal(socialAccessFrom({ subscriptionTier: "SCALE", subscriptionStatus: "active", executionStoppedAt: new Date() }).ok, false, "a stopped account");
    assert.equal(socialAccessFrom({ subscriptionTier: "SCALE", subscriptionStatus: "active" }, false).ok, false, "plan flag switched off");
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
  const scaleId = `${TAG}-scale`;
  const growthId = `${TAG}-growth`;
  await db.organization.create({ data: { id: scaleId, name: "Threadline Apparel", industry: "Clothing boutique", subscriptionTier: "SCALE", subscriptionStatus: "active", hasPaid: true, timezone: "America/New_York" } });
  await db.organization.create({ data: { id: growthId, name: "Growth Co", subscriptionTier: "GROWTH", subscriptionStatus: "active" } });
  for (let i = 0; i < 5; i++) {
    const req = await db.creativeRequest.create({ data: { organizationId: scaleId, brief: `Jacket look ${i}`, status: "APPROVED", month: "2026-10", type: "IMAGE" } });
    await db.creativeImage.create({ data: { creativeRequestId: req.id, version: 1, isFinal: true, imageData: PNG } });
  }

  try {
    console.log("\n— the database side —");
    await check("Growth is refused; active Scale is allowed — read fresh each time", async () => {
      assert.equal((await socialAccess(growthId)).ok, false);
      assert.equal((await socialAccess(scaleId)).ok, true);
    });

    await check("the goal builds a strategy for this business (no AI key: MAIRO's playbook)", async () => {
      const r = await setGoal(scaleId, { goal: "INCREASE_SALES", goalDetail: "We're launching a new collection Friday", platforms: ["INSTAGRAM"], postsPerWeek: 4 });
      assert.equal(r.ai, false);
      assert.ok(r.strategy.contentTypes.some((c) => c.type === "New arrivals"), "retail playbook");
      const view = await loadStrategy(scaleId);
      assert.equal(view?.approvalMode, "APPROVAL_REQUIRED", "approval required by default");
    });

    await check("planning a week: every post has a goal, a type and a reason; nothing is approved", async () => {
      const r = await generatePlan(scaleId, {});
      assert.ok(r.created >= 3, String(r.created));
      const posts = await db.instagramPost.findMany({ where: { organizationId: scaleId } });
      assert.ok(posts.every((p) => p.objective === "Sales" && p.contentType && p.rationale && /goal is to increase sales/i.test(p.rationale)));
      assert.ok(posts.every((p) => p.status === "SUGGESTED" || p.status === "DRAFT"));
      assert.ok(posts.every((p) => !p.approvedAt));
      assert.ok(posts.some((p) => p.mediaRefs.length > 0), "uses the business's own pictures");
      const again = await generatePlan(scaleId, {});
      assert.equal(again.created, 0, "planning again doesn't double up");
    });

    await check("a sale is sequenced into the calendar, mixed with useful posts", async () => {
      const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
      await savePromotion(scaleId, "SALE", { offer: "Jacket sale", discount: "25% off", code: "COZY25", start: day(3), end: day(6) });
      const r = await generatePlan(scaleId, { offsetDays: 0 });
      const promo = await db.instagramPost.findMany({ where: { organizationId: scaleId, promotionId: { not: null } } });
      assert.ok(promo.length >= 2, `promo posts ${promo.length} (created ${r.created})`);
      assert.ok(promo.every((p) => p.sequenceStep && /Jacket sale/.test(p.objective ?? "")));
      assert.ok(promo.some((p) => /COZY25|25% off/.test(p.caption)), "uses the real offer details");
    });

    await check("weekly approval approves only posts that have their picture", async () => {
      const n = await approveWeek(scaleId);
      assert.ok(n > 0);
      const drafts = await db.instagramPost.count({ where: { organizationId: scaleId, status: "DRAFT", approvedAt: { not: null } } });
      assert.equal(drafts, 0);
    });

    await check("Autopilot needs posts the business approved itself first", async () => {
      assert.ok((await autopilotReady(scaleId)).ok, "the week just approved counts");
      assert.equal((await autopilotReady(growthId)).ok, false);
    });

    await check("downgrade: scheduled posts pause, Autopilot is off, nothing is deleted or published", async () => {
      await db.socialStrategy.update({ where: { organizationId: scaleId }, data: { approvalMode: "AUTOPILOT" } });
      const before = await db.instagramPost.count({ where: { organizationId: scaleId } });
      const scheduled = await db.instagramPost.findFirstOrThrow({ where: { organizationId: scaleId, status: "SCHEDULED" } });
      await db.organization.update({ where: { id: scaleId }, data: { subscriptionTier: "GROWTH" } });
      assert.equal(await pauseSocialIfLocked(scaleId), true);
      assert.equal(await db.instagramPost.count({ where: { organizationId: scaleId, status: "SCHEDULED" } }), 0);
      assert.equal((await db.instagramPost.findUniqueOrThrow({ where: { id: scheduled.id } })).status, "PAUSED");
      assert.equal(await db.instagramPost.count({ where: { organizationId: scaleId } }), before, "history kept");
      const view = await loadStrategy(scaleId);
      assert.ok(view?.pausedAt);
      assert.equal(view?.approvalMode, "APPROVAL_REQUIRED", "Autopilot switched off");
      // Even if forced due, a paused account's post never goes out.
      await db.instagramPost.update({ where: { id: scheduled.id }, data: { status: "SCHEDULED", scheduledFor: new Date(Date.now() - 1000) } });
      const r = await publishPost(scheduled.id, { budgetMs: 2_000 });
      assert.equal(r.status, "PAUSED");
      assert.equal((await db.instagramPost.findUniqueOrThrow({ where: { id: scheduled.id } })).status, "PAUSED");
      assert.equal((await generatePlan(scaleId, { offsetDays: 14 })).created >= 0, true);
    });

    await check("a cancelled Scale subscription is caught by the daily sweep too", async () => {
      await db.organization.update({ where: { id: scaleId }, data: { subscriptionTier: "SCALE", subscriptionStatus: "canceled" } });
      const p = await db.instagramPost.findFirstOrThrow({ where: { organizationId: scaleId, status: "PAUSED" } });
      await db.instagramPost.update({ where: { id: p.id }, data: { status: "SCHEDULED" } });
      const r = await pauseSocialSweep();
      assert.ok(r.organizations >= 1);
      assert.equal((await db.instagramPost.findUniqueOrThrow({ where: { id: p.id } })).status, "PAUSED");
    });

    await check("back on Scale, resuming: future posts return, missed ones need approval again", async () => {
      await db.organization.update({ where: { id: scaleId }, data: { subscriptionStatus: "active" } });
      const paused = await db.instagramPost.findMany({ where: { organizationId: scaleId, status: "PAUSED" } });
      assert.ok(paused.length >= 2);
      await db.instagramPost.update({ where: { id: paused[0].id }, data: { scheduledFor: new Date(Date.now() - 3_600_000) } });
      await db.instagramPost.update({ where: { id: paused[1].id }, data: { scheduledFor: new Date(Date.now() + 3 * 86_400_000) } });
      const r = await resumeSocial(scaleId);
      assert.ok(r.rescheduled >= 1 && r.needApproval >= 1);
      assert.equal((await db.instagramPost.findUniqueOrThrow({ where: { id: paused[0].id } })).status, "SUGGESTED");
      assert.equal((await db.instagramPost.findUniqueOrThrow({ where: { id: paused[1].id } })).status, "SCHEDULED");
      assert.equal((await loadStrategy(scaleId))?.pausedAt, null);
    });

    await check("on Autopilot, new posts with pictures are scheduled under the business's rules", async () => {
      await db.socialStrategy.update({ where: { organizationId: scaleId }, data: { approvalMode: "AUTOPILOT" } });
      await generatePlan(scaleId, { offsetDays: 21 });
      const auto = await db.instagramPost.findMany({ where: { organizationId: scaleId, autoApproved: true } });
      assert.ok(auto.length > 0 && auto.every((p) => p.status === "SCHEDULED" && p.mediaRefs.length > 0));
    });

    await check("likes and comments are read back and feed what MAIRO learns", async () => {
      const demo = await db.metaAdAccount.findFirst();
      await db.metaAdAccount.create({ data: { organizationId: scaleId, metaAdAccountId: `act_${TAG}`, pageId: "page1", pageName: "Threadline", accessToken: demo?.accessToken ?? "token", status: "CONNECTED" } });
      const mk = (mediaId: string, contentType: string) =>
        db.instagramPost.create({ data: { organizationId: scaleId, caption: "x", status: "PUBLISHED", mediaId, postedAt: new Date(), contentType } });
      await mk(`${TAG}-m1`, "Testimonial");
      await mk(`${TAG}-m2`, "Testimonial");
      await mk(`${TAG}-m3`, "Offer");
      await mk(`${TAG}-m4`, "Offer");
      const n = await refreshMetrics(scaleId, { limit: 10 });
      assert.equal(n, 4);
      const row = await db.instagramPost.findFirstOrThrow({ where: { organizationId: scaleId, mediaId: `${TAG}-m1` } });
      assert.equal(row.likeCount, 40);
      assert.equal(row.commentCount, 3);
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
