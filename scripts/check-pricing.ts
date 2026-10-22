// Checks the pricing page and plan copy can't promise more than the product
// does:
//
//   - The two plans sold — MAIRO Pro and MAIRO Scale — have their prices and
//     trial, and the earlier plans are kept, unsold, at theirs.
//   - Every plan difference shown comes from the flags and limits the server
//     enforces, and the automation modes match what each plan may switch on.
//   - No automation level offers a change nothing implements (bid changes),
//     and the four always-approved actions are listed on every plan.
//   - Integrations are described as they are: Meta-only for advertising;
//     Shopify and Google Tag Manager for tracking, Stripe for billing, and
//     no social media posting, which MAIRO no longer offers.
//   - Plan feature lines don't carry claims nothing backs.
//
//   npm run check:pricing   (pure; no database writes, no network)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLANS, LEGACY_PLANS, FREELANCER_PLANS, PRO_TRIAL_DAYS, SOLD_TIERS, campaignLimitText, creativeRequestText, trialDaysFor } from "../src/lib/plans";
import { DEFAULT_ENTITLEMENTS, planComparison } from "../src/lib/entitlements";
import { ACTIONS, ALWAYS_NEEDS_APPROVAL, automaticActions, mayDoAutomatically } from "../src/lib/automation/levels";
import { actionFor } from "../src/lib/decisions/guardrails";
import { BUSINESS_TIERS, INTEGRATIONS, MONEY_AND_CONTROL, STATUS_LABEL, alwaysYours, automationLevels, automationModes, comparison, pictures, planStories, pricingFacts } from "../src/lib/pricing/compare";
import { DEFAULT_COSTS } from "../src/lib/creative-studio/costs";

// The landing page itself is a thin route; the pricing block is components/landing/home.tsx.
const page = readFileSync(new URL("../src/components/landing/home.tsx", import.meta.url), "utf8");

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("— prices and plans —");
check("exactly two plans are sold: MAIRO Pro $139.99 with a 7-day trial, MAIRO Scale $299.99 with none", () => {
  assert.deepEqual(PLANS.map((p) => [p.tier, p.name, p.priceMonthly, p.trialDays ?? 0]), [
    ["PRO", "MAIRO Pro", 139.99, PRO_TRIAL_DAYS],
    ["SCALE_V2", "MAIRO Scale", 299.99, 0],
  ]);
  assert.equal(PRO_TRIAL_DAYS, 7);
  assert.deepEqual(SOLD_TIERS, ["PRO", "SCALE_V2"]);
  assert.deepEqual(BUSINESS_TIERS, ["PRO", "SCALE_V2"]);
  assert.equal(trialDaysFor("SCALE_V2"), 0);
  assert.equal(PLANS.find((p) => p.featured)?.tier, "SCALE_V2", "Scale is the Most Popular card");
  assert.deepEqual(PLANS.map((p) => p.cta), ["Get Started with Pro", "Start Scaling with MAIRO"]);
});
check("the earlier plans are kept, unsold, at the prices their subscribers pay", () => {
  assert.deepEqual(LEGACY_PLANS.map((p) => [p.tier, p.priceMonthly, Boolean(p.legacy)]), [
    ["STARTER", 149.99, true],
    ["GROWTH", 239.99, true],
    ["SCALE", 499.99, true],
  ]);
  for (const p of [...LEGACY_PLANS, ...FREELANCER_PLANS]) assert.ok(p.legacy && !SOLD_TIERS.includes(p.tier), p.tier);
  // Their entitlements are what they bought — nothing taken away by the change.
  assert.equal(DEFAULT_ENTITLEMENTS.SCALE.studio_credits_monthly, 400);
  assert.equal(DEFAULT_ENTITLEMENTS.GROWTH.auto_optimize, true);
  assert.equal(DEFAULT_ENTITLEMENTS.STARTER.campaign_limit, 3);
  for (const t of ["STARTER", "GROWTH", "SCALE", "STUDIO", "AGENCY"] as const) {
    assert.equal(DEFAULT_ENTITLEMENTS[t].member_limit, Infinity, `${t} keeps its team`);
    assert.equal(DEFAULT_ENTITLEMENTS[t].growth_coach, true, `${t} keeps the Coach`);
  }
});
check("the plan stories use those prices and the enforced limits", () => {
  const s = planStories();
  assert.deepEqual(s.map((p) => p.price), [139.99, 299.99]);
  assert.equal(s[0].highlights[0], "1 Meta ad account");
  assert.equal(s[1].highlights[0], "Up to 3 Meta ad accounts");
  assert.match(s[0].highlights[1], /Up to 15 campaigns/);
  assert.equal(s[1].highlights[1], "Unlimited campaigns");
  for (const p of s) assert.match(p.highlights[2], new RegExp(`${DEFAULT_ENTITLEMENTS[p.tier].studio_credits_monthly} AI image credits`));
});
check("Pro and Scale differ by what the server enforces", () => {
  const pro = DEFAULT_ENTITLEMENTS.PRO;
  const scale = DEFAULT_ENTITLEMENTS.SCALE_V2;
  assert.deepEqual([pro.studio_credits_monthly, scale.studio_credits_monthly], [50, 200]);
  assert.deepEqual([pro.ad_account_limit, scale.ad_account_limit], [1, 3]);
  assert.deepEqual([pro.member_limit, scale.member_limit], [1, Infinity]);
  // Social media posting isn't offered on either plan any more.
  assert.equal(pro.social_posting, false);
  assert.equal(scale.social_posting, false);
  for (const f of ["advanced_analytics", "advanced_tracking", "growth_coach", "auto_optimize", "autopilot"] as const) {
    assert.equal(pro[f], false, `Pro: ${f}`);
    assert.equal(scale[f], true, `Scale: ${f}`);
  }
  assert.ok(pro.meta_ads && scale.meta_ads);
});
check("automation modes per plan are exactly what the server lets each plan switch on", () => {
  assert.deepEqual(automationModes("PRO"), ["MANUAL"]);
  assert.deepEqual(automationModes("SCALE_V2"), ["MANUAL", "ASSISTED", "AUTOPILOT"]);
  for (const t of BUSINESS_TIERS) {
    assert.equal(automationModes(t).includes("ASSISTED"), DEFAULT_ENTITLEMENTS[t].auto_optimize, t);
    assert.equal(automationModes(t).includes("AUTOPILOT"), DEFAULT_ENTITLEMENTS[t].autopilot, t);
  }
});
check("every yes/no in the comparison follows an enforced flag", () => {
  const rows = Object.fromEntries(comparison().flatMap((g) => g.rows).map((r) => [r.key, r]));
  for (const t of BUSINESS_TIERS) {
    const e = DEFAULT_ENTITLEMENTS[t];
    assert.equal(rows.assisted.cells[t].kind === "yes", e.auto_optimize, `assisted ${t}`);
    assert.equal(rows.autopilot.cells[t].kind === "yes", e.autopilot, `autopilot ${t}`);
    assert.equal(rows["per-ad"].cells[t].kind === "yes", e.advanced_analytics, `per-ad ${t}`);
    const credits = rows.credits.cells[t];
    assert.ok(credits.kind === "text" && credits.text === `${e.studio_credits_monthly} a month` && credits.note === `about ${pictures(e.studio_credits_monthly)} pictures`);
  }
});
check("optional automation is marked optional — nothing is switched on by buying a plan", () => {
  const rows = comparison().flatMap((g) => g.rows);
  for (const key of ["assisted", "autopilot"]) {
    for (const c of Object.values(rows.find((r) => r.key === key)!.cells)) if (c.kind === "yes") assert.equal(c.note, "Optional");
  }
});

console.log("\n— automation and approvals —");
check("no level offers bid changes, which nothing implements", () => {
  assert.ok(!ACTIONS.some((a) => /bid/i.test(`${a.action} ${a.label}`)));
  for (const level of ["ASSISTED", "AUTOPILOT"] as const) for (const a of automaticActions(level)) assert.doesNotMatch(a.label, /bid/i);
});
check("Full Autopilot's extra — widening who sees an ad — is something MAIRO actually makes", () => {
  const extra = automaticActions("AUTOPILOT").filter((a) => !automaticActions("ASSISTED").some((b) => b.action === a.action));
  assert.deepEqual(extra.map((a) => a.action), ["adjust-audience"]);
  assert.equal(actionFor([{ type: "widen-audience", platform: "META", mairoCampaignId: "c", campaignName: "C", from: { geoRadius: 10, ageMin: 25, ageMax: 55 }, to: { geoRadius: 25, ageMin: 25, ageMax: 65 } }]), "adjust-audience");
});
check("launching, raising the total, overspending and connecting always wait — and are shown on every plan", () => {
  assert.equal(alwaysYours().length, ALWAYS_NEEDS_APPROVAL.length);
  for (const level of ["MANUAL", "ASSISTED", "AUTOPILOT"] as const) for (const a of ALWAYS_NEEDS_APPROVAL) assert.equal(mayDoAutomatically(level, a), false);
  assert.ok(alwaysYours().some((a) => /Launch a new campaign/.test(a.label)));
  assert.ok(alwaysYours().some((a) => /Increase your total budget/.test(a.label)));
});
check("plan feature lines for automation say it's opt-in and never raises the total", () => {
  const pro = PLANS.find((p) => p.tier === "PRO")!.features.join(" ");
  const scale = PLANS.find((p) => p.tier === "SCALE_V2")!.features.join(" ");
  assert.match(pro, /recommendations, each one yours to approve/);
  assert.match(pro, /Your approval before any campaign launches or spending changes/);
  assert.match(scale, /AI Assist and Full Autopilot inside your limits, never raising your total/);
  assert.doesNotMatch(`${pro} ${scale}`, /\bbids?\b/i);
});

console.log("\n— integrations —");
check("advertising is Meta-only; Google Ads and TikTok are listed as not supported", () => {
  const full = INTEGRATIONS.filter((i) => i.status === "full").map((i) => i.key);
  assert.deepEqual(full, ["meta", "instagram-ads"]);
  assert.equal(INTEGRATIONS.find((i) => i.key === "other-ads")?.status, "unsupported");
});
check("Shopify and Tag Manager are for tracking, Stripe for billing — each with its limits; no social posting listed", () => {
  const by = Object.fromEntries(INTEGRATIONS.map((i) => [i.key, i]));
  assert.equal(by.shopify.status, "tracking");
  assert.match(by.shopify.limits ?? "", /Not a Shopify app/);
  assert.equal(by.gtm.status, "tracking");
  assert.equal(by.stripe.status, "billing");
  assert.match(by.stripe.limits ?? "", /Meta charges your ad account/);
  assert.equal(by["social-posting"], undefined, "social media posting isn't offered any more");
  assert.equal(STATUS_LABEL.pending, "Waiting for Meta's approval");
});
check("nothing sold or shown publicly offers social media posting", () => {
  const sold = PLANS.flatMap((p) => [p.headline, p.tagline, ...p.features]).join(" | ");
  assert.doesNotMatch(sold, /social manager|instagram content|post approval|social post|posting/i);
  assert.ok(!comparison().some((g) => g.key === "social"), "no social row in the comparison");
  assert.ok(!pricingFacts().some((f) => f.key === "social"), "no social fact");
  assert.doesNotMatch(page, /Social Manager|Publishing once Meta approves/);
  assert.match(page, /it doesn't post to your Instagram or Facebook profile/);
});
check("no plan carries a service promise nothing in the product backs", () => {
  const all = [...PLANS, ...FREELANCER_PLANS].flatMap((p) => p.features).join(" | ");
  assert.doesNotMatch(all, /48-hour|turnaround|Video creative included|guarantee/i);
});

console.log("\n— plan explainers —");
check("Manual, AI Assist and Full Autopilot name the plans the server lets switch them on", () => {
  const levels = automationLevels();
  assert.deepEqual(levels.map((l) => [l.level, l.plans]), [
    ["MANUAL", "Every plan"],
    ["ASSISTED", "MAIRO Scale"],
    ["AUTOPILOT", "MAIRO Scale"],
  ]);
  for (const l of levels.slice(1)) {
    assert.deepEqual(l.does, automaticActions(l.level).map((a) => a.label));
    assert.ok(!l.does.some((d) => /raise|launch/i.test(d)), `${l.label} must not list raising budgets or launching`);
  }
});
check("the trial, credits, limits and Social facts are the enforced numbers", () => {
  const facts = Object.fromEntries(pricingFacts().map((f) => [f.key, f.body]));
  assert.match(facts.trial, new RegExp(`^MAIRO Pro starts with a ${PRO_TRIAL_DAYS}-day free trial`));
  assert.match(facts.trial, /charges it when the trial ends, unless you cancel first/);
  assert.match(facts.trial, /MAIRO Scale is billed from the day you subscribe/);
  assert.match(facts.trial, /never needs a card/);
  assert.match(facts.credits, new RegExp(`standard picture uses ${DEFAULT_COSTS.standard}`));
  assert.match(facts.credits, /don't carry over/);
  const e = DEFAULT_ENTITLEMENTS;
  assert.match(facts.limits, new RegExp(`MAIRO Pro ${e.PRO.campaign_limit}, MAIRO Scale unlimited`));
  assert.match(facts.limits, new RegExp(`MAIRO Pro ${e.PRO.creative_limit} a month, MAIRO Scale ${e.SCALE_V2.creative_limit} a month`));
});

console.log("\n— one set of numbers —");
check("the plan cards' limits are the entitlement limits the server enforces", () => {
  for (const p of PLANS) {
    const e = DEFAULT_ENTITLEMENTS[p.tier];
    assert.equal(p.limits.campaigns, e.campaign_limit, `${p.name} campaigns`);
    assert.equal(p.limits.creativesPerMonth, e.creative_limit, `${p.name} creative requests`);
    assert.ok(p.features.includes(`${e.studio_credits_monthly} AI creative credits a month`), `${p.name} credits line`);
    if (!Number.isFinite(e.campaign_limit)) assert.ok(p.features.includes("Unlimited campaigns"), `${p.name} campaigns line`);
    // Ad accounts: the line on the card is the allowance the server enforces.
    assert.ok(p.features.some((f) => f.startsWith(e.ad_account_limit === 1 ? "Connect 1 Meta advertising account" : `Connect up to ${e.ad_account_limit} Meta advertising accounts`)), `${p.name} ad accounts line`);
  }
});
check("an unlimited limit is never shown as the word Infinity", () => {
  assert.equal(campaignLimitText(Infinity), "unlimited campaigns");
  assert.equal(campaignLimitText(1), "1 campaign");
  assert.equal(campaignLimitText(15), "15 campaigns");
  assert.equal(creativeRequestText(10), "10 creative requests a month");
  for (const t of BUSINESS_TIERS) for (const row of planComparison(t)) assert.doesNotMatch(row.value, /Infinity/, `${t} ${row.label}`);
  // Every screen that prints a campaign limit goes through the helper.
  for (const f of ["src/app/dashboard/settings/billing-section.tsx", "src/app/dashboard/campaigns/page.tsx", "src/app/dashboard/campaigns/delete-campaign.tsx", "src/app/aios/organizations/[id]/page.tsx"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\{\s*(?:current|upgradeTarget|plan)\.limits\.campaigns\s*\}|\{upgrade\.campaigns\}/, f);
  }
});
check("the limits the server enforces are read from the entitlements", () => {
  const creative = readFileSync(new URL("../src/lib/actions/creative-actions.ts", import.meta.url), "utf8");
  assert.match(creative, /entitlementsFor\(organizationId\)\)\.creative_limit/);
  assert.doesNotMatch(creative, /limits\.creativesPerMonth/);
  const launch = readFileSync(new URL("../src/lib/campaigns/auto-launch.ts", import.meta.url), "utf8");
  assert.match(launch, /entitlementsFor\(organizationId\)\)\.campaign_limit/);
  assert.doesNotMatch(launch, /limits\.campaigns/);
});

console.log("\n— money and control —");
check("the money-and-control facts cover all eight questions", () => {
  assert.deepEqual(MONEY_AND_CONTROL.map((m) => m.key), ["budget", "who-pays", "automation", "approvals", "performance", "pause", "ending", "disconnect"]);
  const text = MONEY_AND_CONTROL.map((m) => m.body).join(" ");
  assert.match(text, /never raises your total budget or launches a new campaign without your approval/);
  assert.match(text, /keep spending at the budgets you approved until you pause them/);
  assert.match(text, /Disconnecting doesn't pause running campaigns/);
});

console.log("\n— the public page —");
check("the landing page uses the shared pricing, integration and control data", () => {
  for (const name of ["planStories", "comparison", "alwaysYours", "INTEGRATIONS", "MONEY_AND_CONTROL", "EVERY_PLAN"]) assert.ok(page.includes(name), name);
});
check("the landing page says what MAIRO does, and has no fake urgency or testimonials", () => {
  assert.match(page, /What MAIRO actually does for you/);
  for (const name of ["automationLevels", "pricingFacts"]) assert.ok(page.includes(name), name);
  assert.doesNotMatch(page, /limited time|only \d+ (spots|left)|hurry|act now|testimonial|★★★★★/i);
});
check("the pricing section is two large cards, Pro then Scale, with ad spend separate", () => {
  assert.match(page, /Two plans\. One AI advertising team\./);
  assert.match(page, /md:grid-cols-2/);
  assert.match(page, /Most Popular/);
  assert.match(page, /Ad spend is separate/);
  assert.doesNotMatch(page, /Three plans/);
  assert.doesNotMatch(page, /for-freelancers/, "the freelancer plans are no longer offered");
});

console.log(`\nPricing: ${passed} checks passed`);
