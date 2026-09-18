import type { AdPlatform, CampaignStatus } from "@/generated/prisma/enums";

// What MAIRO has done to a campaign, as a list somebody can read.
//
// The point of this screen is trust. A business owner hands over a budget and
// an objective and then, in every other tool, sees nothing until numbers
// appear — so the nine steps below are the answer to "what is it actually
// doing with my money".
//
// Derived, not stored. There is no timeline table and there should not be one:
// every step here is a question the database can already answer — is there an
// intake, is a network connected, does the campaign have creatives, is it
// live. A stored copy would be a second source of truth that drifts the first
// time anything is changed outside this flow, and then the timeline would be
// confidently wrong, which is worse than absent.
//
// It also means the timeline is honest for campaigns that existed before this
// screen did. They get a real history rather than an empty one.

export type StepState = "done" | "current" | "upcoming" | "blocked";

export type TimelineStep = {
  key: string;
  title: string;
  /** One line, in the customer's language, for the collapsed row. */
  summary: string;
  /** Shown when the row is expanded. Facts, not reassurance. */
  detail: string;
  state: StepState;
  /** Where to go to unblock this, when the customer is the blocker. */
  action?: { label: string; href: string };
};

export type TimelineInput = {
  status: CampaignStatus;
  /** Whether the business ever answered the signup questions. */
  hasIntake: boolean;
  /** Networks with a live connection right now. */
  connected: AdPlatform[];
  /** Networks this campaign is meant to run on. */
  requested: AdPlatform[];
  /** Creatives attached to this campaign. */
  creativeCount: number;
  /** True once targeting is more specific than "the whole country". */
  hasTargeting: boolean;
  /** Anything stopping it going live, already in plain language. */
  blockers: string[];
  /** Automatic changes MAIRO has already made. */
  appliedActions: number;
  autoOptimizeOn: boolean;
  startsAt: Date | null;
};

const PLATFORM_LABEL: Record<AdPlatform, string> = {
  META: "Meta",
  TIKTOK: "TikTok",
  GOOGLE: "Google",
  SNAPCHAT: "Snapchat",
  PINTEREST: "Pinterest",
  LINKEDIN: "LinkedIn",
};

/** First letter up. The blockers arrive as fragments and are used as sentences. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function list(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The nine steps, in order, each already resolved to a state.
 *
 * Exactly one step is ever `current`. Everything before it is `done` and
 * everything after is `upcoming` — which is what makes the list readable at a
 * glance rather than a grid of independent ticks. `blocked` is the exception:
 * it marks the step the customer themselves has to clear, and it is the only
 * state that carries an action.
 */
export function campaignTimeline(input: TimelineInput): TimelineStep[] {
  const live = input.status === "ACTIVE";
  const missing = input.requested.filter((p) => !input.connected.includes(p));
  const connectedRequested = input.requested.filter((p) => input.connected.includes(p));
  const readyToLaunch = input.blockers.length === 0;

  const steps: Omit<TimelineStep, "state">[] = [
    {
      key: "analysis",
      title: "Business analysis",
      summary: input.hasIntake
        ? "MAIRO read what you sell, who buys it and what you want from advertising."
        : "MAIRO needs to know what you sell before it can advertise it.",
      detail: input.hasIntake
        ? "Your answers at signup — the goal, the budget, who you are trying to reach — are what every plan and every ad gets written from. Change them in Settings and the next campaign is written from the new ones."
        : "Finish setup and MAIRO can start here.",
      action: input.hasIntake ? undefined : { label: "Finish setup", href: "/onboarding" },
    },
    {
      key: "connection",
      title: "Account connection",
      summary:
        // A campaign with no network rows at all is not "connected" — it is a
        // campaign that never reached one. Saying "connected." with nothing in
        // front of it was the shape of that bug.
        input.requested.length === 0
          ? "This campaign has not reached an advertising network yet."
          : missing.length === 0
            ? `${list(connectedRequested.map((p) => PLATFORM_LABEL[p]))} connected.`
            : `${list(missing.map((p) => PLATFORM_LABEL[p]))} still needs connecting.`,
      detail:
        missing.length === 0 && input.requested.length > 0
          ? "MAIRO builds campaigns inside your own advertising account. The account stays yours, the ad spend is billed to you by the platform, and you can disconnect at any time."
          : "Nothing can go live until the account is connected. MAIRO never takes custody of your budget — you pay the platform directly and MAIRO decides how that budget is used.",
      action:
        missing.length === 0 && input.requested.length > 0
          ? undefined
          : { label: "Connect", href: "/dashboard/integrations" },
    },
    {
      key: "strategy",
      title: "Campaign strategy",
      summary: "MAIRO chose the objective, the structure and how the budget is split.",
      detail:
        "The objective decides what the platform optimises for, which is the single biggest lever on what your money buys. MAIRO picks it from your goal rather than asking you to know the difference between traffic and conversions.",
    },
    {
      key: "creative",
      title: "Creative generation",
      summary:
        input.creativeCount > 0
          ? `${input.creativeCount} ${input.creativeCount === 1 ? "creative" : "creatives"} written for this campaign.`
          : "MAIRO will write the ads for this campaign.",
      detail:
        input.creativeCount > 0
          ? "Each one is written for the network it runs on — what works on TikTok is not what works on Facebook. You can read every one, change any of them, and ask for more."
          : "Concepts, headlines, body copy and calls to action, written per network. You approve them before anything runs.",
    },
    {
      key: "targeting",
      title: "Targeting setup",
      summary: input.hasTargeting
        ? "Location, age and audience set."
        : "Targeting is still set to everyone, everywhere.",
      detail: input.hasTargeting
        ? "Narrow enough to reach people who might actually buy, wide enough that the platform has room to learn. MAIRO widens or narrows it as results come in."
        : "A campaign aimed at everybody spends most of its budget on people who will never buy. This is worth setting before launch.",
    },
    {
      key: "review",
      title: "Campaign review",
      summary: readyToLaunch
        ? "Checked for the things that stop a campaign delivering."
        : sentence(input.blockers[0] ?? "Something is still missing."),
      detail: readyToLaunch
        ? "Budget against objective, targeting against location, creative against the platform's own policies — the checks that otherwise fail after you have already pressed go."
        : `Still to sort: ${list(input.blockers)}.`,
    },
    {
      key: "approval",
      title: "Your approval",
      summary: live
        ? "You approved this campaign."
        : readyToLaunch
          ? "Waiting for you. Nothing spends until you say so."
          : "Available once the checks above pass.",
      detail:
        "MAIRO builds campaigns paused, inside your account. This is the step where money starts being spent, so it is the one step MAIRO will never take for you.",
      action:
        !live && readyToLaunch ? { label: "Review and approve", href: "#approve" } : undefined,
    },
    {
      key: "launch",
      title: "Launch",
      summary: live
        ? "Live."
        : input.startsAt
          ? `Scheduled for ${input.startsAt.toLocaleDateString()}.`
          : "Goes live as soon as you approve and the platform finishes its own review.",
      detail:
        "The platform reviews every new campaign before it delivers. That is usually under a day and is entirely on their side — MAIRO cannot speed it up, and shows you the moment it clears.",
    },
    {
      key: "optimization",
      title: "MAIRO optimisation",
      summary: !live
        ? "Starts once the campaign is running."
        : input.appliedActions > 0
          ? `${input.appliedActions} ${input.appliedActions === 1 ? "change" : "changes"} made so far.`
          : "Watching. No changes needed yet.",
      detail: input.autoOptimizeOn
        ? "MAIRO moves budget toward what is working, within the limits you set. Every change is logged with the numbers behind it."
        : "MAIRO watches the campaign and proposes changes for you to approve. Turn on Auto Optimize in Settings and it makes them itself, within limits you set.",
    },
  ];

  // Resolve states. The first step that is not finished is the current one;
  // if the customer is what it is waiting on, it is blocked rather than
  // current, because those two need to look different.
  const done: Record<string, boolean> = {
    analysis: input.hasIntake,
    connection: missing.length === 0 && input.requested.length > 0,
    strategy: true,
    creative: input.creativeCount > 0,
    targeting: input.hasTargeting,
    review: readyToLaunch,
    approval: live,
    launch: live,
    optimization: live && input.appliedActions > 0,
  };

  let seenCurrent = false;
  return steps.map((step) => {
    if (done[step.key]) return { ...step, state: "done" as StepState };
    if (seenCurrent) return { ...step, state: "upcoming" as StepState };
    seenCurrent = true;
    return { ...step, state: step.action ? ("blocked" as StepState) : ("current" as StepState) };
  });
}
