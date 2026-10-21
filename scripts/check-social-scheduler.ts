// Checks Scale's Instagram and Facebook Page posting: the rules (formats,
// carousels, timing, Instagram's picture shapes), the JPEG conversion, and the
// publishers' state machines against a simulated Graph API — photos,
// carousels and multi-photo posts, a Reel or video still processing,
// suggestions that must never post, the Page-posting permission, and the
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
let videoChecks = 0;
let n = 0;
const pagePosting = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== "graph.facebook.com") return realFetch(input, init);
  const method = (init?.method ?? "GET").toUpperCase();
  const path = url.pathname.replace(/^\/v[\d.]+/, "");
  const params = Object.fromEntries(url.searchParams.entries());
  if (typeof init?.body === "string" && !init.body.startsWith("{")) Object.assign(params, Object.fromEntries(new URLSearchParams(init.body).entries()));
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
  // Facebook Page posting.
  if (method === "GET" && path === "/me/permissions") return json({ data: [{ permission: "ads_management", status: "granted" }, ...(pagePosting ? [{ permission: "pages_manage_posts", status: "granted" }] : [])] });
  if (method === "GET" && path === "/page1" && params.fields === "access_token") return json({ access_token: "page-token" });
  if (method === "POST" && path === "/page1/photos") return json(params.published === "false" ? { id: `u${++n}` } : { id: `ph${++n}`, post_id: `page1_${n}` });
  if (method === "POST" && path === "/page1/feed") return json({ id: `page1_feed${++n}` });
  if (method === "POST" && path === "/page1/videos") return json({ id: "vid1" });
  if (method === "GET" && path === "/vid1") return json({ status: { video_status: ++videoChecks < 2 ? "processing" : "ready" }, permalink_url: "/page1/videos/vid1/" });
  if (method === "GET" && params.fields === "permalink_url") return json({ permalink_url: `https://www.facebook.com${path}` });
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

  await check("Facebook rules: longer text, no hashtag cap, multi-photo wording", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    assert.equal(validatePost({ mediaType: "IMAGE", refs: ["creative:a"], caption: tags, network: "FACEBOOK" }), null);
    assert.equal(validatePost({ mediaType: "IMAGE", refs: ["creative:a"], caption: "x".repeat(3000), network: "FACEBOOK" }), null);
    assert.match(validatePost({ mediaType: "IMAGE", refs: ["creative:a"], caption: "x".repeat(3000) }) ?? "", /2200/);
    assert.match(validatePost({ mediaType: "IMAGE", refs: ["creative:a"], caption: "x".repeat(5001), network: "FACEBOOK" }) ?? "", /5000/);
    assert.match(validatePost({ mediaType: "CAROUSEL", refs: ["studio:a"], caption: "Hi", network: "FACEBOOK" }) ?? "", /multi-photo/);
    assert.match(validatePost({ mediaType: "REEL", refs: ["creative:a"], caption: "Hi", network: "FACEBOOK" }) ?? "", /one video/);
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
  await db.metaAdAccount.create({ data: { organizationId: orgId, metaAdAccountId: demo.metaAdAccountId, pageId: "page1", pageName: "Sunrise Coffee", accessToken: demo.accessToken, tokenExpiresAt: demo.tokenExpiresAt, status: "CONNECTED" } });
  const camp = await db.mairoCampaign.create({ data: { organizationId: orgId, name: "Video camp", objective: "LEADS", totalDailyBudgetCents: 2000 } });
  const ad = await db.campaignAd.create({ data: { mairoCampaignId: camp.id, position: 0, kind: "VIDEO", videoUrl: "https://blob.example/v.mp4" } });
  const past = new Date(Date.now() - 60_000);
  const mk = (data: Record<string, unknown>) =>
    db.instagramPost.create({ data: { organizationId: orgId, caption: "Hello from the shop", status: "SCHEDULED", approvedAt: new Date(), scheduledFor: past, ...data } as never });

  try {
    // Posting to Instagram and Facebook profiles was discontinued for every
    // plan (lib/social/access.ts). Even an earlier-Scale subscriber with a
    // connected Page and approved posts due now gets nothing published.
    await check("nothing reaches Instagram or Facebook: due, approved posts are paused, no Graph write is made", async () => {
      const posts = await Promise.all([
        mk({ mediaType: "IMAGE", mediaRefs: ["creative:x"] }),
        mk({ mediaType: "CAROUSEL", mediaRefs: ["creative:a", "creative:b"] }),
        mk({ mediaType: "REELS", mediaRefs: [`ad:${ad.id}`] }),
        mk({ network: "FACEBOOK", mediaType: "IMAGE", mediaRefs: ["creative:fb"] }),
      ]);
      calls.length = 0;
      await publishDuePosts({ organizationId: orgId, budgetMs: 10_000 });
      for (const p of posts) {
        const r = await publishPost(p.id, { budgetMs: 2_000 });
        assert.notEqual(r.status, "PUBLISHED");
        const row = await db.instagramPost.findUniqueOrThrow({ where: { id: p.id } });
        assert.equal(row.status, "PAUSED", `${row.network} ${row.mediaType}`);
        assert.equal(row.postedAt, null);
      }
      assert.equal(calls.filter((c) => c.method === "POST").length, 0, "no post to Graph");
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
