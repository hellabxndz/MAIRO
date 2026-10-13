// Checks creative tests — no Meta call, nothing published, nothing spent:
//
//   - the verdict: a winner only with a week of running, enough results, a
//     gap chance is unlikely to explain, and more than a sliver of the spend
//     for each ad; "no clear difference" and "couldn't tell" are said as
//     such; an ad Meta starved is called untested, not a loser;
//   - the lifecycle on the database: proposed when two directions are
//     approved, approved by the owner, a campaign draft with both versions on
//     the same picture, linked by position at launch, started only when the
//     campaign is live, judged daily on per-ad figures, concluded once;
//   - a winner adds a proposal to switch off the other ad that waits for the
//     owner — the test itself changes nothing in the ad account;
//   - while a test runs, the daily rules leave its ads alone;
//   - one business can't see, approve, stop or check another's test.
//
//   npm run check:experiments   (needs the local database)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { encryptSecret } from "../src/lib/crypto/secret-box";
import { changeBrain } from "../src/lib/brain/store";
import { approveCreative, ensureDirections, listSuggestions, reviseDirection, saveOwnerVideo } from "../src/lib/suggested-ads/store";
import { EVIDENCE, binomialPValue, judge, type VariantFigures } from "../src/lib/experiments/verdict";
import {
  approveExperiment,
  campaignsUnderTest,
  cancelExperiment,
  checkExperiment,
  currentExperiment,
  draftFromExperiment,
  linkExperimentCampaign,
  type CheckDeps,
} from "../src/lib/experiments/store";
import type { PlatformMetrics } from "../src/lib/ad-platforms/types";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-exp";
const A = `${TAG}-a`;
const B = `${TAG}-b`;
const DAY = 86_400_000;

const v = (label: string, spendDollars: number, results: number): VariantFigures => ({ label, spendCents: spendDollars * 100, impressions: spendDollars * 100, clicks: spendDollars * 2, results });

function metrics(spendCents: number, purchases: number): PlatformMetrics {
  const blank = Object.fromEntries(
    ["spendCents", "impressions", "reach", "clicks", "ctr", "cpcCents", "cpmCents", "conversions", "purchases", "costPerPurchaseCents", "revenueCents", "roas", "videoViews", "videoViews2s", "videoViews6s", "leads", "bookings", "contacts", "landingPageViews", "engagement"].map((k) => [k, null]),
  ) as unknown as PlatformMetrics;
  return { ...blank, spendCents, impressions: spendCents, clicks: Math.round(spendCents / 50), purchases, conversions: purchases };
}

/** Meta's per-ad figures, as a fixture: one set per check. */
function fixture(byAd: Record<string, [number, number]> | null): CheckDeps {
  return {
    perAd: async () =>
      byAd === null
        ? { ok: false, error: "Meta was unavailable" }
        : { ok: true, data: Object.entries(byAd).map(([externalAdId, [spend, results]]) => ({ externalAdId, metrics: metrics(spend, results) })) },
  };
}

async function cleanup() {
  await db.campaignDraft.deleteMany({ where: { organizationId: { startsWith: TAG } } });
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function org(id: string, name: string) {
  await db.organization.create({ data: { id, name } });
  await db.metaAdAccount.create({ data: { organizationId: id, metaAdAccountId: `act_${id}`, accessToken: encryptSecret("fake-token"), status: "CONNECTED", pageId: "1234" } });
  for (const [field, value, list] of [["focusItem", "Handmade stoneware mugs", false], ["targetCustomer", "Coffee lovers buying gifts", false], ["offers", "free shipping over $60", true], ["usps", "thrown and glazed in our own studio", true]] as const) {
    const r = await changeBrain(id, list ? { op: "add", field, value } : { op: "set", field, value }, "customer");
    assert.equal(r.ok, true);
  }
}

async function picture(organizationId: string, angleId: string) {
  return db.creativeStudioAsset.create({
    data: { organizationId, source: "PROMPT", format: "PORTRAIT", angleId, versions: { create: [{ version: 1, kind: "GENERATE", instruction: "test", status: "COMPLETE", imageUrl: `https://example.test/${organizationId}/${angleId}.png` }] } },
    include: { versions: true },
  });
}

/**
 * Approve two directions, as an owner would — the recommended one with the
 * owner's own video (test data in the business's upload folder), the other
 * with a picture — and MAIRO then proposes the test.
 */
async function approveTwo(organizationId: string) {
  await ensureDirections(organizationId, `${organizationId}-user`);
  const dirs = (await listSuggestions(organizationId)).directions;
  const ordered = [...dirs.filter((d) => d.recommended), ...dirs.filter((d) => !d.recommended)];
  for (const [i, d] of ordered.slice(0, 2).entries()) {
    if (i === 0) {
      const url = `https://store.public.blob.vercel-storage.com/ad-media/${organizationId}/clip-${d.id}.mp4`;
      const saved = await saveOwnerVideo(organizationId, `${organizationId}-user`, { angleId: d.id, url, posterUrl: url.replace(".mp4", ".jpg"), name: "studio.mp4", durationMs: 18_000, width: 1080, height: 1920, bytes: 4_000_000 });
      assert.ok(saved.ok, "video saved");
      const cur = (await listSuggestions(organizationId)).directions.find((x) => x.id === d.id)!;
      const r = await approveCreative(organizationId, `${organizationId}-user`, { angleId: d.id, revisionId: cur.words!.revisionId, videoRevisionId: cur.videos[0].revisionId });
      assert.equal(r.ok, true, r.ok ? "" : r.error);
    } else {
      const pic = await picture(organizationId, d.id);
      const r = await approveCreative(organizationId, `${organizationId}-user`, { angleId: d.id, revisionId: d.words!.revisionId, studioVersionId: pic.versions[0].id });
      assert.equal(r.ok, true, r.ok ? "" : r.error);
    }
  }
  return dirs;
}

/** What createCampaignAction leaves behind: the campaign, its Meta half and one row per ad. */
async function launched(organizationId: string, draftId: string, ads: number, status: "PENDING_REVIEW" | "ACTIVE" = "PENDING_REVIEW") {
  const draft = await db.campaignDraft.findFirstOrThrow({ where: { id: draftId, organizationId } });
  const plan = draft.data as { copyOptions: { primaryText: string; headline: string }[] };
  const c = await db.mairoCampaign.create({
    data: {
      organizationId,
      name: "Mug test",
      objective: "SALES",
      status,
      totalDailyBudgetCents: 2000,
      platformCampaigns: { create: { platform: "META", externalCampaignId: `cmp-${draftId}`, externalAdId: `ad0-${draftId}`, extraExternalAdIds: Array.from({ length: ads - 1 }, (_, i) => `ad${i + 1}-${draftId}`), budgetPercent: 100, dailyBudgetCents: 2000, status } },
      ads: { create: plan.copyOptions.slice(0, ads).map((o, i) => ({ position: i, kind: "IMAGE", headline: o.headline, primaryText: o.primaryText })) },
    },
  });
  await linkExperimentCampaign(organizationId, draftId, c.id);
  return c;
}

async function main() {
  await cleanup();

  console.log("— the verdict —");
  await check("the binomial test: no data is no evidence; an even split is chance; an extreme one isn't", () => {
    assert.equal(binomialPValue(0, 0, 0.5), 1);
    assert.ok(Math.abs(binomialPValue(10, 20, 0.5) - 1) < 1e-9);
    assert.ok(Math.abs(binomialPValue(20, 20, 0.5) - 2 * 0.5 ** 20) < 1e-12);
    assert.ok(binomialPValue(7, 10, 0.5) > 0.3);
  });
  await check("nothing is called in the first week, whatever the figures", () => {
    const r = judge([v("A", 300, 40), v("B", 300, 5)], 4, "purchase");
    assert.equal(r.kind, "waiting");
    if (r.kind === "waiting") assert.match(r.missing.join(" "), /3 more days/);
  });
  await check("too few results: it says how many more are needed", () => {
    const r = judge([v("A", 200, 8), v("B", 200, 4)], 10, "lead");
    assert.equal(r.kind, "waiting");
    if (r.kind === "waiting") assert.match(r.missing.join(" "), /8 more leads across both ads/);
  });
  await check("a clear gap with enough results is a winner, judged by cost per result", () => {
    const r = judge([v("Problem first", 300, 30), v("Offer first", 300, 8)], 10, "purchase");
    assert.equal(r.kind, "winner");
    if (r.kind === "winner") {
      assert.equal(r.winner, 0);
      assert.deepEqual(r.losers, [1]);
      assert.ok(r.pValue < EVIDENCE.significance);
      assert.match(r.detail, /\$10 each/);
    }
  });
  await check("the leader is the cheaper ad per result, not the one with more results", () => {
    const r = judge([v("A", 600, 24), v("B", 150, 18)], 12, "purchase");
    assert.notEqual(r.kind === "winner" ? r.winner : 1, 0);
    if (r.kind === "winner") assert.equal(r.winner, 1);
  });
  await check("an ad Meta starved is 'not really tested', never a loser", () => {
    const r = judge([v("A", 950, 30), v("B", 50, 0)], 9, "purchase");
    assert.equal(r.kind, "unfair");
    if (r.kind === "unfair") assert.equal(r.starved, 1);
  });
  await check("close results with plenty of evidence are 'no clear difference'", () => {
    const r = judge([v("A", 350, 35), v("B", 340, 33)], 12, "purchase");
    assert.equal(r.kind, "no-difference");
  });
  await check("within 15% is no difference even when the test would call it", () => {
    const r = judge([v("A", 10000, 1000), v("B", 10000, 880)], 20, "purchase");
    assert.equal(r.kind, "no-difference");
  });
  await check("after four weeks without enough, the test ends and says it couldn't tell", () => {
    const r = judge([v("A", 100, 6), v("B", 100, 5)], 28, "lead");
    assert.equal(r.kind, "inconclusive");
    assert.equal(r.final, true);
  });
  await check("a gap that could be chance waits rather than guessing", () => {
    const r = judge([v("A", 300, 14), v("B", 300, 9)], 10, "purchase");
    assert.equal(r.kind, "waiting");
  });
  await check("three versions: the bar is higher (each comparison must clear it)", () => {
    const two = judge([v("A", 300, 30), v("B", 300, 14)], 10, "purchase");
    const three = judge([v("A", 300, 30), v("B", 300, 14), v("C", 300, 13)], 10, "purchase");
    if (two.kind === "winner" && three.kind === "winner") assert.ok(three.pValue >= 0);
    assert.ok(two.kind === "winner" || two.kind === "waiting");
  });
  await check("a campaign with one ad has nothing to compare", () => {
    assert.equal(judge([v("A", 300, 30)], 10, "purchase").kind, "inconclusive");
  });

  console.log("— the lifecycle —");
  await org(A, "Fernleaf Ceramics");
  await org(B, "Other Co");
  const dirs = await approveTwo(A);
  let test = (await currentExperiment(A))!;

  await check("two approved directions propose one test, recommended direction first — not running", async () => {
    assert.ok(test);
    assert.equal(test.status, "PROPOSED");
    assert.equal(test.variants.length, 2);
    const recommended = dirs.find((d) => d.recommended)!;
    assert.equal(test.variants[0].label, recommended.title);
    assert.equal(await db.creativeExperiment.count({ where: { organizationId: A } }), 1);
  });
  await check("another business can't approve, stop, build or check it", async () => {
    assert.equal((await approveExperiment(B, "user-b", test.id)).ok, false);
    assert.equal((await cancelExperiment(B, test.id)).ok, false);
    assert.equal((await draftFromExperiment(B, "user-b", test.id)).ok, false);
    assert.equal((await checkExperiment(B, test.id)).ok, false);
    assert.equal(await currentExperiment(B), null);
  });
  await check("building before approving is refused", async () => {
    const r = await draftFromExperiment(A, "user-a", test.id);
    assert.equal(r.ok, false);
  });
  await check("approving twice at once approves once", async () => {
    const [x, y] = await Promise.all([approveExperiment(A, "user-a", test.id), approveExperiment(A, "user-a", test.id)]);
    assert.equal([x, y].filter((r) => r.ok).length, 1);
    test = (await currentExperiment(A))!;
    assert.equal(test.status, "APPROVED");
    assert.ok(test.approvedAt);
  });
  await check("approving more directions while a test is open doesn't start a second one", async () => {
    const third = dirs[2];
    const pic = await picture(A, third.id);
    await approveCreative(A, "user-a", { angleId: third.id, revisionId: third.words!.revisionId, studioVersionId: pic.versions[0].id });
    assert.equal(await db.creativeExperiment.count({ where: { organizationId: A } }), 1);
  });

  let draftId = "";
  await check("the test's draft: both versions as test ads on the first version's picture — made once", async () => {
    const r = await draftFromExperiment(A, "user-a", test.id);
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    if (!r.ok) return;
    draftId = r.draftId;
    const again = await draftFromExperiment(A, "user-a", test.id);
    assert.equal(again.ok && again.draftId, draftId);
    const plan = (await db.campaignDraft.findFirstOrThrow({ where: { id: draftId } })).data as { testing: boolean; testPicks: number[]; chosenCopy: number; copyOptions: { primaryText: string; angle: string }[]; adChoice: string; video: { url: string } | null; experimentId: string };
    assert.equal(plan.testing, true);
    assert.deepEqual(plan.testPicks, [1]);
    assert.equal(plan.chosenCopy, 0);
    assert.equal(plan.copyOptions.length, 2);
    assert.equal(plan.experimentId, test.id);
    const first = dirs.find((d) => d.title === test.variants[0].label)!;
    const second = dirs.find((d) => d.title === test.variants[1].label)!;
    assert.match(plan.copyOptions[0].primaryText, new RegExp(first.words!.hook.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(plan.copyOptions[1].primaryText, new RegExp(second.words!.hook.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(plan.adChoice, "video");
    assert.ok(plan.video?.url.includes(`clip-${first.id}`), "one video for both versions: only the words differ");
  });

  let campaignId = "";
  await check("at launch the test learns which ad is which, by position, with the words that ran", async () => {
    const c = await launched(A, draftId, 2);
    campaignId = c.id;
    test = (await currentExperiment(A))!;
    assert.equal(test.mairoCampaignId, c.id);
    assert.equal(test.campaignDraftId, null);
    assert.deepEqual(test.variants.map((x) => x.position), [0, 1]);
    assert.ok(test.variants[1].primaryText);
  });
  await check("it doesn't start until Meta reports the campaign running", async () => {
    const r = await checkExperiment(A, test.id, new Date(), fixture({}));
    assert.ok(r.ok && r.view.status === "APPROVED" && r.view.startsAt === null);
    assert.ok((await campaignsUnderTest(A)).has(campaignId), "the daily rules already leave it alone");
  });
  const t0 = new Date();
  await check("once live it's running, from that moment", async () => {
    await db.mairoCampaign.update({ where: { id: campaignId }, data: { status: "ACTIVE" } });
    const r = await checkExperiment(A, test.id, t0, fixture({}));
    assert.ok(r.ok && r.view.status === "RUNNING");
    if (r.ok) assert.equal(r.view.startsAt, t0.toISOString());
  });
  await check("a failed read from Meta records nothing but the attempt", async () => {
    const before = (await db.creativeExperiment.findFirstOrThrow({ where: { id: test.id } })).resultJson;
    const r = await checkExperiment(A, test.id, new Date(t0.getTime() + 2 * DAY), fixture(null));
    assert.ok(r.ok);
    assert.equal((await db.creativeExperiment.findFirstOrThrow({ where: { id: test.id } })).resultJson, before);
  });
  await check("day 3: figures recorded, still collecting evidence", async () => {
    const r = await checkExperiment(A, test.id, new Date(t0.getTime() + 3 * DAY), fixture({ [`ad0-${draftId}`]: [9000, 9], [`ad1-${draftId}`]: [9000, 3] }));
    assert.ok(r.ok && r.view.status === "RUNNING");
    if (r.ok) {
      assert.equal(r.view.result?.verdict.kind, "waiting");
      assert.deepEqual(r.view.result?.figures.map((f) => f.results), [9, 3]);
      assert.equal(r.view.result?.word, "purchase");
    }
  });
  await check("day 10: a clear winner ends the test once, with a proposal that waits for the owner", async () => {
    const at = new Date(t0.getTime() + 10 * DAY);
    const figures = fixture({ [`ad0-${draftId}`]: [30000, 30], [`ad1-${draftId}`]: [30000, 8] });
    const [r1, r2] = await Promise.all([checkExperiment(A, test.id, at, figures), checkExperiment(A, test.id, at, figures)]);
    assert.ok(r1.ok && r2.ok);
    const row = await db.creativeExperiment.findFirstOrThrow({ where: { id: test.id } });
    assert.equal(row.status, "CONCLUDED");
    assert.ok(row.conclusion && /brings in purchases for less/.test(row.conclusion));
    const decisions = await db.mairoDecision.findMany({ where: { organizationId: A, dedupeKey: `experiment:${test.id}:switch-off` } });
    assert.equal(decisions.length, 1, "one proposal, however many checks ran");
    assert.equal(decisions[0].status, "PENDING", "nothing is switched off until the owner approves");
    assert.equal(row.decisionId, decisions[0].id);
    const changes = JSON.parse(decisions[0].changesJson) as { type: string; externalAdId: string }[];
    assert.deepEqual(changes.map((c) => [c.type, c.externalAdId]), [["pause-ad", `ad1-${draftId}`]]);
    assert.equal((await campaignsUnderTest(A)).has(campaignId), false, "once concluded, the daily rules see the campaign again");
  });
  await check("a finished test isn't checked again", async () => {
    const r = await checkExperiment(A, test.id, new Date(t0.getTime() + 11 * DAY), fixture({ [`ad0-${draftId}`]: [1, 0], [`ad1-${draftId}`]: [99999, 999] }));
    assert.ok(r.ok && r.view.status === "CONCLUDED");
    if (r.ok) assert.equal(r.view.result?.verdict.kind, "winner");
  });

  console.log("— the other endings —");
  /** A fresh proposed → approved → launched test for business B. */
  async function freshTest(ads = 2) {
    await db.creativeExperiment.updateMany({ where: { organizationId: B, status: { in: ["PROPOSED", "APPROVED", "RUNNING"] } }, data: { status: "CANCELED" } });
    await db.creativeApproval.deleteMany({ where: { organizationId: B } });
    await db.adAngle.deleteMany({ where: { organizationId: B } });
    await approveTwo(B);
    const t = (await currentExperiment(B))!;
    assert.equal((await approveExperiment(B, "user-b", t.id)).ok, true);
    const d = await draftFromExperiment(B, "user-b", t.id);
    assert.ok(d.ok);
    const c = await launched(B, d.ok ? d.draftId : "", ads, "ACTIVE");
    return { t, c, draft: d.ok ? d.draftId : "" };
  }
  await check("built with one ad: the test stops and says why", async () => {
    const { t } = await freshTest(1);
    const row = await db.creativeExperiment.findFirstOrThrow({ where: { id: t.id } });
    assert.equal(row.status, "CANCELED");
    assert.match(row.conclusion ?? "", /one ad/);
  });
  await check("Meta starving one ad ends the test as 'not really tested' — no proposal", async () => {
    const { t, draft } = await freshTest();
    const start = new Date();
    await checkExperiment(B, t.id, start, fixture({}));
    const r = await checkExperiment(B, t.id, new Date(start.getTime() + 9 * DAY), fixture({ [`ad0-${draft}`]: [95000, 30], [`ad1-${draft}`]: [4000, 0] }));
    assert.ok(r.ok && r.view.status === "CONCLUDED" && r.view.result?.verdict.kind === "unfair");
    assert.equal(await db.mairoDecision.count({ where: { organizationId: B, dedupeKey: `experiment:${t.id}:switch-off` } }), 0);
  });
  await check("four weeks without enough results ends the test as 'couldn't tell'", async () => {
    const { t, draft } = await freshTest();
    const start = new Date();
    await checkExperiment(B, t.id, start, fixture({}));
    const r = await checkExperiment(B, t.id, new Date(start.getTime() + 28 * DAY), fixture({ [`ad0-${draft}`]: [6000, 4], [`ad1-${draft}`]: [6000, 3] }));
    assert.ok(r.ok && r.view.status === "CONCLUDED" && r.view.result?.verdict.kind === "inconclusive");
  });
  await check("the campaign deleted: the test stops", async () => {
    const { t, c } = await freshTest();
    await db.mairoCampaign.update({ where: { id: c.id }, data: { status: "ARCHIVED" } });
    const r = await checkExperiment(B, t.id, new Date(), fixture({}));
    assert.ok(r.ok && r.view.status === "CANCELED");
  });
  await check("stopping a running test leaves the campaign as it is", async () => {
    const { t, c } = await freshTest();
    await checkExperiment(B, t.id, new Date(), fixture({}));
    assert.equal((await cancelExperiment(B, t.id)).ok, true);
    assert.equal((await db.mairoCampaign.findFirstOrThrow({ where: { id: c.id } })).status, "ACTIVE");
    assert.equal((await cancelExperiment(B, t.id)).ok, false, "already finished");
  });
  await check("an ad edited after the test was written can't be approved into it", async () => {
    await db.creativeExperiment.updateMany({ where: { organizationId: B, status: { in: ["PROPOSED", "APPROVED", "RUNNING"] } }, data: { status: "CANCELED" } });
    await db.creativeApproval.deleteMany({ where: { organizationId: B } });
    await db.adAngle.deleteMany({ where: { organizationId: B } });
    const ds = await approveTwo(B);
    const t = (await currentExperiment(B))!;
    const edited = ds.find((d) => d.title === t.variants[1].label)!;
    await reviseDirection(B, "user-b", edited.id, { hook: "Something new entirely", body: edited.words!.body, cta: edited.words!.cta });
    const r = await approveExperiment(B, "user-b", t.id);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /changed/);
  });

  await cleanup();
  console.log(`\nCreative tests: ${passed} checks passed`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => null);
    await db.$disconnect();
    process.exit(1);
  });
