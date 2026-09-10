// Checks the arithmetic that decides where a customer's money goes.
//
// This is the one part of multi-platform advertising where a bug is not a
// cosmetic problem. A split that loses a cent means a customer who set a
// $1,000 daily budget is charged $1,000.01 every day forever; a guardrail that
// can be talked round means MAIRO spends money nobody agreed to spend. Both
// are the kind of fault you find from a card statement rather than from a
// stack trace, so they are checked here instead.
//
// Run with: npm run check:budget

import { recommendAllocation, splitBudget, validateAllocation, rebalance } from "@/lib/budget/allocation";
import { recommendReallocation, checkGuardrails, aggregate } from "@/lib/budget/optimizer";
import { EMPTY_METRICS } from "@/lib/ad-platforms/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.log(`  FAIL  ${name} ${extra}`); }
  else console.log(`  ok    ${name}`);
}

console.log("\n— splits are exact —");
// Every budget from $1 to $2000, in every split from 1..99, must sum exactly.
let worst = 0;
for (let total = 100; total <= 200000; total += 137) {
  for (let pct = 1; pct <= 99; pct++) {
    const parts = splitBudget(total, [
      { platform: "META", percent: pct },
      { platform: "TIKTOK", percent: 100 - pct },
    ]);
    const sum = parts.reduce((s, p) => s + p.dailyBudgetCents, 0);
    worst = Math.max(worst, Math.abs(sum - total));
  }
}
check("two-way split never loses or invents a cent", worst === 0, `worst drift ${worst}`);

let worst3 = 0;
for (let total = 300; total <= 100000; total += 291) {
  const parts = splitBudget(total, [
    { platform: "META", percent: 33 },
    { platform: "TIKTOK", percent: 33 },
    { platform: "GOOGLE", percent: 34 },
  ]);
  worst3 = Math.max(worst3, Math.abs(parts.reduce((s, p) => s + p.dailyBudgetCents, 0) - total));
}
check("three-way split is exact too", worst3 === 0, `worst drift ${worst3}`);

console.log("\n— recommended allocations —");
for (const goal of ["LEADS","SALES","AWARENESS","TRAFFIC","APP_PROMOTION"] as const) {
  const a = recommendAllocation(["META","TIKTOK"], goal, 100000);
  const pct = a.reduce((s,x)=>s+x.percent,0);
  const cents = a.reduce((s,x)=>s+x.dailyBudgetCents,0);
  check(`${goal}: percents=100 money=total`, pct === 100 && cents === 100000,
    `got ${pct}% / ${cents}c ${JSON.stringify(a.map(x=>[x.platform,x.percent]))}`);
}
const solo = recommendAllocation(["TIKTOK"], "SALES", 50000);
check("single platform gets everything", solo.length===1 && solo[0].percent===100 && solo[0].dailyBudgetCents===50000);

console.log("\n— validation —");
check("rejects a split that doesn't sum to 100",
  validateAllocation([
    { platform:"META", percent:60, dailyBudgetCents:60000 },
    { platform:"TIKTOK", percent:30, dailyBudgetCents:30000 },
  ]).some(p=>p.kind==="sum"));
check("rejects TikTok under its $20/day floor",
  validateAllocation([
    { platform:"META", percent:90, dailyBudgetCents:9000 },
    { platform:"TIKTOK", percent:10, dailyBudgetCents:1000 },
  ]).some(p=>p.kind==="below_minimum"));
check("accepts a valid split",
  validateAllocation([
    { platform:"META", percent:60, dailyBudgetCents:60000 },
    { platform:"TIKTOK", percent:40, dailyBudgetCents:40000 },
  ]).length===0);

console.log("\n— rebalancing keeps the total at 100 —");
let rebalanceOk = true;
for (let p = 0; p <= 100; p++) {
  const r = rebalance([{platform:"META",percent:60},{platform:"TIKTOK",percent:40}], "META", p);
  if (r.reduce((s,x)=>s+x.percent,0) !== 100) rebalanceOk = false;
  const r3 = rebalance(
    [{platform:"META",percent:50},{platform:"TIKTOK",percent:30},{platform:"GOOGLE",percent:20}],
    "TIKTOK", p);
  if (r3.reduce((s,x)=>s+x.percent,0) !== 100) rebalanceOk = false;
}
check("every drag of the slider still sums to 100", rebalanceOk);

console.log("\n— the optimizer stays quiet without evidence —");
const thin = { ...EMPTY_METRICS, clicks: 12, purchases: 1, costPerPurchaseCents: 1000, roas: 9 };
check("no recommendation on 12 clicks",
  recommendReallocation([
    { platform:"META", metrics: thin, currentPercent: 60 },
    { platform:"TIKTOK", metrics: { ...thin, roas: 1 }, currentPercent: 40 },
  ]) === null);

const metaM = { ...EMPTY_METRICS, clicks: 4000, purchases: 90, spendCents: 240300, costPerPurchaseCents: 2670, roas: 2.9, revenueCents: 696870 };
const tikM  = { ...EMPTY_METRICS, clicks: 5200, purchases: 140, spendCents: 198800, costPerPurchaseCents: 1420, roas: 5.1, revenueCents: 1013880 };
const rec = recommendReallocation([
  { platform:"META", metrics: metaM, currentPercent: 60 },
  { platform:"TIKTOK", metrics: tikM, currentPercent: 40 },
]);
check("recommends when the gap is real", rec !== null);
if (rec) {
  console.log(`        "${rec.rationale}"`);
  const sum = rec.proposal.reduce((s,p)=>s+p.toPercent,0);
  check("proposal still sums to 100", sum === 100, `got ${sum}`);
  check("proposal favours the cheaper platform",
    rec.proposal.find(p=>p.platform==="TIKTOK")!.toPercent > 40);
  check("never starves a platform below 10%",
    rec.proposal.every(p=>p.toPercent >= 10));

  console.log("\n— guardrails —");
  const base = { recommendation: rec, totalDailyBudgetCents: 10000, currentTotalDailyBudgetCents: 10000 };
  const limits = { enabled: true, maxDailyBudgetCents: 50000, maxDailyIncreasePercent: 100, minRoas: null, maxCpaCents: null, platforms: ["META","TIKTOK"] as const };

  check("refuses when Auto Optimize is off",
    checkGuardrails({ ...base, limits: { ...limits, enabled: false, platforms:[...limits.platforms] } }).allowed === false);
  check("refuses a platform the customer didn't allow",
    checkGuardrails({ ...base, limits: { ...limits, platforms: ["META"] } }).allowed === false);
  check("refuses a budget above the ceiling",
    checkGuardrails({ ...base, limits: { ...limits, maxDailyBudgetCents: 5000, platforms:[...limits.platforms] } }).allowed === false);
  check("refuses an increase above the daily cap",
    checkGuardrails({ ...base, limits: { ...limits, maxDailyIncreasePercent: 5, platforms:[...limits.platforms] } }).allowed === false);
  check("refuses when ROAS is under the floor",
    checkGuardrails({ ...base, limits: { ...limits, minRoas: 99, platforms:[...limits.platforms] } }).allowed === false);
  check("refuses when CPA is over the ceiling",
    checkGuardrails({ ...base, limits: { ...limits, maxCpaCents: 100, platforms:[...limits.platforms] } }).allowed === false);
  const good = checkGuardrails({ ...base, limits: { ...limits, platforms:[...limits.platforms] } });
  check("allows a change inside every limit", good.allowed === true);
  if (good.allowed) {
    check("and the money it produces sums to the total",
      good.allocations.reduce((s,a)=>s+a.dailyBudgetCents,0) === 10000);
  }
}

console.log("\n— aggregate recomputes rates rather than averaging them —");
const agg = aggregate([
  { ...EMPTY_METRICS, impressions: 1000, clicks: 100, spendCents: 5000, purchases: 5, revenueCents: 20000 },
  { ...EMPTY_METRICS, impressions: 9000, clicks: 180, spendCents: 5000, purchases: 15, revenueCents: 40000 },
]);
check("CTR is total clicks over total impressions", Math.abs(agg.ctr! - 280/10000) < 1e-9, `got ${agg.ctr}`);
check("ROAS is total revenue over total spend", Math.abs(agg.roas! - 6) < 1e-9, `got ${agg.roas}`);
check("CPA is total spend over total purchases", agg.costPerPurchaseCents === 500, `got ${agg.costPerPurchaseCents}`);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
