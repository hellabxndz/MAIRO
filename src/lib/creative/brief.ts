import { maxTestAds } from "@/lib/campaigns/ad-copy";

// A one-page creative brief and a first test that can actually teach
// something: one variable changed, everything else held, a decision rule
// written down before the results come in.
//
// The rule is a rule of thumb, and the page says so. Two ads on a small
// budget rarely produce a statistically reliable winner; what this prevents
// is the common mistake of calling a winner after a handful of results.

export type BriefGoal = "leads" | "bookings" | "sales" | "messages";
export type TestVariable = "hook" | "visual" | "offer" | "format";
export type Placement = "feed" | "stories" | "reels";

export const GOAL_RESULT: Record<BriefGoal, string> = {
  leads: "enquiry",
  bookings: "booking",
  sales: "purchase",
  messages: "conversation",
};

export const VARIABLE_LABEL: Record<TestVariable, string> = {
  hook: "The opening line",
  visual: "The picture or video",
  offer: "The offer",
  format: "The format (picture vs video)",
};

export type BriefInput = {
  business: string;
  offering: string;
  goal: BriefGoal;
  customer: string;
  message: string;
  /** Only proof the owner can stand behind. */
  proof?: string;
  offer?: string;
  cta: string;
  format: "picture" | "video" | "carousel";
  placements: Placement[];
  variable: TestVariable;
  versionA: string;
  versionB: string;
  dailyBudget?: number | null;
  /** The owner's estimate. */
  costPerResult?: number | null;
  /** Results each version needs before deciding. */
  resultsEach?: number | null;
};

export type Spec = { placement: Placement; ratio: string; size: string; safe: string };

/** Meta's recommended sizes and the areas its own buttons and captions cover. */
export const SPECS: Record<Placement, Spec> = {
  feed: { placement: "feed", ratio: "1:1 or 4:5", size: "1080 × 1080 or 1080 × 1350", safe: "The whole frame shows; keep text large enough to read on a phone." },
  stories: { placement: "stories", ratio: "9:16", size: "1080 × 1920", safe: "Keep text and logos out of roughly the top and bottom 14% (about 250 px), where the profile and button sit." },
  reels: { placement: "reels", ratio: "9:16", size: "1080 × 1920", safe: "Keep text out of roughly the bottom 35% and the top 14%, where captions, buttons and the profile sit." },
};

export type TestPlan = {
  variable: TestVariable;
  heldConstant: string[];
  versions: { label: "A" | "B"; text: string }[];
  budgetEach: number | null;
  versionsFit: boolean;
  resultsEach: number;
  /** Days until each version has `resultsEach` results, at the owner's estimates. */
  days: number | null;
  rule: string[];
  warnings: string[];
};

export type Brief = {
  title: string;
  objective: string;
  audience: string;
  message: string;
  proof: string | null;
  offer: string | null;
  mustInclude: string[];
  avoid: string[];
  specs: Spec[];
  test: TestPlan;
};

const HELD: Record<TestVariable, string[]> = {
  hook: ["the picture or video", "the offer", "the button", "the audience", "the budget"],
  visual: ["the opening line", "the text", "the offer", "the button", "the audience"],
  offer: ["the picture or video", "the opening line's structure", "the button", "the audience"],
  format: ["the message", "the offer", "the button", "the audience"],
};

export function buildBrief(i: BriefInput): Brief {
  const result = GOAL_RESULT[i.goal];
  const resultsEach = Math.max(10, Math.min(200, Math.round(i.resultsEach ?? 20)));
  const daily = i.dailyBudget && i.dailyBudget > 0 ? i.dailyBudget : null;
  const versionsFit = daily ? maxTestAds(Math.round(daily * 100)) >= 2 : true;
  const budgetEach = daily ? daily / 2 : null;
  const days = daily && i.costPerResult && i.costPerResult > 0 ? Math.ceil((resultsEach * i.costPerResult) / (daily / 2)) : null;
  const warnings: string[] = [];
  if (!versionsFit) warnings.push("At this daily budget two versions would each get too little to judge. Run one now and test the other next, or raise the budget only if each result still pays for itself.");
  if (i.versionA.trim() && i.versionA.trim() === i.versionB.trim()) warnings.push("Version A and B are the same — change the one thing you're testing.");
  if (days !== null && days > 28) warnings.push(`At your estimates it would take about ${days} days to get ${resultsEach} ${result}s per version. Consider testing for a more frequent step, or accept a longer test.`);

  return {
    title: `${i.business || i.offering} — first ad brief`,
    objective: `Get ${result}s from ${i.customer || "the people most likely to buy"}${i.goal === "sales" ? " on your website" : ""}.`,
    audience: i.customer || "Not given — describe your best customers before briefing a designer.",
    message: i.message,
    proof: i.proof?.trim() || null,
    offer: i.offer?.trim() || null,
    mustInclude: ["Your logo, at its own proportions", `A clear button: "${i.cta}"`, "What you sell, in the first two seconds or the first line"],
    avoid: [
      "Claims you can't prove (\"best\", \"#1\", \"guaranteed\")",
      "Discounts, deadlines or reviews that aren't real",
      "People presented as your customers unless they are and agreed to it",
      "Questions that imply something personal about the viewer (\"Are you in debt?\")",
    ],
    specs: (i.placements.length ? i.placements : (["feed"] as Placement[])).map((p) => SPECS[p]),
    test: {
      variable: i.variable,
      heldConstant: HELD[i.variable],
      versions: [
        { label: "A", text: i.versionA },
        { label: "B", text: i.versionB },
      ],
      budgetEach,
      versionsFit,
      resultsEach,
      days,
      rule: [
        `Wait until each version has at least ${resultsEach} ${result}s.`,
        `Then compare cost per ${result} — not clicks or likes.`,
        "Keep the cheaper one only if its cost per result is at least 20% lower. Closer than that is a tie: keep both, or test something bigger.",
        "Don't change anything else while the test runs.",
      ],
      warnings,
    },
  };
}

export function briefAsText(b: Brief, currencySymbol = "$"): string {
  const lines = [
    b.title,
    "",
    `Objective: ${b.objective}`,
    `Audience: ${b.audience}`,
    `Key message: ${b.message}`,
    ...(b.proof ? [`Proof (true and checkable): ${b.proof}`] : []),
    ...(b.offer ? [`Offer: ${b.offer}`] : []),
    "",
    "Must include:",
    ...b.mustInclude.map((x) => `- ${x}`),
    "",
    "Avoid:",
    ...b.avoid.map((x) => `- ${x}`),
    "",
    "Sizes:",
    ...b.specs.map((s) => `- ${s.placement}: ${s.ratio} (${s.size}). ${s.safe}`),
    "",
    `First test — ${VARIABLE_LABEL[b.test.variable]}`,
    ...b.test.versions.map((v) => `- Version ${v.label}: ${v.text}`),
    `Keep the same: ${b.test.heldConstant.join(", ")}.`,
    ...(b.test.budgetEach !== null ? [`Budget: ${currencySymbol}${b.test.budgetEach.toFixed(2)} a day each.`] : []),
    ...(b.test.days !== null ? [`Expected length: about ${b.test.days} days.`] : []),
    "Decision rule:",
    ...b.test.rule.map((x) => `- ${x}`),
    ...b.test.warnings.map((x) => `Note: ${x}`),
  ];
  return lines.join("\n");
}
