// Checks the promises the legal pages, Billing and the deletion page make,
// against the database and pretend Stripe and file storage — nothing is sent
// anywhere, charged or deleted outside the test rows:
//
//   - Deleting an account names the campaigns still running in Meta first,
//     cancels the Stripe subscription before deleting anything (and deletes
//     nothing if Stripe doesn't confirm), removes uploaded files, and takes
//     every record with it — including a freelancer's client businesses.
//   - A daily sweep removes files left behind by deleted businesses only.
//   - Cancelling is announced once, with the campaigns still running named;
//     undoing it clears the notice; a paid plan ending is announced too.
//   - The public wording matches: no "we don't post", no "deleted
//     immediately" for backups, no "losing money", Gemini disclosed, social
//     posting shown as waiting for Meta.
//
//   npm run check:trust-db   (needs DATABASE_URL; makes no network calls)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { closeAccount, sweepOrphanedFiles, type CloseDeps } from "../src/lib/account/close";
import { runningMetaCampaigns } from "../src/lib/billing/running-campaigns";
import { announceCancellation } from "../src/lib/billing/announce-cancellation";
import { cancellationNotice, scheduledEnd } from "../src/lib/billing/cancellation-notice";
import { organizationPrefixes } from "../src/lib/storage/blob";
import { ACTIONS, levelInfo } from "../src/lib/automation/levels";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-trust";
const cleanup = () => db.organization.deleteMany({ where: { id: { startsWith: TAG } } }).then(() => db.user.deleteMany({ where: { email: { startsWith: TAG } } }));

async function business(id: string, data: Record<string, unknown> = {}) {
  await db.organization.create({ data: { id: `${TAG}-${id}`, name: `Trust ${id}`, ...data } });
  const user = await db.user.create({ data: { email: `${TAG}-${id}@test.invalid`, passwordHash: "x", organizationId: `${TAG}-${id}` } });
  return { orgId: `${TAG}-${id}`, userId: user.id };
}
async function campaign(organizationId: string, name: string, platformStatus: "ACTIVE" | "PAUSED" | "PENDING_REVIEW", status: "ACTIVE" | "PAUSED" | "ARCHIVED" = "ACTIVE") {
  return db.mairoCampaign.create({
    data: {
      organizationId, name, objective: "LEADS", status, totalDailyBudgetCents: 2500, launchApprovedAt: new Date(),
      platformCampaigns: { create: { platform: "META", status: platformStatus, externalCampaignId: `${organizationId}-${name}`, budgetPercent: 100, dailyBudgetCents: 2500 } },
    },
  });
}
function fakes(over: Partial<CloseDeps> = {}) {
  const log = { cancelled: [] as string[], prefixes: [] as string[] };
  const deps: CloseDeps = {
    cancelSubscription: async (id) => { log.cancelled.push(id); },
    deleteFiles: async (p) => { log.prefixes.push(p); return 2; },
    billingReachable: () => true,
    ...over,
  };
  return { deps, log };
}

async function main() {
  await cleanup();
  try {
    console.log("— deleting an account —");
    await check("only campaigns running in Meta are counted: not paused, waiting or archived ones", async () => {
      const { orgId } = await business("count");
      await campaign(orgId, "live", "ACTIVE");
      await campaign(orgId, "paused", "PAUSED", "PAUSED");
      await campaign(orgId, "waiting", "PENDING_REVIEW");
      await campaign(orgId, "gone", "ACTIVE", "ARCHIVED");
      assert.deepEqual((await runningMetaCampaigns([orgId])).map((c) => c.name), ["live"]);
    });

    await check("with campaigns running, deletion waits for the owner to confirm, and names them", async () => {
      const { orgId, userId } = await business("running", { stripeSubscriptionId: `${TAG}-sub-r`, subscriptionStatus: "active" });
      await campaign(orgId, "Spring leads", "ACTIVE");
      const { deps, log } = fakes();
      const r = await closeAccount({ userId, organizationId: orgId, acknowledgedRunning: false }, deps);
      assert.ok(!r.ok && r.reason === "running-campaigns" && r.running[0].name === "Spring leads" && /keep spending/.test(r.error));
      assert.equal(log.cancelled.length, 0, "nothing cancelled before the owner confirms");
      assert.ok(await db.organization.findUnique({ where: { id: orgId } }));
    });

    await check("if Stripe doesn't confirm the cancellation, nothing is deleted", async () => {
      const { orgId, userId } = await business("stripe-fails", { stripeSubscriptionId: `${TAG}-sub-f`, subscriptionStatus: "active" });
      const { deps } = fakes({ cancelSubscription: async () => { throw Object.assign(new Error("Stripe down"), { statusCode: 500 }); } });
      const r = await closeAccount({ userId, organizationId: orgId, acknowledgedRunning: true }, deps);
      assert.ok(!r.ok && r.reason === "billing" && /nothing was deleted/.test(r.error));
      assert.ok(await db.organization.findUnique({ where: { id: orgId } }));
      assert.ok(await db.user.findUnique({ where: { id: userId } }));
    });

    await check("if Stripe can't be reached at all, nothing is deleted", async () => {
      const { orgId, userId } = await business("no-stripe", { stripeSubscriptionId: `${TAG}-sub-n`, subscriptionStatus: "trialing" });
      const { deps } = fakes({ billingReachable: () => false });
      const r = await closeAccount({ userId, organizationId: orgId, acknowledgedRunning: true }, deps);
      assert.ok(!r.ok && r.reason === "billing");
      assert.ok(await db.organization.findUnique({ where: { id: orgId } }));
    });

    await check("confirmed: the subscription is cancelled first, files and every record go, client businesses too", async () => {
      const { orgId, userId } = await business("close", { stripeSubscriptionId: `${TAG}-sub-c`, subscriptionStatus: "active" });
      await db.organization.create({ data: { id: `${TAG}-close-client`, name: "Client", parentId: orgId } });
      await campaign(orgId, "Still on", "ACTIVE");
      await db.notification.create({ data: { organizationId: orgId, kind: "NEEDS_ATTENTION", severity: "WARNING", dedupeKey: "x", title: "t", body: "b" } });
      await db.metaAdAccount.create({ data: { organizationId: orgId, metaAdAccountId: "act_1", accessToken: "secret-token" } });
      const { deps, log } = fakes();
      const r = await closeAccount({ userId, organizationId: orgId, acknowledgedRunning: true }, deps);
      assert.ok(r.ok && r.cancelledSubscriptions === 1);
      assert.deepEqual(log.cancelled, [`${TAG}-sub-c`]);
      for (const p of [...organizationPrefixes(orgId), ...organizationPrefixes(`${TAG}-close-client`)]) assert.ok(log.prefixes.includes(p), p);
      assert.equal(await db.organization.count({ where: { id: { in: [orgId, `${TAG}-close-client`] } } }), 0);
      assert.equal(await db.user.count({ where: { id: userId } }), 0);
      assert.equal(await db.metaAdAccount.count({ where: { organizationId: orgId } }), 0, "the Meta token goes with it");
      assert.equal(await db.notification.count({ where: { organizationId: orgId } }), 0);
      assert.equal(await db.mairoCampaign.count({ where: { organizationId: orgId } }), 0);
    });

    await check("a subscription Stripe already removed doesn't block deletion; a storage outage doesn't either", async () => {
      const { orgId, userId } = await business("gone", { stripeSubscriptionId: `${TAG}-sub-g`, subscriptionStatus: "active" });
      const { deps } = fakes({
        cancelSubscription: async () => { throw Object.assign(new Error("No such subscription"), { code: "resource_missing" }); },
        deleteFiles: async () => { throw new Error("storage unreachable"); },
      });
      const r = await closeAccount({ userId, organizationId: orgId, acknowledgedRunning: true }, deps);
      assert.ok(r.ok);
      assert.equal(await db.organization.count({ where: { id: orgId } }), 0);
    });

    await check("an ended subscription isn't cancelled again", async () => {
      const { orgId, userId } = await business("ended", { stripeSubscriptionId: null, subscriptionStatus: "canceled" });
      const { deps, log } = fakes();
      assert.ok((await closeAccount({ userId, organizationId: orgId, acknowledgedRunning: true }, deps)).ok);
      assert.equal(log.cancelled.length, 0);
    });

    await check("the daily sweep removes files only for businesses that no longer exist", async () => {
      const { orgId } = await business("keeps-files");
      const deleted: string[] = [];
      const n = await sweepOrphanedFiles({
        folders: ["creative-studio", "ad-media"],
        folderIds: async (f) => (f === "creative-studio" ? [orgId, `${TAG}-deleted-long-ago`] : []),
        deleteFiles: async (p) => { deleted.push(p); return 1; },
      });
      assert.equal(n, 1);
      assert.deepEqual(deleted, [`creative-studio/${TAG}-deleted-long-ago/`]);
    });

    console.log("\n— cancelling —");
    await check("the end date comes from Stripe's cancel_at, or the period end when cancelling at period end", () => {
      const end = new Date("2026-11-09T00:00:00Z");
      assert.equal(scheduledEnd({ cancel_at: end.getTime() / 1000 }, null)?.toISOString(), end.toISOString());
      assert.equal(scheduledEnd({ cancel_at: null, cancel_at_period_end: true }, end)?.toISOString(), end.toISOString());
      assert.equal(scheduledEnd({ cancel_at: null, cancel_at_period_end: false }, end), null);
    });

    await check("every notice states the subscription and the campaigns as separate facts", () => {
      const s = cancellationNotice({ kind: "scheduled", endsOn: new Date("2026-11-09T00:00:00Z"), running: 2 });
      assert.match(s.body, /active until November 9, 2026/);
      assert.match(s.body, /2 MAIRO campaigns are still running/);
      assert.match(s.body, /doesn't pause them/);
      const e = cancellationNotice({ kind: "ended", endsOn: null, running: 0 });
      assert.match(e.body, /No MAIRO campaigns are running in Meta/);
      assert.doesNotMatch(`${s.body} ${e.body}`, /paused your|we paused|have been paused/i);
    });

    await check("cancelling is announced once, naming what still runs; undoing clears it; the end is announced for a paid plan", async () => {
      const { orgId } = await business("announce");
      await campaign(orgId, "Running one", "ACTIVE");
      const ends = new Date("2026-11-09T00:00:00Z");
      const base = { organizationId: orgId, subscriptionId: `${TAG}-sub-a`, hadPaid: true };
      await announceCancellation({ ...base, cancelAtBefore: null, cancelAtNow: ends, ended: false });
      await announceCancellation({ ...base, cancelAtBefore: null, cancelAtNow: ends, ended: false });
      const rows = await db.notification.findMany({ where: { organizationId: orgId, kind: "SUBSCRIPTION_CHANGE" } });
      assert.equal(rows.length, 1);
      assert.match(rows[0].body, /1 MAIRO campaign is still running/);
      assert.equal(rows[0].actionHref, "/dashboard/billing/cancel#campaigns");
      await announceCancellation({ ...base, cancelAtBefore: ends, cancelAtNow: null, ended: false });
      assert.equal(await db.notification.count({ where: { organizationId: orgId, kind: "SUBSCRIPTION_CHANGE" } }), 0, "undone");
      await announceCancellation({ ...base, cancelAtBefore: ends, cancelAtNow: null, ended: true });
      const ended = await db.notification.findMany({ where: { organizationId: orgId, kind: "SUBSCRIPTION_CHANGE" } });
      assert.equal(ended.length, 1);
      assert.match(ended[0].title, /plan has ended/);
    });

    await check("a trial that ends unpaid isn't announced here — those campaigns are paused for the business", async () => {
      const { orgId } = await business("trial");
      await announceCancellation({ organizationId: orgId, subscriptionId: `${TAG}-sub-t`, hadPaid: false, cancelAtBefore: null, cancelAtNow: null, ended: true });
      assert.equal(await db.notification.count({ where: { organizationId: orgId } }), 0);
    });

    console.log("\n— the public wording —");
    const privacy = readFileSync(new URL("../src/app/privacy/page.tsx", import.meta.url), "utf8");
    const deletion = readFileSync(new URL("../src/app/data-deletion/page.tsx", import.meta.url), "utf8");
    const terms = readFileSync(new URL("../src/app/terms/page.tsx", import.meta.url), "utf8");
    await check("the privacy policy no longer says MAIRO never posts, and says when it does", () => {
      assert.doesNotMatch(privacy, /We do not post to your Facebook Page/);
      assert.match(privacy, /only on the Scale plan/);
      assert.match(privacy, /Social Autopilot/);
      assert.match(privacy, /metaPostingApproved/);
    });
    await check("deletion is described the same way everywhere: live records at once, backups and logs within the window", () => {
      assert.doesNotMatch(deletion, /Deleted immediately|Both are immediate/);
      assert.match(deletion, /straight away/);
      assert.match(deletion, /Backups/);
      assert.match(privacy, /backup copies\s+and server logs expire within/);
      assert.match(deletion, /cancelled with\s+Stripe/);
      assert.match(terms, /Deleting your account cancels your/);
    });
    await check("data the privacy policy didn't mention is disclosed", () => {
      assert.match(privacy, /Gemini image model/);
      assert.match(privacy, /hashed \(scrambled one way\) and sent to Meta/);
      assert.match(privacy, /read its public pages/);
      assert.match(privacy, /stores the pictures and videos you upload/);
    });
    await check("no automation wording claims to know what loses money", () => {
      const all = `${ACTIONS.map((a) => `${a.label} ${a.detail}`).join(" ")} ${levelInfo("ASSISTED").detail}`;
      assert.doesNotMatch(all, /losing money|unprofitable/i);
      assert.match(ACTIONS.find((a) => a.action === "pause-underperformer")!.detail, /not proof of a loss/);
    });
  } finally {
    await cleanup();
  }
  console.log(`\n${passed} trust checks passed.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
