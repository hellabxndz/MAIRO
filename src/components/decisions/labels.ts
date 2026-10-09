import type { DecisionCategory, DecisionConfidence, DecisionRisk } from "@/generated/prisma/enums";

// The words the Decisions screens use for categories, risk and confidence,
// and the plain-English meaning of every advertising term they show.

export const CATEGORY_LABEL: Record<DecisionCategory, string> = {
  NEEDS_ATTENTION: "Needs attention",
  GROWTH: "Growth opportunity",
  CREATIVE: "Creative",
  BUDGET: "Budget",
  AUDIENCE: "Audience",
  RETARGETING: "Retargeting",
  WEBSITE: "Website",
  TESTING: "Testing",
};

export const CATEGORY_TONE: Record<DecisionCategory, string> = {
  NEEDS_ATTENTION: "#f87171",
  GROWTH: "#34d399",
  CREATIVE: "#a78bfa",
  BUDGET: "#6c9eff",
  AUDIENCE: "#38bdf8",
  RETARGETING: "#f472b6",
  WEBSITE: "#fbbf24",
  TESTING: "#94a3b8",
};

export const RISK_LABEL: Record<DecisionRisk, string> = {
  LOW: "Low risk",
  MEDIUM: "Medium risk",
  HIGH: "High risk",
};

export const CONFIDENCE_LABEL: Record<DecisionConfidence, string> = {
  HIGH: "High confidence",
  MEDIUM: "Medium confidence",
  EARLY: "Early signal",
};

export const CONFIDENCE_HELP: Record<DecisionConfidence, string> = {
  HIGH: "Based on a week or more of steady results and meaningful spend.",
  MEDIUM: "Enough results to see a pattern, but it could still move.",
  EARLY: "A first sign from a small amount of data. Worth watching; worth acting on carefully.",
};

/** Plain meanings for the terms Advanced mode shows, for the ⓘ beside them. */
export const TERM_HELP: { match: RegExp; help: string }[] = [
  { match: /\bCTR\b/, help: "Click-through rate: out of every 100 people who saw the ad, how many clicked it." },
  { match: /\bCPA\b/, help: "Cost per acquisition: what you paid, on average, for each purchase or lead." },
  { match: /\bROAS\b/, help: "Return on ad spend: how many dollars came back for every $1 spent on ads." },
  { match: /frequency/i, help: "How many times, on average, each person has seen the ad." },
  { match: /\breach\b/i, help: "How many different people saw the ad at least once." },
  { match: /\bCPM\b/, help: "What it cost to show the ad 1,000 times." },
  { match: /\bCPC\b/, help: "What each click cost, on average." },
  { match: /spend/i, help: "What the ad network charged you over the period." },
];

export function termHelp(label: string): string | null {
  return TERM_HELP.find((t) => t.match.test(label))?.help ?? null;
}

/**
 * "Today, 10:36 AM" in the business's timezone when given one — the same clock
 * the team's trail uses, and the same text on the server and in the browser.
 */
export function whenText(iso: string, now = new Date(), timeZone?: string): string {
  const at = new Date(iso);
  const day = (d: Date) => Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d));
  const diff = Math.round((day(now) - day(at)) / 86_400_000);
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  if (diff <= 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  if (diff < 7) return `${diff} days ago`;
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}
