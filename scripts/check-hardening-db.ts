// Pre-launch hardening, checked against the database and a pretend Meta —
// never the real one, and nothing is spent:
//
//   - Choosing the ad account: only accounts this login can reach; the switch
//     waits while MAIRO manages campaigns in the current one; a reconnect with
//     a login that can't reach that account keeps the old connection.
//   - Meta's permission running out: warned a week ahead, once; past its date
//     it's recorded as expired and the disconnected notice follows; reconnecting
//     clears both so the next problem is said again.
//
//   npm run check:hardening-db   (needs DATABASE_URL; makes no network calls)

import assert from "node:assert/strict";

process.env.META_APP_ID ||= "hard-app";
process.env.META_APP_SECRET ||= "hard-secret";
process.env.META_REDIRECT_URI ||= "http://localhost:3000/api/meta/callback";

import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { completeMetaConnection } from "../src/lib/meta/connect-flow";
import { listAdAccounts, managedMetaCampaigns, switchMetaAdAccount } from "../src/lib/meta/account-switch";
import { loadMetaConnection } from "../src/lib/meta/connection";
import { connectionSummaries } from "../src/lib/ad-platforms/connections";
import { detectFor } from "../src/lib/notifications/detect";
import { explainMetaConnect } from "../src/lib/onboarding/problems";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-hard";
const ORG = `${TAG}-org`;
const OTHER = `${TAG}-other`;
const A = "act_9001";
const B = "act_9002";
const C = "act_9003";
const DAY = 24 * 60 * 60 * 1000;

const world = { adAccounts: [] as { id: string; name: string; account_status: number }[], token: "EAAB-hard-1" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fakeMeta: typeof fetch = async (input) => {
  const path = new URL(String(input)).pathname.replace(/^\/v\d+\.\d+/, "");
  if (path === "/oauth/access_token") return json({ access_token: world.token, token_type: "bearer", expires_in: 5_184_000 });
  if (path === "/me/permissions") {
    return json({ data: ["ads_management", "pages_show_list", "pages_read_engagement", "business_management"].map((p) => ({ permission: p, status: "granted" })) });
  }
  if (path === "/me/adaccounts") return json({ data: world.adAccounts });
  if (path === "/me/accounts") return json({ data: [{ id: "pg1", name: "Harbor Dental" }] });
  return json({ data: [] });
};
const viaMeta = <T,>(fn: () => Promise<T>) => withGraphTransport({ fetch: fakeMeta, record: false }, fn);

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function main() {
  await cleanup();
  await db.organization.create({ data: { id: ORG, name: "Harbor Dental" } });
  await db.organization.create({ data: { id: OTHER, name: "Someone else" } });

  try {
    console.log("— choosing the ad account —");
    world.adAccounts = [
      { id: A, name: "Harbor Dental", account_status: 1 },
      { id: B, name: "Harbor Dental — second clinic", account_status: 1 },
      { id: C, name: "Old account", account_status: 101 },
    ];

    await check("connecting picks an account that can spend, and clears old connection notices", async () => {
      for (const key of ["disconnected:META", "expiring:META"]) {
        await db.notification.create({ data: { organizationId: ORG, kind: "ACCOUNT_DISCONNECTED", severity: "WARNING", dedupeKey: key, title: "old", body: "old" } });
      }
      const r = await viaMeta(() => completeMetaConnection(ORG, "code-1"));
      assert.ok(r.ok && r.adAccountId === A);
      assert.equal(await db.notification.count({ where: { organizationId: ORG, dedupeKey: { in: ["disconnected:META", "expiring:META"] } } }), 0);
    });

    await check("the list is what Meta says this login can reach, with each account's state in words", async () => {
      const conn = await loadMetaConnection(ORG);
      const list = await viaMeta(() => listAdAccounts(conn!.accessToken));
      assert.deepEqual(list.map((a) => [a.id, a.label]), [[A, "Active"], [B, "Active"], [C, "Closed"]]);
    });

    await check("an account this login can't reach is refused, whatever the request says", async () => {
      const r = await viaMeta(() => switchMetaAdAccount({ organizationId: ORG, adAccountId: "act_666", actorUserId: null }));
      assert.equal(r.ok, false);
      assert.equal((await loadMetaConnection(ORG))!.metaAdAccountId, A);
    });

    await check("with nothing running, switching works, drops the old account's capabilities and is logged", async () => {
      await db.platformAccountCapability.create({ data: { organizationId: ORG, platform: "META", adAccountId: A, currency: "USD" } });
      const r = await viaMeta(() => switchMetaAdAccount({ organizationId: ORG, adAccountId: B, actorUserId: null }));
      assert.deepEqual(r, { ok: true, changed: true });
      assert.equal((await loadMetaConnection(ORG))!.metaAdAccountId, B);
      assert.equal(await db.platformAccountCapability.count({ where: { organizationId: ORG } }), 0);
      const log = await db.mairoActivity.findFirst({ where: { organizationId: ORG, action: "switch-ad-account" } });
      assert.ok(log && log.before === A && log.after === B && log.automatic === false);
    });

    let campaignId = "";
    await check("while MAIRO manages a campaign in the account, switching away is refused and names it", async () => {
      const c = await db.mairoCampaign.create({
        data: {
          organizationId: ORG,
          name: "Cleaning special",
          objective: "LEADS",
          status: "ACTIVE",
          totalDailyBudgetCents: 2000,
          launchApprovedAt: new Date(),
          platformCampaigns: { create: { platform: "META", status: "ACTIVE", externalCampaignId: "cmp-1", budgetPercent: 100, dailyBudgetCents: 2000 } },
        },
      });
      campaignId = c.id;
      assert.equal((await managedMetaCampaigns(ORG)).count, 1);
      const r = await viaMeta(() => switchMetaAdAccount({ organizationId: ORG, adAccountId: A, actorUserId: null }));
      assert.ok(!r.ok && /Cleaning special/.test(r.error) && /Delete it in Campaigns first/.test(r.error), JSON.stringify(r));
      assert.equal((await loadMetaConnection(ORG))!.metaAdAccountId, B);
    });

    await check("a draft that never reached Meta doesn't hold the account", async () => {
      await db.mairoCampaign.create({
        data: { organizationId: ORG, name: "Draft only", objective: "LEADS", status: "DRAFT", totalDailyBudgetCents: 1000, platformCampaigns: { create: { platform: "META", status: "DRAFT", budgetPercent: 100, dailyBudgetCents: 1000 } } },
      });
      assert.equal((await managedMetaCampaigns(ORG)).count, 1);
    });

    await check("a reconnect with a login that can't reach that account keeps the old connection", async () => {
      const before = await db.metaAdAccount.findUniqueOrThrow({ where: { organizationId: ORG } });
      world.adAccounts = [{ id: C, name: "Someone's other account", account_status: 1 }];
      world.token = "EAAB-hard-2";
      const r = await viaMeta(() => completeMetaConnection(ORG, "code-2"));
      assert.deepEqual(r, { ok: false, code: "lost_account", technical: B });
      const after = await db.metaAdAccount.findUniqueOrThrow({ where: { organizationId: ORG } });
      assert.equal(after.metaAdAccountId, B);
      assert.equal(after.accessToken, before.accessToken, "the token that still reaches the campaigns is kept");
      const p = explainMetaConnect("lost_account", { returnTo: "/dashboard/meta", technical: B });
      assert.match(p.message, new RegExp(`ad account ${B}`));
      assert.doesNotMatch(explainMetaConnect("lost_account", { returnTo: "/dashboard/meta", technical: "<b>call 555</b>" }).message, /555/);
    });

    await check("once the campaign is deleted (paused in Meta first), the switch goes through", async () => {
      await db.mairoCampaign.update({ where: { id: campaignId }, data: { status: "ARCHIVED" } });
      world.adAccounts = [
        { id: A, name: "Harbor Dental", account_status: 1 },
        { id: B, name: "Harbor Dental — second clinic", account_status: 1 },
      ];
      const r = await viaMeta(() => switchMetaAdAccount({ organizationId: ORG, adAccountId: A, actorUserId: null }));
      assert.deepEqual(r, { ok: true, changed: true });
    });

    console.log("\n— Meta's permission running out —");
    await check("three days out: one warning, not one a day, and the connection screen says it too", async () => {
      await db.metaAdAccount.update({ where: { organizationId: ORG }, data: { tokenExpiresAt: new Date(Date.now() + 3 * DAY), status: "CONNECTED" } });
      await viaMeta(() => detectFor(ORG));
      await viaMeta(() => detectFor(ORG));
      const rows = await db.notification.findMany({ where: { organizationId: ORG, dedupeKey: "expiring:META" } });
      assert.equal(rows.length, 1);
      assert.match(rows[0].title, /runs out in 3 days/);
      assert.match(rows[0].actionHref ?? "", /^\/api\/meta\/connect\?returnTo=/);
      const summary = (await connectionSummaries(ORG)).get("META")!;
      assert.equal(summary.connected, true);
      assert.match(summary.problem ?? "", /runs out in 3 days/);
    });

    await check("past its date it's recorded as expired, and the disconnected notice follows on the same run", async () => {
      await db.metaAdAccount.update({ where: { organizationId: ORG }, data: { tokenExpiresAt: new Date(Date.now() - DAY) } });
      await viaMeta(() => detectFor(ORG));
      assert.equal((await db.metaAdAccount.findUniqueOrThrow({ where: { organizationId: ORG } })).status, "TOKEN_EXPIRED");
      assert.equal(await db.notification.count({ where: { organizationId: ORG, dedupeKey: "disconnected:META" } }), 1);
    });

    await check("reconnecting clears both notices, so the next expiry is said again", async () => {
      world.token = "EAAB-hard-3";
      const r = await viaMeta(() => completeMetaConnection(ORG, "code-3"));
      assert.ok(r.ok && r.adAccountId === A, JSON.stringify(r));
      assert.equal(await db.notification.count({ where: { organizationId: ORG, dedupeKey: { in: ["disconnected:META", "expiring:META"] } } }), 0);
      const fresh = await db.metaAdAccount.findUniqueOrThrow({ where: { organizationId: ORG } });
      assert.equal(fresh.status, "CONNECTED");
      assert.ok(fresh.tokenExpiresAt && fresh.tokenExpiresAt.getTime() > Date.now() + 50 * DAY);
    });

    await check("another business is untouched by all of it", async () => {
      assert.equal(await db.metaAdAccount.count({ where: { organizationId: OTHER } }), 0);
      assert.equal(await db.notification.count({ where: { organizationId: OTHER } }), 0);
      assert.equal(await db.mairoActivity.count({ where: { organizationId: OTHER } }), 0);
    });
  } finally {
    await cleanup();
  }
  console.log(`\n${passed} hardening checks passed.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
