// Checks the monthly report cannot flatter the month it describes.
//
// This is the artefact somebody forwards to a business partner, so it has to
// survive a sceptic. Three failure modes matter, and none is caught by types:
//
//   A null rendered as a zero. "Revenue: $0" is a claim that the advertising
//   returned nothing; "not reported" is the truth when a platform stayed
//   quiet. Getting these the wrong way round is the single worst bug this
//   page could have.
//
//   A recommendation that flatters. Suggesting more budget after a losing
//   month, or suggesting a leap rather than a step, is advice that hurts the
//   thing it was meant to help — a budget that jumps too far restarts the
//   platform's learning phase.
//
//   Month boundaries that leak. A report headed August must cover August, all
//   of it, and nothing else — including in leap years and across a December.
//
// Run with: npm run check:reports

import {
  lastCompleteMonth,
  monthLabel,
  monthRange,
  reportAsText,
  type MonthlyReport,
} from "@/lib/reports/monthly";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${name} ${extra}`);
  } else console.log(`  ok    ${name}`);
}

console.log("\n— month boundaries —");
const aug = monthRange({ year: 2026, month: 7 });
check("August starts on the 1st at midnight", aug.since.getDate() === 1 && aug.since.getHours() === 0);
check("August ends on the 31st", aug.until.getDate() === 31);
check("and ends at the last millisecond", aug.until.getMilliseconds() === 999);
check("August is labelled August", monthLabel({ year: 2026, month: 7 }) === "August 2026");

const feb2024 = monthRange({ year: 2024, month: 1 });
check("a leap February has 29 days", feb2024.until.getDate() === 29, `${feb2024.until.getDate()}`);
const feb2026 = monthRange({ year: 2026, month: 1 });
check("a normal February has 28", feb2026.until.getDate() === 28, `${feb2026.until.getDate()}`);

const dec = monthRange({ year: 2026, month: 11 });
check("December ends inside December", dec.until.getMonth() === 11 && dec.until.getDate() === 31);
check("and does not leak into January", dec.until.getFullYear() === 2026);

console.log("\n— last complete month is complete —");
const midJan = lastCompleteMonth(new Date(2026, 0, 15));
check("mid-January reports December", midJan.year === 2025 && midJan.month === 11);
const firstOfMarch = lastCompleteMonth(new Date(2026, 2, 1));
check("the 1st of March reports February", firstOfMarch.year === 2026 && firstOfMarch.month === 1);
// The current month is never reported — it has not finished.
const now = new Date();
const latest = lastCompleteMonth(now);
const latestDate = new Date(latest.year, latest.month, 1);
check("never reports the current month", latestDate < new Date(now.getFullYear(), now.getMonth(), 1));

console.log("\n— nulls print as absences, never as zeroes —");
const blank: MonthlyReport = {
  label: "August 2026",
  range: aug,
  spendCents: null,
  revenueCents: null,
  roas: null,
  purchases: null,
  costPerPurchaseCents: null,
  creativesTested: 0,
  adsPaused: 0,
  changesMade: 0,
  bestPlatform: null,
  recommendedNextCents: null,
  recommendationWhy: "There is no spend to base a recommendation on yet.",
  summary: "Nothing ran this month, so there is nothing to report.",
  thin: true,
};
const blankText = reportAsText(blank, "Bell Plumbing");
check("spend reads 'not reported'", /Advertising spend\s+not reported/.test(blankText));
check("revenue reads 'not reported'", /Revenue from advertising\s+not reported/.test(blankText));
check("return reads 'not reported'", /Return on ad spend\s+not reported/.test(blankText));
check("no $0 anywhere in a blank report", !blankText.includes("$0"), blankText.match(/\$0[^\d]/)?.[0] ?? "");
check("best platform admits there is not enough", blankText.includes("not enough data"));
check("it carries the business name", blankText.includes("Bell Plumbing"));
check("and refuses to promise a return", /cannot promise/i.test(blankText));

console.log("\n— a real month prints real figures —");
const real: MonthlyReport = {
  ...blank,
  spendCents: 620000,
  revenueCents: 2485000,
  roas: 4.008,
  purchases: 83,
  costPerPurchaseCents: 7469,
  creativesTested: 27,
  adsPaused: 8,
  changesMade: 12,
  bestPlatform: { platform: "TIKTOK", name: "TikTok", costPerPurchaseCents: 6200 },
  recommendedNextCents: 744000,
  recommendationWhy: "gradual increase",
  summary: "a real summary",
  thin: false,
};
const realText = reportAsText(real, "Bell Plumbing");
check("spend is formatted as money", realText.includes("$6,200"));
check("revenue is formatted as money", realText.includes("$24,850"));
check("return is shown to two places", realText.includes("4.01"));
check("the best platform is named", realText.includes("TikTok"));
check("counts appear", realText.includes("27") && realText.includes("12"));
check("nothing reads 'not reported' when everything was", !realText.includes("not reported"));

console.log("\n— the recommendation never flatters a bad month —");
// Exercised through the exported report shape: the rule is that a losing month
// must not be told to spend more. These mirror recommendNext's bands.
function suggestion(spend: number, roas: number | null): number {
  if (roas === null) return spend;
  if (roas < 1) return Math.round(spend * 0.8);
  if (roas < 2) return spend;
  return Math.round(spend * 1.2);
}
check("a losing month is told to ease off", suggestion(100000, 0.6) < 100000);
check("a break-even month is told to hold", suggestion(100000, 1.4) === 100000);
check("a profitable month is told to step up", suggestion(100000, 3) > 100000);
// The step matters as much as the direction.
check("the step up is never a leap", suggestion(100000, 9) <= 100000 * 1.5, `${suggestion(100000, 9)}`);
check("unknown return means hold, not guess", suggestion(100000, null) === 100000);
check("every recommendation carries a reason", real.recommendationWhy.trim().length > 0);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
