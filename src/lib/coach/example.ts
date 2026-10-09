import type { LeadStatus } from "@/generated/prisma/enums";
import { EMPTY_METRICS, type PlatformMetrics } from "@/lib/ad-platforms/types";
import { stageLabels } from "@/lib/leads/details";
import { resultsModel, type JourneyStage } from "@/lib/results/model";
import { diagnose } from "./diagnose";
import type { CoachInput, CoachLead, Explanation, Gap } from "./types";

// An invented roofing business, for the public landing page only — never
// written to the database, never shown inside an account.
//
// It isn't a script of what MAIRO "would say". The figures go through the
// same diagnostic engine and results model a real account's do, so the
// landing page can't show the Performance Coach saying anything the product
// doesn't say. Three moments in the same two weeks: the leads have come in
// but nobody has marked them; the owner has marked them (25 leads, 4
// qualified); the owner has also recorded why the others weren't a fit.

export type ExampleStep = "unmarked" | "marked" | "reasons";

export type ExampleFinding = {
  title: string;
  plain: string;
  noticed: string;
  explanations: Explanation[];
  recommendation: string;
  evidence: { label: string; value: string }[];
  confidence: string;
  limitations: string;
  missing: string[];
  steps: { title: string; approval: string }[];
};

export type ExampleView = {
  journey: JourneyStage[];
  finding: ExampleFinding | null;
  gaps: Gap[];
};

const DAY = 86_400_000;
const NOW = new Date(Date.UTC(2026, 3, 30, 12));
const end = new Date(Date.UTC(2026, 3, 29));
const back = (d: number) => new Date(end.getTime() - d * DAY);
const daysAgo = (d: number, h = 0) => new Date(NOW.getTime() - d * DAY - h * 3_600_000);

const metrics = (m: Partial<PlatformMetrics>): PlatformMetrics => ({ ...EMPTY_METRICS, ...m });

const CONFIDENCE = { STRONG: "Strong evidence", SOME: "Some evidence", EARLY: "An early sign" } as const;

/** The 25 enquiries, each logged as contacted within a couple of hours. */
function leads(step: ExampleStep): CoachLead[] {
  const plan: { status: LeadStatus; value?: number; reason?: string }[] = [
    { status: "WON", value: 940_000 },
    { status: "BOOKED" },
    { status: "QUALIFIED" },
    { status: "QUALIFIED" },
    ...Array.from({ length: 14 }, (_, i) => ({ status: "LOST" as LeadStatus, reason: step === "reasons" ? (i < 8 ? "outside-area" : i < 10 ? "price" : undefined) : i === 0 ? "other" : undefined })),
    ...Array.from({ length: 3 }, () => ({ status: "SPAM" as LeadStatus })),
    ...Array.from({ length: 4 }, () => ({ status: "NEW" as LeadStatus })),
  ];
  return plan.map((p, i) => {
    const createdAt = daysAgo(1 + (i % 12), 3);
    const status: LeadStatus = step === "unmarked" ? "NEW" : p.status;
    return {
      id: `example-${i}`,
      createdAt,
      status,
      source: "MAIRO_FORM",
      mairoCampaignId: "example-roof",
      firstContactedAt: new Date(createdAt.getTime() + 2 * 3_600_000),
      appointmentAt: null,
      nextFollowUpAt: null,
      statusChangedAt: status === "NEW" ? null : new Date(createdAt.getTime() + DAY),
      estimatedValueCents: null,
      valueCents: status === "WON" ? (p.value ?? null) : null,
      lostReason: status === "LOST" ? (p.reason ?? null) : null,
    };
  });
}

function input(step: ExampleStep): CoachInput {
  return {
    now: NOW,
    current: { since: back(13), until: end },
    previous: { since: back(27), until: back(14) },
    campaigns: [
      {
        mairoCampaignId: "example-roof",
        name: "Roof inspections",
        objective: "LEADS",
        status: "ACTIVE",
        platform: "META",
        platformCampaignId: "example",
        externalCampaignId: "example",
        dailyBudgetCents: 4_300,
        liveSince: daysAgo(45),
        current: metrics({ spendCents: 60_000, impressions: 41_000, reach: 18_500, clicks: 1_180, leads: 25 }),
        previous: metrics({ spendCents: 59_000, impressions: 40_000, reach: 18_000, clicks: 1_150, leads: 24 }),
        ads: [],
        hostedForm: true,
      },
    ],
    leads: leads(step),
    tracking: { pixel: "firing", pixelLastFiredAt: daysAgo(0), storeConnected: false },
    guardrails: { maxDailyBudgetCents: null, maxDailyIncreasePercent: 20, maxDailyDecreasePercent: 50, maxBudgetShiftPercent: 30, minRoas: null, maxCpaCents: null },
    labels: stageLabels("Roofing", null),
    orders: null,
    history: { worsened: [], dismissedKeys: [] },
  };
}

export function coachExample(step: ExampleStep): ExampleView {
  const i = input(step);
  const result = diagnose(i);
  const labels = i.labels;
  const journey = resultsModel({
    kind: "leads",
    labels,
    meta: { spendCents: 60_000, clicks: 1_180, leads: 25, purchases: null, revenueCents: null },
    metaProblem: null,
    leads: i.leads.map((l) => ({ status: l.status, valueCents: l.valueCents, attributed: true })),
    store: { connected: false, orders: 0, valueCents: 0 },
    salesTracked: true,
  }).journey;
  const f = result.findings.find((x) => x.category === "LEAD_QUALITY") ?? null;
  return {
    journey,
    finding: f && {
      title: f.title,
      plain: f.plain,
      noticed: f.noticed,
      explanations: f.explanations,
      recommendation: f.recommendation,
      evidence: f.evidence,
      confidence: CONFIDENCE[f.confidence],
      limitations: f.limitations,
      missing: f.missing,
      steps: f.steps.map((s) => ({ title: s.title, approval: s.approval })),
    },
    gaps: result.gaps.filter((g) => g.key === "mark-leads"),
  };
}

export const EXAMPLE_STEPS: ExampleStep[] = ["unmarked", "marked", "reasons"];
