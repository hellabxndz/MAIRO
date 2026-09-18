// Checks the promises the settings page makes about what MAIRO may do.
//
// The automation level is the most consequential setting in the product: it
// decides what happens to somebody's advertising budget while nobody is
// watching. The settings screen shows the customer two lists — what happens on
// its own, what still waits for them — and those lists are only worth showing
// if they are the same lists the server consults before acting.
//
// So this checks the shape of the promise rather than any one code path:
// that Manual really does nothing, that the four irreversible actions are
// automatic at no level and cannot be made so, that each level is a superset
// of the one below it, and that the two lists on screen are complementary —
// no action can be missing from both, and none can appear in both.
//
// Run with: npm run check:automation

import {
  ACTIONS,
  ALWAYS_NEEDS_APPROVAL,
  approvalActions,
  automaticActions,
  LEVELS,
  levelInfo,
  mayDoAutomatically,
  type AutomationAction,
} from "@/lib/automation/levels";
import { checkGuardrails } from "@/lib/budget/optimizer";
import { EMPTY_METRICS } from "@/lib/ad-platforms/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${name} ${extra}`);
  } else console.log(`  ok    ${name}`);
}

const ALL: AutomationAction[] = ACTIONS.map((a) => a.action);

console.log("\n— Manual means manual —");
check("Manual automates nothing at all", automaticActions("MANUAL").length === 0);
check(
  "no action whatsoever passes on Manual",
  ALL.every((a) => mayDoAutomatically("MANUAL", a) === false),
);

console.log("\n— the four that always ask —");
for (const action of ALWAYS_NEEDS_APPROVAL) {
  check(
    `"${action}" is automatic at no level`,
    LEVELS.every((l) => mayDoAutomatically(l.level, action) === false),
  );
}
check(
  "raising the total budget is one of them",
  ALWAYS_NEEDS_APPROVAL.includes("raise-total-budget"),
);
check("launching a campaign is one of them", ALWAYS_NEEDS_APPROVAL.includes("launch-campaign"));
check(
  "spending above the customer's ceiling is one of them",
  ALWAYS_NEEDS_APPROVAL.includes("spend-above-limit"),
);
check(
  "connecting another platform is one of them",
  ALWAYS_NEEDS_APPROVAL.includes("connect-platform"),
);

console.log("\n— the levels nest —");
// Turning automation up must never take a permission away, and turning it down
// must never add one. Anything else and "more automatic" stops meaning
// anything the customer can reason about.
const assisted = automaticActions("ASSISTED").map((a) => a.action);
const autopilot = automaticActions("AUTOPILOT").map((a) => a.action);
check(
  "everything Assisted does, Autopilot also does",
  assisted.every((a) => autopilot.includes(a)),
);
check("Autopilot does strictly more than Assisted", autopilot.length > assisted.length);
check("Assisted does strictly more than Manual", assisted.length > 0);
check(
  "Autopilot still does not do everything",
  autopilot.length < ALL.length,
  `${autopilot.length} of ${ALL.length}`,
);

console.log("\n— the two lists on screen are complementary —");
for (const l of LEVELS) {
  const auto = automaticActions(l.level).map((a) => a.action);
  const waits = approvalActions(l.level).map((a) => a.action);
  check(
    `${l.label}: every action appears in one list or the other`,
    ALL.every((a) => auto.includes(a) || waits.includes(a)),
  );
  check(
    `${l.label}: no action appears in both`,
    ALL.every((a) => !(auto.includes(a) && waits.includes(a))),
  );
  check(
    `${l.label}: the four that always ask are in the waiting list`,
    ALWAYS_NEEDS_APPROVAL.every((a) => waits.includes(a)),
  );
}

console.log("\n— every level and action is described —");
check(
  "every level has a summary and a longer explanation",
  LEVELS.every((l) => l.summary.trim().length > 0 && l.detail.trim().length > 0),
);
check(
  "every action has a label and says why it is or is not safe",
  ACTIONS.every((a) => a.label.trim().length > 0 && a.detail.trim().length > 0),
);
check("levelInfo returns the right one", levelInfo("AUTOPILOT").label === "Autopilot");

console.log("\n— the budget guardrail asks the level, not a stale flag —");
// The real enforcement path, with a proposal that is fine on every other
// count. The only thing changing between these is the level.
const recommendation = {
  headline: "Move budget toward TikTok",
  rationale: "TikTok is producing purchases more cheaply.",
  proposal: [
    { platform: "META" as const, fromPercent: 60, toPercent: 50 },
    { platform: "TIKTOK" as const, fromPercent: 40, toPercent: 50 },
  ],
  evidence: [
    { platform: "META" as const, metrics: { ...EMPTY_METRICS, clicks: 900, purchases: 30, spendCents: 60000, revenueCents: 180000 }, currentPercent: 60 },
    { platform: "TIKTOK" as const, metrics: { ...EMPTY_METRICS, clicks: 900, purchases: 60, spendCents: 40000, revenueCents: 200000 }, currentPercent: 40 },
  ],
  confidence: "high" as const,
};
const base = {
  recommendation,
  totalDailyBudgetCents: 10000,
  currentTotalDailyBudgetCents: 10000,
};
const limits = {
  maxDailyBudgetCents: 50000,
  maxDailyIncreasePercent: 100,
  maxBudgetShiftPercent: 50,
  minRoas: null,
  maxCpaCents: null,
  platforms: ["META" as const, "TIKTOK" as const],
};

check(
  "Manual refuses a proposal that is otherwise fine",
  checkGuardrails({ ...base, limits: { ...limits, level: "MANUAL" } }).allowed === false,
);
check(
  "Assisted allows the same proposal",
  checkGuardrails({ ...base, limits: { ...limits, level: "ASSISTED" } }).allowed === true,
);
check(
  "Autopilot allows it too",
  checkGuardrails({ ...base, limits: { ...limits, level: "AUTOPILOT" } }).allowed === true,
);
// The shift cap counts the whole movement, not one platform's growth. Ten
// points onto TikTok is 10% of the budget changing hands.
check(
  "the shift cap counts the whole movement",
  checkGuardrails({ ...base, limits: { ...limits, level: "AUTOPILOT", maxBudgetShiftPercent: 5 } })
    .allowed === false,
);
check(
  "and allows it when the cap is wide enough",
  checkGuardrails({ ...base, limits: { ...limits, level: "AUTOPILOT", maxBudgetShiftPercent: 10 } })
    .allowed === true,
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
