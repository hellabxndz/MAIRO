// Checks the pricing page and plan copy can't promise more than the product
// does:
//
//   - The three business plans keep their prices and trial.
//   - Every plan difference shown comes from the flags and limits the server
//     enforces, and the automation modes match what each plan may switch on.
//   - No automation level offers a change nothing implements (bid changes),
//     and the four always-approved actions are listed on every plan.
//   - Integrations are described as they are: Meta-only for advertising;
//     Shopify and Google Tag Manager for tracking, Stripe for billing, and
//     posting limited until Meta approves it.
//   - Plan feature lines don't carry claims nothing backs.
//
//   npm run check:pricing   (pure; no database writes, no network)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLANS, FREELANCER_PLANS, STARTER_TRIAL_DAYS } from "../src/lib/plans";
import { DEFAULT_ENTITLEMENTS } from "../src/lib/entitlements";
import { ACTIONS, ALWAYS_NEEDS_APPROVAL, automaticActions, mayDoAutomatically } from "../src/lib/automation/levels";
import { actionFor } from "../src/lib/decisions/guardrails";
import { BUSINESS_TIERS, INTEGRATIONS, MONEY_AND_CONTROL, alwaysYours, automationModes, comparison, pictures, planStories } from "../src/lib/pricing/compare";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("— prices and plans —");
check("Starter, Growth and Scale keep their prices; only Starter has the 7-day trial", () => {
  assert.deepEqual(PLANS.map((p) => [p.tier, p.priceMonthly, p.trialDays ?? 0]), [
    ["STARTER", 149.99, STARTER_TRIAL_DAYS],
    ["GROWTH", 239.99, 0],
    ["SCALE", 499.99, 0],
  ]);
  assert.equal(STARTER_TRIAL_DAYS, 7);
});
check("the plan stories use those prices and the enforced limits", () => {
  const s = planStories();
  assert.deepEqual(s.map((p) => p.price), [149.99, 239.99, 499.99]);
  assert.match(s[0].highlights[0], /Up to 3 campaigns/);
  assert.match(s[1].highlights[0], /Up to 15 campaigns/);
  assert.equal(s[2].highlights[0], "Unlimited campaigns");
  for (const p of s) assert.match(p.highlights[1], new RegExp(`${DEFAULT_ENTITLEMENTS[p.tier].studio_credits_monthly} AI image credits`));
});
check("automation modes per plan are exactly what the server lets each plan switch on", () => {
  assert.deepEqual(automationModes("STARTER"), ["MANUAL"]);
  assert.deepEqual(automationModes("GROWTH"), ["MANUAL", "ASSISTED"]);
  assert.deepEqual(automationModes("SCALE"), ["MANUAL", "ASSISTED", "AUTOPILOT"]);
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
    assert.equal(rows.social.cells[t].kind === "yes", e.social_posting, `social ${t}`);
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
  const growth = PLANS.find((p) => p.tier === "GROWTH")!.features.join(" ");
  const scale = PLANS.find((p) => p.tier === "SCALE")!.features.join(" ");
  assert.match(growth, /when you switch it on/i);
  assert.match(growth, /never raising your total/);
  assert.match(scale, /Full Autopilot, when you switch it on/);
  assert.doesNotMatch(`${growth} ${scale}`, /\bbids?\b/i);
});

console.log("\n— integrations —");
check("advertising is Meta-only; Google Ads and TikTok are listed as not supported", () => {
  const full = INTEGRATIONS.filter((i) => i.status === "full").map((i) => i.key);
  assert.deepEqual(full, ["meta", "instagram-ads"]);
  assert.equal(INTEGRATIONS.find((i) => i.key === "other-ads")?.status, "unsupported");
});
check("Shopify and Tag Manager are for tracking, Stripe for billing, posting limited — each with its limits", () => {
  const by = Object.fromEntries(INTEGRATIONS.map((i) => [i.key, i]));
  assert.equal(by.shopify.status, "tracking");
  assert.match(by.shopify.limits ?? "", /Not a Shopify app/);
  assert.equal(by.gtm.status, "tracking");
  assert.equal(by.stripe.status, "billing");
  assert.match(by.stripe.limits ?? "", /Meta charges your ad account/);
  assert.equal(by["social-posting"].status, "limited");
  assert.match(by["social-posting"].limits ?? "", /Meta's approval/);
});
check("Scale's posting lines say they depend on Meta's approval", () => {
  const scale = PLANS.find((p) => p.tier === "SCALE")!.features.filter((f) => /posting|publishing/i.test(f));
  assert.ok(scale.length >= 2);
  for (const f of scale) assert.match(f, /once Meta approves/);
});
check("no plan carries a service promise nothing in the product backs", () => {
  const all = [...PLANS, ...FREELANCER_PLANS].flatMap((p) => p.features).join(" | ");
  assert.doesNotMatch(all, /48-hour|turnaround|Video creative included|guarantee/i);
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
const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
check("the landing page uses the shared pricing, integration and control data", () => {
  for (const name of ["planStories", "comparison", "alwaysYours", "INTEGRATIONS", "MONEY_AND_CONTROL", "EVERY_PLAN"]) assert.ok(page.includes(name), name);
});
check("the landing page has the 'Why pay for MAIRO?' section, and no fake urgency or testimonials", () => {
  assert.match(page, /Why pay for MAIRO\?/);
  assert.doesNotMatch(page, /limited time|only \d+ (spots|left)|hurry|act now|testimonial|★★★★★/i);
});
check("the freelancer link promises a sign-up, not plans the page doesn't show", () => {
  assert.doesNotMatch(page, /See the freelancer and agency plans/);
});

console.log(`\nPricing: ${passed} checks passed`);
