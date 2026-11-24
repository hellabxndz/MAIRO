// Checks the Meta Ads Analyzer's judgements on realistic accounts:
//
//   - Efficient campaigns are called out, and kept (never "replace it").
//   - Real money with no results is flagged as possible waste — with the
//     caveat that tracking or the campaign's purpose might explain it.
//   - Awareness and traffic campaigns are never called waste for having no
//     purchases.
//   - Expensive campaigns are compared with the account's own average.
//   - Fatigue needs both high frequency and a falling click rate.
//   - A shop with clicks and no purchases is told to check tracking.
//   - Thin data is labelled an early signal; missing figures stay missing.
//   - No history → no invented findings.
//   - Every number in a finding is arithmetic on the input.
//
//   npm run check:analyzer   (pure; no database, no network)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMPTY_METRICS, type PlatformMetrics } from "@/lib/ad-platforms/types";
import { analyzeAccount, confidenceOf, type AnalyzerCampaign } from "@/lib/analyzer/analyze";
import { rangeOf } from "@/lib/analyzer/load";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};
const NOW = new Date("2026-11-24T12:00:00Z");
const m = (p: Partial<PlatformMetrics>): PlatformMetrics => ({ ...EMPTY_METRICS, ...p });
const same = (x: PlatformMetrics) => ({ d7: x, d30: x, prev30: x, d90: x, d180: x });
const camp = (id: string, p: Partial<AnalyzerCampaign> & { windows: AnalyzerCampaign["windows"] }): AnalyzerCampaign => ({ id, name: id, goal: "SALES", running: true, managed: false, ...p });

// A shop: one efficient campaign, one expensive, one that spent with no sales.
const shop = [
  camp("Winners", { windows: same(m({ spendCents: 60_000, purchases: 40, conversions: 40, revenueCents: 240_000, impressions: 60_000, reach: 40_000, clicks: 1_200 })) }),
  camp("Expensive", { windows: same(m({ spendCents: 50_000, purchases: 10, conversions: 10, revenueCents: 40_000, impressions: 50_000, reach: 30_000, clicks: 700 })) }),
  camp("Nothing", { windows: same(m({ spendCents: 20_000, purchases: 0, conversions: 0, impressions: 30_000, reach: 20_000, clicks: 400 })) }),
  camp("Awareness", { goal: "AWARENESS", windows: same(m({ spendCents: 30_000, impressions: 200_000, reach: 120_000 })) }),
];
const a = analyzeAccount({ now: NOW, campaigns: shop, sellsOnline: true });
if (a.state !== "ready") throw new Error("expected ready");

console.log("— the judgements —");
const acctCpr = Math.round((60_000 + 50_000 + 20_000) / 50); // 2,600¢ across the sales campaigns
ok("the account average is arithmetic on the input ($26.00 per purchase)", a.doingWell.some((f) => f.evidence.some(([k, v]) => k === "Account average" && v === `$${(acctCpr / 100).toFixed(2)}`)), JSON.stringify(a.doingWell[0]?.evidence));
ok("the efficient campaign is what's working", a.doingWell.some((f) => f.key === "efficient:Winners"));
ok("…and MAIRO recommends keeping it, not replacing it", a.recommendations.some((r) => r.key === "scale:Winners" && /^Keep “Winners” running/.test(r.title)));
ok("money with no purchases is possible waste", a.improve.some((f) => f.key === "waste:Nothing" && /spent \$200\.00 without a purchase/.test(f.title)));
ok("…with the tracking caveat for a shop", a.improve.find((f) => f.key === "waste:Nothing")?.limitation?.includes("purchase tracking") ?? false);
ok("…and a fix with Ads Manager, never MAIRO editing it", a.recommendations.some((r) => r.key === "fix:Nothing" && r.action === "fix"));
ok("the expensive campaign is compared with the account's own average", a.improve.some((f) => f.key === "expensive:Expensive" && /more per purchase than your average/.test(f.title)));
ok("an awareness campaign is never called waste", !a.improve.some((f) => f.campaignId === "Awareness"));
ok("recommendations never promise results", a.recommendations.every((r) => !/guarantee|will increase|will double/i.test(`${r.why} ${r.expected}`)));
ok("a 'build' recommendation is always offered", a.recommendations.some((r) => r.action === "build"));
ok("the headline counts the opportunities it lists", /I found \d+ opportunit/.test(a.headline), a.headline);
ok("limitations always include attribution", a.limitations.some((l) => /attribut/.test(l)));

console.log("\n— fatigue and trend —");
{
  const tired = camp("Tired", {
    windows: { d7: m({ spendCents: 10_000 }), d30: m({ spendCents: 40_000, purchases: 20, conversions: 20, impressions: 40_000, reach: 10_000, clicks: 400 }), prev30: m({ spendCents: 40_000, purchases: 30, conversions: 30, impressions: 40_000, reach: 20_000, clicks: 800 }), d90: m({ spendCents: 100_000, purchases: 60, conversions: 60 }), d180: m({ spendCents: 150_000, purchases: 90, conversions: 90 }) },
  });
  const r = analyzeAccount({ now: NOW, campaigns: [tired], sellsOnline: false });
  ok("high frequency and a falling click rate → fatigue", r.state === "ready" && r.improve.some((f) => f.key === "fatigue:Tired" && /4\.0 times/.test(f.detail)));
  ok("…with a creative refresh recommended", r.state === "ready" && r.recommendations.some((x) => x.action === "creatives"));
  ok("cost per purchase up 50% month on month is reported as a rise", r.state === "ready" && r.improve.some((f) => f.key === "trend" && /rose 50%/.test(f.title)));
  const fresh = camp("Fresh", { windows: { ...tired.windows, d30: m({ spendCents: 40_000, purchases: 20, conversions: 20, impressions: 40_000, reach: 30_000, clicks: 400 }) } });
  const r2 = analyzeAccount({ now: NOW, campaigns: [fresh], sellsOnline: false });
  ok("a falling click rate alone (low frequency) isn't called fatigue", r2.state === "ready" && !r2.improve.some((f) => f.key.startsWith("fatigue")));
}

console.log("\n— tracking —");
{
  const blind = [camp("Blind", { windows: same(m({ spendCents: 50_000, purchases: 0, conversions: 0, clicks: 900, impressions: 40_000, reach: 25_000 })) })];
  const r = analyzeAccount({ now: NOW, campaigns: blind, sellsOnline: true });
  ok("a shop with 900 clicks and no purchases is told to check tracking", r.state === "ready" && r.improve.some((f) => f.key === "tracking:none") && r.recommendations.some((x) => x.action === "tracking"));
  const noValue = [camp("NoValue", { windows: same(m({ spendCents: 50_000, purchases: 12, conversions: 12, clicks: 900 })) })];
  const r2 = analyzeAccount({ now: NOW, campaigns: noValue, sellsOnline: true });
  ok("purchases without order value → add value and currency", r2.state === "ready" && r2.improve.some((f) => f.key === "tracking:value"));
}

console.log("\n— honesty about thin or missing data —");
{
  const thin = analyzeAccount({ now: NOW, campaigns: [camp("Small", { windows: same(m({ spendCents: 6_000, purchases: 3, conversions: 3 })) })], sellsOnline: false });
  ok("3 purchases: nothing is called efficient or expensive", thin.state === "ready" && thin.doingWell.length === 0 && !thin.improve.some((f) => f.key.startsWith("expensive")));
  ok("…and the analysis says conclusions are early", thin.state === "ready" && thin.limitations.some((l) => /early/.test(l)));
  ok("confidence follows volume", confidenceOf(40, 40_000) === "high" && confidenceOf(12, 5_000) === "medium" && confidenceOf(3, 2_000) === "low");
  const none = analyzeAccount({ now: NOW, campaigns: [], sellsOnline: true });
  ok("no history: no findings at all, and it says so", none.state === "no-history" && /no advertising history/i.test(none.headline));
  const unreported = analyzeAccount({ now: NOW, campaigns: [camp("Quiet", { windows: { d180: m({ spendCents: 5_000 }), d90: null, d30: null, prev30: null, d7: null } })], sellsOnline: false });
  ok("a period Meta reported nothing for shows as missing, not $0", unreported.state === "ready" && unreported.windows.find((w) => w.key === "d30")?.spendCents === null);
}

console.log("\n— periods and isolation —");
{
  const r30 = rangeOf("d30", NOW);
  const p30 = rangeOf("prev30", NOW);
  ok("last 30 days ends yesterday", r30.until === "2026-11-23" && r30.since === "2026-10-25");
  ok("the 30 days before don't overlap the last 30", p30.until < r30.since, `${p30.until} vs ${r30.since}`);
  const route = readFileSync(join(process.cwd(), "src/app/api/analyzer/route.ts"), "utf8");
  ok("the API reads the business from the session and membership, never the request", /activeOrganizationId\(\)\) \?\? session\.user\.organizationId/.test(route) && /roleIn\(session\.user\.id, organizationId\)/.test(route) && !/searchParams|request\.json|req\.json/.test(route));
  ok("the API is rate-limited per business", /tooManyAnalyzerRuns\(organizationId/.test(route));
  const load = readFileSync(join(process.cwd(), "src/lib/analyzer/load.ts"), "utf8");
  ok("the loader only reads from Meta (no POST, no writes)", !/method: "POST"|method: "DELETE"|\.update\(|\.create\(|\.delete\(/.test(load));
}

if (bad) {
  console.log(`\n${bad} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll analyzer checks passed.");
