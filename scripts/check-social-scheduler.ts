// Checks Scale's Instagram posting: the rules (formats, carousels, timing,
// Instagram's picture shapes), the JPEG conversion, and the publisher's
// state machine against a simulated Instagram API — photos, carousels, a
// Reel that is still processing, suggestions that must never post, and the
// plan / subscription lock.
//
//   npm run check:social-scheduler   (needs DATABASE_URL; makes no network calls)

import assert from "node:assert/strict";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { feedCanvas, planSlots, validatePost, validateWhen, isDuePost } from "../src/lib/instagram/social-logic";
import { toInstagramJpeg } from "../src/lib/instagram/jpeg";
import { publishDuePosts, publishPost } from "../src/lib/instagram/scheduler";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// --- A pretend Instagram ---------------------------------------------------------
type Call = { method: string; path: string; params: Record<string, string> };
const calls: Call[] = [];
let reelChecks = 0;
let n = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== "graph.facebook.com") return realFetch(input, init);
  const method = (init?.method ?? "GET").toUpperCase();
  const path = url.pathname.replace(/^\/v[\d.]+/, "");
  const params = Object.fromEntries(url.searchParams.entries());
  calls.push({ method, path, params });
  const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
  if (method === "GET" && params.fields?.startsWith("instagram_business_account")) return json({ instagram_business_account: { id: "ig1", username: "shop" } });
  if (method === "POST" && path === "/ig1/media") {
    const id = params.media_type === "REELS" ? "reel-c" : `c${++n}`;
    return json({ id });
  }
  if (method === "GET" && params.fields === "status_code") {
    if (path === "/reel-c") return json({ status_code: ++reelChecks < 2 ? "IN_PROGRESS" : "FINISHED" });
    return json({ status_code: "FINISHED" });
  }
  if (method === "POST" && path === "/ig1/media_publish") return json({ id: `m-${params.creation_id}` });
  if (method === "GET" && params.fields === "permalink") return json({ permalink: `https://instagram.com/p${path}` });
  return json({});
}) as typeof fetch;

const TAG = `zz-social-${Date.now()}`;

async function main() {
  await check("post rules: formats, carousel size, captions, hashtags", () => {
    assert.equal(validatePost({ mediaType: "IMAGE", refs: ["creative:a"], caption: "Hi" }), null);
    assert.match(validatePost({ mediaType: "IMAGE", refs: ["video:a"], caption: "Hi" }) ?? "", /one picture/);
    assert.match(validatePost({ mediaType: "CAROUSEL", refs: ["studio:a"], caption: "Hi" }) ?? "", /2 to 10/);
    assert.equal(validatePost({ mediaType: "CAROUSEL", refs: ["studio:a", "creative:b"], caption: "Hi" }), null);
    assert.match(validatePost({ mediaType: "CAROUSEL", refs: ["studio:a", "studio:a"], caption: "Hi" }) ?? "", /once/);
    assert.equal(validatePost({ mediaType: "REEL", refs: ["video:x"], caption: "Hi" }), null);
    assert.match(validatePost({ mediaType: "IMAGE", refs: ["creative:a"], caption: " " }) ?? "", /caption/);
    assert.match(validatePost({ mediaType: "IMAGE", refs: ["creative:a"], caption: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ") }) ?? "", /30 hashtags/);
    assert.match(validatePost({ mediaType: "IMAGE", refs: ["https://evil"], caption: "Hi" }) ?? "", /can't be posted/);
  });

  await check("timing: past and far-future times are refused", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    assert.equal(validateWhen(null, now), null);
    assert.match(validateWhen(new Date("2026-09-30T12:00:00Z"), now) ?? "", /passed/);
    assert.match(validateWhen(new Date("2027-06-01T12:00:00Z"), now) ?? "", /75 days/);
    assert.deepEqual(planSlots(3, "2026-10-01", 11), ["2026-10-02T11:00", "2026-10-04T11:00", "2026-10-06T11:00"]);
  });

  await check("only approved, due posts are picked up; suggestions never are", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    assert.equal(isDuePost({ status: "SUGGESTED", scheduledFor: null, approvedAt: null, attempts: 0 }, now), false);
    assert.equal(isDuePost({ status: "SCHEDULED", scheduledFor: null, approvedAt: null, attempts: 0 }, now), false);
    assert.equal(isDuePost({ status: "SCHEDULED", scheduledFor: new Date("2026-10-02T00:00:00Z"), approvedAt: now, attempts: 0 }, now), false);
    assert.equal(isDuePost({ status: "SCHEDULED", scheduledFor: new Date("2026-10-01T11:00:00Z"), approvedAt: now, attempts: 0 }, now), true);
    assert.equal(isDuePost({ status: "CREATED", scheduledFor: null, approvedAt: now, attempts: 6 }, now), false);
  });

  await check("pictures are fitted to Instagram's shapes, never cropped", async () => {
    const tall = feedCanvas(1080, 1920);
    assert.ok(Math.abs(tall.width / tall.height - 0.8) < 0.01, "9:16 padded to 4:5");
    const wide = feedCanvas(3000, 1000);
    assert.ok(wide.width <= 1440 && Math.abs(wide.width / wide.height - 1.91) < 0.01, "3:1 padded to 1.91:1");
    assert.deepEqual(feedCanvas(1080, 1080), { width: 1080, height: 1080, imageWidth: 1080, imageHeight: 1080 });
    const png = await sharp({ create: { width: 1080, height: 1920, channels: 4, background: { r: 200, g: 50, b: 50, alpha: 1 } } }).png().toBuffer();
    const jpeg = await toInstagramJpeg(png);
    const meta = await sharp(jpeg).metadata();
    assert.equal(meta.format, "jpeg");
    assert.ok(Math.abs((meta.width ?? 0) / (meta.height ?? 1) - 0.8) < 0.01);
  });

  // A Scale account with a connected Page, copied from the demo connection.
  const orgId = `${TAG}-scale`;
  await db.organization.create({ data: { id: orgId, name: "Social Test", subscriptionTier: "SCALE", subscriptionStatus: "active", hasPaid: true } });
  const demo = await db.metaAdAccount.findFirst({ where: { organizationId: "demo-org-local" } });
  if (!demo) throw new Error("Needs the local demo org's Meta connection (demo-org-local).");
  await db.metaAdAccount.create({ data: { organizationId: orgId, metaAdAccountId: demo.metaAdAccountId, pageId: demo.pageId ?? "page1", pageName: demo.pageName, accessToken: demo.accessToken, tokenExpiresAt: demo.tokenExpiresAt, status: "CONNECTED" } });
  const camp = await db.mairoCampaign.create({ data: { organizationId: orgId, name: "Video camp", objective: "LEADS", totalDailyBudgetCents: 2000 } });
  const ad = await db.campaignAd.create({ data: { mairoCampaignId: camp.id, position: 0, kind: "VIDEO", videoUrl: "https://blob.example/v.mp4" } });
  const past = new Date(Date.now() - 60_000);
  const mk = (data: Record<string, unknown>) =>
    db.instagramPost.create({ data: { organizationId: orgId, caption: "Hello from the shop", status: "SCHEDULED", approvedAt: new Date(), scheduledFor: past, ...data } as never });

  try {
    await check("a photo post is published, via a JPEG address Instagram can fetch", async () => {
      const p = await mk({ mediaType: "IMAGE", mediaRefs: ["creative:x"] });
      const r = await publishPost(p.id, { budgetMs: 5_000 });
      assert.equal(r.status, "PUBLISHED");
      const create = calls.find((c) => c.method === "POST" && c.path === "/ig1/media" && c.params.image_url?.includes(p.id));
      assert.ok(create && create.params.image_url.endsWith(`/api/social/media/${p.id}/0`) && create.params.caption === "Hello from the shop");
      const row = await db.instagramPost.findUniqueOrThrow({ where: { id: p.id } });
      assert.equal(row.status, "PUBLISHED");
      assert.ok(row.permalink?.startsWith("https://instagram.com/p/"));
    });

    await check("a carousel sends each picture as an item, then one carousel", async () => {
      const p = await mk({ mediaType: "CAROUSEL", mediaRefs: ["creative:a", "studio:b", "creative:c"] });
      const before = calls.length;
      assert.equal((await publishPost(p.id, { budgetMs: 5_000 })).status, "PUBLISHED");
      const mine = calls.slice(before).filter((c) => c.method === "POST" && c.path === "/ig1/media");
      assert.equal(mine.filter((c) => c.params.is_carousel_item === "true").length, 3);
      const parent = mine.find((c) => c.params.media_type === "CAROUSEL");
      assert.ok(parent && parent.params.children.split(",").length === 3 && parent.params.caption);
    });

    await check("a Reel still processing waits for the next check, then publishes", async () => {
      const p = await mk({ mediaType: "REEL", mediaRefs: [`video:${ad.id}`] });
      const first = await publishPost(p.id, { budgetMs: 1_000 });
      assert.equal(first.status, "CREATED");
      const reelCall = calls.find((c) => c.params.media_type === "REELS");
      assert.ok(reelCall && reelCall.params.video_url === "https://blob.example/v.mp4");
      const second = await publishPost(p.id, { budgetMs: 5_000 });
      assert.equal(second.status, "PUBLISHED");
      assert.equal(calls.filter((c) => c.params.media_type === "REELS").length, 1, "the container is created once");
    });

    await check("future and unapproved posts are left alone by the runner", async () => {
      const future = await mk({ mediaType: "IMAGE", mediaRefs: ["creative:f"], scheduledFor: new Date(Date.now() + 86_400_000) });
      const suggestion = await mk({ mediaType: "IMAGE", mediaRefs: ["creative:s"], status: "SUGGESTED", approvedAt: null });
      await publishDuePosts({ organizationId: orgId, budgetMs: 10_000 });
      assert.equal((await db.instagramPost.findUniqueOrThrow({ where: { id: future.id } })).status, "SCHEDULED");
      assert.equal((await db.instagramPost.findUniqueOrThrow({ where: { id: suggestion.id } })).status, "SUGGESTED");
    });

    await check("without Scale, nothing is posted", async () => {
      await db.organization.update({ where: { id: orgId }, data: { subscriptionTier: "GROWTH" } });
      const p = await mk({ mediaType: "IMAGE", mediaRefs: ["creative:g"] });
      const r = await publishPost(p.id, { budgetMs: 5_000 });
      assert.equal(r.status, "FAILED");
      assert.match(r.message, /Scale/);
      await db.organization.update({ where: { id: orgId }, data: { subscriptionTier: "SCALE" } });
    });

    await check("a free-plan account without a live subscription can't post", async () => {
      await db.organization.update({ where: { id: orgId }, data: { paymentRequired: true, subscriptionStatus: "past_due" } });
      const p = await mk({ mediaType: "IMAGE", mediaRefs: ["creative:h"] });
      assert.equal((await publishPost(p.id, { budgetMs: 5_000 })).status, "FAILED");
      await db.organization.update({ where: { id: orgId }, data: { paymentRequired: false, subscriptionStatus: "active" } });
    });

    await check("Instagram's 25-a-day limit holds a post for the next check", async () => {
      await db.instagramPost.createMany({ data: Array.from({ length: 25 }, () => ({ organizationId: orgId, caption: "x", status: "PUBLISHED" as const, postedAt: new Date() })) });
      const p = await mk({ mediaType: "IMAGE", mediaRefs: ["creative:l"] });
      assert.equal((await publishPost(p.id, { budgetMs: 5_000 })).status, "SCHEDULED");
      assert.match((await db.instagramPost.findUniqueOrThrow({ where: { id: p.id } })).error ?? "", /25 posts a day/);
    });
  } finally {
    await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  }
  console.log(`\n${passed} social scheduler checks passed.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } }).catch(() => undefined);
  process.exit(1);
});
