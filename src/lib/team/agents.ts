import type { AgentRole } from "@/generated/prisma/enums";

// The MAIRO AI Team: eight specialties, one system.
//
// Each specialty is a set of MAIRO's existing services, not a separately
// running model or a person. The Strategist's work is the Business Analyzer,
// the advertising plan and the Strategy Engine; the Budget Guardian's is Spend
// Protection and the limits every change is checked against; and so on. What
// makes them a team is that they run as steps of one workflow (the daily
// team review — see src/lib/decisions/run.ts) and that every run is recorded
// (AgentRun), so the customer can see who did what, when, and why.
//
// What each may do is enforced by the services, not by this list: the list is
// what the customer is told, and it must match what the code allows. Nothing
// that spends money, launches, or changes a live campaign happens without the
// customer's approval unless they chose an automation level that allows it —
// and even then never above their limits. Pure; pinned by check-team.ts.

export type AgentInfo = {
  role: AgentRole;
  name: string;
  /** Two or three words. */
  specialty: string;
  purpose: string;
  /** What it actually does, in the customer's words. */
  does: string[];
  /** What that means for the business, in one sentence. */
  helps: string;
  /** The information it works from, as the business would name it. */
  uses: string[];
  /** The existing MAIRO systems it runs on — for the team and the docs. */
  runsOn: string[];
  /** What it may do without asking, within the customer's settings. */
  mayDo: string[];
  /** What always waits for the customer. */
  asks: string[];
  /** Needs a connected Meta ad account to do its job. */
  needsMeta: boolean;
  /** Checks on a schedule (and when the business opens MAIRO) — never "continuously". */
  periodic: boolean;
};

export const AGENTS: AgentInfo[] = [
  {
    role: "STRATEGIST",
    name: "Strategy Agent",
    specialty: "Your advertising plan",
    purpose: "The brain behind your advertising",
    does: [
      "Reads your website and what you've told MAIRO",
      "Builds your advertising plan around your goal",
      "Picks the right campaign objective for what you want",
      "Plans experiments and coordinates the rest of the team",
    ],
    helps: "Every campaign starts from what you want — more calls, bookings or sales — instead of guesswork.",
    uses: ["Your website", "What you tell MAIRO about your business and goal", "Your past results, once there are some"],
    runsOn: ["Business Analyzer", "Advertising Plan", "Strategy Engine", "Mission"],
    mayDo: ["Write and revise your plan", "Suggest experiments"],
    asks: ["Approving the plan", "Changing your goal"],
    needsMeta: false,
    periodic: false,
  },
  {
    role: "AUDIENCE",
    name: "Audience Agent",
    specialty: "Finding customers",
    purpose: "Finds people likely to be interested",
    does: [
      "Works out where and who to reach, from your service area and customers",
      "Uses only the targeting Meta actually supports",
      "Suggests audiences worth testing",
    ],
    helps: "Your budget goes toward people in your area who are likely to want what you sell.",
    uses: ["Your service area and the customers you describe", "The targeting options Meta offers", "Which audiences have brought results before"],
    runsOn: ["Advertising Plan audience", "Audience decisions"],
    mayDo: ["Suggest audiences"],
    asks: ["Changing who a running campaign reaches"],
    needsMeta: false,
    periodic: false,
  },
  {
    role: "CREATIVE",
    name: "Creative Agent",
    specialty: "Ads people want to see",
    purpose: "Creates and tests your ads",
    does: [
      "Writes headlines and ad text from facts about your business",
      "Makes images in Creative Studio, and says when something is only an idea",
      "Prepares new versions of ads to test",
    ],
    helps: "Ready-to-review ads written from real facts about your business — no blank page.",
    uses: ["Your website and what MAIRO knows about your business", "Your own photos and videos", "Which ads people have responded to"],
    runsOn: ["Creative generation", "Creative Studio", "Ad versions"],
    mayDo: ["Draft ads and images for you to review"],
    asks: ["Putting a new ad into a running campaign (unless you've allowed it)"],
    needsMeta: false,
    periodic: false,
  },
  {
    role: "ARCHITECT",
    name: "Campaign Agent",
    specialty: "Building campaigns",
    purpose: "Builds and launches campaigns",
    does: [
      "Turns your approved plan into a real Meta campaign, built switched off",
      "Checks your ad account, Page, payment method and tracking",
      "Runs the pre-launch check",
      "Launches only after you approve",
    ],
    helps: "Campaigns set up properly on Meta and checked before anything is spent.",
    uses: ["Your approved plan", "Your Meta ad account, Page and payment method", "Your tracking setup"],
    runsOn: ["Campaign builder", "Pre-launch check", "Launch"],
    mayDo: ["Build campaigns switched off"],
    asks: ["Every launch, with the budget shown first"],
    needsMeta: true,
    periodic: false,
  },
  {
    role: "OPTIMIZER",
    name: "Optimization Agent",
    specialty: "Better results",
    purpose: "Improves results over time",
    does: [
      "Looks at your real results once a day",
      "Spots rising costs, tired ads and money better spent elsewhere",
      "Waits for enough data — no changes from a handful of clicks",
      "Proposes changes with the numbers behind them",
    ],
    helps: "Spots what is costing too much and proposes a fix, with the numbers behind it.",
    uses: ["Your campaign results from Meta", "How each ad is doing", "The leads you mark as good ones"],
    runsOn: ["Mairo Decisions"],
    mayDo: ["Small changes your automation level allows, within your limits"],
    asks: ["Anything outside your automation level"],
    needsMeta: true,
    periodic: true,
  },
  {
    role: "GUARDIAN",
    name: "Budget Guardian",
    specialty: "Protecting your money",
    purpose: "Protects your budget",
    does: [
      "Checks every proposed change against your spending limits",
      "Watches spend against your caps, and pauses at a limit if you've asked it to",
      "Flags campaigns that aren't spending or are spending unusually",
      "Never raises your total budget without you",
    ],
    helps: "Your spending stays inside the limits you set.",
    uses: ["The spending limits and monthly cap you choose", "What Meta reports you've spent", "Every change your team proposes"],
    runsOn: ["Spend Protection", "Spending limits", "Meta billing check"],
    mayDo: ["Pause a campaign at a limit you set"],
    asks: ["Any increase in what you spend"],
    needsMeta: true,
    periodic: true,
  },
  {
    role: "ANALYST",
    name: "Analytics Agent",
    specialty: "What's working",
    purpose: "Explains your results",
    does: [
      "Reads your results from Meta every day",
      "Writes your Daily Brief and weekly report in plain words",
      "Compares periods long enough to mean something",
      "Says when tracking is missing instead of guessing",
    ],
    helps: "You know what is working in plain words, without reading ad reports.",
    uses: ["Your results from Meta", "The leads and sales you record", "Whether your tracking is working"],
    runsOn: ["Mairo Intelligence", "Daily Brief", "Weekly and monthly reports"],
    mayDo: ["Write reports"],
    asks: [],
    needsMeta: true,
    periodic: true,
  },
  {
    role: "GROWTH",
    name: "Growth Advisor",
    specialty: "Room to grow",
    purpose: "Helps the business grow",
    does: [
      "Looks for what's working well enough to do more of",
      "Suggests new tests when results support them",
      "Says what it needs to see before recommending more spend",
    ],
    helps: "Tells you when it's worth doing more — and when it isn't yet.",
    uses: ["Results that have held up over time", "The leads you mark as good ones", "Your goal"],
    runsOn: ["Strategy Engine growth moves", "Opportunity Radar", "Monthly results"],
    mayDo: ["Suggest"],
    asks: ["Any budget increase or new campaign"],
    needsMeta: true,
    periodic: true,
  },
];

export const AGENT = Object.fromEntries(AGENTS.map((a) => [a.role, a])) as Record<AgentRole, AgentInfo>;

/**
 * Which specialty a Mairo Decision belongs to — the one that noticed it.
 * By kind first (each rule is one specialty's finding), then by category.
 */
export function agentForDecision(kind: string, category: string): AgentRole {
  switch (kind) {
    case "widen-audience":
      return "AUDIENCE";
    case "test-variation":
      return "CREATIVE";
    case "pause-ad":
    case "creative-fatigue":
    case "shift-budget":
    case "strategy-shift-budget":
      return "OPTIMIZER";
    case "scale-winner":
    case "strategy-more-of-winner":
      return "GROWTH";
    case "not-spending":
      return "GUARDIAN";
    case "landing-page":
      return "ANALYST";
    case "strategy-promotion-urgency":
    case "strategy-discount-rest":
      return "STRATEGIST";
  }
  switch (category) {
    case "BUDGET":
      return "OPTIMIZER";
    case "CREATIVE":
    case "TESTING":
      return "CREATIVE";
    case "AUDIENCE":
    case "RETARGETING":
      return "AUDIENCE";
    case "GROWTH":
      return "GROWTH";
    case "NEEDS_ATTENTION":
      return "GUARDIAN";
    case "WEBSITE":
      return "ANALYST";
    default:
      return "STRATEGIST";
  }
}
