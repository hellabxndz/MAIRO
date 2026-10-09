// Checks the live Meta check (AIOS → Live Meta check) against a simulated
// Graph API: that it only ever reads — a write is refused before it leaves
// the server — that it reports each thing MAIRO depends on honestly (an
// invalid token, missing permissions, a disabled account, no payment method,
// a silent pixel, a campaign MAIRO built that drifted or vanished), and that
// no token or app secret ever appears in what it shows.
//
//   npm run check:live-meta   (needs DATABASE_URL; makes no network calls)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { saveMetaConnection } from "../src/lib/meta/connection";
import { checkMetaApp, checkOrganizationMeta, readOnlyFetch, worstState, type LiveStep } from "../src/lib/meta/live-check";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "e2e-livemeta";
const ORG = `${TAG}-org`;
const TOKEN = "EAAB-user-token-0123456789-secret";
process.env.META_APP_ID = "1234567890";
process.env.META_APP_SECRET = "app-secret-abcdef123456";

// --- A pretend Meta --------------------------------------------------------------
type World = {
  tokenValid: boolean;
  granted: string[];
  accountStatus: number;
  funded: boolean;
  pixelFired: Date | null;
  campaign: { status: string } | null;
  appError?: string;
};
let world: World;
const fresh = (): World => ({
  tokenValid: true,
  granted: ["ads_management", "pages_show_list", "pages_read_engagement", "business_management"],
  accountStatus: 1,
  funded: true,
  pixelFired: new Date(Date.now() - 3_600_000),
  campaign: { status: "ACTIVE" },
});
const methods: string[] = [];
const urls: string[] = [];

const fakeMeta: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  methods.push((init?.method ?? "GET").toUpperCase());
  urls.push(url.toString());
  const path = url.pathname.replace(/^\/v[\d.]+/, "");
  const ok = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
  const err = (status: number, message: string, code = 100) => new Response(JSON.stringify({ error: { message, code } }), { status });
  if (path === "/1234567890") return world.appError ? err(400, world.appError) : ok({ id: "1234567890", name: "MAIRO" });
  if (path === "/debug_token") return ok({ data: { is_valid: world.tokenValid, app_id: "1234567890", expires_at: 0, data_access_expires_at: Math.floor(Date.now() / 1000) + 60 * 86_400 } });
  if (!world.tokenValid) return err(401, "Error validating access token: Session has expired.", 190);
  if (path === "/me/permissions") return ok({ data: world.granted.map((p) => ({ permission: p, status: "granted" })).concat([{ permission: "pages_manage_posts", status: "declined" }]) });
  if (path === `/act_${TAG}`) return ok({ name: "Shine Ads", account_status: world.accountStatus, currency: "USD", timezone_name: "America/New_York", ...(world.funded ? { funding_source_details: { id: "fs1", display_string: "Visa *4242" } } : {}) });
  if (path === "/page1") return ok({ id: "page1", name: "Shine Auto Spa" });
  if (path === `/act_${TAG}/campaigns`) return ok({ data: [{ id: "c1", effective_status: "ACTIVE" }, { id: "c2", effective_status: "PAUSED" }] });
  if (path === `/act_${TAG}/insights`) return ok({ data: [{ spend: "123.45", impressions: "9000", clicks: "210", account_currency: "USD" }] });
  if (path === `/act_${TAG}/adspixels`) return ok({ data: world.pixelFired ? [{ id: "px1", name: "Shine pixel", last_fired_time: world.pixelFired.toISOString() }] : [] });
  if (path === "/meta-camp-1") return world.campaign ? ok({ id: "meta-camp-1", effective_status: world.campaign.status }) : err(400, "Unsupported get request. Object with ID 'meta-camp-1' does not exist", 100);
  return err(404, `unexpected ${path}`);
};

const byKey = (steps: LiveStep[], key: string) => {
  const s = steps.find((x) => x.key === key);
  assert.ok(s, `no step ${key}`);
  return s;
};
const noSecrets = (steps: LiveStep[]) => {
  const text = JSON.stringify(steps);
  for (const secret of [TOKEN, process.env.META_APP_SECRET!]) assert.ok(!text.includes(secret), "a secret leaked into the result");
};

async function main() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  await db.organization.create({ data: { id: ORG, name: "Live Check Co" } });
  await saveMetaConnection({ organizationId: ORG, metaAdAccountId: `act_${TAG}`, pageId: "page1", pageName: "Shine Auto Spa", accessToken: TOKEN, tokenExpiresAt: null });
  await db.mairoCampaign.create({
    data: {
      organizationId: ORG,
      name: "Spring Detail",
      objective: "LEADS",
      status: "ACTIVE",
      totalDailyBudgetCents: 2000,
      platformCampaigns: { create: { platform: "META", externalCampaignId: "meta-camp-1", budgetPercent: 100, dailyBudgetCents: 2000 } },
    },
  });

  try {
    await check("a write is refused before it leaves the server", async () => {
      let reached = false;
      const guarded = readOnlyFetch(async () => {
        reached = true;
        return new Response("{}");
      });
      await assert.rejects(guarded("https://graph.facebook.com/v1/act_1/campaigns", { method: "POST" }), /only reads/);
      await assert.rejects(guarded("https://graph.facebook.com/v1/c1", { method: "DELETE" }), /only reads/);
      assert.equal(reached, false);
      await guarded("https://graph.facebook.com/v1/me");
      assert.equal(reached, true);
    });

    await check("everything working reads as working — and only GETs are sent", async () => {
      world = fresh();
      methods.length = 0;
      const app = await checkMetaApp({ fetch: fakeMeta });
      assert.equal(worstState(app), "pass");
      const steps = await checkOrganizationMeta(ORG, { fetch: fakeMeta });
      assert.equal(worstState(steps), "pass", JSON.stringify(steps, null, 1));
      for (const k of ["stored-token", "token", "permissions", "account", "funding", "page", "campaigns", "insights", "pixel", "mairo-campaigns"]) byKey(steps, k);
      assert.match(byKey(steps, "insights").detail, /123\.45 USD/);
      assert.match(byKey(steps, "funding").detail, /Visa \*4242/);
      assert.match(byKey(steps, "mairo-campaigns").detail, /1 of 1 found on Meta/);
      assert.equal(methods.length, 9); // the app, then eight reads for the business
      assert.ok(methods.every((m) => m === "GET"), `non-GET sent: ${methods.join(",")}`);
      noSecrets([...app, ...steps]);
    });

    await check("the token and app secret are sent to Meta but never shown", async () => {
      world = fresh();
      urls.length = 0;
      world.appError = `Invalid OAuth access token - Cannot parse access_token ${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
      const app = await checkMetaApp({ fetch: fakeMeta });
      assert.equal(byKey(app, "app").state, "fail");
      assert.match(byKey(app, "app").detail, /\[hidden\]/);
      noSecrets(app);
      assert.ok(urls.some((u) => u.includes("app-secret")), "the app token should go to Meta");
    });

    await check("missing app credentials are a failure, not a skip", async () => {
      const id = process.env.META_APP_ID;
      delete process.env.META_APP_ID;
      const app = await checkMetaApp({ fetch: fakeMeta });
      process.env.META_APP_ID = id;
      assert.equal(byKey(app, "credentials").state, "fail");
    });

    await check("an invalid token fails and stops — no further reads pretend to work", async () => {
      world = { ...fresh(), tokenValid: false };
      const steps = await checkOrganizationMeta(ORG, { fetch: fakeMeta });
      assert.equal(byKey(steps, "token").state, "fail");
      assert.match(byKey(steps, "token").detail, /reconnect/);
      assert.equal(steps.find((s) => s.key === "campaigns"), undefined);
      noSecrets(steps);
    });

    await check("a missing permission is named, with what was declined", async () => {
      world = { ...fresh(), granted: ["ads_management", "pages_show_list"] };
      const steps = await checkOrganizationMeta(ORG, { fetch: fakeMeta });
      const p = byKey(steps, "permissions");
      assert.equal(p.state, "fail");
      assert.match(p.detail, /pages_read_engagement/);
      assert.match(p.detail, /business_management/);
      assert.match(p.detail, /declined: pages_manage_posts/);
    });

    await check("a disabled account fails; no payment method and a silent pixel need attention", async () => {
      world = { ...fresh(), accountStatus: 2, funded: false, pixelFired: null };
      const steps = await checkOrganizationMeta(ORG, { fetch: fakeMeta });
      assert.equal(byKey(steps, "account").state, "fail");
      assert.match(byKey(steps, "account").detail, /disabled/);
      assert.equal(byKey(steps, "funding").state, "warn");
      assert.equal(byKey(steps, "pixel").state, "warn");
      assert.match(byKey(steps, "pixel").detail, /No pixel/);
      world = { ...fresh(), pixelFired: new Date(Date.now() - 30 * 86_400_000) };
      const stale = await checkOrganizationMeta(ORG, { fetch: fakeMeta });
      assert.equal(byKey(stale, "pixel").state, "warn");
      assert.match(byKey(stale, "pixel").detail, /not in the last week/);
    });

    await check("a campaign MAIRO built that drifted or vanished on Meta is reported", async () => {
      world = { ...fresh(), campaign: { status: "PAUSED" } };
      const drift = await checkOrganizationMeta(ORG, { fetch: fakeMeta });
      assert.equal(byKey(drift, "mairo-campaigns").state, "warn");
      assert.match(byKey(drift, "mairo-campaigns").detail, /active in MAIRO, paused on Meta/);
      world = { ...fresh(), campaign: null };
      const gone = await checkOrganizationMeta(ORG, { fetch: fakeMeta });
      assert.equal(byKey(gone, "mairo-campaigns").state, "fail");
      assert.match(byKey(gone, "mairo-campaigns").detail, /0 of 1 found/);
    });

    await check("a business that never connected is skipped, not failed", async () => {
      const steps = await checkOrganizationMeta(`${TAG}-nobody`, { fetch: fakeMeta });
      assert.equal(worstState(steps), "skip");
    });
  } finally {
    await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
  }

  console.log(`\nlive Meta check: ${passed} checks passed`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } }).catch(() => undefined);
  await db.$disconnect();
  process.exit(1);
});
