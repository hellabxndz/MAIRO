// Checks that a MAIRO Pro free trial can be had once per business and once
// per Meta ad account — and that deleting an account doesn't bring it back.
//
//   npm run check:trial-claims   (needs the database)
//
// Meta is a pretend one (withGraphTransport); nothing reaches Meta or Stripe.

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { completeMetaConnection } from "../src/lib/meta/connect-flow";
import { adAccountAllowedDuringTrial, claimAdAccount, recordTrialStart, trialEligible, trialRefusal } from "../src/lib/billing/trial-claims";
import { connectProblemFromParams, explainMetaConnect } from "../src/lib/onboarding/problems";

process.env.META_APP_ID ||= "trial-app";
process.env.META_APP_SECRET ||= "trial-secret";
process.env.META_REDIRECT_URI ||= "http://localhost:3000/api/meta/callback";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "check-trial";
const A = `${TAG}-a`;
const B = `${TAG}-b`;
const C = `${TAG}-c`;
const ACT1 = `act_${TAG}-1`;
const ACT2 = `act_${TAG}-2`;
const ACT3 = `act_${TAG}-3`;

// --- A pretend Meta ----------------------------------------------------------------
const world = { adAccounts: [{ id: ACT1, name: "Shared account", account_status: 1 }] as { id: string; name: string; account_status: number }[] };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const fakeMeta: typeof fetch = async (input) => {
  const path = new URL(String(input)).pathname.replace(/^\/v\d+\.\d+/, "");
  if (path === "/oauth/access_token") return json({ access_token: "EAAB-trial-token", token_type: "bearer", expires_in: 5_184_000 });
  if (path === "/me/permissions") return json({ data: ["ads_management", "pages_show_list"].map((permission) => ({ permission, status: "granted" })) });
  if (path === "/me/adaccounts") return json({ data: world.adAccounts });
  if (path === "/me/accounts") return json({ data: [{ id: "pg1", name: "Page" }] });
  return json({ data: [] });
};
const viaMeta = <T,>(fn: () => Promise<T>) => withGraphTransport({ fetch: fakeMeta, record: false }, fn);

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  await db.trialClaim.deleteMany({ where: { metaAdAccountId: { startsWith: `act_${TAG}` } } });
}

async function org(id: string, status: string | null = null) {
  await db.organization.create({ data: { id, name: id, paymentRequired: true, subscriptionStatus: status } });
}

async function main() {
  await cleanup();
  try {
    console.log("— the rule —");
    await check("a business that had a trial gets no second one", () => {
      assert.equal(trialRefusal({ trialUsedAt: new Date(), adAccountClaimedBy: null, organizationId: A }), "business");
    });
    await check("an ad account another business had its trial on gets none", () => {
      assert.equal(trialRefusal({ trialUsedAt: null, adAccountClaimedBy: B, organizationId: A }), "ad_account");
    });
    await check("a new business, on its own or a fresh ad account, gets one", () => {
      assert.equal(trialRefusal({ trialUsedAt: null, adAccountClaimedBy: null, organizationId: A }), null);
      assert.equal(trialRefusal({ trialUsedAt: null, adAccountClaimedBy: A, organizationId: A }), null);
    });

    console.log("\n— the first business —");
    await org(A);
    await check("a new business is offered the trial", async () => assert.equal(await trialEligible(A), true));

    await check("its trial starts and it connects Meta during it: the ad account is claimed", async () => {
      await db.organization.update({ where: { id: A }, data: { subscriptionStatus: "trialing" } });
      await recordTrialStart(A);
      const r = await viaMeta(() => completeMetaConnection(A, "code-a"));
      assert.ok(r.ok && r.adAccountId === ACT1, JSON.stringify(r));
      assert.equal((await db.trialClaim.findUniqueOrThrow({ where: { metaAdAccountId: ACT1 } })).organizationId, A);
      assert.ok((await db.organization.findUniqueOrThrow({ where: { id: A } })).trialUsedAt);
    });

    await check("after cancelling, the same business is offered no second trial", async () => {
      await db.organization.update({ where: { id: A }, data: { subscriptionStatus: "canceled" } });
      assert.equal(await trialEligible(A), false);
    });

    console.log("\n— a second sign-up, same Meta ad account —");
    await org(B);
    await check("it's offered a trial before Meta is connected (nothing to go on yet)", async () => assert.equal(await trialEligible(B), true));

    await check("during its trial, connecting the used ad account is refused and nothing is saved", async () => {
      await db.organization.update({ where: { id: B }, data: { subscriptionStatus: "trialing" } });
      const r = await viaMeta(() => completeMetaConnection(B, "code-b"));
      assert.ok(!r.ok && r.code === "trial_used", JSON.stringify(r));
      assert.equal(await db.metaAdAccount.count({ where: { organizationId: B } }), 0);
    });

    await check("the refusal explains it and offers to start paying now", () => {
      const p = connectProblemFromParams({ metaError: "trial_used" }, "/dashboard/launch")!;
      assert.equal(p.code, "trial_used");
      assert.match(p.fix!.href, /\/dashboard\/billing\?endTrial=1/);
      assert.match(p.message, /one MAIRO free trial/);
      assert.equal(explainMetaConnect("trial_used", { returnTo: "/x" }).also?.[0]?.label, "Connect again");
    });

    await check("if the login also manages a fresh ad account, that one is connected instead", async () => {
      world.adAccounts = [world.adAccounts[0], { id: ACT2, name: "Own account", account_status: 1 }];
      const r = await viaMeta(() => completeMetaConnection(B, "code-b2"));
      world.adAccounts = [world.adAccounts[0]];
      assert.ok(r.ok && r.adAccountId === ACT2, JSON.stringify(r));
      assert.equal((await db.trialClaim.findUniqueOrThrow({ where: { metaAdAccountId: ACT2 } })).organizationId, B);
    });

    await check("switching to the used ad account during the trial is refused", async () => {
      assert.equal(await adAccountAllowedDuringTrial(B, ACT1), false);
    });

    await check("once paying, the used ad account can be connected", async () => {
      await db.organization.update({ where: { id: B }, data: { subscriptionStatus: "active" } });
      assert.equal(await adAccountAllowedDuringTrial(B, ACT1), true);
      const r = await viaMeta(() => completeMetaConnection(B, "code-b3"));
      assert.ok(r.ok, JSON.stringify(r));
    });

    console.log("\n— deleting the account doesn't bring the trial back —");
    await check("the first business is deleted; its claim stays", async () => {
      await db.organization.delete({ where: { id: A } });
      assert.equal((await db.trialClaim.findUniqueOrThrow({ where: { metaAdAccountId: ACT1 } })).organizationId, A);
    });

    await check("a new business with that ad account already connected is offered no trial at checkout", async () => {
      await org(C);
      await db.metaAdAccount.create({ data: { organizationId: C, metaAdAccountId: ACT1, accessToken: "x", status: "CONNECTED" } });
      assert.equal(await trialEligible(C), false);
    });

    console.log("\n— two at once —");
    await check("two businesses racing for one ad account: exactly one gets it", async () => {
      const results = await Promise.all([claimAdAccount(`${TAG}-d`, ACT3), claimAdAccount(`${TAG}-e`, ACT3)]);
      assert.equal(results.filter(Boolean).length, 1, JSON.stringify(results));
    });

    console.log(`\n${passed} checks passed.`);
  } finally {
    await cleanup();
    await db.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
