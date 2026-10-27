// Meta reliability: the changelog check's freshness, reviewed impact, whose
// problem an error is, pausing only what Meta is failing, recommendations
// that say what their figures rest on, and that none of it leaks a token or
// one business's data. Stubbed Meta and the local database only — nothing is
// sent to Meta, published or spent.
//
//   npm run check:meta-reliability   (needs the local database)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { encryptSecret } from "../src/lib/crypto/secret-box";
import { FRESH_FOR_MS, impactClass, monitorFreshness, type MonitorSource } from "../src/lib/meta-intelligence/impact";
import { checkSource } from "../src/lib/meta-intelligence/change-detector/run";
import { reviewImpact } from "../src/lib/meta-intelligence/pipeline";
import { classifyMetaFailure, retryDelayMs } from "../src/lib/meta-intelligence/errors/classify";
import { recordMetaError } from "../src/lib/meta-intelligence/errors/monitor";
import { hourOf, operationHealth, pausedMessage, successDrop, type Stat } from "../src/lib/meta-intelligence/operations/rules";
import { metaOperationPaused, recordOperation } from "../src/lib/meta-intelligence/operations";
import { integrationHealth } from "../src/lib/meta-intelligence/health";
import { versionAlerts } from "../src/lib/meta-intelligence/api-versioning/rules";
import { maybeGoLive } from "../src/lib/campaigns/auto-launch";
import { launchOne } from "../src/lib/campaigns/launch";
import { applyDecision } from "../src/lib/decisions/apply";
import { purchaseDataFrom, withDataBasis } from "../src/lib/decisions/data-basis";
import type { DecisionDraft } from "../src/lib/decisions/types";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-rel";
const ORG = `${TAG}-org`;
const OTHER = `${TAG}-other`;
const HOUR = 3_600_000;
const now = new Date();

const src = (over: Partial<MonitorSource>): MonitorSource => ({ key: "k", name: "Graph API changelog", url: "https://developers.facebook.com/docs/graph-api/changelog/", kind: "CHANGELOG", authority: "OFFICIAL", active: true, lastCheckedAt: null, lastSuccessAt: null, lastError: null, ...over });
const stat = (operation: string, over: Partial<Stat>, hour = hourOf(now)): Stat => ({ operation, hour, ok: 0, metaDown: 0, rateLimited: 0, account: 0, rejected: 0, ...over });

const draft = (over: Partial<DecisionDraft>): DecisionDraft => ({
  kind: "scale-winner", category: "BUDGET", urgent: false, mairoCampaignId: "c1", platform: "META", title: "t", noticed: "n", noticedAdvanced: "n", whyItMatters: "w", recommendation: "r", impact: "i",
  risk: "LOW", confidence: "HIGH", evidence: [{ label: "Cost per purchase", value: "$12" }],
  changes: [{ type: "set-budget", platform: "META", mairoCampaignId: "c1", platformCampaignId: "p1", externalCampaignId: "x1", campaignName: "Mugs", fromCents: 2000, toCents: 2600 }],
  dedupeKey: "d1", priority: 1, ...over,
});

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  await db.platformSource.deleteMany({ where: { key: { startsWith: `custom.${TAG}` } } });
  await db.platformUpdate.deleteMany({ where: { dedupeKey: { startsWith: TAG } } });
  await db.platformApiError.deleteMany({ where: { endpoint: { startsWith: `/${TAG}` } } });
}

async function main() {
  console.log("— is the changelog check current? —");
  await check("never read: 'Not checked yet', never current", () => {
    assert.equal(monitorFreshness([], now).state, "never");
    assert.equal(monitorFreshness([src({ lastCheckedAt: now, lastError: "HTTP 500" })], now).state, "never");
  });
  await check("read recently, every required page: current — with the read's time, not a claim of compatibility", () => {
    const f = monitorFreshness([src({ lastSuccessAt: new Date(now.getTime() - HOUR) }), src({ kind: "VERSIONS", lastSuccessAt: new Date(now.getTime() - 2 * HOUR) })], now);
    assert.equal(f.state, "current");
    assert.match(f.label, /^Checked /);
    assert.doesNotMatch(f.label + f.detail, /up to date|compatible|supported/i);
  });
  await check("the last attempt failed: 'Last check failed' even though an older read succeeded", () => {
    const f = monitorFreshness([src({ lastSuccessAt: new Date(now.getTime() - HOUR), lastCheckedAt: now, lastError: "HTTP 503" })], now);
    assert.equal(f.state, "failing");
    assert.match(f.detail, /HTTP 503/);
  });
  await check("too old, or a required page never read: stale", () => {
    assert.equal(monitorFreshness([src({ lastSuccessAt: new Date(now.getTime() - FRESH_FOR_MS - HOUR) })], now).state, "stale");
    assert.equal(monitorFreshness([src({ lastSuccessAt: now }), src({ kind: "VERSIONS" })], now).state, "stale");
  });
  await check("blogs, docs pages and unofficial hosts don't count toward freshness", () => {
    assert.equal(monitorFreshness([src({ kind: "DOCS", lastSuccessAt: now }), src({ authority: "TRUSTED", lastSuccessAt: now })], now).state, "never");
  });

  await cleanup();
  try {
    await check("a successful read records when; a failed one records the error and keeps the last success", async () => {
      const row = await db.platformSource.create({ data: { platform: "META", key: `custom.${TAG}.changelog`, name: "Test changelog", url: "https://developers.facebook.com/docs/zz-test-changelog/", kind: "CHANGELOG", authority: "OFFICIAL" } });
      const ok: typeof fetch = async () => new Response("<html><body><h2>v99.0</h2><p>Nothing new.</p></body></html>", { status: 200, headers: { "content-type": "text/html" } });
      const bad: typeof fetch = async () => new Response("down", { status: 503, headers: { "content-type": "text/html" } });
      const t1 = new Date(now.getTime() - 2 * HOUR);
      const r1 = await checkSource(row, { fetcher: ok, now: t1 });
      assert.ok(r1.ok);
      const after1 = await db.platformSource.findUniqueOrThrow({ where: { id: row.id } });
      assert.equal(after1.lastSuccessAt?.getTime(), t1.getTime());
      const r2 = await checkSource(row, { fetcher: bad, now });
      assert.equal(r2.ok, false);
      const after2 = await db.platformSource.findUniqueOrThrow({ where: { id: row.id } });
      assert.equal(after2.lastSuccessAt?.getTime(), t1.getTime(), "a failure doesn't move the last success");
      assert.match(after2.lastError ?? "", /503/);
      assert.equal(monitorFreshness([after2], now).state, "failing");
    });
    await check("a non-Meta address is never fetched, whatever the stored row says", async () => {
      let fetched = false;
      const r = await checkSource({ id: "x", key: "x", name: "x", url: "https://example.com/changelog", kind: "CHANGELOG", authority: "OFFICIAL" }, { fetcher: (async () => { fetched = true; return new Response(""); }) as typeof fetch });
      assert.equal(r.ok, false);
      assert.equal(fetched, false);
    });

    console.log("— what an update means for MAIRO —");
    await check("unreviewed: the detector's reading (informational or potentially breaking), never 'confirmed'", () => {
      assert.deepEqual(impactClass({ impact: null, risk: "NON_BREAKING", urgency: "LOW", changeType: "NEW_FEATURE" }), { cls: "informational", reviewed: false });
      assert.deepEqual(impactClass({ impact: null, risk: "UNKNOWN", urgency: "LOW", changeType: "REMOVED_FIELD" }), { cls: "potentially_breaking", reviewed: false });
      assert.deepEqual(impactClass({ impact: null, risk: "BREAKING", urgency: "CRITICAL", changeType: "REMOVED_ENDPOINT" }), { cls: "potentially_breaking", reviewed: false });
    });
    await check("only a person's review confirms it, recorded with who, when and why", async () => {
      const u = await db.platformUpdate.create({ data: { platform: "META", dedupeKey: `${TAG}:u1`, title: "Field removed", excerpt: "x", changeType: "REMOVED_FIELD", risk: "POTENTIALLY_BREAKING", areas: ["campaign-creation"] } });
      const r = await reviewImpact(u.id, "affects_mairo", "owner@mairo.test", "We send this field when creating ad sets.");
      assert.ok(r.ok);
      const row = await db.platformUpdate.findUniqueOrThrow({ where: { id: u.id } });
      assert.deepEqual(impactClass(row), { cls: "affects_mairo", reviewed: true });
      assert.equal(row.impactReviewedById, "owner@mairo.test");
      assert.ok(row.impactReviewedAt);
      assert.match(row.historyJson, /affects_mairo/);
      assert.equal(row.status, "DETECTED", "reviewing impact doesn't move it through the pipeline or apply anything");
      await reviewImpact(u.id, "not_affected", "owner@mairo.test", "Only used by Instagram shopping.");
      assert.deepEqual(impactClass(await db.platformUpdate.findUniqueOrThrow({ where: { id: u.id } })), { cls: "informational", reviewed: true });
    });
    await check("a retiring API version names the deadline and what it affects", () => {
      const alerts = versionAlerts([{ version: "v24.0", status: "PRODUCTION", retiresAt: new Date(now.getTime() + 60 * 86_400_000), releasedAt: null, migrationStatus: "NOT_STARTED" }], "v24.0", now);
      assert.equal(alerts[0].severity, "HIGH");
      assert.match(alerts[0].body, /retire this version on \d{4}-\d{2}-\d{2}/);
      assert.match(alerts[0].body, /campaign, ad set and ad creation/);
    });

    console.log("— whose problem, and what to retry —");
    await check("Meta's side retries; the customer's connection and refused requests don't", () => {
      for (const [status, code, side, retry] of [[500, 2, "meta", true], [400, 4, "meta", true], [400, 613, "meta", true], [504, null, "meta", true], [400, 190, "account", false], [400, 200, "account", false], [400, 100, "mairo", false]] as const) {
        const f = classifyMetaFailure({ status, code });
        assert.equal(f.side, side, `${status}/${code}`);
        assert.equal(f.retryable, retry, `${status}/${code}`);
      }
    });
    await check("backoff grows, and waits longer for a rate limit", () => {
      const r = () => 0;
      assert.ok(retryDelayMs(1, "meta_outage", 500, r) > retryDelayMs(0, "meta_outage", 500, r));
      assert.ok(retryDelayMs(0, "rate_limit", 500, r) > retryDelayMs(0, "meta_outage", 500, r));
    });
    await check("recorded errors keep a hashed account key, never the token", async () => {
      await recordMetaError({ status: 400, body: { error: { message: "Invalid OAuth access token.", code: 190 } }, path: `/${TAG}/me`, method: "GET", apiVersion: "v24.0", accessToken: "EAAB-SECRET-TOKEN" });
      const row = await db.platformApiError.findFirstOrThrow({ where: { endpoint: { startsWith: `/${TAG}` } } });
      assert.doesNotMatch(JSON.stringify(row), /EAAB-SECRET-TOKEN/);
    });

    console.log("— pausing only what Meta is failing —");
    await check("Meta failing most of an action's attempts pauses that action only", () => {
      const h = operationHealth([stat("build", { metaDown: 3, ok: 1 }), stat("change", { ok: 8 })], now);
      assert.equal(h.find((x) => x.operation === "build")!.state, "paused");
      assert.equal(h.find((x) => x.operation === "change")!.state, "ok");
    });
    await check("a few failures among many successes, or customers' own expired tokens, pause nothing", () => {
      assert.equal(operationHealth([stat("change", { metaDown: 3, ok: 10 })], now)[1].state, "ok");
      assert.equal(operationHealth([stat("change", { account: 25 })], now)[1].state, "ok");
    });
    await check("Meta refusing most requests is flagged for a developer, not paused", () => {
      assert.equal(operationHealth([stat("build", { rejected: 5, ok: 1 })], now)[0].state, "investigate");
    });
    await check("old failures expire: two hours ago doesn't pause now", () => {
      assert.equal(operationHealth([stat("build", { metaDown: 9 }, hourOf(new Date(now.getTime() - 2 * HOUR)))], now)[0].state, "ok");
    });
    await check("a drop in success rate is noticed against the week before", () => {
      const day = (h: number) => hourOf(new Date(now.getTime() - h * HOUR));
      const drop = successDrop([stat("build", { ok: 40, rejected: 1 }, day(72)), stat("build", { ok: 5, rejected: 8 }, day(3))], "build", now);
      assert.ok(drop && drop.before > drop.after, JSON.stringify(drop));
      assert.equal(successDrop([stat("build", { ok: 3 }, day(3))], "build", now), null, "too few attempts to say");
    });
    await check("the customer is told what's unavailable, that nothing changed, and what happens next", () => {
      const m = pausedMessage("build", "Meta's systems are failing or not answering right now.");
      assert.match(m, /^Meta isn't accepting new campaigns and ads right now\./);
      assert.match(m, /Nothing was changed/);
      assert.match(m, /saved/);
    });

    // The real paths, with Meta failing campaign changes and creation for everyone.
    const window = { gte: hourOf(new Date(now.getTime() - HOUR)) };
    const saved = await db.metaOperationStat.findMany({ where: { hour: window } });
    await db.metaOperationStat.deleteMany({ where: { hour: window } });
    try {
      for (let i = 0; i < 3; i++) {
        await recordOperation("change", "meta_outage");
        await recordOperation("build", "rate_limit");
      }
      await check("counts are platform-wide numbers only: no business, account, campaign or token", async () => {
        const row = await db.metaOperationStat.findFirstOrThrow({ where: { operation: "change", hour: hourOf(now) } });
        assert.deepEqual(Object.keys(row).sort(), ["account", "hour", "id", "metaDown", "ok", "operation", "rateLimited", "rejected"]);
        assert.equal(row.metaDown, 3);
        assert.ok((await metaOperationPaused("change")).paused);
      });

      await db.organization.create({ data: { id: ORG, name: "Fernleaf Ceramics", subscriptionTier: "PRO", subscriptionStatus: "active", autoLaunchHeld: false } });
      await db.organization.create({ data: { id: OTHER, name: "Other" } });
      await db.metaAdAccount.create({ data: { organizationId: ORG, metaAdAccountId: "act_77", accessToken: encryptSecret("fake-token"), status: "CONNECTED", pageId: "pg", pageName: "Page" } });
      const approved = await db.mairoCampaign.create({
        data: {
          organizationId: ORG, name: "Spring mugs", objective: "LEADS", destinationType: "LEAD_FORM", status: "PENDING_REVIEW", totalDailyBudgetCents: 3000, launchApprovedAt: now,
          platformCampaigns: { create: { platform: "META", status: "PENDING_REVIEW", externalCampaignId: `${ORG}-c`, externalAdGroupId: `${ORG}-as`, externalAdId: `${ORG}-ad`, budgetPercent: 100, dailyBudgetCents: 3000 } },
        },
        include: { platformCampaigns: true },
      });
      const writes: string[] = [];
      const fake: typeof fetch = async (input, init) => {
        if ((init?.method ?? "GET") !== "GET") writes.push(String(input));
        return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
      };
      const viaMeta = <T,>(fn: () => Promise<T>) => withGraphTransport({ fetch: fake, record: false }, fn);

      await check("auto-launch holds an approved campaign, says why, and sends nothing; the approval stands", async () => {
        const r = await viaMeta(() => maybeGoLive(ORG));
        assert.equal(r.launched, false);
        assert.match(r.heldBecause ?? "", /Meta isn't accepting changes to campaigns/);
        assert.equal(writes.length, 0);
        const c = await db.mairoCampaign.findUniqueOrThrow({ where: { id: approved.id } });
        assert.ok(c.launchApprovedAt, "the customer's approval is kept");
      });

      await check("an approved budget change isn't sent: the decision keeps waiting, with the reason", async () => {
        const d = await db.mairoDecision.create({
          data: {
            organizationId: ORG, kind: "scale-winner", category: "BUDGET", title: "Raise Spring mugs to $35/day", noticed: "n", noticedAdvanced: "n", whyItMatters: "w", recommendation: "r", impact: "i", risk: "LOW", confidence: "HIGH", evidenceJson: "[]", dedupeKey: `${TAG}-d1`,
            changesJson: JSON.stringify([{ type: "set-budget", platform: "META", mairoCampaignId: approved.id, platformCampaignId: approved.platformCampaigns[0].id, externalCampaignId: `${ORG}-c`, campaignName: "Spring mugs", fromCents: 3000, toCents: 3500 }]),
          },
        });
        const r = await viaMeta(() => applyDecision({ organizationId: ORG, decisionId: d.id, userId: "u1", automatic: false }));
        assert.equal(r.ok, false);
        if (!r.ok) assert.match(r.error, /Meta isn't accepting/);
        const row = await db.mairoDecision.findUniqueOrThrow({ where: { id: d.id } });
        assert.equal(row.status, "PENDING");
        assert.equal(row.applyingAt, null, "not claimed, so it can be approved again later");
        assert.equal(writes.length, 0);
      });

      await check("building a campaign stops before Meta: kept as a draft with the reason, nothing created", async () => {
        const c = await db.mairoCampaign.create({ data: { organizationId: ORG, name: "New build", objective: "LEADS", destinationType: "LEAD_FORM", status: "DRAFT", totalDailyBudgetCents: 2000, platformCampaigns: { create: { platform: "META", status: "DRAFT", budgetPercent: 100, dailyBudgetCents: 2000 } } }, include: { platformCampaigns: true } });
        const r = await viaMeta(() => launchOne({ organizationId: ORG, platformCampaignId: c.platformCampaigns[0].id, mairoCampaignId: c.id, platform: "META", name: c.name, objective: "LEADS", destinationType: "LEAD_FORM", dailyBudgetCents: 2000, activate: false }));
        assert.equal(r.launched, false);
        assert.equal(r.externalCampaignId, null);
        assert.match(r.error ?? "", /new campaigns and ads/);
        const pc = await db.platformCampaign.findUniqueOrThrow({ where: { id: c.platformCampaigns[0].id } });
        assert.equal(pc.status, "DRAFT");
        assert.match(pc.lastError ?? "", /Meta isn't accepting/);
        assert.equal(writes.length, 0);
      });

      await check("once Meta recovers, the pause lifts on its own", async () => {
        for (let i = 0; i < 6; i++) await recordOperation("change", null);
        assert.equal((await metaOperationPaused("change")).paused, false);
      });

      await check("the admin summary is counts and checks only — no business, account or campaign", async () => {
        const h = await integrationHealth(now);
        const text = JSON.stringify(h);
        for (const leak of [ORG, OTHER, "act_77", "Spring mugs", "fake-token"]) assert.ok(!text.includes(leak), leak);
        assert.ok(["never", "failing", "stale", "current"].includes(h.monitor.state));
        assert.equal(h.operations.find((o) => o.operation === "build")!.state, "paused");
      });
    } finally {
      await db.metaOperationStat.deleteMany({ where: { hour: window } });
      for (const r of saved) await db.metaOperationStat.create({ data: r });
    }

    console.log("— what recommendations rest on —");
    await check("a sales campaign on unverified purchases says so, is held at lower confidence, and never raises spend by itself", () => {
      const p = purchaseDataFrom({ pixelChosen: true, latestPurchaseCheck: { status: "NOT_SEEN", checkedAt: now } }, now);
      const r = withDataBasis(draft({}), { objective: "SALES", destinationType: "WEBSITE" }, p);
      assert.equal(r.draft.confidence, "MEDIUM");
      assert.ok(r.draft.evidence.some((e) => e.label === "Data check" && /unconfirmed/.test(e.value)));
      assert.equal(r.holdAutomatic, true);
    });
    await check("missing and stale purchase data are named as such; a budget cut isn't held", () => {
      const missing = withDataBasis(draft({}), { objective: "SALES", destinationType: "WEBSITE" }, purchaseDataFrom({ pixelChosen: false, latestPurchaseCheck: null }, now));
      assert.match(missing.draft.evidence.at(-1)!.value, /No Meta Pixel/);
      const old = new Date(now.getTime() - 45 * 86_400_000);
      const stale = withDataBasis(draft({}), { objective: "SALES", destinationType: "WEBSITE" }, purchaseDataFrom({ pixelChosen: true, latestPurchaseCheck: { status: "VERIFIED", checkedAt: old } }, now));
      assert.match(stale.draft.evidence.at(-1)!.value, /last verified on/);
      const cut = draft({ changes: [{ type: "set-budget", platform: "META", mairoCampaignId: "c1", platformCampaignId: "p1", externalCampaignId: "x1", campaignName: "Mugs", fromCents: 2600, toCents: 2000 }] });
      assert.equal(withDataBasis(cut, { objective: "SALES", destinationType: "WEBSITE" }, purchaseDataFrom({ pixelChosen: false, latestPurchaseCheck: null }, now)).holdAutomatic, false);
    });
    await check("verified purchases, and lead or call campaigns, are left as they are", () => {
      const d = draft({});
      assert.equal(withDataBasis(d, { objective: "SALES", destinationType: "WEBSITE" }, purchaseDataFrom({ pixelChosen: true, latestPurchaseCheck: { status: "VERIFIED", checkedAt: now } }, now)).draft, d);
      assert.equal(withDataBasis(d, { objective: "LEADS", destinationType: "LEAD_FORM" }, purchaseDataFrom({ pixelChosen: false, latestPurchaseCheck: null }, now)).draft, d);
    });
  } finally {
    await cleanup();
  }
  console.log(`\nMeta reliability: ${passed} checks passed. Stubbed Meta only — nothing was sent to Meta, published or spent.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
