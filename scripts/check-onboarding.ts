// Checks the first-campaign journey can't mislead a new business:
//
//   - The ten setup steps come from records: a new business starts at step 1,
//     a returning one at the first unfinished step, and nothing is "done"
//     that isn't.
//   - Every problem (Meta connection, permissions, missing assets, payment,
//     expired access, campaign errors) is said plainly with a way out, and
//     says that nothing was lost or spent. Meta's raw words stay in the
//     details, never the headline.
//   - The pre-launch review keeps Meta's bill and MAIRO's apart, names what
//     can't be measured, and lists the approvals still needed.
//   - Suggestions say why.
//
//   npm run check:onboarding   (pure; no database, no network)

import assert from "node:assert/strict";
import { focusStep, onboardingSteps, progressCount, resumeHref, type OnboardingFacts } from "../src/lib/onboarding/progress";
import {
  classifyMetaConnect,
  connectProblemFromParams,
  explainAdAccountStatus,
  explainCampaignError,
  explainConnectionState,
  explainMetaConnect,
  explainSubscription,
} from "../src/lib/onboarding/problems";
import { budgetMeaning, recommendGoal } from "../src/lib/onboarding/goal";
import { parseDraft, resumeScreen } from "../src/lib/onboarding/draft";
import { composePreLaunch, type PreLaunchInput } from "../src/lib/onboarding/prelaunch";
import { nextUp } from "../src/lib/onboarding/team";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const now = new Date("2026-10-23T15:00:00Z");
const blank: OnboardingFacts = {
  business: false,
  website: null,
  learned: { state: "none", note: null },
  goal: false,
  plan: null,
  meta: null,
  subscription: { paid: false, status: null, trial: false, planName: null },
  campaign: { draftStep: null, built: false, buildError: null, launchApproved: false, live: false, launchError: null, id: null },
  now,
};
const facts = (over: Partial<OnboardingFacts>): OnboardingFacts => ({ ...blank, ...over, campaign: { ...blank.campaign, ...(over.campaign ?? {}) }, subscription: { ...blank.subscription, ...(over.subscription ?? {}) } });
const state = (f: OnboardingFacts) => Object.fromEntries(onboardingSteps(f).map((s) => [s.id, s.state]));
const connected = { status: "CONNECTED", adAccount: "act_1", pageName: "Peak Roofing", hasPage: true, expiresAt: null };
const approvedPlan = { status: "APPROVED", yourChanges: 0, activated: true };
const paid = { paid: true, status: "active", trial: false, planName: "Growth" };

console.log("— the ten steps —");
check("a brand-new business starts at step 1, with nothing done", () => {
  const steps = onboardingSteps(blank);
  assert.equal(steps.length, 10);
  assert.equal(focusStep(steps)?.id, "business");
  assert.equal(focusStep(steps)?.state, "current");
  assert.deepEqual(progressCount(steps), { finished: 0, total: 10 });
  assert.equal(resumeHref(steps), "/onboarding");
});
check("the steps are the journey, in order, each with who does it and why", () => {
  const steps = onboardingSteps(blank);
  assert.deepEqual(steps.map((s) => s.id), ["business", "learn", "goal", "plan", "edit", "approve", "connect", "subscribe", "prepare", "launch"]);
  assert.ok(steps.every((s) => s.why.length > 10));
  assert.deepEqual(steps.filter((s) => s.who === "mairo").map((s) => s.id), ["learn", "plan", "prepare"]);
});
check("a returning business resumes at the first unfinished step", () => {
  const f = facts({ business: true, website: "https://peak.example", learned: { state: "read", note: null }, goal: true, plan: { status: "DRAFT", yourChanges: 0, activated: false } });
  const steps = onboardingSteps(f);
  assert.equal(focusStep(steps)?.id, "edit");
  assert.equal(resumeHref(steps), "/plan");
});
check("no website: MAIRO's reading step is skipped, not failed", () => {
  const s = onboardingSteps(facts({ business: true }));
  assert.equal(s[1].state, "skipped");
  assert.match(s[1].detail ?? "", /No website/);
  assert.equal(focusStep(s)?.id, "goal");
});
check("a website MAIRO couldn't read is skipped with the reason", () => {
  const s = onboardingSteps(facts({ business: true, website: "https://x.example", learned: { state: "failed", note: "The site didn't answer." } }));
  assert.equal(s[1].state, "skipped");
  assert.equal(s[1].detail, "The site didn't answer.");
});
check("approving the plan as written skips the optional edit step; changes count when made", () => {
  assert.equal(state(facts({ business: true, goal: true, plan: approvedPlan })).edit, "skipped");
  const s = onboardingSteps(facts({ business: true, goal: true, plan: { status: "DRAFT", yourChanges: 2, activated: false } }));
  assert.equal(s[4].state, "done");
  assert.match(s[4].detail ?? "", /2 changes/);
  assert.equal(focusStep(s)?.id, "approve");
});
check("an expired Meta connection needs attention, with Reconnect — not 'done'", () => {
  const s = onboardingSteps(facts({ business: true, goal: true, plan: approvedPlan, meta: { ...connected, expiresAt: new Date(now.getTime() - 1000) } }));
  const c = s.find((x) => x.id === "connect")!;
  assert.equal(c.state, "attention");
  assert.equal(c.problem?.code, "expired");
  assert.match(c.problem?.fix?.href ?? "", /\/api\/meta\/connect/);
  assert.equal(focusStep(s)?.id, "connect");
});
check("connected without a Facebook Page needs attention", () => {
  const s = onboardingSteps(facts({ business: true, goal: true, plan: approvedPlan, meta: { ...connected, hasPage: false, pageName: null } }));
  assert.equal(s.find((x) => x.id === "connect")?.problem?.code, "no_page");
});
check("a declined card: the subscription step says so, and resumes at the payment", () => {
  const s = onboardingSteps(facts({ business: true, goal: true, plan: approvedPlan, meta: connected, subscription: { paid: false, status: "incomplete", trial: false, planName: "Growth" } }));
  const sub = s.find((x) => x.id === "subscribe")!;
  assert.equal(sub.state, "attention");
  assert.equal(sub.problem?.code, "card_declined");
  assert.match(sub.problem?.kept ?? "", /saved/);
});
check("built but not approved: the final approval is next; nothing says live", () => {
  const s = onboardingSteps(facts({ business: true, goal: true, plan: approvedPlan, meta: connected, subscription: paid, campaign: { ...blank.campaign, built: true, id: "c1" } }));
  assert.equal(focusStep(s)?.id, "launch");
  assert.ok(!s.some((x) => /live/i.test(x.detail ?? "")));
});
check("approved and waiting on Meta is 'waiting'; live only when Meta confirmed it", () => {
  const base = { business: true, goal: true, plan: approvedPlan, meta: connected, subscription: paid };
  assert.equal(state(facts({ ...base, campaign: { ...blank.campaign, built: true, launchApproved: true } })).launch, "waiting");
  const live = onboardingSteps(facts({ ...base, campaign: { ...blank.campaign, built: true, launchApproved: true, live: true } }));
  assert.equal(focusStep(live), null);
  assert.match(live[9].detail ?? "", /Meta confirmed/);
});
check("Meta refusing to switch it on is explained on the launch step", () => {
  const s = onboardingSteps(facts({ business: true, goal: true, plan: approvedPlan, meta: connected, subscription: paid, campaign: { ...blank.campaign, built: true, launchApproved: true, launchError: "(#100) Ad account has no valid funding source" } }));
  const l = s.find((x) => x.id === "launch")!;
  assert.equal(l.state, "attention");
  assert.equal(l.problem?.code, "funding");
});
check("a failed build is explained, with Meta's words kept for support", () => {
  const s = onboardingSteps(facts({ business: true, goal: true, plan: approvedPlan, meta: connected, subscription: paid, campaign: { ...blank.campaign, buildError: "Invalid parameter: Your ad must be associated with a Facebook Page" } }));
  const p = s.find((x) => x.id === "prepare")!;
  assert.equal(p.state, "attention");
  assert.equal(p.problem?.code, "page");
  assert.match(p.problem?.technical ?? "", /Invalid parameter/);
  assert.doesNotMatch(p.problem?.title ?? "", /Invalid parameter/);
});

console.log("\n— problems, said plainly —");
check("closing the Facebook window or saying no is 'denied', and nothing changed", () => {
  assert.equal(classifyMetaConnect({ error: "access_denied", errorReason: "user_denied", description: "Permissions error" }), "denied");
  const p = explainMetaConnect("denied", { returnTo: "/plan/activate" });
  assert.match(p.message, /Nothing changed/);
  assert.match(p.fix!.href, /returnTo=%2Fplan%2Factivate/);
});
check("a misconfigured app is MAIRO's problem, not the owner's — the setting goes to the details", () => {
  assert.equal(classifyMetaConnect({ message: "Error validating client secret." }), "setup");
  const p = explainMetaConnect("setup", { returnTo: "/plan/activate", technical: "META_APP_SECRET doesn't match" });
  assert.match(p.message, /not something you did/);
  assert.doesNotMatch(`${p.title} ${p.message}`, /META_|secret/i);
  assert.match(p.technical ?? "", /META_APP_SECRET/);
});
check("switched-off permissions are named in plain words, and connecting again re-asks for them", () => {
  const p = explainMetaConnect("permissions", { returnTo: "/dashboard/launch", missing: ["ads_management", "pages_show_list"] });
  assert.match(p.message, /create and manage your ads/);
  assert.match(p.message, /see your Facebook Pages/);
  assert.match(p.fix!.href, /rerequest=1/);
});
check("no ad account and no Page each say how to make one", () => {
  assert.match(explainMetaConnect("no_ad_account", { returnTo: "/x" }).fix!.href, /business\.facebook\.com/);
  assert.match(explainMetaConnect("no_page", { returnTo: "/x" }).fix!.href, /pages\/create/);
});
check("an ad account Meta disabled, or one with an unpaid balance, is named", () => {
  assert.equal(explainAdAccountStatus(1), null);
  assert.equal(explainAdAccountStatus(3)?.code, "account_unsettled");
  assert.equal(explainAdAccountStatus(2)?.code, "account_disabled");
  assert.equal(explainAdAccountStatus(7)?.code, "account_review");
});
check("a connection problem survives the trip back from Facebook, and unknown codes stay safe", () => {
  assert.equal(connectProblemFromParams({ metaError: "permissions", missing: "ads_management" }, "/plan/activate")?.code, "permissions");
  assert.equal(connectProblemFromParams({ metaError: "<script>" }, "/plan/activate")?.code, "unknown");
  assert.equal(connectProblemFromParams({ acct: "3" }, "/plan/activate")?.code, "account_unsettled");
  assert.equal(connectProblemFromParams({}, "/plan/activate"), null);
});
check("an expired or broken connection says to reconnect, and that nothing is lost", () => {
  const e = explainConnectionState({ status: "TOKEN_EXPIRED", hasPage: true }, { returnTo: "/x" })!;
  assert.equal(e.code, "expired");
  assert.match(e.kept, /saved/);
  assert.equal(explainConnectionState({ status: "ERROR", hasPage: true }, { returnTo: "/x" })?.code, "connection_error");
  assert.equal(explainConnectionState({ status: "CONNECTED", hasPage: true }, { returnTo: "/x" }), null);
});
check("Meta's campaign errors become plain problems with the right way out", () => {
  const cases: [string, string][] = [
    ["(#100) The ad account has no valid payment method", "funding"],
    ["Special Ad Categories required for housing ads", "special_category"],
    ["Budget is too low: minimum daily budget is $1.00", "budget"],
    ["Ad disapproved: violates advertising policies", "policy"],
    ["(#17) User request limit reached", "unavailable"],
    ["Error validating access token: Session has expired", "expired"],
    ["(#200) Requires ads_management permission", "permissions"],
    ["Invalid image aspect ratio", "creative"],
    ["Targeting spec is invalid: location radius too small", "audience"],
    ["Something nobody anticipated", "invalid"],
  ];
  for (const [raw, code] of cases) {
    const p = explainCampaignError(raw);
    assert.equal(p.code, code, raw);
    assert.equal(p.technical, raw);
    assert.match(p.kept, /Nothing was launched or charged/);
  }
});
check("payment problems: declined, expired, failed later, cancelled at checkout — and paid is no problem", () => {
  assert.equal(explainSubscription("incomplete")?.code, "card_declined");
  assert.equal(explainSubscription("incomplete_expired")?.code, "payment_expired");
  assert.equal(explainSubscription("past_due")?.code, "payment_failed");
  assert.equal(explainSubscription(null, { checkoutCancelled: true })?.code, "checkout_cancelled");
  assert.match(explainSubscription(null, { checkoutCancelled: true })!.message, /nothing was charged/);
  assert.equal(explainSubscription("active", { paid: true }), null);
  assert.equal(explainSubscription(null), null);
});

console.log("\n— suggestions say why —");
check("the website's main button decides the suggested goal, and says so", () => {
  const shop = recommendGoal({ primaryCta: "Shop now" });
  assert.equal(shop.goal, "SALES");
  assert.match(shop.why, /“Shop now”/);
  assert.equal(recommendGoal({ primaryCta: "Book an appointment" }).goal, "LEADS");
});
check("without a website, the industry decides; otherwise leads, with the reason", () => {
  assert.equal(recommendGoal({ industry: "Dental practice" }).goal, "LEADS");
  assert.equal(recommendGoal({ industry: "Clothing boutique" }).goal, "SALES");
  const d = recommendGoal({});
  assert.equal(d.goal, "LEADS");
  assert.ok(d.why.length > 20);
});
check("the budget is explained per day", () => {
  assert.match(budgetMeaning(1000).text, /About \$33 a day/);
  assert.match(budgetMeaning(200).text, /learns slowly/);
});
check("what happens next is said as future work, never as activity", () => {
  for (const id of ["business", "plan", "connect", "prepare", "launch"] as const) {
    const n = nextUp(id)!;
    assert.doesNotMatch(n.text, /\b(is|are) (working|reading|writing|building)\b/i, id);
  }
});

console.log("\n— saving and resuming —");
check("a damaged draft reads as empty rather than failing", () => {
  assert.deepEqual(parseDraft("nonsense"), {});
  assert.deepEqual(parseDraft(null), {});
  const d = parseDraft({ screen: "goal", business: { offering: "Roofs", savedAt: "2026-10-23" }, goal: { monthlyBudget: "x" } });
  assert.equal(d.business?.offering, "Roofs");
  assert.equal(d.goal?.monthlyBudget, undefined);
});
check("resuming opens where they stopped, but never past an unsaved first screen", () => {
  const saved = { screen: "goal" as const, business: { offering: "Roofs", savedAt: "x" } };
  assert.equal(resumeScreen(saved, "https://peak.example"), "goal");
  assert.equal(resumeScreen({ screen: "goal" }, null), "business");
  assert.equal(resumeScreen({ ...saved, screen: "learn" }, null), "goal");
  assert.equal(resumeScreen(saved, "https://peak.example", "learn"), "learn");
  assert.equal(resumeScreen(saved, null, "bogus"), "goal");
});

console.log("\n— the pre-launch review —");
const plan = {
  v: 1 as const, summary: "", goal: "LEADS" as const, goalWhy: "Roofing grows from enquiries.", platforms: ["FACEBOOK" as const, "INSTAGRAM" as const], platformsWhy: "", dailyBudget: 40, budgetWhy: "",
  audience: { summary: "", location: "Austin, TX", ageMin: 30, ageMax: 65, interests: ["Home improvement"] },
  campaignType: "LEAD_FORM" as never, campaignTypeWhy: "", product: "Roof repair", productWhy: "", offer: "", offerWhy: "", creativeStrategy: "", concepts: [], hooks: [], retargeting: "", website: [], split: [], structure: [],
};
const pre: PreLaunchInput = {
  plan,
  campaign: { id: "c1", name: "Roof repair — Austin", objective: "LEADS", destinationType: "WEBSITE", destinationUrl: "https://peak.example/quote", destinationPhone: null, geoLabel: "Austin, TX", geoRadius: 25, ageMin: 30, ageMax: 65, genders: 0, advantageAudience: true, placements: ["FACEBOOK_FEED", "INSTAGRAM_FEED"], budgetType: "DAILY", totalDailyBudgetCents: 4000, lifetimeBudgetCents: null, startDate: null, endDate: null, launchApprovedAt: null, specialAdCategory: null },
  ads: [{ id: "a1", kind: "IMAGE", headline: "Leaking roof?", primaryText: "Free inspection this week.", callToAction: "GET_QUOTE", image: "https://img/1.jpg", sourceAdName: null }],
  account: { adAccount: "act_1", pageName: "Peak Roofing", connected: true },
  subscription: { tier: "GROWTH", status: "active", paid: true, trialEnds: null },
  pixelActive: false,
  adReview: null,
  funding: { state: "done", detail: null },
  differences: [{ key: "budget", label: "Daily budget", approved: "$35/day", real: "$40/day", status: "different", note: null }, { key: "goal", label: "Goal", approved: "Leads", real: "Leads", status: "same", note: null }],
  timeZone: "America/Chicago",
};
check("Meta's bill and MAIRO's are separate, each named for who charges it", () => {
  const r = composePreLaunch(pre);
  assert.equal(r.budget.headline, "$40 a day");
  assert.equal(r.budget.per30, "$1,200");
  assert.match(r.subscription.price, /a month/);
  assert.equal(r.subscription.name, "Growth");
  assert.notEqual(r.subscription.price, r.budget.headline);
});
check("everything the owner is approving is there: goal, objective, audience, ads, account", () => {
  const r = composePreLaunch(pre);
  assert.equal(r.goal.label, "More leads and enquiries");
  assert.equal(r.objective.label, "Leads");
  assert.match(r.audience.location, /Austin, TX and 25 miles around/);
  assert.match(r.audience.placements, /Facebook feed, Instagram feed/);
  assert.equal(r.ads[0].label, "Main ad");
  assert.equal(r.account.pageName, "Peak Roofing");
  assert.match(r.destination, /peak\.example\/quote/);
});
check("a website campaign without an active pixel says what can't be counted yet", () => {
  const r = composePreLaunch(pre);
  assert.ok(r.tracking.some((t) => /can't yet count sales or sign-ups/.test(t)));
  assert.ok(composePreLaunch({ ...pre, pixelActive: true }).tracking.some((t) => /pixel is active/.test(t)));
  assert.ok(composePreLaunch({ ...pre, campaign: { ...pre.campaign, destinationType: "LEAD_FORM" } }).tracking.some((t) => /nothing to install/.test(t)));
});
check("the approvals still needed are listed, and the owner's comes first and is pending", () => {
  const r = composePreLaunch(pre);
  assert.deepEqual(r.approvals.map((a) => a.key), ["you", "subscription", "funding", "review"]);
  assert.equal(r.approvals[0].state, "pending");
  assert.equal(r.approvals[3].state, "pending");
  assert.equal(composePreLaunch({ ...pre, adReview: "DISAPPROVED" }).approvals[3].state, "problem");
  assert.equal(composePreLaunch({ ...pre, adReview: "DISAPPROVED" }).ready, false);
});
check("an approval that needs fixing links straight to the fix", () => {
  const r = composePreLaunch({ ...pre, funding: { state: "problem", detail: "There is no payment method on this Meta ad account yet." } });
  const funding = r.approvals.find((a) => a.key === "funding")!;
  assert.equal(funding.state, "problem");
  assert.match(funding.fix?.href ?? "", /billing_hub/);
  assert.equal(r.approvals.find((a) => a.key === "you")?.fix, undefined);
});
check("a lifetime budget is shown as a total, and only real differences from the plan are listed", () => {
  const r = composePreLaunch({ ...pre, campaign: { ...pre.campaign, budgetType: "LIFETIME", lifetimeBudgetCents: 50000, endDate: new Date("2026-11-30T00:00:00Z") } });
  assert.equal(r.budget.headline, "Up to $500 in total");
  assert.equal(r.budget.per30, null);
  assert.deepEqual(composePreLaunch(pre).differences.map((d) => d.key), ["budget"]);
});

console.log(`\nOnboarding: ${passed} checks passed`);
