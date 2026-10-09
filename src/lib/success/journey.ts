// A new business's first 30 days with MAIRO.
//
// The point of the first month isn't to fill a checklist — it's for the
// business to see MAIRO earn its subscription. Each stage names what has to be
// true by then, works it out from what MAIRO already knows (nothing here is
// asked of the customer twice), and says honestly when it's too early to judge.
//
//   Day 1    Get set up          setup, ad account, plan, payment on Meta,
//                                tracking where possible, first campaign approved
//   Week 1   Running smoothly    live, delivering, nothing blocking — early
//                                numbers, no conclusions
//   Week 2   First improvements  MAIRO has looked for changes; you've answered
//   Week 3   Understand results  a weekly report explaining what's working
//   Week 4   Monthly review      the month's results, and how MAIRO is doing
//
// Pure; pinned by scripts/check-success.ts. The MAIRO team's view in AIOS uses
// the same stages, so the customer and the team never disagree about where an
// account is.

export type JourneyFacts = {
  startedAt: Date;
  now: Date;
  setupDone: boolean;
  metaConnected: boolean;
  subscribed: boolean;
  /** Payment method on the Meta ad account: true, false, or null when Meta couldn't say. */
  fundingConfirmed: boolean | null;
  /** A pixel Meta can optimize towards. Asked "where possible", never required. */
  trackingReady: boolean;
  campaignApproved: boolean;
  live: boolean;
  delivering: boolean;
  problems: number;
  decisionsMade: number;
  decisionsAnswered: number;
  weeklyReports: number;
  /** The "is MAIRO making advertising easier?" question answered in week 3 or later. */
  pulseAnswered: boolean;
};

export type JourneyItem = { label: string; done: boolean; href: string; optional?: boolean; note?: string };
export type JourneyStage = {
  key: "activation" | "health" | "optimization" | "insights" | "review";
  when: string;
  title: string;
  /** Day the stage begins. */
  from: number;
  items: JourneyItem[];
  state: "done" | "current" | "upcoming";
  /** A sentence for the stage: what's normal at this point. */
  note: string;
};

export type Journey = {
  day: number;
  stages: JourneyStage[];
  done: number;
  total: number;
  next: JourneyItem | null;
  /** Shown on the Overview for the first five weeks, unless everything is done. */
  show: boolean;
  /** Something in a stage that has started is still undone — worth the team's attention. */
  behind: boolean;
};

const DAY = 86_400_000;

/** "Ask me later" on the pulse question, per device, for a week. */
export const PULSE_LATER_COOKIE = "mairo_pulse_later";

export function successJourney(f: JourneyFacts): Journey {
  const day = Math.max(1, Math.floor((f.now.getTime() - f.startedAt.getTime()) / DAY) + 1);
  const nothingToChangeYet = f.decisionsMade === 0 && day >= 14 && f.live;

  const raw: Omit<JourneyStage, "state">[] = [
    {
      key: "activation",
      when: "Day 1",
      title: "Get set up",
      from: 1,
      note: "Nothing goes live until you've approved it.",
      items: [
        { label: "Tell MAIRO about your business", done: f.setupDone, href: "/dashboard/settings/business-brain" },
        { label: "Connect your Meta ad account", done: f.metaConnected, href: "/dashboard/meta" },
        { label: "Choose your MAIRO plan", done: f.subscribed, href: "/dashboard/billing" },
        {
          label: "Payment method on your Meta account",
          done: f.fundingConfirmed === true,
          href: "/dashboard/meta",
          note: f.fundingConfirmed === null ? "Meta couldn't confirm it just now" : undefined,
        },
        { label: "Set up sales tracking", done: f.trackingReady, href: "/dashboard/tracking", optional: true },
        { label: "Approve your first campaign", done: f.campaignApproved, href: "/dashboard/campaigns" },
      ],
    },
    {
      key: "health",
      when: "Week 1",
      title: "Running smoothly",
      from: 2,
      note: "The first days are Meta learning who responds. Early numbers move a lot — MAIRO watches delivery and problems, not conclusions.",
      items: [
        { label: "Your campaign is live", done: f.live, href: "/dashboard/campaigns" },
        { label: "Ads are being shown and spending", done: f.delivering, href: "/dashboard/analytics" },
        { label: "No problems blocking your ads", done: f.live && f.problems === 0, href: "/dashboard" },
      ],
    },
    {
      key: "optimization",
      when: "Week 2",
      title: "First improvements",
      from: 8,
      note: nothingToChangeYet
        ? "MAIRO hasn't seen anything worth changing yet — that's normal when there isn't much data."
        : "With a week of results, MAIRO looks for changes worth making and asks you first.",
      items: [
        { label: "MAIRO looked for improvements", done: f.decisionsMade > 0 || nothingToChangeYet, href: "/dashboard/decisions" },
        { label: "You've answered MAIRO's suggestions", done: f.decisionsAnswered > 0 || nothingToChangeYet, href: "/dashboard/decisions" },
      ],
    },
    {
      key: "insights",
      when: "Week 3",
      title: "Understand your results",
      from: 15,
      note: "What's working, what isn't yet, and what's still too early to say.",
      items: [{ label: "Read your weekly report", done: f.weeklyReports > 0, href: "/dashboard/reports" }],
    },
    {
      key: "review",
      when: "Week 4",
      title: "Your monthly review",
      from: 22,
      note: "A month of results, what MAIRO did, and the plan for next month.",
      items: [
        { label: "See your monthly results", done: day >= 28 && f.live, href: "/dashboard/reports/monthly" },
        { label: "Tell MAIRO how it's going", done: f.pulseAnswered, href: "/dashboard?feedback=1" },
      ],
    },
  ];

  const required = (s: Omit<JourneyStage, "state">) => s.items.filter((i) => !i.optional);
  let currentFound = false;
  const stages: JourneyStage[] = raw.map((s) => {
    const complete = required(s).every((i) => i.done);
    if (complete) return { ...s, state: "done" };
    if (!currentFound) {
      currentFound = true;
      return { ...s, state: "current" };
    }
    return { ...s, state: "upcoming" };
  });

  const all = stages.flatMap((s) => required(s));
  const done = all.filter((i) => i.done).length;
  const current = stages.find((s) => s.state === "current") ?? null;
  const next = current ? (current.items.find((i) => !i.done && !i.optional) ?? null) : null;
  const behind = stages.some((s) => s.state !== "done" && day >= s.from + 6);

  return { day, stages, done, total: all.length, next, show: day <= 35 && done < all.length, behind };
}
