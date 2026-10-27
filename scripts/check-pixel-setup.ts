// Checks the Meta Pixel setup and the launch rule built on it, against a
// pretend Meta (no real Meta call, no spend, nothing published):
//
//   - when a Pixel is needed: from the business type, the campaign's
//     objective and its destination together — required only for a campaign
//     that depends on website purchases, optional for leads;
//   - "chosen in MAIRO" is never "receiving events", and only the latter
//     lets a purchase campaign launch;
//   - choosing checks the Pixel is shared with the connected ad account;
//     creating needs the permission and never reports success without Meta's
//     id; declining is saved; revoked access is noticed and recorded;
//   - auto-launch holds a purchase campaign without a working Pixel and
//     lets a lead campaign go without one;
//   - the onboarding step and settings read the same saved choice;
//   - one business never sees another's.
//
//   npm run check:pixel-setup   (needs the local database)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { encryptSecret } from "../src/lib/crypto/secret-box";
import { businessPixelNeed, campaignPixelNeed, launchGate, pixelStatus, type PixelState } from "../src/lib/tracking/pixel-rules";
import {
  accessiblePixels,
  campaignLaunchGate,
  choosePixel,
  createPixelForBusiness,
  declinePixel,
  hostOf,
  launchGateForCampaign,
  loadPixelSetup,
  pixelStateFor,
  recheckPixelAccess,
  setLeadMeasurement,
} from "../src/lib/tracking/pixel-setup";
import { loadOnboarding } from "../src/lib/onboarding/progress-store";
import { maybeGoLive } from "../src/lib/campaigns/auto-launch";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-pxs";
const SHOP = `${TAG}-shop`;
const LEADS = `${TAG}-leads`;
const ACT = "act_888";
const ACT_LEADS = "act_889";
const day = 864e5;

// --- A pretend Meta ---------------------------------------------------------------
type FakePixel = { id: string; name: string; last_fired_time?: string; creation_time?: string; is_unavailable?: boolean; owner_business?: { id: string; name: string } };
const world = {
  /** Pixels shared with each ad account. */
  shared: { [ACT]: [] as FakePixel[], [ACT_LEADS]: [] as FakePixel[] } as Record<string, FakePixel[]>,
  /** Pixels the login can read at all (shared or not). */
  readable: [] as FakePixel[],
  nextId: 700000000000001,
  granted: ["ads_management", "pages_show_list", "pages_read_engagement", "business_management"],
  permissionsFail: false,
  tokenRevoked: false,
  createFails: false,
  hosts: {} as Record<string, string[]>,
  funded: true,
};
const calls: string[] = [];
const writes: string[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const revoked = () => json({ error: { message: "Error validating access token: The user has not authorized application.", type: "OAuthException", code: 190 } }, 400);
const fakeMeta: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/v\d+\.\d+/, "");
  const method = (init?.method ?? "GET").toUpperCase();
  calls.push(`${method} ${path}`);
  if (world.tokenRevoked) return revoked();
  if (path === "/me/permissions") {
    if (world.permissionsFail) return json({ error: { message: "Service temporarily unavailable", code: 2 } }, 500);
    const all = ["ads_management", "pages_show_list", "pages_read_engagement", "business_management"];
    return json({ data: all.map((p) => ({ permission: p, status: world.granted.includes(p) ? "granted" : "declined" })) });
  }
  const list = path.match(/^\/(act_\d+)\/adspixels$/);
  if (list && method === "GET") return json({ data: world.shared[list[1]] ?? [] });
  if (list && method === "POST") {
    if (world.createFails) return json({ error: { message: "Invalid parameter", code: 100 } }, 400);
    const p: FakePixel = { id: String(world.nextId++), name: url.searchParams.get("name") ?? "pixel", creation_time: new Date().toISOString() };
    (world.shared[list[1]] ??= []).push(p);
    world.readable.push(p);
    return json({ id: p.id });
  }
  const stats = path.match(/^\/(\d+)\/stats$/);
  if (stats) {
    if (url.searchParams.get("aggregation") === "host") return json({ data: [{ data: (world.hosts[stats[1]] ?? []).map((value) => ({ value, count: 3 })) }] });
    return json({ data: [] });
  }
  if (path === `/${ACT}` || path === `/${ACT_LEADS}`) {
    return json({ id: path.slice(1), account_status: 1, currency: "USD", balance: "0", amount_spent: "0", ...(world.funded ? { funding_source_details: { id: "fs1", display_string: "Visa ·4242" } } : {}) });
  }
  if (path === "/" && url.searchParams.get("ids")) {
    return json(Object.fromEntries(url.searchParams.get("ids")!.split(",").map((id) => [id, { effective_status: "ACTIVE" }])));
  }
  const node = path.match(/^\/(\d+)$/);
  if (node && method === "GET") {
    const p = world.readable.find((x) => x.id === node[1]);
    return p ? json(p) : json({ error: { message: "Unsupported get request", code: 100, error_subcode: 33 } }, 400);
  }
  if (method !== "GET") {
    writes.push(`${method} ${path}`);
    return json({ success: true });
  }
  return json({ data: [] });
};
const viaMeta = <T,>(fn: () => Promise<T>) => withGraphTransport({ fetch: fakeMeta, record: false }, fn);

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function business(id: string, act: string, nicheId: string, goal: "SALES" | "LEADS") {
  await db.organization.create({
    data: { id, name: id === SHOP ? "Fernleaf Ceramics" : "Peak Roofing", website: id === SHOP ? "https://fernleaf.example" : "https://peak.example", subscriptionTier: "PRO", subscriptionStatus: "active", autoLaunchHeld: false },
  });
  await db.onboardingIntake.create({ data: { organizationId: id, primaryGoal: goal, monthlyBudgetCents: 120_000 } });
  await db.trackingProfile.create({ data: { organizationId: id, nicheId, nicheConfirmed: true } });
  await db.metaAdAccount.create({ data: { organizationId: id, metaAdAccountId: act, accessToken: encryptSecret("fake-token"), status: "CONNECTED", pageId: `${id}-page`, pageName: "Page" } });
}

/** A campaign built on Meta, switched off, and approved by the owner — what auto-launch looks for. */
async function approvedCampaign(organizationId: string, objective: "SALES" | "LEADS", destinationType: "WEBSITE" | "LEAD_FORM") {
  return db.mairoCampaign.create({
    data: {
      organizationId,
      name: objective === "SALES" ? "Spring mugs" : "Roof inspections",
      objective,
      destinationType,
      status: "PENDING_REVIEW",
      totalDailyBudgetCents: 3_000,
      launchApprovedAt: new Date(),
      platformCampaigns: { create: { platform: "META", status: "PENDING_REVIEW", externalCampaignId: `${organizationId}-c`, externalAdGroupId: `${organizationId}-as`, externalAdId: `${organizationId}-ad`, budgetPercent: 100, dailyBudgetCents: 3_000 } },
    },
  });
}

type PixelFacts = NonNullable<PixelState["pixel"]>;
const state = (over: { decision?: PixelState["decision"]; purchaseVerified?: boolean; pixel?: Partial<PixelFacts> | null } = {}): PixelState => ({
  decision: over.decision ?? null,
  purchaseVerified: over.purchaseVerified ?? false,
  pixel: over.pixel ? { id: "1", name: "P", lastFiredAt: null, installDetected: false, accessLost: false, otherAdAccount: false, ...over.pixel } : null,
});

async function main() {
  console.log("— when a Pixel is needed —");
  await check("an online shop's sales campaign to its website needs one; the same shop's lead form or call ad doesn't", () => {
    assert.equal(campaignPixelNeed({ nicheId: "ecommerce", objective: "SALES", destination: "WEBSITE" }).need, "required_for_purchases");
    assert.equal(campaignPixelNeed({ nicheId: "ecommerce", objective: "LEADS", destination: "LEAD_FORM" }).need, "not_needed");
    assert.equal(campaignPixelNeed({ nicheId: "ecommerce", objective: "LEADS", destination: "PHONE_CALL" }).need, "not_needed");
    assert.equal(campaignPixelNeed({ nicheId: "ecommerce", objective: "TRAFFIC", destination: "WEBSITE" }).need, "recommended");
  });
  await check("a lead business never needs one: recommended for website leads, not needed for calls, forms or messages", () => {
    assert.equal(campaignPixelNeed({ nicheId: "home_services", objective: "LEADS", destination: "WEBSITE" }).need, "recommended");
    assert.equal(campaignPixelNeed({ nicheId: "home_services", objective: "LEADS", destination: "PHONE_CALL" }).need, "not_needed");
    assert.equal(campaignPixelNeed({ nicheId: "home_services", objective: "LEADS", destination: "DIRECT_MESSAGE" }).need, "not_needed");
    // A "sales" goal from a business that doesn't sell online isn't treated as website purchases.
    assert.equal(campaignPixelNeed({ nicheId: "home_services", objective: "SALES", destination: "WEBSITE" }).need, "recommended");
  });
  await check("for onboarding: required for online shops (or a sales goal), optional otherwise", () => {
    assert.equal(businessPixelNeed({ nicheId: "ecommerce", goal: "LEADS" }), "required_for_purchases");
    assert.equal(businessPixelNeed({ nicheId: "general", goal: "SALES" }), "required_for_purchases");
    assert.equal(businessPixelNeed({ nicheId: "home_services", goal: "LEADS" }), "optional");
  });

  console.log("— chosen vs receiving —");
  await check("each state is named apart: chosen isn't receiving, receiving isn't purchases", () => {
    assert.equal(pixelStatus(state()), "not_set_up");
    assert.equal(pixelStatus(state({ decision: "declined" })), "declined");
    assert.equal(pixelStatus(state({ pixel: {} })), "selected_not_receiving");
    assert.equal(pixelStatus(state({ pixel: { lastFiredAt: new Date() } })), "receiving");
    assert.equal(pixelStatus(state({ pixel: { installDetected: true } })), "receiving");
    assert.equal(pixelStatus(state({ pixel: { lastFiredAt: new Date() }, purchaseVerified: true })), "purchases_verified");
    assert.equal(pixelStatus(state({ pixel: { lastFiredAt: new Date(), accessLost: true } })), "access_lost");
    assert.equal(pixelStatus(state({ pixel: { lastFiredAt: new Date(), otherAdAccount: true } })), "access_lost");
  });
  await check("a purchase campaign launches only with a Pixel receiving events; each refusal says why and how to fix it", () => {
    const need = "required_for_purchases" as const;
    assert.equal(launchGate(need, state({ pixel: { lastFiredAt: new Date() } })).ok, true);
    assert.equal(launchGate(need, state({ pixel: {}, purchaseVerified: true })).ok, true);
    for (const [s, code] of [
      [state(), "no_pixel"],
      [state({ decision: "declined" }), "declined"],
      [state({ pixel: {} }), "not_receiving"],
      [state({ pixel: { lastFiredAt: new Date(), accessLost: true } }), "access_lost"],
    ] as const) {
      const g = launchGate(need, s);
      assert.equal(g.ok, false);
      if (g.ok) continue;
      assert.equal(g.code, code);
      assert.ok(g.reason.length > 40, "a plain reason");
      assert.ok(g.fixes.some((f) => f.href.startsWith("/dashboard/pixel")), "a way to fix it");
    }
  });
  await check("a campaign that doesn't depend on purchases is never held, whatever the Pixel's state", () => {
    for (const need of ["recommended", "not_needed"] as const) {
      for (const s of [state(), state({ decision: "declined" }), state({ pixel: { accessLost: true } })]) assert.equal(launchGate(need, s).ok, true);
    }
  });
  await check("website addresses are reduced to the host", () => {
    assert.equal(hostOf("https://www.Fernleaf.example/shop?x=1"), "fernleaf.example");
    assert.equal(hostOf("fernleaf.example"), "fernleaf.example");
    assert.equal(hostOf(""), null);
  });

  await cleanup();
  await business(SHOP, ACT, "ecommerce", "SALES");
  await business(LEADS, ACT_LEADS, "home_services", "LEADS");
  const now = Date.now();
  const mine: FakePixel = { id: "444444444444", name: "Fernleaf pixel", creation_time: new Date(now - 90 * day).toISOString(), owner_business: { id: "bm1", name: "Fernleaf Ltd" } };
  const elsewhere: FakePixel = { id: "555555555555", name: "Someone's other pixel", creation_time: new Date(now - 10 * day).toISOString() };
  world.shared[ACT] = [mine];
  world.readable = [mine, elsewhere];
  world.hosts[mine.id] = ["fernleaf.example"];

  try {
    console.log("— listing —");
    await check("lists the Pixels shared with the ad account, with the websites Meta saw them on; chooses nothing", async () => {
      const r = await viaMeta(() => accessiblePixels(SHOP));
      assert.ok(r.ok, JSON.stringify(r));
      if (!r.ok) return;
      assert.equal(r.data.adAccountId, ACT);
      assert.deepEqual(r.data.choices.map((c) => c.id), [mine.id]);
      assert.deepEqual(r.data.choices[0].hosts, ["fernleaf.example"]);
      assert.equal(r.data.canCreate, true);
      assert.equal(await db.trackingPixel.count({ where: { organizationId: SHOP } }), 0);
      assert.ok(!calls.some((c) => c.startsWith("POST")), "nothing created");
    });
    await check("without ads_management, creating isn't offered and the missing permission is named", async () => {
      world.granted = ["pages_show_list"];
      const r = await viaMeta(() => accessiblePixels(SHOP));
      world.granted = ["ads_management", "pages_show_list", "pages_read_engagement", "business_management"];
      assert.ok(r.ok && !r.data.canCreate && r.data.missingForCreate.includes("ads_management"), JSON.stringify(r));
    });
    await check("when Meta won't say which permissions were granted, creating is offered and Meta's answer decides", async () => {
      world.permissionsFail = true;
      const r = await viaMeta(() => accessiblePixels(SHOP));
      world.permissionsFail = false;
      assert.ok(r.ok && r.data.canCreate && r.data.permissionsUnknown, JSON.stringify(r));
    });
    await check("a revoked connection is an answer (reconnect), not an empty list", async () => {
      world.tokenRevoked = true;
      const r = await viaMeta(() => accessiblePixels(SHOP));
      world.tokenRevoked = false;
      assert.ok(!r.ok && r.reason === "not_connected", JSON.stringify(r));
    });

    console.log("— choosing —");
    await check("a malformed ID, or a Pixel not shared with this ad account, is refused and nothing is saved", async () => {
      const bad = await viaMeta(() => choosePixel(SHOP, "u1", { pixelId: "abc", websiteDomain: null }));
      assert.equal(bad.ok, false);
      const notShared = await viaMeta(() => choosePixel(SHOP, "u1", { pixelId: elsewhere.id, websiteDomain: "fernleaf.example" }));
      assert.ok(!notShared.ok && /isn't shared with your ad account/.test(notShared.message), JSON.stringify(notShared));
      assert.equal(await db.trackingPixel.count({ where: { organizationId: SHOP } }), 0);
    });
    await check("choosing saves the Pixel with its ad account, the confirmed website, the time and the decision", async () => {
      const r = await viaMeta(() => choosePixel(SHOP, "u1", { pixelId: mine.id, websiteDomain: "https://www.fernleaf.example/" }));
      assert.ok(r.ok && !r.data.already, JSON.stringify(r));
      const row = await db.trackingPixel.findUniqueOrThrow({ where: { organizationId_platform: { organizationId: SHOP, platform: "META" } } });
      assert.equal(row.externalPixelId, mine.id);
      assert.equal(row.metaAdAccountId, ACT);
      assert.equal(row.websiteDomain, "fernleaf.example");
      assert.ok(row.websiteConfirmedAt && row.selectedAt);
      const profile = await db.trackingProfile.findUniqueOrThrow({ where: { organizationId: SHOP } });
      assert.equal(profile.pixelDecision, "use");
      assert.equal(profile.pixelDecidedById, "u1");
      assert.ok(profile.pixelDecidedAt);
    });
    await check("…and it shows as chosen, not as receiving events", async () => {
      const view = await loadPixelSetup(SHOP);
      assert.equal(view.status, "selected_not_receiving");
      assert.equal(view.pixel?.lastFiredAt, null);
    });
    await check("choosing the same Pixel again changes nothing and makes no second record", async () => {
      const r = await viaMeta(() => choosePixel(SHOP, "u1", { pixelId: mine.id, websiteDomain: null }));
      assert.ok(r.ok && r.data.already, JSON.stringify(r));
      assert.equal(await db.trackingPixel.count({ where: { organizationId: SHOP } }), 1);
    });
    await check("creating while a Pixel is chosen is refused — no second Pixel", async () => {
      const posts = calls.filter((c) => c.startsWith("POST")).length;
      const r = await viaMeta(() => createPixelForBusiness(SHOP, "u1", null));
      assert.equal(r.ok, false);
      assert.equal(calls.filter((c) => c.startsWith("POST")).length, posts);
    });

    console.log("— the launch rule —");
    const salesCampaign = await approvedCampaign(SHOP, "SALES", "WEBSITE");
    await check("a chosen Pixel that isn't receiving events holds the shop's purchase campaign", async () => {
      const gate = await campaignLaunchGate(SHOP, { objective: "SALES", destinationType: "WEBSITE" });
      assert.ok(!gate.ok && gate.code === "not_receiving", JSON.stringify(gate));
    });
    await check("auto-launch holds it, says why, and sends nothing to Meta", async () => {
      const before = writes.length;
      const r = await viaMeta(() => maybeGoLive(SHOP));
      assert.equal(r.launched, false);
      assert.match(r.heldBecause ?? "", /Spring mugs: .*Pixel/);
      assert.equal(writes.length, before, writes.join(","));
      const pc = await db.platformCampaign.findFirstOrThrow({ where: { mairoCampaignId: salesCampaign.id } });
      assert.equal(pc.status, "PENDING_REVIEW");
    });
    await check("another business can't read this one's campaign gate as ok", async () => {
      const g = await launchGateForCampaign(LEADS, salesCampaign.id);
      assert.equal(g.ok, false);
    });

    console.log("— access —");
    await check("re-checking reads Meta's last event: once Meta has one, the Pixel counts as receiving", async () => {
      mine.last_fired_time = new Date(now - 3600_000).toISOString();
      const r = await viaMeta(() => recheckPixelAccess(SHOP));
      assert.ok(r.ok && r.data.accessible && r.data.lastFiredAt, JSON.stringify(r));
      assert.equal((await loadPixelSetup(SHOP)).status, "receiving");
      assert.equal((await campaignLaunchGate(SHOP, { objective: "SALES", destinationType: "WEBSITE" })).ok, true);
    });
    await check("access removed in Meta (no longer shared with the ad account) is recorded, and holds the launch again", async () => {
      world.shared[ACT] = [];
      const r = await viaMeta(() => recheckPixelAccess(SHOP));
      assert.ok(r.ok && !r.data.accessible, JSON.stringify(r));
      const row = await db.trackingPixel.findFirstOrThrow({ where: { organizationId: SHOP } });
      assert.ok(row.accessLostAt);
      const gate = await campaignLaunchGate(SHOP, { objective: "SALES", destinationType: "WEBSITE" });
      assert.ok(!gate.ok && gate.code === "access_lost", JSON.stringify(gate));
      assert.equal((await loadOnboarding(SHOP))!.find((s) => s.id === "pixel")?.state, "attention");
    });
    await check("a revoked Meta connection is recorded as lost access", async () => {
      world.shared[ACT] = [mine];
      await db.trackingPixel.updateMany({ where: { organizationId: SHOP }, data: { accessLostAt: null } });
      world.tokenRevoked = true;
      const r = await viaMeta(() => recheckPixelAccess(SHOP));
      world.tokenRevoked = false;
      assert.ok(!r.ok && r.reason === "not_connected", JSON.stringify(r));
      assert.ok((await db.trackingPixel.findFirstOrThrow({ where: { organizationId: SHOP } })).accessLostAt);
    });
    await check("re-checking after access is restored clears it", async () => {
      const r = await viaMeta(() => recheckPixelAccess(SHOP));
      assert.ok(r.ok && r.data.accessible, JSON.stringify(r));
      assert.equal((await db.trackingPixel.findFirstOrThrow({ where: { organizationId: SHOP } })).accessLostAt, null);
    });
    await check("a Pixel confirmed for a different ad account than the one connected now isn't trusted", async () => {
      await db.metaAdAccount.update({ where: { organizationId: SHOP }, data: { metaAdAccountId: "act_999" } });
      assert.equal(pixelStatus(await pixelStateFor(SHOP)), "access_lost");
      await db.metaAdAccount.update({ where: { organizationId: SHOP }, data: { metaAdAccountId: ACT } });
      assert.equal(pixelStatus(await pixelStateFor(SHOP)), "receiving");
    });
    await check("with a working Pixel the purchase campaign is no longer held for it", async () => {
      const before = writes.length;
      const r = await viaMeta(() => maybeGoLive(SHOP));
      assert.doesNotMatch(r.heldBecause ?? "", /Pixel/);
      assert.ok(writes.length > before, `Meta was asked to switch it on: ${JSON.stringify(r)}`);
    });

    console.log("— declining —");
    await check("an online shop can decline: saved, the Pixel stops being used, and purchase campaigns say why they can't launch", async () => {
      await declinePixel(SHOP, "u1", null);
      assert.equal(await db.trackingPixel.count({ where: { organizationId: SHOP } }), 0);
      const profile = await db.trackingProfile.findUniqueOrThrow({ where: { organizationId: SHOP } });
      assert.equal(profile.pixelDecision, "declined");
      const gate = await campaignLaunchGate(SHOP, { objective: "SALES", destinationType: "WEBSITE" });
      assert.ok(!gate.ok && gate.code === "declined" && /chose not to connect/.test(gate.reason), JSON.stringify(gate));
      // Visits and lead forms still can.
      assert.equal((await campaignLaunchGate(SHOP, { objective: "TRAFFIC", destinationType: "WEBSITE" })).ok, true);
      assert.equal((await campaignLaunchGate(SHOP, { objective: "LEADS", destinationType: "LEAD_FORM" })).ok, true);
      const step = (await loadOnboarding(SHOP))!.find((s) => s.id === "pixel")!;
      assert.equal(step.state, "skipped");
      assert.match(step.detail ?? "", /purchase campaigns can't launch/);
    });
    await check("a lead business declines, says how it measures leads, and its lead campaign launches without a Pixel", async () => {
      await declinePixel(LEADS, "u2", "calls");
      const view = await loadPixelSetup(LEADS);
      assert.equal(view.decision, "declined");
      assert.equal(view.leadMeasurement, "calls");
      assert.equal(view.need, "optional");
      const step = (await loadOnboarding(LEADS))!.find((s) => s.id === "pixel")!;
      assert.match(step.label, /optional/);
      assert.equal(step.state, "skipped");
      await setLeadMeasurement(LEADS, "crm");
      assert.equal((await loadPixelSetup(LEADS)).leadMeasurement, "crm");
      await approvedCampaign(LEADS, "LEADS", "LEAD_FORM");
      const before = writes.length;
      const r = await viaMeta(() => maybeGoLive(LEADS));
      assert.doesNotMatch(r.heldBecause ?? "", /Pixel/);
      assert.ok(writes.length > before, `the lead campaign was switched on: ${JSON.stringify(r)}`);
    });

    console.log("— creating —");
    await check("without ads_management, creating is refused before asking Meta, with the Events Manager route", async () => {
      world.granted = ["pages_show_list"];
      const posts = calls.filter((c) => c.startsWith("POST")).length;
      const r = await viaMeta(() => createPixelForBusiness(SHOP, "u1", "fernleaf.example"));
      world.granted = ["ads_management", "pages_show_list", "pages_read_engagement", "business_management"];
      assert.ok(!r.ok && r.reason === "missing_permission" && /Events Manager/.test(r.message), JSON.stringify(r));
      assert.equal(calls.filter((c) => c.startsWith("POST")).length, posts);
      assert.equal(await db.trackingPixel.count({ where: { organizationId: SHOP } }), 0);
    });
    await check("Meta refusing the create isn't a success: nothing saved, and the Events Manager steps are offered", async () => {
      world.createFails = true;
      const r = await viaMeta(() => createPixelForBusiness(SHOP, "u1", "fernleaf.example"));
      world.createFails = false;
      assert.ok(!r.ok && /Events Manager/.test(r.message), JSON.stringify(r));
      assert.equal(await db.trackingPixel.count({ where: { organizationId: SHOP } }), 0);
      assert.equal((await db.trackingProfile.findUniqueOrThrow({ where: { organizationId: SHOP } })).pixelDecision, "declined", "the earlier choice stands");
    });
    await check("creating with permission makes one Pixel in the ad account, saved as chosen — still not receiving", async () => {
      const r = await viaMeta(() => createPixelForBusiness(SHOP, "u1", "fernleaf.example"));
      assert.ok(r.ok, JSON.stringify(r));
      const row = await db.trackingPixel.findFirstOrThrow({ where: { organizationId: SHOP } });
      assert.equal(row.origin, "CREATED_BY_MAIRO");
      assert.equal(row.metaAdAccountId, ACT);
      assert.equal(row.websiteDomain, "fernleaf.example");
      assert.equal((await db.trackingProfile.findUniqueOrThrow({ where: { organizationId: SHOP } })).pixelDecision, "use");
      assert.equal((await loadPixelSetup(SHOP)).status, "selected_not_receiving");
      assert.equal(world.shared[ACT].length, 2);
    });

    console.log("— isolation —");
    await check("one business never sees another's Pixel or choice", async () => {
      const leads = await loadPixelSetup(LEADS);
      assert.equal(leads.pixel, null);
      assert.equal(leads.adAccountId, ACT_LEADS);
      const shop = await loadPixelSetup(SHOP);
      assert.notEqual(shop.leadMeasurement, "crm");
    });
    await check("no access token appears in anything the page is given", async () => {
      const text = JSON.stringify([await loadPixelSetup(SHOP), await viaMeta(() => accessiblePixels(SHOP))]);
      assert.doesNotMatch(text, /fake-token|accessToken/);
    });
  } finally {
    await cleanup();
  }
  console.log(`\nPixel setup: ${passed} checks passed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
