// Walks a business through the first-campaign journey against the database
// and a pretend Meta — never the real one, and nothing is spent:
//
//   brand-new customer → saving and resuming → MAIRO learning (or not) →
//   the free plan and its AI team records → a failed Meta connection →
//   missing permissions → no Page → a failed payment → the campaign draft →
//   the pre-launch review → Meta refusing the launch → the final approval,
//   pressed twice → cancelling before launch → another business untouched.
//
//   npm run check:onboarding-db   (needs DATABASE_URL; makes no network calls)

import assert from "node:assert/strict";

// The plan is written by MAIRO's own rules here, not an AI call.
delete process.env.ANTHROPIC_API_KEY;
process.env.META_APP_ID ||= "onb-app";
process.env.META_APP_SECRET ||= "onb-secret";
process.env.META_REDIRECT_URI ||= "http://localhost:3000/api/meta/callback";

import { db } from "../src/lib/db";
import { withGraphTransport } from "../src/lib/meta/client";
import { completeMetaConnection } from "../src/lib/meta/connect-flow";
import { loadOnboarding, loadOnboardingFacts } from "../src/lib/onboarding/progress-store";
import { focusStep, resumeHref } from "../src/lib/onboarding/progress";
import { learnBusiness, saveBusinessStep, saveGoalDraft } from "../src/lib/onboarding/setup";
import { parseDraft, resumeScreen } from "../src/lib/onboarding/draft";
import { setupWork } from "../src/lib/onboarding/team";
import { cancelPlanLaunch, launchPlanCampaign } from "../src/lib/onboarding/launch";
import { loadPreLaunch } from "../src/lib/onboarding/prelaunch";
import { approve, activateIfPaid, createStrategy } from "../src/lib/strategy/store";
import { draftFromApprovedPlan } from "../src/lib/strategy/campaign";
import { loadJourney } from "../src/lib/strategy/journey";
import { maybeGoLive } from "../src/lib/campaigns/auto-launch";
import { executionBlock } from "../src/lib/billing/execution";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "e2e-onb";
const ORG = `${TAG}-org`;
const OTHER = `${TAG}-other`;
const ACT = `act_${TAG}`;

// --- A pretend Meta ---------------------------------------------------------------

const world = {
  tokenError: null as string | null,
  declined: [] as string[],
  adAccounts: [{ id: ACT, name: "Peak Roofing", account_status: 1 }] as { id: string; name: string; account_status: number }[],
  pages: [{ id: "pg1", name: "Peak Roofing" }] as { id: string; name: string }[],
  funded: false,
  refuseWrites: null as string | null,
};
const writes: string[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fakeMeta: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/v\d+\.\d+/, "");
  const method = (init?.method ?? "GET").toUpperCase();
  if (path === "/oauth/access_token") {
    if (world.tokenError) return json({ error: { message: world.tokenError, type: "OAuthException", code: 1 } }, 400);
    return json({ access_token: "EAAB-onb-token", token_type: "bearer", expires_in: 5_184_000 });
  }
  if (path === "/me/permissions") {
    const all = ["ads_management", "pages_show_list", "pages_read_engagement", "business_management"];
    return json({ data: all.map((p) => ({ permission: p, status: world.declined.includes(p) ? "declined" : "granted" })) });
  }
  if (path === "/me/adaccounts") return json({ data: world.adAccounts });
  if (path === "/me/accounts") return json({ data: world.pages });
  if (method !== "GET") {
    writes.push(`${method} ${path}`);
    if (world.refuseWrites) return json({ error: { message: world.refuseWrites, type: "OAuthException", code: 100 } }, 400);
    return json({ success: true });
  }
  if (path === `/${ACT}`) {
    return json({ id: ACT, account_status: 1, currency: "USD", balance: "0", amount_spent: "0", ...(world.funded ? { funding_source_details: { id: "fs1", display_string: "Visa ·4242" } } : {}) });
  }
  return json({ data: [] });
};
const viaMeta = <T,>(fn: () => Promise<T>) => withGraphTransport({ fetch: fakeMeta, record: false }, fn);

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

/** The campaign the builder makes from the plan: built on Meta, switched off, not approved. */
async function builtCampaign(organizationId: string) {
  const c = await db.mairoCampaign.create({
    data: {
      organizationId,
      name: "Roof repair — Austin",
      objective: "LEADS",
      status: "PENDING_REVIEW",
      totalDailyBudgetCents: 4_000,
      geoLabel: "Austin, TX",
      destinationType: "LEAD_FORM",
      platformCampaigns: { create: { platform: "META", status: "PENDING_REVIEW", externalCampaignId: `${organizationId}-c`, externalAdGroupId: `${organizationId}-as`, externalAdId: `${organizationId}-ad`, budgetPercent: 100, dailyBudgetCents: 4_000 } },
      ads: { create: { position: 0, kind: "IMAGE", headline: "Leaking roof?", primaryText: "Free inspection this week.", callToAction: "GET_QUOTE", imageUrl: "https://img.example/roof.jpg" } },
    },
  });
  await db.strategyPlan.update({ where: { organizationId }, data: { campaignId: c.id } });
  return c.id;
}

async function main() {
  await cleanup();
  await db.organization.create({ data: { id: ORG, name: "Peak Roofing", paymentRequired: true, timezone: "America/Chicago" } });
  await db.organization.create({ data: { id: OTHER, name: "Someone Else", paymentRequired: true } });

  try {
    console.log("— a brand-new customer —");
    await check("starts at step 1 of 10, with nothing done and no AI activity shown", async () => {
      const steps = (await loadOnboarding(ORG))!;
      assert.equal(focusStep(steps)?.id, "business");
      assert.equal(steps.filter((s) => s.state === "done").length, 0);
      assert.equal((await setupWork(ORG)).length, 0);
    });

    await check("a website that isn't a web address is refused, and nothing is saved", async () => {
      const r = await saveBusinessStep(ORG, { offering: "Roof repair", website: "not a website" });
      assert.equal(r.ok, false);
      assert.equal((await db.organization.findUniqueOrThrow({ where: { id: ORG } })).onboardingDraft, null);
    });

    await check("saving the first screen keeps the answers, and the next visit opens the next screen", async () => {
      const r = await saveBusinessStep(ORG, { offering: "Roof repair and inspections", website: "peak-roofing.invalid", customerLocation: "Austin, TX", industry: "Roofing" });
      assert.ok(r.ok && r.website === "https://peak-roofing.invalid/", JSON.stringify(r));
      const org = await db.organization.findUniqueOrThrow({ where: { id: ORG } });
      const draft = parseDraft(org.onboardingDraft);
      assert.equal(draft.business?.offering, "Roof repair and inspections");
      assert.equal(resumeScreen(draft, org.website), "learn");
      assert.equal((await loadOnboardingFacts(ORG))?.business, true);
    });

    await check("a website MAIRO can't read is said plainly, and setup carries on", async () => {
      const r = await learnBusiness(ORG);
      assert.equal(r.read, false);
      assert.ok(r.note && r.note.length > 10);
      assert.deepEqual(r.learned, [], "nothing is presented as learned");
      assert.equal(r.suggestion.goal, "LEADS");
      assert.match(r.suggestion.why, /enquiries|bookings/);
      const steps = (await loadOnboarding(ORG))!;
      assert.equal(steps[1].state, "skipped");
      assert.equal(focusStep(steps)?.id, "goal");
    });

    await check("what MAIRO did learn is shown as found — and the suggestion cites it", async () => {
      await db.businessBrain.create({ data: { organizationId: ORG, analyzedAt: new Date(), profileJson: JSON.stringify({ overview: "Family-run roofers serving Austin since 2009.", primaryCta: "Get a free quote", serviceArea: "Austin and Round Rock" }) } });
      const r = await learnBusiness(ORG);
      assert.equal(r.read, true);
      assert.ok(r.learned.some((l) => l.label === "What you do" && /Family-run roofers/.test(l.value)));
      assert.match(r.suggestion.why, /“Get a free quote”/);
    });

    await check("the goal screen is saved as they go — a returning visit resumes there", async () => {
      assert.ok((await saveGoalDraft(ORG, { primaryGoal: "LEADS", monthlyBudget: 900, destinationType: "LEAD_FORM" })).ok);
      const org = await db.organization.findUniqueOrThrow({ where: { id: ORG } });
      const draft = parseDraft(org.onboardingDraft);
      assert.equal(draft.goal?.monthlyBudget, 900);
      assert.equal(resumeScreen(draft, org.website), "goal");
    });

    console.log("\n— the free plan —");
    await db.onboardingIntake.create({ data: { organizationId: ORG, primaryGoal: "LEADS", monthlyBudgetCents: 90_000, offering: "Roof repair and inspections", customerLocation: "Austin, TX" } });
    await db.organization.update({ where: { id: ORG }, data: { onboardingDraft: undefined, defaultDestination: "LEAD_FORM" } });

    await check("the plan is written and the specialists' parts are recorded — and only what happened", async () => {
      const r = await createStrategy(ORG);
      assert.ok(r.ok);
      const work = await setupWork(ORG);
      const tasks = work.map((w) => w.task);
      assert.ok(tasks.includes("write-plan") && tasks.includes("plan-audience"), tasks.join(","));
      const plan = JSON.parse((await db.strategyPlan.findUniqueOrThrow({ where: { organizationId: ORG } })).planJson);
      assert.equal(tasks.includes("plan-creative"), plan.concepts.length + plan.hooks.length > 0, "a Creative record only if the plan has ad ideas");
      assert.ok(work.every((w) => w.status !== "RUNNING"));
    });

    await check("a returning customer resumes at the plan review", async () => {
      const steps = (await loadOnboarding(ORG))!;
      assert.equal(focusStep(steps)?.id, "edit");
      assert.equal(resumeHref(steps), "/plan");
    });

    await check("approving the plan moves on to connecting Meta", async () => {
      const row = await db.strategyPlan.findUniqueOrThrow({ where: { organizationId: ORG } });
      assert.ok((await approve(ORG, row.version)).ok);
      const steps = (await loadOnboarding(ORG))!;
      assert.equal(steps.find((s) => s.id === "edit")?.state, "skipped");
      assert.equal(focusStep(steps)?.id, "connect");
    });

    console.log("\n— connecting Meta —");
    await check("a failed connection (MAIRO's app misconfigured) saves nothing, and says it isn't the owner's fault", async () => {
      world.tokenError = "Error validating client secret.";
      const r = await viaMeta(() => completeMetaConnection(ORG, "code-1"));
      world.tokenError = null;
      assert.ok(!r.ok && r.code === "setup", JSON.stringify(r));
      assert.match(r.ok ? "" : (r.technical ?? ""), /META_APP_SECRET/);
      assert.equal(await db.metaAdAccount.count({ where: { organizationId: ORG } }), 0);
    });

    await check("permission to manage ads switched off: refused, named, nothing saved", async () => {
      world.declined = ["ads_management"];
      const r = await viaMeta(() => completeMetaConnection(ORG, "code-2"));
      world.declined = [];
      assert.ok(!r.ok && r.code === "permissions" && r.missing?.includes("ads_management"), JSON.stringify(r));
      assert.equal(await db.metaAdAccount.count({ where: { organizationId: ORG } }), 0);
    });

    await check("Pages permission switched off is caught too", async () => {
      world.declined = ["pages_show_list"];
      const r = await viaMeta(() => completeMetaConnection(ORG, "code-3"));
      world.declined = [];
      assert.ok(!r.ok && r.missing?.includes("pages_show_list"));
    });

    await check("no ad account on the login: told how to make one, nothing saved", async () => {
      const saved = world.adAccounts;
      world.adAccounts = [];
      const r = await viaMeta(() => completeMetaConnection(ORG, "code-4"));
      world.adAccounts = saved;
      assert.ok(!r.ok && r.code === "no_ad_account");
      assert.equal(await db.metaAdAccount.count({ where: { organizationId: ORG } }), 0);
    });

    await check("connected without a Facebook Page: kept, and the step asks for a Page", async () => {
      const saved = world.pages;
      world.pages = [];
      const r = await viaMeta(() => completeMetaConnection(ORG, "code-5"));
      world.pages = saved;
      assert.ok(r.ok && r.pageId === null);
      const c = (await loadOnboarding(ORG))!.find((s) => s.id === "connect")!;
      assert.equal(c.state, "attention");
      assert.equal(c.problem?.code, "no_page");
    });

    await check("connecting again with a Page completes the step, keeping the same ad account", async () => {
      const r = await viaMeta(() => completeMetaConnection(ORG, "code-6"));
      assert.ok(r.ok && r.adAccountId === ACT && r.pageId === "pg1");
      assert.equal((await loadOnboarding(ORG))!.find((s) => s.id === "connect")?.state, "done");
      assert.equal(writes.length, 0, "connecting writes nothing to Meta");
    });

    await check("an expired connection is flagged for reconnecting — nothing else is lost", async () => {
      await db.metaAdAccount.update({ where: { organizationId: ORG }, data: { tokenExpiresAt: new Date(Date.now() - 60_000) } });
      const steps = (await loadOnboarding(ORG))!;
      assert.equal(steps.find((s) => s.id === "connect")?.problem?.code, "expired");
      assert.equal(steps.find((s) => s.id === "approve")?.state, "done", "the approved plan is still approved");
      await db.metaAdAccount.update({ where: { organizationId: ORG }, data: { tokenExpiresAt: new Date(Date.now() + 86_400_000) } });
    });

    console.log("\n— paying for MAIRO —");
    await check("a declined card: progress kept, the step says so, and nothing can be built", async () => {
      await db.organization.update({ where: { id: ORG }, data: { subscriptionTier: "GROWTH", subscriptionStatus: "incomplete" } });
      const steps = (await loadOnboarding(ORG))!;
      const sub = steps.find((s) => s.id === "subscribe")!;
      assert.equal(sub.state, "attention");
      assert.equal(sub.problem?.code, "card_declined");
      assert.equal(steps.find((s) => s.id === "connect")?.state, "done");
      assert.ok(await executionBlock(ORG), "building is refused while unpaid");
      assert.equal((await activateIfPaid(ORG))?.activatedAt, null);
    });

    await check("once paid, the plan activates and MAIRO prepares the campaign next", async () => {
      await db.organization.update({ where: { id: ORG }, data: { subscriptionStatus: "active" } });
      assert.ok((await activateIfPaid(ORG))?.activatedAt);
      assert.equal(focusStep((await loadOnboarding(ORG))!)?.id, "prepare");
    });

    console.log("\n— the campaign —");
    await check("the campaign draft is made once from the approved plan, even when asked twice at once", async () => {
      const [a, b] = await Promise.all([draftFromApprovedPlan(ORG, null), draftFromApprovedPlan(ORG, null)]);
      assert.ok(a && a === b, `${a} vs ${b}`);
      assert.equal(await db.campaignDraft.count({ where: { organizationId: ORG } }), 1);
      assert.equal((await db.strategyPlan.findUniqueOrThrow({ where: { organizationId: ORG } })).campaignDraftId, a);
    });

    const campaignId = await builtCampaign(ORG);

    await check("built but not approved: nothing goes live, and the final approval is next", async () => {
      world.funded = true;
      const r = await viaMeta(() => maybeGoLive(ORG));
      assert.equal(r.launched, false);
      assert.equal(writes.length, 0);
      assert.equal(focusStep((await loadOnboarding(ORG))!)?.id, "launch");
    });

    await check("the pre-launch review shows both bills apart, the ads, the account and the approvals needed", async () => {
      const journey = (await viaMeta(() => loadJourney(ORG, { checkFunding: true })))!;
      const review = (await loadPreLaunch(ORG, journey))!;
      assert.equal(review.budget.headline, "$40 a day");
      assert.match(review.subscription.price, /a month/);
      assert.equal(review.ads[0].headline, "Leaking roof?");
      assert.equal(review.account.adAccount, ACT);
      assert.equal(review.account.pageName, "Peak Roofing");
      assert.equal(review.approvals.find((a) => a.key === "you")?.state, "pending");
      assert.equal(review.approvals.find((a) => a.key === "funding")?.state, "done");
      assert.ok(review.ready);
    });

    await check("Meta refusing to switch it on: not called live, explained, and left switched off", async () => {
      world.refuseWrites = "(#100) The ad account has no valid payment method";
      const r = await viaMeta(() => launchPlanCampaign(ORG));
      world.refuseWrites = null;
      assert.ok(r.ok && !r.live && r.problem?.code === "funding", JSON.stringify(r));
      const pc = await db.platformCampaign.findFirstOrThrow({ where: { mairoCampaignId: campaignId } });
      assert.equal(pc.status, "PENDING_REVIEW");
      assert.notEqual((await db.mairoCampaign.findUniqueOrThrow({ where: { id: campaignId } })).status, "ACTIVE");
      assert.equal(await db.agentRun.count({ where: { organizationId: ORG, task: "launch" } }), 0, "no 'put live' record");
      assert.equal((await loadOnboarding(ORG))!.find((s) => s.id === "launch")?.state, "attention");
    });

    await check("cancelling before launch takes back the approval — and nothing then goes live", async () => {
      const c = await cancelPlanLaunch(ORG);
      assert.ok(c.ok, JSON.stringify(c));
      assert.equal((await db.mairoCampaign.findUniqueOrThrow({ where: { id: campaignId } })).launchApprovedAt, null);
      await db.platformCampaign.updateMany({ where: { mairoCampaignId: campaignId }, data: { lastError: null } });
      const before = writes.length;
      const r = await viaMeta(() => maybeGoLive(ORG, { onlyCampaignId: campaignId, approvedByPerson: true }));
      assert.equal(r.launched, false);
      assert.equal(writes.length, before, "nothing sent to Meta");
      assert.equal(await db.agentRun.count({ where: { organizationId: ORG, task: "cancel-launch" } }), 1);
      const again = await cancelPlanLaunch(ORG);
      assert.ok(again.ok && /wasn't approved/.test(again.message));
    });

    await check("the final approval, pressed twice at once: approved once, switched on once, live only when Meta confirmed", async () => {
      const before = writes.length;
      const [a, b] = await viaMeta(() => Promise.all([launchPlanCampaign(ORG), launchPlanCampaign(ORG)]));
      assert.ok(a.ok && b.ok, JSON.stringify([a, b]));
      const live = [a, b].filter((r) => r.ok && r.live && !/already/.test(r.message ?? "")).length;
      assert.equal(live, 1, JSON.stringify([a, b]));
      assert.ok(writes.length > before, "Meta was asked to switch it on");
      assert.equal(await db.agentRun.count({ where: { organizationId: ORG, task: "launch" } }), 1, "one 'put live' record");
      const c = await db.mairoCampaign.findUniqueOrThrow({ where: { id: campaignId }, include: { platformCampaigns: true } });
      assert.equal(c.status, "ACTIVE");
      assert.equal(c.platformCampaigns[0].status, "ACTIVE");
      const steps = (await loadOnboarding(ORG))!;
      assert.equal(focusStep(steps), null, "setup complete");
      const third = await viaMeta(() => launchPlanCampaign(ORG));
      assert.ok(third.ok && third.live && /already live/.test(third.message ?? ""));
    });

    await check("once live, the launch can't be 'cancelled' — the owner is told to pause instead", async () => {
      const c = await cancelPlanLaunch(ORG);
      assert.ok(!c.ok && /pause/i.test(c.error));
    });

    console.log("\n— another business —");
    await check("sees none of it, and can't launch or cancel this one's campaign", async () => {
      assert.equal((await setupWork(OTHER)).length, 0);
      const facts = (await loadOnboardingFacts(OTHER))!;
      assert.equal(facts.business, false);
      assert.equal(facts.campaign.id, null);
      const l = await viaMeta(() => launchPlanCampaign(OTHER));
      assert.ok(!l.ok);
      const c = await cancelPlanLaunch(OTHER);
      assert.ok(!c.ok);
      assert.equal((await db.mairoCampaign.findUniqueOrThrow({ where: { id: campaignId } })).status, "ACTIVE");
    });
  } finally {
    await cleanup();
  }
  console.log(`\nOnboarding journey (database): ${passed} checks passed. Simulated Meta only — nothing was sent to Meta or spent.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
