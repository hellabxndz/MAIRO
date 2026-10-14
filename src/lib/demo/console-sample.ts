import type { ConsoleHeaderData } from "@/components/console/header";
import type { MetricData } from "@/components/console/metrics";
import type { ActionItemData } from "@/components/console/action-center";
import type { CampaignCounts, CampaignSummaryRow } from "@/components/console/campaigns";
import type { TeamMemberData } from "@/components/console/team";
import type { ResultsInsight } from "@/components/console/results";
import type { DailyPoint } from "@/lib/dashboard/overview";
import { EXAMPLES } from "./examples";

// The sample account every product demonstration on the website shows —
// Brightwater Plumbing, the fictional business from lib/demo/examples.ts —
// drawn with the same console components as the real dashboard. The figures
// match the walkthrough's (spend $140, 11 leads, 6 qualified, 2 booked) and,
// like every demonstration, never include revenue, a return on spend or a
// customer count. Every frame that shows them carries the sample-data label.

const ex = EXAMPLES.service;

export const SAMPLE = {
  business: ex.name,
  period: "Last 14 days",
  header: {
    greeting: "Good morning, Dana.",
    subline: "Working toward: more qualified leads.",
    business: ex.name,
    adAccount: { label: `${ex.name} · act_•••• 4821`, state: "connected" },
    ai: { label: "Monitoring", tone: "live", running: false, detail: "Next check tomorrow, 7:00 AM", href: null },
  } satisfies ConsoleHeaderData,
  metrics: [
    { key: "spend", label: "Money spent", value: "$140.00", source: "Meta reports", change: null, empty: null },
    { key: "value", label: "Revenue or tracked value", value: null, source: null, change: null, empty: "Not tracked yet: mark the leads you win and MAIRO shows what they were worth.", fix: { href: null, label: "Mark leads" } },
    { key: "results", label: "Leads", value: "11", source: "Meta reports", change: null, empty: null },
    { key: "cost", label: "Cost per lead", value: "$12.73", source: "Meta reports", change: null, empty: null },
  ] satisfies MetricData[],
  actions: [
    { key: "area", agent: "AUDIENCE", kind: "audience", title: ex.story.recommendation.title, why: `${ex.story.recommendation.why} Asking up front saves you calls you can't take.`, impact: { text: "No change to what you spend.", up: false }, risk: "Low risk", href: null, cta: "Review & approve" },
    { key: "creative", agent: "CREATIVE", kind: "creative", title: "Test a second opening line", why: "“Leak under the sink? We'll find it.” brought most of the leads. A second version tests whether naming the same-week visit does better.", impact: { text: "No change to what you spend.", up: false }, risk: "Low risk", href: null, cta: "Review the new version" },
    { key: "leads", agent: "ANALYST", kind: "tracking", title: "Mark this week's leads", why: "3 new leads aren't marked yet. Marking which ones booked lets MAIRO judge the ads on jobs, not clicks.", impact: null, risk: null, href: null, cta: "Mark leads" },
  ] satisfies ActionItemData[],
  counts: { live: 1, paused: 0, review: 0, draft: 1 } satisfies CampaignCounts,
  campaigns: [
    { id: "c1", name: "Leak & drain repair — leads", status: { label: "Live", tone: "live" }, goal: "Leads", budget: ex.review.budget, result: "$140 spent · 11 leads", thumbnailUrl: null, href: null },
    { id: "c2", name: "Bathroom refits — leads", status: { label: "Draft", tone: "violet" }, goal: "Leads", budget: null, result: null, thumbnailUrl: null, href: null },
  ] satisfies CampaignSummaryRow[],
  insights: [
    { key: "i1", text: "$140 spent on one campaign in the last 14 days, as Meta reports it." },
    { key: "i2", text: "6 of the 11 leads were qualified and 2 booked — marked by you." },
    { key: "i3", text: "Too early to pick a winning ad: MAIRO checks again Friday." },
  ] satisfies ResultsInsight[],
  team: [
    { role: "STRATEGIST", state: "Completed", tone: "blue", line: "Wrote the plan you approved." },
    { role: "AUDIENCE", state: "Waiting for approval", tone: "warn", line: "Suggests asking for the job's area." },
    { role: "CREATIVE", state: "Waiting for approval", tone: "warn", line: "Drafted a second opening line." },
    { role: "ARCHITECT", state: "Completed", tone: "blue", line: "Built the campaign you launched." },
    { role: "OPTIMIZER", state: "Monitoring scheduled", tone: "live", line: "Checks again Friday." },
    { role: "GUARDIAN", state: "Monitoring scheduled", tone: "live", line: "Spend is inside your limits." },
    { role: "ANALYST", state: "Monitoring scheduled", tone: "live", line: "Reads Meta's figures daily." },
    { role: "GROWTH", state: "Idle", tone: "muted", line: "Looks for next steps after the test." },
  ] satisfies TeamMemberData[],
  teamIntro: "Your MAIRO AI Team is monitoring one live campaign. 2 recommendations are waiting for your approval.",
};

/** Fourteen sample days: about $10 a day, eleven leads in all. Drawn with the real chart. */
export function sampleDaily(): DailyPoint[] {
  const spend = [9.2, 10.4, 9.8, 10.1, 11.3, 8.6, 9.4, 10.9, 10.2, 9.7, 10.6, 9.9, 10.3, 9.6];
  const leads = [0, 1, 1, 0, 2, 0, 1, 1, 0, 1, 2, 0, 1, 1];
  const start = Date.UTC(2026, 8, 28);
  return spend.map((s, i) => ({ date: new Date(start + i * 86_400_000).toISOString().slice(0, 10), spendCents: Math.round(s * 100), revenueCents: 0, purchases: 0, leads: leads[i], delivered: true }));
}
