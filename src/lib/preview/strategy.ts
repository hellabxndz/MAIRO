import { maxTestAds } from "@/lib/campaigns/ad-copy";
import type { PreviewGoal, PreviewKind } from "@/lib/preview/build";

// The free AI ad plan's strategy: the five goals a visitor can choose, the
// budget choices, how a monthly Meta budget is divided for this business and
// goal, and the first 30 days with MAIRO. Pure and deterministic — the same
// inputs always give the same plan — and pinned by scripts/check-strategy.ts.
//
// Every figure here is the visitor's own budget divided up, never a forecast:
// nothing says how many sales, leads or people a budget will bring. Rules
// that change the split (too little traffic to retarget, no pixel yet, a goal
// retargeting doesn't serve) are said in the plan as notes, so the visitor
// sees why a tactic is or isn't there.

export const GOAL_OPTIONS: { value: PreviewGoal; label: string; detail: string }[] = [
  { value: "sales", label: "More online sales", detail: "People buying on your website" },
  { value: "leads", label: "Generate more leads", detail: "Enquiries, quotes and calls" },
  { value: "bookings", label: "Get more bookings", detail: "Appointments and reservations" },
  { value: "traffic", label: "Increase website traffic", detail: "More people on your site" },
  { value: "awareness", label: "Build brand awareness", detail: "The right people knowing you" },
];

/** The budget choices offered, in dollars a month. The last reads "$5,000+". */
export const BUDGET_CHOICES = [300, 500, 1000, 2500, 5000] as const;
export const BUDGET_MIN = 100;
export const BUDGET_MAX = 1_000_000;

export function budgetLabel(monthly: number): string {
  return monthly >= 5000 && (BUDGET_CHOICES as readonly number[]).includes(monthly) ? "$5,000+" : `$${monthly.toLocaleString("en-US")}`;
}

/** The setup goal (lib/onboarding/goal.ts) a free-plan goal becomes, so setup opens with it chosen. */
export function setupGoalFor(goal: PreviewGoal): "SALES" | "LEADS" | "TRAFFIC" | "AWARENESS" {
  return goal === "sales" ? "SALES" : goal === "traffic" ? "TRAFFIC" : goal === "awareness" ? "AWARENESS" : "LEADS";
}

export type BudgetLine = {
  key: "prospecting" | "reach" | "retargeting" | "testing" | "audiences";
  label: string;
  monthly: number;
  daily: number;
  share: number;
  why: string;
};

export type BudgetPlan = {
  monthly: number;
  daily: number;
  lines: BudgetLine[];
  /** Why a tactic isn't in the plan, or what the budget means for it. */
  notes: string[];
  /** How many ads run against each other at once at this budget (lib/campaigns/ad-copy.ts maxTestAds). */
  adsAtOnce: number;
};

export type BudgetInput = {
  monthly: number;
  goal: PreviewGoal;
  kind: PreviewKind;
  hasWebsite: boolean;
  /** Whether a Meta pixel was seen on the site; null when the site wasn't read. */
  pixelSeen: boolean | null;
  /** A lead form inside the ad, rather than a website form. */
  usesLeadForm: boolean;
};

const DAYS = 30.4;
const round5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * The monthly budget divided for this business and goal. Shares follow from
 * the goal, the budget and what the website can support — not one split for
 * everyone — and the parts always add up to the visitor's own figure.
 */
export function budgetPlan(i: BudgetInput): BudgetPlan {
  const monthly = Math.round(Math.min(Math.max(i.monthly, BUDGET_MIN), BUDGET_MAX));
  const daily = monthly / DAYS;
  const adsAtOnce = maxTestAds(Math.round(daily * 100));
  const notes: string[] = [];
  const converting = i.goal === "sales" || i.goal === "leads" || i.goal === "bookings";
  const lines: Omit<BudgetLine, "daily" | "share">[] = [];

  // Retargeting: only for a goal that converts, with a website (or a lead form) people have already met, and enough money for that audience to fill.
  let retarget = 0;
  if (!converting) {
    notes.push(i.goal === "traffic" ? "No retargeting: it brings back people who already visited, which helps a sale or an enquiry — not a goal of new visits." : "No retargeting: awareness is about reaching new people, not following up the ones who've seen you.");
  } else if (monthly < 1000) {
    notes.push(`No retargeting yet: at ${money(monthly)} a month, too few people would visit${i.usesLeadForm ? " or open your form" : " your site"} for a retargeting audience to fill. MAIRO suggests it once there's steady traffic.`);
  } else if (!i.hasWebsite && !i.usesLeadForm) {
    notes.push("No retargeting yet: it needs a website or a lead form people have already visited.");
  } else if (i.hasWebsite && !i.usesLeadForm && i.pixelSeen === false) {
    notes.push("No retargeting yet: MAIRO found no Meta pixel on the pages it read, so Meta can't tell who visited. Once the pixel is installed and has collected visitors, MAIRO can suggest moving part of the budget there.");
  } else {
    retarget = round5(monthly * (i.kind === "shop" ? 0.2 : 0.15));
    lines.push({
      key: "retargeting",
      label: "Retargeting",
      monthly: retarget,
      why: i.usesLeadForm
        ? "Reaches people who opened your form or watched your ad without finishing — often the cheapest enquiries, once enough people have seen the ads."
        : i.kind === "shop"
          ? "Reminds people who visited your shop or added something to their basket. Usually the cheapest sales — it starts once enough people have visited."
          : "Reaches people who visited your website but didn't get in touch. It starts once enough people have visited.",
    });
    if (i.pixelSeen === null && i.hasWebsite && !i.usesLeadForm) notes.push("Retargeting needs the Meta pixel on your website. Setup checks whether it's there before this part starts.");
  }

  // Creative testing: a separate budget only when it's enough to learn from (about $5 a day); below that the ads share one ad set.
  let testing = 0;
  const testShare = monthly >= 4000 ? 0.1 : 0.15;
  if (monthly * testShare / DAYS >= 4.9) {
    testing = round5(monthly * testShare);
    lines.push({ key: "testing", label: "Creative testing", monthly: testing, why: "A small budget of its own for trying a new opening or picture against the current best ad, so your ads don't wear out. MAIRO proposes each test; you approve it." });
  } else {
    notes.push(`No separate testing budget: at about ${money(daily)} a day, splitting it would leave each part too little to learn from. Your ${adsAtOnce === 1 ? "ad runs" : `${adsAtOnce} ads run`} together in one ad set${adsAtOnce < 3 ? `, and the ${adsAtOnce === 1 ? "other two wait" : "third waits"} for the first results` : " and Meta spends more on the one that works"}.`);
  }

  // A second audience, at scale, for a goal that converts.
  let audiences = 0;
  if (converting && monthly >= 4000) {
    audiences = round5(monthly * 0.1);
    lines.push({ key: "audiences", label: "New audience test", monthly: audiences, why: "Tries one new audience at a time — a second area, or people similar to your customers once you have enough of them — against the main one." });
  }

  const main = monthly - retarget - testing - audiences;
  lines.unshift(
    i.goal === "awareness"
      ? { key: "reach", label: "Reach", monthly: main, why: "Shows your ads to as many of the right people as possible, a few times each — enough to be remembered, not so often they tune out." }
      : {
          key: "prospecting",
          label: "Prospecting",
          monthly: main,
          why:
            i.goal === "traffic"
              ? "Puts your page in front of new people likely to open it and stay. Meta learns from who does and finds more like them."
              : i.kind === "shop"
                ? "Finds new buyers across Facebook and Instagram. Starting broad lets Meta learn from who buys and find more people like them."
                : "Shows your ads to people near you who don't know you yet. Meta learns from who gets in touch and finds more people like them.",
        },
  );

  if (daily < 10) notes.push(`At about ${money(daily)} a day, Meta learns slowly. The plan keeps to one campaign and one audience so nothing is spread too thin.`);
  if (monthly >= 5000 && (BUDGET_CHOICES as readonly number[]).includes(monthly)) notes.push("Planned at $5,000 a month. Tell MAIRO your real figure and it re-plans the split.");

  return {
    monthly,
    daily: Math.round(daily * 100) / 100,
    adsAtOnce,
    notes,
    lines: lines.map((l) => ({ ...l, daily: Math.round((l.monthly / DAYS) * 100) / 100, share: Math.round((l.monthly / monthly) * 100) })),
  };
}

export type PlanWeek = { week: 1 | 2 | 3 | 4; title: string; actions: string[] };

/**
 * The first 30 days with MAIRO, for this goal and budget — what would be
 * done, in order. Planned actions, not things already done or results
 * promised: every launch and change waits for the owner's approval.
 */
export function firstMonth(i: BudgetInput & { firstAd: string }): PlanWeek[] {
  const b = budgetPlan(i);
  const result = i.goal === "sales" ? "purchase" : i.goal === "bookings" ? "booking" : i.goal === "leads" ? "lead" : i.goal === "traffic" ? "visit" : "1,000 people reached";
  const tracking =
    i.goal === "awareness"
      ? "Choose the area and the people the ads should reach; Meta measures reach itself."
      : i.usesLeadForm
        ? "Build the lead form inside the ad with you — it reports each lead to Meta by itself."
        : i.goal === "traffic"
          ? i.hasWebsite ? "Check the page your ads send people to loads quickly and works on a phone." : "Add the website your ads will send people to."
          : `Set up tracking so Meta sees each ${result}: find or create your Meta pixel, show the install steps for your website, and check Meta receives the event.`;
  const moves = b.lines.some((l) => l.key === "retargeting") ? " and whether to start retargeting" : "";
  return [
    {
      week: 1,
      title: "Prepare",
      actions: [
        `Finish your ${b.adsAtOnce === 3 ? "three" : b.adsAtOnce === 2 ? "first two" : "first"} ad${b.adsAtOnce === 1 ? "" : "s"}, starting with “${i.firstAd}” — from your own photos and videos, or MAIRO's picture tools on a paid plan.`,
        tracking,
        `Build the campaign in your own Meta ad account, switched off, at about ${money(b.daily)} a day.`,
        "You review the budget, the audience and every ad, and approve before anything runs.",
      ],
    },
    {
      week: 2,
      title: "Launch and learn",
      actions: [
        "Launch the campaign you approved. Meta reviews the ads first, and MAIRO shows them as live only once Meta confirms.",
        "Meta's learning phase: about a week of delivery to find who responds. MAIRO doesn't judge the ads before then.",
        "MAIRO checks delivery every day and tells you if an ad is rejected, spend stops, or something needs your attention.",
      ],
    },
    {
      week: 3,
      title: "Read the results",
      actions: [
        i.goal === "awareness" ? "Compare the ads on what they actually cost to reach people, and how often the same people see them." : `Compare the ads on what each ${result} actually cost — from your real results, not an estimate.`,
        i.goal === "leads" || i.goal === "bookings" ? "Mark each enquiry as good, booked or a customer, so MAIRO can judge the ads on the ones that matter." : "Check what Meta reports against what your own records show.",
        `MAIRO recommends what to keep, what to replace${moves} — each change waits for your approval.`,
      ],
    },
    {
      week: 4,
      title: "Refine",
      actions: [
        "Replace the weakest ad with a fresh version of what worked, and plan the next test.",
        "Decide month two's budget from what the first weeks showed — MAIRO never raises it on its own.",
        "Your first monthly summary: what ran, what it cost, and what MAIRO recommends next.",
      ],
    },
  ];
}
