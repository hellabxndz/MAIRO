// Checks the Creative Studio additions to "Review your suggested ads" — no
// Meta call, no AI call, nothing published, nothing spent:
//
//   - each direction says who it's for, where the button sends people and why
//     it's worth a test, and the button fits the kind of business — a shop,
//     a local service, B2B software and an agency;
//   - the readiness check: seven areas, each from what's really there, areas
//     that don't apply left out of the score, and fixes that only use what
//     the owner confirmed;
//   - a MAIRO rewrite is checked before the owner sees it: numbers the
//     business never gave are dropped, words to avoid stop it, the button
//     stays one MAIRO can run;
//   - the previews say when they're illustrations;
//   - turning a direction down: kept with its reason, its approval and any
//     proposed test withdrawn, a different kind suggested in its place, never
//     the same kind again; refused while its test is approved;
//   - the Creative Library lists one business's creatives only, by source and
//     stage, with results only where Meta reported them.
//
//   npm run check:creative-readiness   (needs the local database)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { encryptSecret } from "../src/lib/crypto/secret-box";
import { changeBrain } from "../src/lib/brain/store";
import { NO_RULES } from "../src/lib/brain/brand-check";
import { audienceFor, buildDirections, ctaFor, destinationFor, type ConfirmedFacts } from "../src/lib/suggested-ads/directions";
import { BLOCKED_MAX, READINESS_LABEL, applyFixes, aspectOf, readiness, shortenedHook, type ReadinessInput } from "../src/lib/creative/readiness";
import { BUTTONS, settleRewrite } from "../src/lib/creative/rewrite-rules";
import { inFilter, matchesSearch } from "../src/lib/creatives/library-view";
import { loadCreativeLibrary } from "../src/lib/creatives/library";
import { mockLabel } from "../src/app/dashboard/creatives/suggested/placements";
import {
  approveCreative,
  bringBackDirection,
  ensureDirections,
  listSuggestions,
  refreshDirections,
  rejectDirection,
  reviseDirection,
  saveOwnerVideo,
  trackingReadiness,
} from "../src/lib/suggested-ads/store";
import { approveExperiment } from "../src/lib/experiments/store";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-ready";
const A = `${TAG}-a`;
const B = `${TAG}-b`;

const base: ConfirmedFacts = {
  businessName: "Harbour Mugs",
  offering: "Handmade stoneware mugs",
  customer: "Coffee lovers buying gifts",
  location: "",
  presence: "online",
  problem: "",
  outcome: "",
  offer: "free shipping over $60",
  proof: "thrown and glazed in our own studio",
  objection: "",
  goal: "sales",
  avoid: ["cheap"],
  niche: "ecommerce",
  website: "https://harbourmugs.example",
};

const input = (over: Partial<ReadinessInput> = {}, facts: Partial<ConfirmedFacts> = {}): ReadinessInput => ({
  words: { hook: "Mugs made by hand, one at a time.", body: "Free shipping over $60. Handmade stoneware mugs from our studio.", cta: "Shop now" },
  facts: { ...base, ...facts },
  brand: { ...NO_RULES, offers: ["free shipping over $60"] },
  media: { kind: "image", aspect: "4:5" },
  tracking: { pixelSeesResult: true },
  ...over,
});
const areaOf = (r: ReturnType<typeof readiness>, key: string) => r.areas.find((a) => a.key === key)!;

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function org(id: string, name: string) {
  await db.organization.create({ data: { id, name, website: "https://harbourmugs.example" } });
  await db.metaAdAccount.create({ data: { organizationId: id, metaAdAccountId: `act_${id}`, accessToken: encryptSecret("fake-token"), status: "CONNECTED", pageId: "1234" } });
  for (const [field, value, list] of [["focusItem", "Handmade stoneware mugs", false], ["targetCustomer", "Coffee lovers buying gifts", false], ["offers", "free shipping over $60", true], ["usps", "thrown and glazed in our own studio", true], ["painPoints", "mugs that chip in the dishwasher", true]] as const) {
    const r = await changeBrain(id, list ? { op: "add", field, value } : { op: "set", field, value }, "customer");
    assert.equal(r.ok, true);
  }
}

async function approveWithVideo(organizationId: string, angleId: string) {
  const url = `https://blob.example/ad-media/${organizationId}/video-${angleId}.mp4`;
  const saved = await saveOwnerVideo(organizationId, `${organizationId}-user`, { angleId, url, posterUrl: url.replace(".mp4", ".jpg"), name: "studio.mp4", durationMs: 18_000, width: 1080, height: 1920, bytes: 4_000_000 });
  assert.ok(saved.ok);
  const cur = (await listSuggestions(organizationId)).directions.find((x) => x.id === angleId)!;
  const r = await approveCreative(organizationId, `${organizationId}-user`, { angleId, revisionId: cur.words!.revisionId, videoRevisionId: cur.videos[0].revisionId });
  assert.ok(r.ok, r.ok ? "" : r.error);
}

async function main() {
  console.log("Directions: who, where, why, and the right button");

  await check("the button fits the business: a shop, a local service, B2B software, an agency", () => {
    assert.equal(ctaFor({ goal: "sales", niche: "ecommerce" }), "Shop now");
    assert.equal(ctaFor({ goal: "leads", niche: "home_services" }), "Get a quote");
    assert.equal(ctaFor({ goal: "bookings", niche: "beauty" }), "Book now");
    assert.equal(ctaFor({ goal: "leads", niche: "saas" }), "Sign up");
    assert.equal(ctaFor({ goal: "leads", niche: "professional" }), "Contact us");
    assert.equal(ctaFor({ goal: "bookings", niche: "professional" }), "Book now");
  });

  await check("built directions carry that button", () => {
    const saas = buildDirections({ ...base, niche: "saas", goal: "leads", offering: "Scheduling software for clinics", offer: "", proof: "set up in a day" }).directions;
    assert.ok(saas.length > 0 && saas.every((d) => d.cta === "Sign up"));
    const agency = buildDirections({ ...base, niche: "professional", goal: "leads", offering: "Bookkeeping for restaurants", offer: "", presence: "local", location: "Leeds" }).directions;
    assert.ok(agency.length > 0 && agency.every((d) => d.cta === "Contact us"));
  });

  await check("who it's for and where it sends people — from confirmed facts, or saying what's missing", () => {
    assert.equal(audienceFor({ customer: "coffee lovers buying gifts", location: "", presence: "online" }), "Coffee lovers buying gifts");
    assert.match(audienceFor({ customer: "homeowners", location: "Bristol", presence: "local" }), /Homeowners in and around Bristol/);
    assert.match(audienceFor({ customer: "", location: "", presence: "" }), /confirm an ideal customer/);
    assert.equal(destinationFor({ goal: "sales", website: "https://harbourmugs.example/" }), "Your website, harbourmugs.example");
    assert.match(destinationFor({ goal: "sales", website: "" }), /add its address/);
    assert.match(destinationFor({ goal: "leads", website: "" }), /form inside the ad/);
    assert.match(destinationFor({ goal: "bookings", website: "salon.example" }), /booking page on salon\.example/);
  });

  await check("a turned-down kind is left out of new suggestions", () => {
    const all = buildDirections(base).directions.map((d) => d.kind);
    const without = buildDirections(base, { exclude: [all[0]] }).directions.map((d) => d.kind);
    assert.ok(!without.includes(all[0]));
    assert.equal(buildDirections(base, { exclude: [all[0]] }).directions[0].recommended, true, "the best remaining one is recommended");
  });

  console.log("Readiness check");

  await check("a clean ad scores well; the label says it's not a prediction", () => {
    const r = readiness(input());
    assert.ok(r.score >= 90, String(r.score));
    assert.equal(r.areas.length, 7);
    assert.equal(r.label, READINESS_LABEL);
    assert.match(r.label, /not a prediction/);
    assert.equal(r.fixes.length, 0);
  });

  await check("message: no opening line is a fix; a long one offers 'shorten'; capitals are flagged", () => {
    assert.equal(areaOf(readiness(input({ words: { hook: "", body: "x", cta: "Shop now" } })), "message").state, "fix");
    const long = readiness(input({ words: { hook: "Our handmade stoneware mugs are thrown and glazed in our own studio, then fired twice so they last for years.", body: "", cta: "Shop now" } }));
    assert.equal(areaOf(long, "message").state, "improve");
    assert.ok(long.fixes.some((f) => f.kind === "shorten-hook"));
    assert.equal(areaOf(readiness(input({ words: { hook: "HANDMADE MUGS", body: "", cta: "Shop now" } })), "message").state, "improve");
  });

  await check("offer: a confirmed offer left out is flagged with 'add your offer'; none confirmed doesn't count", () => {
    const missing = readiness(input({ words: { hook: "Mugs made by hand.", body: "Handmade stoneware mugs.", cta: "Shop now" } }));
    assert.equal(areaOf(missing, "offer").state, "improve");
    assert.ok(missing.fixes.some((f) => f.kind === "add-offer"));
    const none = readiness(input({}, { offer: "" }));
    assert.equal(areaOf(none, "offer").state, "na");
    assert.equal(areaOf(none, "offer").score, null);
  });

  await check("brand: a word to avoid is a fix; an unconfirmed claim is flagged", () => {
    assert.equal(areaOf(readiness(input({ words: { hook: "Cheap mugs, made by hand.", body: "", cta: "Shop now" } })), "brand").state, "fix");
    assert.equal(areaOf(readiness(input({ words: { hook: "The best mugs in the country.", body: "Free shipping over $60.", cta: "Shop now" } })), "brand").state, "improve");
  });

  await check("button: one that doesn't ask for the goal is flagged, and the fix uses the goal's button", () => {
    const r = readiness(input({ words: { hook: "Mugs made by hand.", body: "Free shipping over $60.", cta: "Learn more" } }));
    assert.equal(areaOf(r, "cta").state, "improve");
    assert.ok(r.fixes.some((f) => f.kind === "match-cta" && f.label.includes("Shop now")));
    const saas = readiness(input({ words: { hook: "Book clinic visits in a click.", body: "", cta: "Sign up" } }, { niche: "saas", goal: "leads", offer: "", offering: "Clinic scheduling software", website: "" }));
    assert.equal(areaOf(saas, "cta").state, "good");
  });

  await check("format: no picture or video is a fix that says the previews are illustrative; a wide video is flagged", () => {
    const none = readiness(input({ media: { kind: "none" } }));
    assert.equal(areaOf(none, "format").state, "fix");
    assert.match(areaOf(none, "format").note, /illustrative/);
    assert.equal(areaOf(readiness(input({ media: { kind: "video", aspect: "16:9" } })), "format").state, "improve");
    assert.equal(areaOf(readiness(input({ media: { kind: "video", aspect: "9:16" } })), "format").state, "good");
    assert.equal(aspectOf(1920, 1080), "16:9");
    assert.equal(aspectOf(1080, 1920), "9:16");
    assert.equal(aspectOf(1080, 1350), "4:5");
    assert.equal(aspectOf(1080, 1080), "1:1");
  });

  await check("landing: a sales ad without a website is a fix; an ad that doesn't name what's on the page is flagged", () => {
    assert.equal(areaOf(readiness(input({}, { website: "" })), "landing").state, "fix");
    const off = readiness(input({ words: { hook: "Something for your mornings.", body: "Free shipping over $60.", cta: "Shop now" } }));
    assert.equal(areaOf(off, "landing").state, "improve");
  });

  await check("tracking: only a verified pixel counts; unknown is said as unknown; lead forms need no pixel", () => {
    assert.equal(areaOf(readiness(input({ tracking: { pixelSeesResult: false } })), "tracking").state, "fix");
    const enquiries = areaOf(readiness(input({ words: { hook: "Leaking tap?", body: "", cta: "Get a quote" }, tracking: { pixelSeesResult: false } }, { goal: "leads", niche: "home_services", offering: "Emergency plumbing", offer: "", website: "plumber.example" })), "tracking");
    assert.equal(enquiries.state, "improve", "for leads, a form inside the ad works without a pixel, so it's not a blocker");
    assert.doesNotMatch(enquiries.note, /buys/);
    assert.equal(areaOf(readiness(input({ tracking: { pixelSeesResult: null } })), "tracking").state, "improve");
    const leads = readiness(input({ words: { hook: "Leaking tap?", body: "", cta: "Get a quote" }, tracking: { pixelSeesResult: null, leadFormReady: true } }, { goal: "leads", niche: "home_services", offering: "Emergency plumbing", offer: "", website: "plumber.example" }));
    assert.equal(areaOf(leads, "tracking").state, "good");
    assert.deepEqual(trackingReadiness({ stage: { stage: "verified" }, requiredEvent: "Purchase" }), { pixelSeesResult: true, leadFormReady: false, stage: "verified" });
    assert.equal(trackingReadiness({ stage: { stage: "no_asset" }, requiredEvent: "Purchase" }).pixelSeesResult, false);
    assert.equal(trackingReadiness({ stage: { stage: "installation_detected" }, requiredEvent: "Purchase" }).pixelSeesResult, null);
    assert.equal(trackingReadiness({ stage: { stage: "no_asset" }, requiredEvent: null }).leadFormReady, true);
    assert.deepEqual(trackingReadiness(null), { pixelSeesResult: null, leadFormReady: false, stage: null });
  });

  await check("something to fix before running caps the score, whatever the other areas say", () => {
    const blocked = readiness(input({ media: { kind: "none" } }));
    assert.ok(blocked.areas.some((a) => a.state === "fix"));
    assert.ok(blocked.score <= BLOCKED_MAX, String(blocked.score));
    assert.ok(readiness(input()).score > BLOCKED_MAX);
  });

  await check("'Improve this ad' fixes use only confirmed facts, and raise the score", () => {
    const w = { hook: "Our handmade stoneware mugs are thrown and glazed in our own studio, then fired twice so they last for years.", body: "Handmade stoneware mugs.", cta: "Learn more" };
    const before = readiness(input({ words: w }));
    const fixed = applyFixes(w, before.fixes, base);
    assert.equal(fixed.cta, "Shop now");
    assert.ok(fixed.hook.length <= 90, fixed.hook);
    assert.match(fixed.body, /Free shipping over \$60\./);
    assert.ok(readiness(input({ words: fixed })).score > before.score);
    assert.equal(applyFixes(w, [{ kind: "add-offer", label: "" }], { ...base, offer: "" }).body, w.body, "no confirmed offer, nothing added");
    assert.equal(shortenedHook("Short and clear."), "Short and clear.");
  });

  console.log("MAIRO's rewrite, checked before the owner sees it");
  const current = { hook: "Mugs made by hand.", body: "Free shipping over $60.", cta: "Shop now" };
  const facts = "Business: Harbour Mugs\nStanding offer: free shipping over $60";

  await check("a sentence with a number the business never gave is dropped", () => {
    const r = settleRewrite({ hook: "Hand-thrown mugs, made to last.", body: "Rated 4.9 by 2,000 customers. Free shipping over $60.", cta: "Shop now", note: "Warmer." }, current, facts, []);
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.words.body, "Free shipping over $60.");
      assert.ok(r.dropped.length > 0);
    }
    const hook = settleRewrite({ hook: "30% off handmade mugs.", body: "Glazed in our own studio. Free shipping over $60.", cta: "Shop now" }, current, facts, []);
    assert.ok(hook.ok && hook.words.hook === current.hook && hook.dropped.includes("30%"), "an invented discount in the opening line keeps the current one");
    const only = settleRewrite({ hook: "30% off handmade mugs.", body: current.body, cta: "Shop now" }, current, facts, []);
    assert.ok(!only.ok, "when the invented number was the only change, nothing is proposed");
  });

  await check("words to avoid stop it; the button stays one MAIRO can run; no change is said plainly", () => {
    const avoided = settleRewrite({ hook: "Cheap, handmade mugs.", body: "", cta: "Shop now" }, current, facts, ["cheap"]);
    assert.ok(!avoided.ok && /avoid/.test(avoided.error));
    const odd = settleRewrite({ hook: "Hand-thrown mugs.", body: "", cta: "Grab yours!!" }, current, facts, []);
    assert.ok(odd.ok && odd.words.cta === "Shop now");
    const cased = settleRewrite({ hook: "Hand-thrown mugs.", body: "", cta: "book now" }, current, facts, []);
    assert.ok(cased.ok && cased.words.cta === "Book now" && (BUTTONS as readonly string[]).includes(cased.words.cta));
    const same = settleRewrite({ ...current, note: "" }, current, facts, []);
    assert.ok(!same.ok);
    const couldnt = settleRewrite({ ...current, note: "MAIRO doesn't know about a new product yet — add it in the Business Brain.", couldNot: true }, current, facts, []);
    assert.ok(!couldnt.ok && /Business Brain/.test(couldnt.error));
    const tooLong = settleRewrite({ hook: "x".repeat(170), body: "", cta: "Shop now" }, current, facts, []);
    assert.ok(!tooLong.ok);
  });

  console.log("Previews and library filters");

  await check("previews say when they're illustrations, and which version they show", () => {
    assert.match(mockLabel("ig-feed", { kind: "none" }), /^Illustrative mock-up/);
    assert.match(mockLabel("fb-feed", { kind: "image", url: "x", version: 3 }), /your picture \(version 3\)/);
    assert.match(mockLabel("reels", { kind: "image", url: "x" }), /covered by Reels/);
    assert.match(mockLabel("square", { kind: "image", url: "x" }), /Meta may crop differently/);
    assert.match(mockLabel("stories", { kind: "video", posterUrl: null, aspect: "9:16", firstCaption: null, version: 2 }), /edit version 2/);
  });

  await check("library filters: by source, by stage, and search", () => {
    assert.ok(inFilter({ source: "suggested", stage: "approved" }, "approved"));
    assert.ok(inFilter({ source: "suggested", stage: "approved" }, "suggested"));
    assert.ok(!inFilter({ source: "generated", stage: "draft" }, "approved"));
    assert.ok(inFilter({ source: "launched", stage: "launched" }, "launched"));
    assert.ok(!inFilter({ source: "suggested", stage: "turned-down" }, "draft"));
    assert.ok(matchesSearch({ title: "Lead with your offer", text: "Free shipping", context: null }, "shipping"));
    assert.ok(!matchesSearch({ title: "Lead with your offer", text: null, context: null }, "plumbing"));
  });

  console.log("Turning directions down (database)");
  await cleanup();
  await org(A, "Harbour Mugs");
  await org(B, "Other Business");
  await ensureDirections(A, null);
  await ensureDirections(B, null);

  await check("turned down: kept with its reason, a different kind in its place, the recommendation moves on", async () => {
    const before = await listSuggestions(A);
    assert.equal(before.directions.length, 3);
    const rec = before.directions.find((d) => d.recommended)!;
    assert.ok(rec.audience && rec.destination, "each says who it's for and where it sends people");
    const r = await rejectDirection(A, "user-a", rec.id, "Not right for our brand");
    assert.ok(r.ok);
    const after = await listSuggestions(A);
    assert.ok(!after.directions.some((d) => d.id === rec.id), "no longer among the suggestions");
    assert.equal(after.rejected[0]?.id, rec.id);
    assert.equal(after.rejected[0]?.reason, "Not right for our brand");
    if (r.ok && r.replacement) {
      assert.equal(after.directions.length, 3);
      assert.ok(!after.directions.some((d) => d.kind === rec.kind), "not the same kind again");
    }
    assert.equal(after.directions.filter((d) => d.recommended).length, 1, "one recommended first test");
  });

  await check("suggesting new directions never brings a turned-down kind back", async () => {
    const rejectedKind = (await db.adAngle.findFirst({ where: { organizationId: A, status: "REJECTED" } }))!.angleKind;
    await refreshDirections(A, null);
    const now = await listSuggestions(A);
    assert.ok(now.directions.length > 0);
    assert.ok(!now.directions.some((d) => d.kind === rejectedKind));
    assert.equal((await db.adAngle.count({ where: { organizationId: A, status: "REJECTED" } })), 1, "the turned-down one is kept, with its reason");
  });

  await check("brought back: among the suggestions again", async () => {
    const rejected = (await db.adAngle.findFirst({ where: { organizationId: A, status: "REJECTED" } }))!;
    assert.deepEqual(await bringBackDirection(B, rejected.id), { ok: false, error: "That direction isn't one you turned down." }, "another business can't");
    assert.ok((await bringBackDirection(A, rejected.id)).ok);
    assert.ok((await listSuggestions(A)).directions.some((d) => d.id === rejected.id));
  });

  await check("turning down a direction in a proposed test stops that test; in an approved test it's refused", async () => {
    const dirs = (await listSuggestions(A)).directions;
    await approveWithVideo(A, dirs[0].id);
    await approveWithVideo(A, dirs[1].id);
    const proposed = await db.creativeExperiment.findFirst({ where: { organizationId: A, status: "PROPOSED" } });
    assert.ok(proposed, "two approvals propose a test");
    const r = await rejectDirection(A, "user-a", dirs[1].id, "");
    assert.ok(r.ok);
    assert.equal((await db.creativeExperiment.findUnique({ where: { id: proposed!.id } }))!.status, "CANCELED");
    assert.equal(await db.creativeApproval.count({ where: { organizationId: A, angleId: dirs[1].id, revokedAt: null } }), 0, "its approval is withdrawn");

    const third = (await listSuggestions(A)).directions.find((d) => d.id !== dirs[0].id && !d.approval)!;
    await approveWithVideo(A, third.id);
    const next = await db.creativeExperiment.findFirst({ where: { organizationId: A, status: "PROPOSED" } });
    assert.ok(next);
    assert.ok((await approveExperiment(A, "user-a", next!.id)).ok);
    const refused = await rejectDirection(A, "user-a", third.id, "");
    assert.ok(!refused.ok && /Stop the test first/.test(refused.error));
  });

  await check("another business can't turn down this one's direction", async () => {
    const mine = (await listSuggestions(A)).directions[0];
    const r = await rejectDirection(B, "user-b", mine.id, "");
    assert.ok(!r.ok);
    assert.notEqual((await db.adAngle.findUnique({ where: { id: mine.id } }))!.status, "REJECTED");
  });

  await check("'Improve this ad' and MAIRO's rewrites are recorded as such in the version history", async () => {
    const d = (await listSuggestions(A)).directions.find((x) => !x.approval)!;
    const fixed = await reviseDirection(A, "user-a", d.id, { hook: "Mugs made by hand.", body: d.words!.body, cta: "Shop now" }, "fix");
    assert.ok(fixed.ok);
    const ai = await reviseDirection(A, "user-a", d.id, { hook: "Hand-thrown mugs, made to last.", body: d.words!.body, cta: "Shop now" }, "ai");
    assert.ok(ai.ok);
    const history = (await listSuggestions(A)).directions.find((x) => x.id === d.id)!.history;
    assert.deepEqual(history.slice(0, 2).map((h) => h.source), ["ai", "fix"]);
  });

  console.log("Creative Library (database)");

  await check("one business's creatives only, by source and stage, with no invented results", async () => {
    const a = await loadCreativeLibrary(A, []);
    const b = await loadCreativeLibrary(B, []);
    const aIds = new Set((await db.adAngle.findMany({ where: { organizationId: A }, select: { id: true } })).map((x) => `angle:${x.id}`));
    assert.ok(a.length > 0 && b.length > 0);
    assert.ok(b.every((i) => !aIds.has(i.key)), "B never sees A's directions");
    assert.ok(a.some((i) => i.source === "suggested" && i.stage === "approved"));
    assert.ok(a.some((i) => i.source === "uploaded" && i.kind === "video"));
    assert.ok(a.every((i) => i.performance === null), "nothing ran, so no results are shown");
    const launched = await loadCreativeLibrary(A, [
      { id: "ad1", name: "Ran", kind: "IMAGE", preview: null, headline: null, primaryText: null, cta: null, reason: null, campaignId: "c1", campaignName: "Spring", status: "Active", goal: "Sales", family: "sales", results: null, spendCents: null, costPerResultCents: null, resultText: "No results yet", date: "2026-10-01" },
      { id: "ad2", name: "Ran too", kind: "IMAGE", preview: null, headline: null, primaryText: null, cta: null, reason: null, campaignId: "c1", campaignName: "Spring", status: "Active", goal: "Sales", family: "sales", results: 4, spendCents: 8000, costPerResultCents: 2000, resultText: "4 purchases", date: "2026-10-02" },
    ]);
    assert.equal(launched.find((i) => i.key === "ad:ad1")!.performance, null, "no figures from Meta, none shown");
    assert.equal(launched.find((i) => i.key === "ad:ad2")!.performance?.resultText, "4 purchases");
  });

  await cleanup();
  console.log(`\n${passed} checks passed`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => null);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
