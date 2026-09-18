import type { PlatformMetrics } from "@/lib/ad-platforms/types";

// How a campaign is doing, in one word and one sentence.
//
// The whole promise of this product is that somebody who does not know what
// CPA means can still tell whether their advertising is working. That is what
// this is for — and it is also the single easiest place in the product to lie,
// so the rules are narrow on purpose.
//
// Three things it will not do:
//
//   It will not grade a campaign with no figures. Every metric on
//   PlatformMetrics is nullable, and null means "the platform has not reported
//   this", which is not the same as zero. A campaign that launched an hour ago
//   is "too early to tell", not "poor".
//
//   It will not grade on spend alone. Money going out is not a result, and a
//   campaign that has spent nothing is not unhealthy — it is new.
//
//   It will not invent a benchmark. There is no industry-average ROAS in here
//   pretending to be a target. The only comparisons it makes are against the
//   campaign's own numbers: is it returning more than it costs, and is it
//   spending without converting.

export type HealthLevel = "unknown" | "early" | "attention" | "steady" | "strong";

export type CampaignHealth = {
  level: HealthLevel;
  /** The one word, for the badge. */
  label: string;
  /** The one sentence, in the customer's language. */
  summary: string;
  /** What MAIRO is doing about it, or would do. Never a promise. */
  note: string;
};

/**
 * Enough of a signal to say anything at all.
 *
 * A campaign needs to have both spent something and been given the chance to
 * return something. Under a few dollars, every ratio is noise — the platform is
 * still working out who to show it to, and a single click can swing a ROAS from
 * zero to ten.
 */
const MIN_SPEND_CENTS = 2000;

export function campaignHealth(
  metrics: PlatformMetrics | null,
  opts: { live: boolean; scope?: "campaign" | "account" } = { live: true },
): CampaignHealth {
  // The same function reads one campaign and the whole account, and the two
  // need different nouns — the dashboard saying "this campaign" over an
  // account-wide figure is the kind of small wrongness that makes somebody
  // stop trusting the number next to it.
  const it = opts.scope === "account" ? "your advertising" : "this campaign";
  if (!opts.live) {
    return {
      level: "unknown",
      label: "Not running",
      summary:
        opts.scope === "account"
          ? "Nothing is running yet, so there is nothing to measure."
          : "This campaign is not live, so there is nothing to measure yet.",
      note:
        opts.scope === "account"
          ? "MAIRO starts watching the moment your first campaign launches."
          : "MAIRO starts watching the moment it launches.",
    };
  }

  const spend = metrics?.spendCents ?? null;

  if (spend === null) {
    return {
      level: "unknown",
      label: "No data yet",
      summary: `The platform has not reported any figures for ${it} yet.`,
      note: "Numbers usually appear within a few hours of launch.",
    };
  }

  if (spend < MIN_SPEND_CENTS) {
    return {
      level: "early",
      label: "Too early to tell",
      summary:
        "It has not spent enough yet for the numbers to mean anything — one click either way would change them.",
      note: "MAIRO leaves a new campaign alone while the platform works out who to show it to.",
    };
  }

  const revenue = metrics?.revenueCents ?? null;
  const conversions = metrics?.conversions ?? metrics?.purchases ?? null;
  // Prefer the platform's own ratio; derive it only when both sides are known.
  const roas =
    metrics?.roas ?? (revenue !== null && spend > 0 ? revenue / spend : null);

  // Spending with nothing to show for it is the one state worth interrupting
  // somebody about, and the only one that does not need a revenue figure to be
  // certain about — zero conversions on real spend is zero either way.
  if (conversions !== null && conversions === 0) {
    return {
      level: "attention",
      label: "Needs attention",
      summary: `It has spent ${money(spend)} without a single result so far.`,
      note: "MAIRO is narrowing the audience and testing different creative. If it stays flat, it will propose pausing it.",
    };
  }

  if (roas === null) {
    // It is converting, but the platform is not reporting a value for those
    // conversions — normal for leads, where MAIRO cannot know what a lead is
    // worth to this business.
    return {
      level: "steady",
      label: "Working",
      summary:
        conversions !== null
          ? `${conversions} ${conversions === 1 ? "result" : "results"} from ${money(spend)} spent.`
          : `${money(spend)} spent. The platform has not reported results yet.`,
      note: "MAIRO is shifting budget toward whatever is producing them.",
    };
  }

  if (roas >= 2) {
    return {
      level: "strong",
      label: "Strong",
      summary: `It is bringing back about ${roas.toFixed(1)}x what it costs.`,
      note: "MAIRO is putting more budget behind what is working and leaving the rest alone.",
    };
  }

  if (roas >= 1) {
    return {
      level: "steady",
      label: "Steady",
      summary: `It is bringing back about ${roas.toFixed(1)}x what it costs.`,
      note: "MAIRO is testing new creative and audiences to push that further.",
    };
  }

  return {
    level: "attention",
    label: "Needs attention",
    summary: `It is currently costing more than it brings back — about ${roas.toFixed(1)}x.`,
    note: "MAIRO is moving budget away from what is losing and will propose a change if it does not recover.",
  };
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Where this level sits in the product's colour vocabulary. */
export function healthTone(level: HealthLevel): "green" | "yellow" | "blue" | "neutral" {
  if (level === "strong") return "green";
  if (level === "steady") return "blue";
  if (level === "attention") return "yellow";
  return "neutral";
}
