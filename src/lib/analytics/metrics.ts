// Every advertising metric, in words a business owner already knows.
//
// The premise of this product is somebody who does not want to become an
// advertiser. "CPA: $31.82" fails them twice — they do not know what CPA is,
// and even told it stands for cost per acquisition they do not know whether
// $31.82 is good. So each metric here carries four things:
//
//   plain    — what to call it on screen, instead of the acronym
//   short    — the acronym, kept as a subtitle for anyone who does know it
//   tooltip  — one sentence defining it, no jargon inside the definition
//   reading  — a sentence template that says what THIS number means, filled
//              in with the actual figure
//
// The fourth is the one that matters and the one most products skip. A
// definition explains the column header; a reading explains the number, which
// is what somebody is actually looking at.
//
// Direction is here too, because "up" is not universally good. Spend going up
// is neutral, cost per purchase going up is bad, and a product that paints
// every increase green teaches people to misread their own account.

export type MetricKey =
  | "spend"
  | "revenue"
  | "roas"
  | "purchases"
  | "costPerPurchase"
  | "clicks"
  | "impressions"
  | "reach"
  | "ctr"
  | "cpc"
  | "cpm"
  | "conversions";

/** Whether a rise in this metric is good, bad, or neither. */
export type Direction = "up-good" | "up-bad" | "neutral";

export type MetricInfo = {
  key: MetricKey;
  plain: string;
  /** The acronym, where one exists and is worth showing. */
  short: string | null;
  tooltip: string;
  direction: Direction;
  /** What this particular value means, in a sentence. */
  reading: (formatted: string) => string;
};

export const METRICS: Record<MetricKey, MetricInfo> = {
  spend: {
    key: "spend",
    plain: "Ad spend",
    short: null,
    tooltip: "What the advertising platforms have charged you so far. Paid to them directly, not to MAIRO.",
    direction: "neutral",
    reading: (v) => `You have spent ${v} on advertising.`,
  },
  revenue: {
    key: "revenue",
    plain: "Revenue from ads",
    short: null,
    tooltip:
      "Sales the platforms could trace back to an ad. Usually lower than your real total — some customers see an ad and buy later without being tracked.",
    direction: "up-good",
    reading: (v) => `${v} of sales were traced back to your ads.`,
  },
  roas: {
    key: "roas",
    plain: "Return on ad spend",
    short: "ROAS",
    tooltip: "Revenue generated for every $1 spent on advertising. Above 1x means the advertising is paying for itself.",
    direction: "up-good",
    reading: (v) => `Your advertising brought back about ${v} what it cost.`,
  },
  purchases: {
    key: "purchases",
    plain: "Sales",
    short: null,
    tooltip: "How many purchases the platforms traced back to an ad.",
    direction: "up-good",
    reading: (v) => `Your ads produced ${v} sales.`,
  },
  costPerPurchase: {
    key: "costPerPurchase",
    plain: "Cost per sale",
    short: "CPA",
    tooltip: "What you spent on advertising to get one sale. Lower is better.",
    direction: "up-bad",
    reading: (v) => `You spent about ${v} on advertising for each sale.`,
  },
  conversions: {
    key: "conversions",
    plain: "Results",
    short: null,
    tooltip:
      "Whatever you asked the campaign to produce — a sale, a form filled in, a message. Counted by the platform.",
    direction: "up-good",
    reading: (v) => `Your ads produced ${v} results.`,
  },
  clicks: {
    key: "clicks",
    plain: "Clicks",
    short: null,
    tooltip: "How many times somebody clicked one of your ads.",
    direction: "up-good",
    reading: (v) => `People clicked your ads ${v} times.`,
  },
  impressions: {
    key: "impressions",
    plain: "Times shown",
    short: null,
    tooltip: "How many times your ads appeared on a screen. The same person can be counted more than once.",
    direction: "neutral",
    reading: (v) => `Your ads were shown ${v} times.`,
  },
  reach: {
    key: "reach",
    plain: "People reached",
    short: null,
    tooltip: "How many different people saw your ads, counting each person once however often they saw one.",
    direction: "up-good",
    reading: (v) => `${v} different people saw your ads.`,
  },
  ctr: {
    key: "ctr",
    plain: "Click rate",
    short: "CTR",
    tooltip:
      "How often people who saw your ad clicked it. A low rate usually means the ad is not catching the right people's attention.",
    direction: "up-good",
    reading: (v) => `${v} of the people who saw your ads clicked one.`,
  },
  cpc: {
    key: "cpc",
    plain: "Cost per click",
    short: "CPC",
    tooltip: "What you paid, on average, each time somebody clicked an ad.",
    direction: "up-bad",
    reading: (v) => `Each click cost you about ${v}.`,
  },
  cpm: {
    key: "cpm",
    plain: "Cost per 1,000 views",
    short: "CPM",
    tooltip:
      "What it costs to show your ad a thousand times. Rises when more advertisers are competing for the same audience.",
    direction: "up-bad",
    reading: (v) => `Showing your ads a thousand times cost about ${v}.`,
  },
};

export function metric(key: MetricKey): MetricInfo {
  return METRICS[key];
}

/* ------------------------------------------------------------- comparison */

export type Comparison = {
  /** Change as a fraction: 0.18 is up 18%. Null when it cannot be computed. */
  change: number | null;
  /** Whether this change is good news, given the metric's direction. */
  tone: "good" | "bad" | "neutral";
  /** "18% more than the 7 days before" — already written. */
  label: string | null;
};

/**
 * This period against the one before it.
 *
 * Refuses more often than it answers, on purpose. A percentage change from a
 * near-zero base is a number like "+4,300%" that is technically correct and
 * completely useless, and a change computed against a period with no data at
 * all is not a change — it is a first reading.
 */
export function compare(
  current: number | null,
  previous: number | null,
  direction: Direction,
  periodLabel: string,
): Comparison {
  const none: Comparison = { change: null, tone: "neutral", label: null };

  if (current === null || previous === null) return none;
  // No baseline is not a 100% rise. It is the first time this has been measured.
  if (previous === 0) return none;
  // Below this the ratio is noise rather than signal.
  if (Math.abs(previous) < 1) return none;

  const change = (current - previous) / Math.abs(previous);
  // Under a point either way is not worth drawing the eye to.
  if (Math.abs(change) < 0.01) {
    return { change, tone: "neutral", label: `about the same as ${periodLabel}` };
  }

  const percent = Math.abs(Math.round(change * 100));
  const up = change > 0;
  const tone: Comparison["tone"] =
    direction === "neutral" ? "neutral" : (up && direction === "up-good") || (!up && direction === "up-bad") ? "good" : "bad";

  return {
    change,
    tone,
    label: `${percent}% ${up ? "more" : "less"} than ${periodLabel}`,
  };
}
