// Checks the simplified MAIRO interface's rules: the Overview's four numbers
// per goal (never CPM, CTR, CPC, frequency or impressions), plain-language
// goals and statuses, campaign tabs, "What's next", the single insight,
// creatives ranked by the business's goal (never clicks for a sales goal), and
// the assistant's fixed list of destinations.
//
//   npm run check:simple-ui   (no database or network needed)

import assert from "node:assert/strict";
import { EMPTY_METRICS, type PlatformMetrics } from "../src/lib/ad-platforms/types";
import { dayLabel, money, performanceTiles, pickInsight, whatsNext } from "../src/lib/dashboard/home";
import { campaignTab, familyFor, goalLabel, optimizingFor, primaryResult, statusLabel } from "../src/lib/dashboard/campaigns";
import { goalResults, rankByGoal, resultPhrase, type HubAd } from "../src/lib/creatives/hub";
import { DESTINATIONS } from "../src/lib/ai/assistant-tools";
import { advancedSettingsSummary } from "../src/lib/dashboard/settings-summary";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const m = (p: Partial<PlatformMetrics>): PlatformMetrics => ({ ...EMPTY_METRICS, ...p });
const NOW = new Date("2026-10-01T15:00:00Z");
const TECH = /\b(cpm|ctr|cpc|frequency|impressions|roas|cpa)\b/i;

async function main() {
  console.log("\n— the Overview's numbers —");
  await check("four plain numbers per goal, never technical metrics", () => {
    for (const f of ["sales", "leads", "bookings", "calls", "traffic", "awareness", "visits", "social"] as const) {
      const tiles = performanceTiles(f, m({}));
      assert.equal(tiles.length, 4, f);
      assert.equal(tiles[0].label, "Money spent");
      for (const t of tiles) assert.doesNotMatch(t.label, TECH, `${f}: ${t.label}`);
    }
  });
  await check("the numbers change with the goal", () => {
    const labels = (f: Parameters<typeof performanceTiles>[0]) => performanceTiles(f, m({})).map((t) => t.label);
    assert.deepEqual(labels("sales"), ["Money spent", "Revenue", "Sales", "Cost per sale"]);
    assert.deepEqual(labels("leads"), ["Money spent", "Leads", "Cost per lead", "Contact actions"]);
    assert.deepEqual(labels("bookings"), ["Money spent", "Bookings", "Cost per booking", "Booking leads"]);
  });
  await check("figures read like the example; unknowns are a dash, never zero", () => {
    const t = performanceTiles("sales", m({ spendCents: 62_000, revenueCents: 284_000, purchases: 34, costPerPurchaseCents: 1824 }));
    assert.deepEqual(t.map((x) => x.value), ["$620.00", "$2,840", "34", "$18.24"]);
    const empty = performanceTiles("leads", m({}));
    assert.ok(empty.every((x) => x.value === "—"));
    assert.equal(money(null), "—");
    const leads = performanceTiles("leads", m({ spendCents: 30_000, leads: 12, contacts: 4 }));
    assert.equal(leads[2].value, "$25.00", "cost per lead");
  });

  console.log("\n— what's next —");
  await check("days are said plainly", () => {
    assert.equal(dayLabel("2026-10-01", "2026-10-01"), "Today");
    assert.equal(dayLabel("2026-10-02", "2026-10-01"), "Tomorrow");
    assert.equal(dayLabel("2026-10-02", "2026-09-30"), "Friday");
    assert.match(dayLabel("2026-10-20", "2026-10-01"), /^Tue, Oct 20$/);
  });
  await check("always something for today, one line per day, at most four, soonest first", () => {
    const n = whatsNext({
      today: "2026-10-01",
      campaignsRunning: 2,
      goalPhrase: "getting more sales",
      events: [
        { day: "2026-10-03", text: "Instagram Reel publishes after your approval." },
        { day: "2026-09-29", text: "Old." },
        { day: "2026-10-02", text: "MAIRO checks your results." },
        { day: "2026-10-02", text: "A second thing tomorrow." },
        { day: "2026-10-05", text: "Weekly report." },
        { day: "2026-10-07", text: "Too far for four." },
      ],
    });
    assert.deepEqual(n.map((x) => x.label), ["Today", "Tomorrow", "Saturday", "Monday"]);
    assert.match(n[0].text, /monitoring your campaigns for getting more sales/);
    assert.ok(!n.some((x) => x.text === "Old."));
    assert.equal(whatsNext({ today: "2026-10-01", campaignsRunning: 0, goalPhrase: null, events: [] })[0].text, "MAIRO is ready when your first campaign is.");
  });
  await check("one insight: the strongest, or none", () => {
    assert.equal(pickInsight([]), null);
    const best = pickInsight([
      { text: "a", why: "", evidence: [], href: "/", source: "intelligence", strength: 1.5 },
      { text: "b", why: "", evidence: [], href: "/", source: "learning", strength: 3 },
    ]);
    assert.equal(best?.text, "b");
  });

  console.log("\n— campaigns, simply —");
  await check("tabs: active, drafts, paused, completed", () => {
    assert.equal(campaignTab({ status: "ACTIVE", endDate: null }, NOW), "active");
    assert.equal(campaignTab({ status: "PENDING_REVIEW", endDate: null }, NOW), "active");
    assert.equal(campaignTab({ status: "DRAFT", endDate: null }, NOW), "drafts");
    assert.equal(campaignTab({ status: "PAUSED", endDate: null }, NOW), "paused");
    assert.equal(campaignTab({ status: "ARCHIVED", endDate: null }, NOW), "completed");
    assert.equal(campaignTab({ status: "ACTIVE", endDate: new Date("2026-09-01") }, NOW), "completed", "an ended campaign is completed");
  });
  await check("goals and statuses in plain words", () => {
    assert.equal(goalLabel("SALES"), "Get More Sales");
    for (const g of ["SALES", "LEADS", "TRAFFIC", "AWARENESS", "ENGAGEMENT", "APP_PROMOTION"] as const) assert.doesNotMatch(goalLabel(g), /OUTCOME_|objective/i);
    assert.deepEqual(statusLabel({ status: "ACTIVE", endDate: null }, NOW), { dot: "🟢", text: "Active", tone: "green" });
    assert.equal(statusLabel({ status: "PENDING_REVIEW", endDate: null }, NOW).text, "Starting");
  });
  await check("each card shows the one result that matters for its goal", () => {
    assert.deepEqual(primaryResult("SALES", "WEBSITE", m({ purchases: 22, clicks: 900 })), { label: "Sales", value: "22" });
    assert.deepEqual(primaryResult("LEADS", "LEAD_FORM", m({ leads: 9 })), { label: "Leads", value: "9" });
    assert.deepEqual(primaryResult("LEADS", "PHONE_CALL", m({ contacts: 5 })), { label: "Calls & messages", value: "5" });
    assert.deepEqual(primaryResult("TRAFFIC", "WEBSITE", m({ landingPageViews: 300, clicks: 500 })), { label: "Website visits", value: "300" });
    assert.equal(primaryResult("SALES", "WEBSITE", null).value, "—");
    assert.equal(familyFor("ENGAGEMENT", "DIRECT_MESSAGE"), "calls");
  });
  await check("'what MAIRO is optimizing for' is said without jargon", () => {
    for (const g of ["SALES", "LEADS", "TRAFFIC", "AWARENESS", "ENGAGEMENT"] as const) {
      const s = optimizingFor(g, "WEBSITE", true);
      assert.doesNotMatch(s, /OFFSITE|LINK_CLICKS|_/);
    }
    assert.match(optimizingFor("SALES", "WEBSITE", false), /purchases become the target once your sales tracking is set up/);
  });

  console.log("\n— creatives ranked by the goal —");
  const ad = (id: string, p: Partial<HubAd>): HubAd => ({ id, name: id, kind: "IMAGE", preview: null, headline: null, primaryText: null, cta: null, reason: null, campaignId: "c", campaignName: "C", status: "Active", goal: "Sales", family: "sales", results: null, spendCents: null, costPerResultCents: null, resultText: "", date: "2026-10-01", ...p });
  await check("a sales goal counts purchases, never clicks or likes", () => {
    assert.equal(goalResults("sales", m({ purchases: 3, clicks: 400, engagement: 900 })), 3);
    assert.equal(goalResults("leads", m({ leads: 7, clicks: 400 })), 7);
    assert.equal(goalResults("awareness", m({ reach: 5000 })), 5000);
  });
  await check("top performing: results first, lowest cost per result wins, no-result ads aren't ranked", () => {
    const top = rankByGoal([
      ad("clicky", { results: 0, spendCents: 5000 }),
      ad("ok", { results: 10, spendCents: 30_000, costPerResultCents: 3000 }),
      ad("best", { results: 12, spendCents: 18_000, costPerResultCents: 1500 }),
      ad("nodata", { results: null, spendCents: null }),
    ]);
    assert.deepEqual(top.map((a) => a.id), ["best", "ok"]);
    assert.equal(resultPhrase("sales", 12), "12 purchases");
    assert.equal(resultPhrase("sales", 1), "1 purchase");
    assert.equal(resultPhrase("leads", null), "No results yet");
  });

  console.log("\n— settings: folded, never hidden —");
  await check("each folded setting says what's on right now", () => {
    const base = { autoLaunchOn: false, stopLossCents: null, stopLossAction: "NOTIFY" as const, monthlyCapCents: null, level: "MANUAL" as const, autoOptimizeAllowed: true };
    const off = advancedSettingsSummary(base);
    assert.deepEqual(off.map((l) => l.anchor), ["go-live", "spend-protection", "automation", "brief"], "anchors match the section ids links use");
    assert.match(off[0].value, /^Off/);
    assert.equal(off[1].value, "Off");
    assert.match(off[2].value, /^Manual/);
    const on = advancedSettingsSummary({ ...base, autoLaunchOn: true, stopLossCents: 5000, stopLossAction: "PAUSE", monthlyCapCents: 150_000, level: "AUTOPILOT" });
    assert.equal(on[0].value, "On");
    assert.equal(on[1].value, "Pauses a campaign that spends $50 with no result · $1,500 monthly limit");
    assert.match(on[2].value, /^Full Autopilot/);
  });
  await check("a level the plan doesn't include reads as Manual, as it behaves", () => {
    const l = advancedSettingsSummary({ autoLaunchOn: false, stopLossCents: null, stopLossAction: "NOTIFY", monthlyCapCents: null, level: "ASSISTED", autoOptimizeAllowed: false });
    assert.match(l[2].value, /^Manual .*plan doesn't include/);
  });

  console.log("\n— the assistant takes people to the right place —");
  await check("destinations are MAIRO pages only", () => {
    for (const d of Object.values(DESTINATIONS)) assert.match(d.href, /^\/dashboard(\/|$|\?)/);
    assert.equal(DESTINATIONS.best_creative.href, "/dashboard/creatives?tab=top");
  });

  console.log(`\n${passed} checks passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
