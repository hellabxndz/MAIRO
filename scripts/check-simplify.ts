// Checks the simplified dashboard: four sections everywhere, the Overview's
// box sends words to the real screen for them (and anything else to the
// assistant, never launching anything itself), Results' periods and findings
// say only what the figures say, and "similar to my previous campaign"
// copies the campaign's settings but never its ad, dates or approval.
//
//   npm run check:simplify   (pure; no database, Meta or Stripe)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { intentOf, subjectOf } from "../src/lib/dashboard/intent";
import { findings, resultsRange } from "../src/lib/dashboard/results";
import { planAbout, planFromCampaign, repeatStep, type PreviousCampaign } from "../src/lib/campaigns/repeat";
import { newPlan } from "../src/lib/campaigns/plan";
import { EMPTY_METRICS } from "../src/lib/ad-platforms/types";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

check("the navigation is exactly Overview, Campaigns, Creatives, Results — on desktop and phone", () => {
  const shell = readFileSync("src/components/mairo/app-shell.tsx", "utf8");
  const primary = shell.slice(shell.indexOf("export const PRIMARY_NAV"), shell.indexOf("export const ASSISTANT_NAV"));
  const labels = [...primary.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Overview", "Campaigns", "Creatives", "Results"]);
  assert.match(shell, /const MOBILE_NAV: NavEntry\[\] = PRIMARY_NAV;/);
  assert.match(shell, /grid-cols-4/);
  const secondary = shell.slice(shell.indexOf("export const SECONDARY_NAV"), shell.indexOf("const MOBILE_NAV"));
  assert.deepEqual([...secondary.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]), ["Account"]);
  // Every page that used to be a destination still belongs to one of them.
  for (const old of ["/dashboard/decisions", "/dashboard/coach", "/dashboard/intelligence", "/dashboard/team", "/dashboard/agents", "/dashboard/analytics", "/dashboard/reports", "/dashboard/creative-studio", "/dashboard/settings", "/dashboard/billing", "/dashboard/pixel"]) {
    assert.ok(shell.includes(`"${old}"`), `${old} isn't owned by any section`);
  }
});

check("Account holds what the owner looks for, and logging out", () => {
  const page = readFileSync("src/app/dashboard/account/page.tsx", "utf8");
  for (const label of ["Business profile", "Connected Meta account", "Pixel & tracking", "Billing & subscription", "Change plan", "Notifications", "Help center", "Log out"]) {
    assert.ok(page.includes(label), `Account is missing ${label}`);
  }
  assert.match(page, /action=\{signOutAction\}/);
  const layout = readFileSync("src/app/dashboard/layout.tsx", "utf8");
  assert.match(layout, /"\/dashboard\/account",/, "Account must open before Meta is connected");
});

check("the box sends wanting to advertise to campaign creation, with what was typed", () => {
  const i = intentOf("Create an ad for our summer sale");
  assert.equal(i.kind, "campaign");
  assert.equal(i.href, "/dashboard/create?start=new&about=our%20summer%20sale");
  assert.equal(intentOf("Promote our new menu").kind, "campaign");
  assert.equal(subjectOf("Can you create a Facebook ad for the spring collection?"), "the spring collection");
  // A goal isn't a thing to advertise: the wizard asks the goal itself.
  assert.equal(intentOf("Get more leads").href, "/dashboard/create?start=new");
});

check("the box sends questions about the numbers to Results, approvals to the Approval Center", () => {
  assert.equal(intentOf("How are my ads performing?").href, "/dashboard/results");
  assert.equal(intentOf("how much have I spent").href, "/dashboard/results");
  assert.equal(intentOf("What's waiting for me to approve?").href, "/dashboard/decisions");
  assert.equal(intentOf("Run my last campaign again").href, "/dashboard/create?start=similar");
  assert.equal(intentOf("Make an image of my hoodie").href, "/dashboard/creative-studio");
  assert.equal(intentOf("set up my pixel").href, "/dashboard/pixel");
});

check("anything else is a question for the assistant — never a launch", () => {
  const i = intentOf("Why am I not getting customers?");
  assert.equal(i.kind, "ask");
  assert.equal(i.href, "/dashboard/agents?ask=Why%20am%20I%20not%20getting%20customers%3F");
  // "Should I…" about a campaign is advice, not an instruction to build one.
  assert.equal(intentOf("Should I create a new campaign?").kind, "ask");
  assert.equal(intentOf("").kind, "ask");
  // No route the box can produce does anything by being opened.
  for (const t of ["launch my ads now", "spend $500 today", "approve everything", "delete my campaign", "x".repeat(2000)]) {
    const href = intentOf(t).href;
    assert.ok(/^\/dashboard\/(create|results|decisions|creative-studio|pixel|billing|agents)\b/.test(href), `${t} → ${href}`);
    assert.ok(href.length < 700, "the question is capped");
  }
});

check("Results' periods: today, 7 and 30 days, and a custom period that can't be in the future or over a year", () => {
  const now = new Date(2026, 9, 30, 15, 0);
  assert.equal(resultsRange({}, now).key, "30d");
  assert.equal(resultsRange({ range: "today" }, now).label, "Today");
  const c = resultsRange({ range: "custom", from: "2026-10-01", to: "2026-12-31" }, now);
  assert.equal(c.key, "custom");
  assert.equal(c.to, "2026-10-30", "clamped to today");
  assert.equal(c.from, "2026-10-01");
  // The period before has the same length, ending the day before.
  assert.equal(Math.round((c.range.until.getTime() - c.range.since.getTime()) / 86_400_000), Math.round((c.previous.until.getTime() - c.previous.since.getTime()) / 86_400_000));
  assert.ok(c.previous.until < c.range.since);
  const swapped = resultsRange({ range: "custom", from: "2026-10-20", to: "2026-10-10" }, now);
  assert.equal(swapped.from, "2026-10-10");
  const long = resultsRange({ range: "custom", from: "2020-01-01", to: "2026-10-30" }, now);
  assert.ok(long.range.until.getTime() - long.range.since.getTime() <= 366 * 86_400_000);
  assert.equal(resultsRange({ range: "custom", from: "2026-02-30", to: "nope" }, now).key, "30d", "a bad date falls back");
});

check("What's working and what needs improvement come only from reported figures", () => {
  const m = (spend: number, leads: number | null) => ({ ...EMPTY_METRICS, spendCents: spend, leads });
  const { working, improve } = findings("leads", [
    { id: "a", name: "Spring", metrics: m(10_000, 20), hasData: true },
    { id: "b", name: "Summer", metrics: m(5_000, 20), hasData: true },
    { id: "c", name: "Autumn", metrics: m(4_000, 0), hasData: true },
    { id: "d", name: "Silent", metrics: m(0, null), hasData: false },
  ]);
  assert.deepEqual(working.map((w) => w.text), ["“Summer” brought 20 leads at $2.50 each.", "“Spring” brought 20 leads at $5.00 each."]);
  assert.deepEqual(improve.map((w) => w.text), ["“Autumn” spent $40.00 with no leads reported yet."]);
  // A campaign Meta reported nothing for isn't described at all.
  assert.ok(![...working, ...improve].some((f) => f.text.includes("Silent")));
});

const fresh = newPlan({ service: "meta", businessName: "Shop", website: "shop.test", offering: "Hoodies", targetAudience: "Students", differentiator: "", messageChannel: "MESSENGER", timeZone: "", metaPercent: 100 });
const previous: PreviousCampaign = {
  name: "Spring", objective: "LEADS", destinationType: "PHONE_CALL", destinationUrl: null, destinationPhone: "+15125550100", messageChannel: "MESSENGER",
  geoKey: "2421836", geoLabel: "Austin, Texas", geoRadius: 15, ageMin: 25, ageMax: 55, genders: 0, totalDailyBudgetCents: 2500,
  budgetType: "DAILY", lifetimeBudgetCents: null, placements: [], specialAdCategory: null, metaAppId: null, promotes: "SERVICE",
};

check("a copied campaign keeps goal, audience, budget and destination — but not the ad, dates or approval", () => {
  const p = planFromCampaign(fresh, previous);
  assert.equal(p.goal, "LEADS");
  assert.equal(p.destinationType, "PHONE_CALL");
  assert.equal(p.destinationValue, "+15125550100");
  assert.equal(p.geoLabel, "Austin, Texas");
  assert.equal(p.audienceMode, "manual");
  assert.equal(p.dailyAmount, 25);
  assert.equal(p.promotes, "SERVICE");
  assert.equal(p.adChoice, "none", "the ad step always runs");
  assert.equal(p.startOnDate, false);
  assert.equal(p.endOnDate, false);
  assert.equal(p.businessName, "Shop");
  assert.equal(planFromCampaign(fresh, { ...previous, promotes: "nonsense" }).promotes, null);
});

check("a copied plan opens on a chosen step, never on the review or launch", () => {
  assert.equal(repeatStep("budget"), "budget");
  assert.equal(repeatStep("ad"), "ad");
  assert.equal(repeatStep("review"), null);
  assert.equal(repeatStep("launch"), null);
  assert.equal(repeatStep(undefined), null);
});

check("“Promote something different” fills in the first answer only", () => {
  assert.equal(planAbout(fresh, "20% off all hoodies").promotes, "OFFER");
  assert.equal(planAbout(fresh, "Our new hoodie").promotes, "OTHER");
  assert.equal(planAbout(fresh, "Our new hoodie").promotesDetail, "Our new hoodie");
  assert.equal(planAbout(fresh, "Our new hoodie").goal, null);
  assert.equal(planAbout(fresh, "   ").promotes, null);
});

console.log(`\n${passed} checks passed.`);
