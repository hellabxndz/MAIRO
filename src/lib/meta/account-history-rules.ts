import type { AdGoal } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";

// The campaigns a business ran on its Meta ad account outside MAIRO — before
// it joined, or alongside it in Ads Manager — in MAIRO's own words.
//
// Read-only by design. MAIRO shows how they did and learns from them, and
// never pauses, edits or spends on them: it didn't build them, it can't know
// why they're set up the way they are, and a customer who finds an old
// campaign changed by a tool they connected for something else stops
// trusting that tool. Pure; pinned by scripts/check-account-history.ts.

export type AccountCampaign = {
  /** Meta's campaign id. */
  id: string;
  name: string;
  /** Meta's objective mapped to MAIRO's goal, for the result that matters. */
  goal: AdGoal;
  state: AccountCampaignState;
  startedAt: Date | null;
  endedAt: Date | null;
  /** Lifetime figures; null when Meta has none (never ran). */
  metrics: PlatformMetrics | null;
};

export type AccountCampaignState = "running" | "paused" | "ended" | "issues";

/**
 * Meta's objective → MAIRO's goal. Covers the current OUTCOME_* objectives and
 * the legacy ones older campaigns still carry; anything unknown reads as
 * engagement rather than claiming sales it wasn't chasing.
 */
export function goalFromObjective(objective: string | null | undefined): AdGoal {
  switch ((objective ?? "").toUpperCase()) {
    case "OUTCOME_SALES":
    case "CONVERSIONS":
    case "PRODUCT_CATALOG_SALES":
      return "SALES";
    case "OUTCOME_LEADS":
    case "LEAD_GENERATION":
      return "LEADS";
    case "OUTCOME_TRAFFIC":
    case "LINK_CLICKS":
      return "TRAFFIC";
    case "OUTCOME_AWARENESS":
    case "REACH":
    case "BRAND_AWARENESS":
      return "AWARENESS";
    case "OUTCOME_APP_PROMOTION":
    case "APP_INSTALLS":
      return "APP_PROMOTION";
    default:
      return "ENGAGEMENT";
  }
}

/** Meta's effective_status, plus an end date, as one of four plain states. */
export function stateOf(effectiveStatus: string | null | undefined, stopTime: Date | null, now: Date): AccountCampaignState {
  const s = (effectiveStatus ?? "").toUpperCase();
  if (s === "ARCHIVED" || s === "DELETED" || (stopTime && stopTime < now)) return "ended";
  if (s === "WITH_ISSUES" || s === "DISAPPROVED") return "issues";
  if (s === "ACTIVE" || s === "IN_PROCESS" || s === "PENDING_REVIEW" || s === "PREAPPROVED") return "running";
  return "paused";
}

export const STATE_LABEL: Record<AccountCampaignState, { dot: string; text: string }> = {
  running: { dot: "🟢", text: "Running on Meta" },
  paused: { dot: "⏸", text: "Paused" },
  ended: { dot: "⚪", text: "Ended" },
  issues: { dot: "🟠", text: "Has issues on Meta" },
};

/** Running first, then most recently started. */
export function sortCampaigns(list: AccountCampaign[]): AccountCampaign[] {
  const rank: Record<AccountCampaignState, number> = { running: 0, issues: 1, paused: 2, ended: 3 };
  return list.slice().sort((a, b) => rank[a.state] - rank[b.state] || (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
}

/** Opens the campaign in Meta Ads Manager — the place to change it, since MAIRO won't. */
export function adsManagerUrl(adAccountId: string, campaignId: string): string {
  const act = adAccountId.replace(/^act_/, "");
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(act)}&selected_campaign_ids=${encodeURIComponent(campaignId)}`;
}

const dollars = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents >= 100_000 ? 0 : 2 });

/** The result a campaign's cost is measured against, for its goal: [count, noun]. */
function resultOf(c: AccountCampaign): [number, string] | null {
  const m = c.metrics;
  if (!m) return null;
  const pick: [number | null | undefined, string][] =
    c.goal === "SALES" ? [[m.purchases, "sale"]] : c.goal === "LEADS" ? [[m.leads, "lead"]] : c.goal === "TRAFFIC" ? [[m.landingPageViews ?? m.clicks, "website visit"]] : c.goal === "APP_PROMOTION" ? [[m.conversions, "install"]] : [];
  const [n, noun] = pick[0] ?? [null, ""];
  return n && n > 0 ? [n, noun] : null;
}

/** The account's history in figures: what ran, what it cost, and the cheapest result per goal. */
export type HistoryPoints = {
  count: number;
  spentCents: number;
  best: { name: string; goal: AdGoal; results: number; noun: string; eachCents: number }[];
};

/** The facts behind both the Brain's brief and the Brain page — or null when nothing ever spent. */
export function historyPoints(list: AccountCampaign[]): HistoryPoints | null {
  const ran = list.filter((c) => (c.metrics?.spendCents ?? 0) > 0);
  if (ran.length === 0) return null;
  // The cheapest result for each goal, never across goals: a website visit
  // will always cost less than a sale, and putting them in one ranking would
  // say the traffic campaign "did best" for no reason but arithmetic.
  const byGoal = new Map<AdGoal, HistoryPoints["best"][number]>();
  for (const c of ran) {
    const r = resultOf(c);
    if (!r) continue;
    const eachCents = Math.round(c.metrics!.spendCents! / r[0]);
    const held = byGoal.get(c.goal);
    if (!held || eachCents < held.eachCents) byGoal.set(c.goal, { name: c.name.slice(0, 80), goal: c.goal, results: r[0], noun: r[0] === 1 ? r[1] : `${r[1]}s`, eachCents });
  }
  return {
    count: ran.length,
    spentCents: ran.reduce((s, c) => s + (c.metrics!.spendCents ?? 0), 0),
    best: [...byGoal.values()].slice(0, 3),
  };
}

/**
 * The account's history for the Business Brain's AI prompt, in a few lines —
 * or null when there's nothing worth saying. Worded as what happened, never
 * as what caused it, and flagged as made outside MAIRO so nothing reads it as
 * MAIRO's own track record.
 */
export function historyBrief(list: AccountCampaign[] | HistoryPoints | null): string | null {
  const h = Array.isArray(list) ? historyPoints(list) : list;
  if (!h) return null;
  const lines = [
    `Before or outside MAIRO, this business ran ${h.count} campaign${h.count === 1 ? "" : "s"} on its Meta ad account itself, spending ${dollars(h.spentCents)} in total (Meta's own figures; made outside MAIRO, so MAIRO doesn't know how they were set up).`,
  ];
  if (h.best.length) lines.push("Its lowest cost per result, for each goal it ran:");
  for (const b of h.best) {
    lines.push(`- "${b.name}" (${b.goal.toLowerCase().replace("_", " ")}) has generated ${b.results.toLocaleString("en-US")} ${b.noun}, about ${dollars(b.eachCents)} each.`);
  }
  if (h.best.length === 0) lines.push("- None of them recorded sales, leads or website visits Meta could count, so there's no cost per result to compare against yet.");
  lines.push("Use this as context for what this account has seen, not as a promise — results depend on the offer, the audience and the season.");
  return lines.join("\n");
}
