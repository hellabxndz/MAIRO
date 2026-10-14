// Checks "Review your suggested ads" — no AI, no Meta call, nothing published:
//
//   - directions come only from confirmed facts: inferred ones are listed,
//     not used; no invented numbers; words to avoid never appear; exactly one
//     is recommended, with why;
//   - three are made once, even when two tabs open the page together;
//   - every change to the words or the video's edits is a new version, and
//     the original upload is never changed;
//   - approval binds the exact words and picture or video version — any change
//     withdraws it, and only the latest version can be approved;
//   - video suggestions are timestamped within the video, and the edits that
//     won't be in the file are named;
//   - one business never sees or changes another's directions, pictures,
//     videos or approvals.
//
//   npm run check:suggested-ads   (needs the local database)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { encryptSecret } from "../src/lib/crypto/secret-box";
import { changeBrain } from "../src/lib/brain/store";
import { buildDirections, ctaTypeFor, imagePromptFor, introFor, preferredOrder, usesAvoided, type ConfirmedFacts } from "../src/lib/suggested-ads/directions";
import { NO_EDITS, describeEdits, editsNotInFile, parseEdits, videoSuggestions, type VideoMeta } from "../src/lib/suggested-ads/video";
import {
  approveCreative,
  confirmedFactsFor,
  draftFromApproval,
  ensureDirections,
  listSuggestions,
  proposedTest,
  refreshDirections,
  reviseDirection,
  saveOwnerVideo,
  saveVideoEdits,
  suggestedAdsGate,
} from "../src/lib/suggested-ads/store";
import { isOwnUpload } from "../src/lib/campaigns/media-rules";
import { META_CTA_TYPES } from "../src/lib/meta/creative-copy";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-sug";
const A = `${TAG}-a`;
const B = `${TAG}-b`;
const C = `${TAG}-c`;

const FULL: ConfirmedFacts = {
  businessName: "Harbour Plumbing",
  offering: "Emergency plumbing repairs",
  customer: "Homeowners with a leak",
  location: "Bristol",
  presence: "local",
  problem: "a burst pipe flooding the kitchen",
  outcome: "the water off and the leak fixed today",
  offer: "free call-out before 6pm",
  proof: "a fixed price agreed before any work starts",
  objection: "worried about surprise bills",
  goal: "leads",
  avoid: ["cheap"],
};

const DIGITS = /\d/;
const INVENTED = /\b(\d+%|%|\$|reviews?|stars?|rated|award|guarantee[ds]?|limited time|today only|ends soon)\b/i;

async function cleanup() {
  await db.campaignDraft.deleteMany({ where: { organizationId: { startsWith: TAG } } });
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function org(id: string, name: string, meta: boolean) {
  await db.organization.create({ data: { id, name } });
  if (meta) await db.metaAdAccount.create({ data: { organizationId: id, metaAdAccountId: `act_${id}`, accessToken: encryptSecret("fake-token"), status: "CONNECTED", pageId: "1234" } });
}

async function confirm(id: string, field: string, value: string, list = false) {
  const r = await changeBrain(id, list ? { op: "add", field, value } : { op: "set", field, value }, "customer");
  assert.equal(r.ok, true, `brain ${field}`);
}

/** A finished picture version for a direction, as the Studio pipeline leaves one — test data only. */
async function picture(organizationId: string, angleId: string, versions: number) {
  return db.creativeStudioAsset.create({
    data: {
      organizationId,
      source: "PROMPT",
      format: "PORTRAIT",
      angleId,
      versions: { create: Array.from({ length: versions }, (_, i) => ({ version: i + 1, kind: "GENERATE", instruction: "test", status: "COMPLETE", imageUrl: `https://example.test/${organizationId}/v${i + 1}.png` })) },
    },
    include: { versions: { orderBy: { version: "asc" } } },
  });
}

async function main() {
  await cleanup();

  console.log("— directions —");
  await check("three directions from full facts, exactly one recommended, with the reason", () => {
    const { directions } = buildDirections(FULL);
    assert.equal(directions.length, 3);
    assert.equal(directions.filter((d) => d.recommended).length, 1);
    assert.equal(directions[0].recommended, true);
    assert.ok(directions[0].recommendedWhy && directions[0].recommendedWhy.length > 20);
    assert.equal(new Set(directions.map((d) => d.kind)).size, 3, "three different reasons, not three wordings");
    for (const d of directions) {
      assert.ok(d.builtFrom.length > 0, `${d.kind} names what it's built from`);
      assert.equal(d.cta, "Get a quote");
    }
  });
  await check("no invented numbers, discounts, reviews or deadlines", () => {
    for (const facts of [FULL, { ...FULL, goal: "sales" as const, presence: "online" as const }, { ...FULL, goal: "bookings" as const }]) {
      for (const d of buildDirections(facts).directions) {
        const text = `${d.title} ${d.hook} ${d.body}`;
        assert.ok(!DIGITS.test(text.replace(/6pm/g, "")), `no figures: ${text}`);
        assert.ok(!INVENTED.test(text), `nothing invented: ${text}`);
      }
    }
  });
  await check("words the owner said to avoid never appear", () => {
    const facts = { ...FULL, offer: "cheap first visit", proof: "cheap and fast" };
    const { directions } = buildDirections(facts);
    assert.ok(directions.length > 0);
    for (const d of directions) assert.equal(usesAvoided(`${d.hook} ${d.body}`, facts.avoid), null, d.hook);
  });
  await check("a direction needs its fact: no offer, no offer direction — and the page says what would unlock it", () => {
    const facts = { ...FULL, offer: "", proof: "" };
    const { directions, missing } = buildDirections(facts);
    assert.ok(!directions.some((d) => d.kind === "offer" || d.kind === "proof"));
    assert.ok(missing.some((m) => m.fact === "Standing offers"));
  });
  await check("nothing to advertise, nothing suggested", () => {
    const { directions, missing } = buildDirections({ ...FULL, offering: "" });
    assert.equal(directions.length, 0);
    assert.match(missing[0].gives, /what you're advertising/);
    assert.match(introFor({ ...FULL, offering: "" }, 0), /needs a little more/);
  });
  await check("the first test suits how the business sells", () => {
    assert.equal(preferredOrder({ presence: "online", goal: "sales" })[0], "offer");
    assert.equal(preferredOrder({ presence: "local", goal: "leads" })[0], "problem");
    assert.equal(buildDirections(FULL).directions[0].kind, "problem");
  });
  await check("the intro is personal; an online business isn't placed in a town", () => {
    const intro = introFor(FULL, 3);
    assert.match(intro, /^Three ways to start advertising emergency plumbing repairs for homeowners with a leak in Bristol/);
    assert.ok(!/Bristol/.test(introFor({ ...FULL, presence: "online" }, 3)));
  });
  await check("the picture brief asks for no text and no people posing as customers", () => {
    const p = imagePromptFor({ kind: "problem", hook: "x" }, FULL);
    assert.match(p, /No text/);
    assert.match(p, /not presented as customers/);
    assert.ok(p.includes("Emergency plumbing repairs"));
  });
  await check("the button words map to a button Meta accepts", () => {
    assert.equal(ctaTypeFor("Shop now"), "SHOP_NOW");
    assert.equal(ctaTypeFor("Get a quote"), "GET_QUOTE");
    assert.equal(ctaTypeFor("Book now"), "BOOK_TRAVEL");
    assert.equal(ctaTypeFor("Something else"), "LEARN_MORE");
    for (const w of ["Shop now", "Get a quote", "Book now", "Learn more", "Contact us", "Order now", "Sign up"]) assert.ok(META_CTA_TYPES.has(ctaTypeFor(w)), w);
  });

  console.log("— video edits —");
  const WIDE: VideoMeta = { durationMs: 45_000, width: 1920, height: 1080 };
  const TALL: VideoMeta = { durationMs: 4_000, width: 1080, height: 1920 };
  await check("edits are clamped to the video; junk becomes no edits", () => {
    const e = parseEdits({ trimStartMs: -50, trimEndMs: 99_000, aspect: "21:9", captions: [{ startMs: 44_000, endMs: 60_000, text: "  end  " }, { startMs: 1, endMs: 2, text: "" }] }, WIDE);
    assert.equal(e.trimStartMs, 0);
    assert.equal(e.trimEndMs, null);
    assert.equal(e.aspect, "original");
    assert.deepEqual(e.captions, [{ startMs: 44_000, endMs: 45_000, text: "end" }]);
    assert.deepEqual(parseEdits("not json", WIDE), NO_EDITS);
    assert.equal(parseEdits({ captions: Array.from({ length: 40 }, (_, i) => ({ startMs: i, endMs: i + 500, text: "x" })) }, WIDE).captions.length, 20);
    assert.equal(parseEdits({ trimStartMs: 10_000, trimEndMs: 10_500 }, WIDE).trimEndMs, null, "a cut under a second is refused");
  });
  await check("suggestions are timestamped inside the video and say what they're based on", () => {
    const s = videoSuggestions(WIDE, { hook: "Burst pipe?", cta: "Get a quote" }, NO_EDITS);
    const ids = s.map((x) => x.id);
    for (const id of ["open-hook", "trim", "crop", "cta-end", "sound"]) assert.ok(ids.includes(id), id);
    for (const x of s) {
      assert.ok(x.atMs >= 0 && x.atMs <= WIDE.durationMs);
      if (x.untilMs !== null) assert.ok(x.untilMs <= WIDE.durationMs && x.untilMs >= x.atMs);
    }
    const hook = s.find((x) => x.id === "open-hook")!;
    assert.match(hook.title, /^0:00–0:03/);
    assert.equal(hook.apply!.captions[0].text, "Burst pipe?");
    const end = s.find((x) => x.id === "cta-end")!;
    assert.equal(end.atMs, 42_000);
    assert.match(s.find((x) => x.id === "sound")!.detail, /can't hear or watch/);
    assert.ok(!videoSuggestions(WIDE, { hook: "Burst pipe?", cta: "Get a quote" }, hook.apply!).some((x) => x.id === "open-hook"), "applied ones aren't offered again");
  });
  await check("a short vertical video gets no crop or end caption", () => {
    const ids = videoSuggestions(TALL, { hook: "Hi", cta: "Book now" }, NO_EDITS).map((x) => x.id);
    assert.ok(ids.includes("short") && ids.includes("vertical"));
    assert.ok(!ids.includes("crop") && !ids.includes("cta-end") && !ids.includes("trim"));
  });
  await check("every edit that won't be in the file is named", () => {
    assert.deepEqual(editsNotInFile(NO_EDITS), []);
    assert.deepEqual(editsNotInFile({ trimStartMs: 1000, trimEndMs: null, captions: [{ startMs: 0, endMs: 1000, text: "x" }], aspect: "4:5" }), ["the trim", "the captions", "the crop"]);
    assert.deepEqual(describeEdits(NO_EDITS, WIDE), ["The original, unedited"]);
  });

  console.log("— the records —");
  await org(A, "Harbour Plumbing", true);
  await org(B, "Other Co", true);
  await org(C, "No Meta Yet", false);
  await confirm(A, "focusItem", "Emergency plumbing repairs");
  await confirm(A, "targetCustomer", "Homeowners with a leak");
  await confirm(A, "serviceArea", "Bristol");
  await confirm(A, "offers", "free call-out before 6pm", true);
  await confirm(A, "usps", "a fixed price agreed before any work starts", true);
  await confirm(A, "avoidClaims", "cheap", true);
  // Read off the website, never confirmed: listed, not used.
  await changeBrain(A, { op: "add", field: "painPoints", value: "slow plumbers who never call back" }, "website");
  await confirm(B, "focusItem", "Handmade candles");
  await confirm(C, "focusItem", "Garden design");

  await check("the page opens once the profile is confirmed — before Meta is connected, which it reports", async () => {
    assert.equal((await suggestedAdsGate(A)).ready, true);
    const c = await suggestedAdsGate(C);
    assert.equal(c.ready, true, "the three directions come before any account setup");
    assert.equal(c.metaConnected, false);
    assert.equal(c.next, null);
    await db.organization.create({ data: { id: `${TAG}-d`, name: "Nothing confirmed" } });
    const d = await suggestedAdsGate(`${TAG}-d`);
    assert.equal(d.ready, false);
    assert.match(d.next!.label, /Business Brain/);
  });
  await check("only confirmed facts are used; inferred ones are listed instead", async () => {
    const f = await confirmedFactsFor(A);
    assert.equal(f.facts.problem, "");
    assert.ok(f.unconfirmed.includes("Problems customers have"));
    assert.equal(f.facts.offering, "Emergency plumbing repairs");
    assert.deepEqual(f.facts.avoid, ["cheap"]);
    assert.equal(f.facts.businessName, "Harbour Plumbing", "the name the owner gave, not one read off a website");
  });
  await check("two page loads at once make one set of three", async () => {
    await Promise.all([ensureDirections(A, "user-a"), ensureDirections(A, "user-a"), ensureDirections(A, "user-a")]);
    assert.equal(await db.adAngle.count({ where: { organizationId: A } }), 3);
    const s = await listSuggestions(A);
    assert.equal(s.directions.length, 3);
    assert.equal(s.directions.filter((d) => d.recommended).length, 1);
    for (const d of s.directions) {
      assert.equal(d.words!.version, 1);
      assert.equal(d.words!.source, "template");
      assert.ok(!/slow plumbers/.test(`${d.words!.hook} ${d.words!.body}`), "the unconfirmed problem isn't used");
    }
  });

  const s0 = await listSuggestions(A);
  const [d1, d2] = s0.directions;
  await check("changing the words makes a new version and keeps the old one", async () => {
    const r = await reviseDirection(A, "user-a", d1.id, { hook: "Water everywhere? We pick up.", body: d1.words!.body, cta: "Get a quote" });
    assert.deepEqual(r, { ok: true, version: 2 });
    const same = await reviseDirection(A, "user-a", d1.id, { hook: "Water everywhere?  We pick up.", body: d1.words!.body, cta: "Get a quote" });
    assert.deepEqual(same, { ok: true, version: 2 }, "the same words aren't a new version");
    const after = (await listSuggestions(A)).directions.find((d) => d.id === d1.id)!;
    assert.equal(after.history.length, 2);
    assert.equal(after.history[1].hook, d1.words!.hook);
    assert.equal(after.words!.source, "owner");
  });
  await check("words to avoid are refused when the owner edits too", async () => {
    const r = await reviseDirection(A, "user-a", d1.id, { hook: "Cheap plumbers near you", body: "", cta: "Get a quote" });
    assert.equal(r.ok, false);
  });

  console.log("— approval —");
  const pic = await picture(A, d1.id, 2);
  await check("only the latest picture version can be approved", async () => {
    const cur = (await listSuggestions(A)).directions.find((d) => d.id === d1.id)!;
    const old = await approveCreative(A, "user-a", { angleId: d1.id, revisionId: cur.words!.revisionId, studioVersionId: pic.versions[0].id });
    assert.equal(old.ok, false);
    if (!old.ok) assert.match(old.error, /newer version/);
  });
  await check("approval binds the exact words and picture; changing the words withdraws it", async () => {
    let cur = (await listSuggestions(A)).directions.find((d) => d.id === d1.id)!;
    const ok = await approveCreative(A, "user-a", { angleId: d1.id, revisionId: cur.words!.revisionId, studioVersionId: pic.versions[1].id });
    assert.equal(ok.ok, true);
    cur = (await listSuggestions(A)).directions.find((d) => d.id === d1.id)!;
    assert.equal(cur.approval?.state, "current");
    assert.equal(cur.approval?.studioVersionId, pic.versions[1].id);
    await reviseDirection(A, "user-a", d1.id, { hook: "Leak? We're on our way.", body: cur.words!.body, cta: "Get a quote" });
    cur = (await listSuggestions(A)).directions.find((d) => d.id === d1.id)!;
    assert.equal(cur.approval?.state, "changed");
  });
  await check("approving words the page no longer shows is refused", async () => {
    const stale = (await db.adAngleRevision.findFirstOrThrow({ where: { angleId: d1.id, version: 1 } })).id;
    const r = await approveCreative(A, "user-a", { angleId: d1.id, revisionId: stale, studioVersionId: pic.versions[1].id });
    assert.equal(r.ok, false);
  });
  await check("approving again withdraws the earlier approval — one live approval per direction", async () => {
    const cur = (await listSuggestions(A)).directions.find((d) => d.id === d1.id)!;
    assert.equal((await approveCreative(A, "user-a", { angleId: d1.id, revisionId: cur.words!.revisionId, studioVersionId: pic.versions[1].id })).ok, true);
    assert.equal(await db.creativeApproval.count({ where: { organizationId: A, angleId: d1.id, revokedAt: null } }), 1);
    assert.equal(await db.creativeApproval.count({ where: { organizationId: A, angleId: d1.id } }), 2);
  });
  await check("one approval proposes no test yet", async () => {
    assert.equal(await proposedTest(A), null);
  });

  console.log("— the owner's video —");
  const URL0 = `https://store.public.blob.vercel-storage.com/ad-media/${A}/video-x.mp4`;
  const saved = await saveOwnerVideo(A, "user-a", { angleId: d2.id, url: URL0, posterUrl: `https://store.public.blob.vercel-storage.com/ad-media/${A}/poster-x.jpg`, name: "van.mp4", durationMs: 45_000, width: 1920, height: 1080, bytes: 5_000_000 });
  assert.ok(saved.ok);
  const videoId = saved.ok ? saved.videoId : "";
  await check("a saved video starts as the original, version 1", async () => {
    const v = (await listSuggestions(A)).directions.find((d) => d.id === d2.id)!.videos[0];
    assert.equal(v.version, 1);
    assert.deepEqual(v.edits, NO_EDITS);
  });
  await check("each edit is a new version; the same edits aren't; the file is never changed", async () => {
    const e1 = { ...NO_EDITS, captions: [{ startMs: 0, endMs: 3000, text: "Leak?" }] };
    assert.deepEqual(await saveVideoEdits(A, "user-a", videoId, e1), { ok: true, version: 2, changed: true });
    assert.deepEqual(await saveVideoEdits(A, "user-a", videoId, e1), { ok: true, version: 2, changed: false });
    assert.deepEqual(await saveVideoEdits(A, "user-a", videoId, NO_EDITS), { ok: true, version: 3, changed: true });
    const row = await db.ownerVideo.findUniqueOrThrow({ where: { id: videoId }, include: { revisions: true } });
    assert.equal(row.url, URL0);
    assert.equal(row.revisions.length, 3);
  });
  await check("a video approval is bound to its edit version; a new edit withdraws it", async () => {
    let cur = (await listSuggestions(A)).directions.find((d) => d.id === d2.id)!;
    const r = await approveCreative(A, "user-a", { angleId: d2.id, revisionId: cur.words!.revisionId, videoRevisionId: cur.videos[0].revisionId });
    assert.equal(r.ok, true);
    cur = (await listSuggestions(A)).directions.find((d) => d.id === d2.id)!;
    assert.equal(cur.approval?.state, "current");
    await saveVideoEdits(A, "user-a", videoId, { ...NO_EDITS, aspect: "4:5" });
    cur = (await listSuggestions(A)).directions.find((d) => d.id === d2.id)!;
    assert.equal(cur.approval?.state, "changed");
    const r2 = await approveCreative(A, "user-a", { angleId: d2.id, revisionId: cur.words!.revisionId, videoRevisionId: cur.videos[0].revisionId });
    assert.equal(r2.ok, true);
  });
  await check("two approved directions write down a proposed test with the exact versions — not run", async () => {
    const t = await proposedTest(A);
    assert.ok(t);
    assert.equal(t!.status, "PROPOSED");
    assert.equal(t!.variants.length, 2);
    const row = await db.creativeExperiment.findFirstOrThrow({ where: { organizationId: A } });
    assert.equal(row.mairoCampaignId, null);
    const variants = JSON.parse(row.variantsJson) as { angleRevisionId: string }[];
    assert.ok(variants.every((v) => v.angleRevisionId));
  });
  await check("continuing makes one campaign draft with exactly the approved video and words", async () => {
    const x = await draftFromApproval(A, "user-a", d2.id);
    const y = await draftFromApproval(A, "user-a", d2.id);
    assert.ok(x.ok && y.ok);
    if (!x.ok || !y.ok) return;
    assert.equal(x.draftId, y.draftId);
    const draft = await db.campaignDraft.findUniqueOrThrow({ where: { id: x.draftId } });
    const plan = draft.data as { adChoice: string; video: { url: string }; copyOptions: { primaryText: string; cta: string }[] };
    assert.equal(plan.adChoice, "video");
    assert.equal(plan.video.url, URL0);
    const words = (await listSuggestions(A)).directions.find((d) => d.id === d2.id)!.words!;
    assert.ok(plan.copyOptions[0].primaryText.startsWith(words.hook));
    assert.equal(plan.copyOptions[0].cta, "GET_QUOTE");
  });
  await check("a changed ad can't continue until it's approved again", async () => {
    const cur = (await listSuggestions(A)).directions.find((d) => d.id === d2.id)!;
    await reviseDirection(A, "user-a", d2.id, { hook: "New words", body: cur.words!.body, cta: cur.words!.cta });
    const r = await draftFromApproval(A, "user-a", d2.id);
    assert.equal(r.ok, false);
  });
  await check("new suggestions set aside only what wasn't approved", async () => {
    const before = await db.adAngle.findMany({ where: { organizationId: A, status: { not: "ARCHIVED" } }, select: { id: true } });
    await refreshDirections(A, "user-a");
    const after = await db.adAngle.findMany({ where: { organizationId: A, status: { not: "ARCHIVED" } }, select: { id: true } });
    assert.equal(before.length, 3);
    assert.deepEqual(after.map((a) => a.id).sort(), [d1.id, d2.id].sort());
  });

  console.log("— isolation —");
  await ensureDirections(B, "user-b");
  await check("another business can't read, change or approve these", async () => {
    const b = await listSuggestions(B);
    assert.ok(!b.directions.some((d) => d.id === d1.id || d.id === d2.id));
    assert.ok(b.directions.every((d) => d.images.length === 0 && d.videos.length === 0));
    assert.equal((await reviseDirection(B, "user-b", d1.id, { hook: "Hijack", body: "", cta: "Shop now" })).ok, false);
    assert.equal((await saveVideoEdits(B, "user-b", videoId, NO_EDITS)).ok, false);
    const cur = (await listSuggestions(A)).directions.find((d) => d.id === d1.id)!;
    assert.equal((await approveCreative(B, "user-b", { angleId: d1.id, revisionId: cur.words!.revisionId, studioVersionId: pic.versions[1].id })).ok, false);
    const bAngle = b.directions[0];
    const cross = await approveCreative(B, "user-b", { angleId: bAngle.id, revisionId: bAngle.words!.revisionId, studioVersionId: pic.versions[1].id });
    assert.equal(cross.ok, false, "A's picture can't be approved on B's ad");
    assert.equal((await saveOwnerVideo(B, "user-b", { angleId: d1.id, url: URL0, posterUrl: null, name: "x", durationMs: 1000, width: 100, height: 100, bytes: 1 })).ok, false);
    assert.equal((await draftFromApproval(B, "user-b", d1.id)).ok, false);
  });
  await check("a video is accepted only from the business's own upload folder", () => {
    assert.equal(isOwnUpload(URL0, A), true);
    assert.equal(isOwnUpload(URL0, B), false);
    assert.equal(isOwnUpload(`https://evil.test/ad-media/${A}/v.mp4`, A), false);
  });

  await cleanup();
  console.log(`\nSuggested ads: ${passed} checks passed.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  process.exit(1);
});
