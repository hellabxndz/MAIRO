import type { AutomationLevel } from "@/generated/prisma/enums";

// What MAIRO is allowed to do without asking.
//
// This is the most consequential file in the product. Everything else decides
// what to recommend; this decides what happens without a person in the loop,
// and the thing being decided is somebody else's advertising budget.
//
// The design rule is that a customer must be able to read this back as a list
// and recognise it. Not "Auto Optimize: on" — a switch whose meaning lives in
// whatever the code happens to do this month — but a named level with an
// explicit inventory of what it permits and what it still holds back for
// approval. If the two ever disagree, the list is what is wrong, because the
// list is the promise.
//
// Three levels, and the boundary between them is reversibility, not size:
//
//   Manual      — MAIRO proposes. A person applies. Nothing moves on its own.
//   Assisted    — MAIRO may do things that are cheap to undo: pause something
//                 that is losing money, start another creative test, shift a
//                 slice of an existing budget. Anything that changes what the
//                 account spends in total still waits.
//   Autopilot   — adds the changes that need a steadier hand — audiences and
//                 bids — still inside the ceilings the customer set, and still
//                 never raising the total.
//
// What no level permits is the same at every level and is not configurable:
// raising the total budget, launching a campaign, spending past the ceiling,
// or connecting another ad platform. Those are the four ways a customer could
// be surprised by a number on a card statement, so they are the four things
// MAIRO will always ask about first.

/** Everything MAIRO can do to a live account, as a closed set. */
export type AutomationAction =
  | "pause-underperformer"
  | "test-new-creative"
  | "duplicate-winner"
  | "shift-budget"
  | "adjust-audience"
  | "change-bid"
  | "raise-total-budget"
  | "launch-campaign"
  | "spend-above-limit"
  | "connect-platform";

export type ActionInfo = {
  action: AutomationAction;
  /** How the customer would say it. */
  label: string;
  /** What it actually does, and why it is or is not safe to automate. */
  detail: string;
};

export const ACTIONS: ActionInfo[] = [
  {
    action: "pause-underperformer",
    label: "Pause ads that are losing money",
    detail:
      "Stops an ad that has spent past your limits without producing. Costs nothing to undo — you can switch it back on.",
  },
  {
    action: "test-new-creative",
    label: "Test new creatives",
    detail:
      "Adds a new ad to a running campaign to test against the current one, inside the campaign's existing budget.",
  },
  {
    action: "duplicate-winner",
    label: "Make more of what is working",
    detail:
      "Takes the ad producing the cheapest results and makes variations of it, inside the existing budget.",
  },
  {
    action: "shift-budget",
    label: "Move budget between campaigns and platforms",
    detail:
      "Moves money from what is not working to what is, up to the share you set below. The total never changes.",
  },
  {
    action: "adjust-audience",
    label: "Adjust who sees your ads",
    detail:
      "Widens or narrows targeting when the platform has run out of cheap people to show an ad to. Harder to undo cleanly, because the platform restarts its learning.",
  },
  {
    action: "change-bid",
    label: "Change how much you bid",
    detail:
      "Adjusts what you are willing to pay per result. Affects delivery quickly and takes a few days to settle.",
  },
  {
    action: "raise-total-budget",
    label: "Increase your total budget",
    detail: "More money leaving your account than you agreed to. Always yours to decide.",
  },
  {
    action: "launch-campaign",
    label: "Launch a new campaign",
    detail: "The moment spending starts. MAIRO builds campaigns paused and waits for you.",
  },
  {
    action: "spend-above-limit",
    label: "Spend above your ceiling",
    detail: "Your maximum is a maximum. Nothing MAIRO does may cross it.",
  },
  {
    action: "connect-platform",
    label: "Connect another ad platform",
    detail: "A new account, new permissions and a new place your money can go.",
  },
];

/**
 * The four MAIRO will never take on its own, at any level.
 *
 * Not a setting. A customer cannot switch these on and neither can an
 * operator, because a product that can be configured into spending without
 * asking is a product that will eventually do it by accident.
 */
export const ALWAYS_NEEDS_APPROVAL: AutomationAction[] = [
  "raise-total-budget",
  "launch-campaign",
  "spend-above-limit",
  "connect-platform",
];

const AUTOMATIC: Record<AutomationLevel, AutomationAction[]> = {
  MANUAL: [],
  ASSISTED: ["pause-underperformer", "test-new-creative", "duplicate-winner", "shift-budget"],
  AUTOPILOT: [
    "pause-underperformer",
    "test-new-creative",
    "duplicate-winner",
    "shift-budget",
    "adjust-audience",
    "change-bid",
  ],
};

export type LevelInfo = {
  level: AutomationLevel;
  label: string;
  /** One line, for the card. */
  summary: string;
  /** The longer promise, for somebody deciding. */
  detail: string;
};

export const LEVELS: LevelInfo[] = [
  {
    level: "MANUAL",
    label: "Manual",
    summary: "MAIRO recommends. You approve everything.",
    detail:
      "Nothing changes in your account unless you press a button. MAIRO still watches, still works out what it would do, and still tells you — it just never acts on it. The safest setting and the most work.",
  },
  {
    level: "ASSISTED",
    label: "Assisted",
    summary: "MAIRO handles the small things. You approve the rest.",
    detail:
      "MAIRO can pause an ad that is losing money, test a new creative, make more of a winner, and move budget between what you are already running. Anything that changes what you spend in total still waits for you.",
  },
  {
    level: "AUTOPILOT",
    label: "Autopilot",
    summary: "MAIRO manages campaigns inside the limits you set.",
    detail:
      "Everything in Assisted, plus targeting and bids. Your ceiling still holds, your total budget still cannot go up without you, and every change is written down with the numbers behind it.",
  },
];

export function levelInfo(level: AutomationLevel): LevelInfo {
  return LEVELS.find((l) => l.level === level) ?? LEVELS[0];
}

export function actionInfo(action: AutomationAction): ActionInfo {
  // The map is exhaustive over the union, so this cannot miss — the fallback
  // exists so a future action added to the type without a description fails
  // visibly in the interface rather than throwing on a settings page.
  return (
    ACTIONS.find((a) => a.action === action) ?? {
      action,
      label: action,
      detail: "",
    }
  );
}

/**
 * The question the rest of the product asks.
 *
 * Every automatic path goes through this. An action that is not in the level's
 * list, or is one of the four that are never automatic, comes back false — and
 * false means "propose it and wait", never "do it quietly".
 */
export function mayDoAutomatically(
  level: AutomationLevel,
  action: AutomationAction,
): boolean {
  if (ALWAYS_NEEDS_APPROVAL.includes(action)) return false;
  return AUTOMATIC[level].includes(action);
}

/** What this level does on its own, for showing the customer. */
export function automaticActions(level: AutomationLevel): ActionInfo[] {
  return AUTOMATIC[level].map(actionInfo);
}

/** What still needs a person at this level. */
export function approvalActions(level: AutomationLevel): ActionInfo[] {
  return ACTIONS.filter(
    (a) => !AUTOMATIC[level].includes(a.action) || ALWAYS_NEEDS_APPROVAL.includes(a.action),
  );
}
