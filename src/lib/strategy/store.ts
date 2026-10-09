import { recordRun } from "@/lib/team/runs";
import { db } from "@/lib/db";
import type { StrategyPlan } from "@/generated/prisma/client";
import { analyzeBusiness } from "@/lib/business/analyze";
import { brainBrief, loadBrain } from "@/lib/business/brain";
import { canOptimizeTowards } from "@/lib/tracking/pixels";
import { hasActivePlan } from "@/lib/readiness";
import { currentMonthKey } from "@/lib/utils/month";
import { generateStrategy, type StrategyInput } from "@/lib/ai/strategy";
import {
  GOAL_LABEL,
  PLAN_GOALS,
  campaignTypeInfo,
  parseStrategy,
  platformsText,
  revisionSummary,
  usd,
  type PlanChange,
  type PlanGoal,
  type StrategyContent,
} from "./plan-logic";

// Reading and writing the free Mairo Advertising Plan.
//
// Every change goes through commit(), which:
//   - refuses once the plan is locked (the subscription is active and the
//     campaign is built from the approved snapshot, not from here),
//   - refuses when somebody else changed it first (a second tab),
//   - returns an approved plan to DRAFT, so it has to be approved again,
//   - writes one revision for the version history.

export type RevisionView = {
  version: number;
  kind: string;
  request: string | null;
  summary: string;
  changes: PlanChange[];
  requestedBy: string;
  createdAt: string;
};

export type LoadedStrategy = { row: StrategyPlan; plan: StrategyContent; revisions: RevisionView[] };

export async function loadStrategy(organizationId: string): Promise<LoadedStrategy | null> {
  const row = await db.strategyPlan.findUnique({
    where: { organizationId },
    include: { revisions: { orderBy: { version: "desc" }, take: 30 } },
  });
  if (!row) return null;
  const plan = parseStrategy(row.planJson);
  if (!plan) return null;
  const { revisions, ...rest } = row;
  return {
    row: rest,
    plan,
    revisions: revisions.map((r) => ({
      version: r.version,
      kind: r.kind,
      request: r.request,
      summary: r.summary,
      changes: safeChanges(r.changesJson),
      requestedBy: r.requestedBy,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

function safeChanges(raw: string): PlanChange[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function approvedPlanOf(row: Pick<StrategyPlan, "approvedSnapshotJson">): StrategyContent | null {
  return parseStrategy(row.approvedSnapshotJson);
}

// --- Writing the first plan ----------------------------------------------------

function asPlanGoal(goal: string): PlanGoal {
  return (PLAN_GOALS as readonly string[]).includes(goal) ? (goal as PlanGoal) : "LEADS";
}

/** Everything the plan is written from. */
export async function strategyInputFor(organizationId: string): Promise<StrategyInput | null> {
  const [org, intake, pixel, brain] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, industry: true, website: true, defaultDestination: true } }),
    db.onboardingIntake.findUnique({ where: { organizationId } }),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } }, select: { status: true } }),
    loadBrain(organizationId),
  ]);
  if (!org || !intake) return null;
  return {
    businessName: org.name,
    industry: org.industry,
    goal: asPlanGoal(intake.primaryGoal),
    monthlyBudgetCents: intake.monthlyBudgetCents,
    destination: org.defaultDestination,
    website: org.website,
    targetAudience: intake.targetAudience,
    brandVoice: intake.brandVoice,
    competitors: intake.competitors,
    notes: intake.notes,
    offering: intake.offering,
    offer: intake.currentOffer,
    location: intake.customerLocation,
    brainBrief: brain.analyzedAt ? brainBrief(brain.profile) : null,
    siteIssues: (brain.analysis?.conversionIssues ?? []).slice(0, 5).map((c) => ({ issue: c.issue, fix: c.fix })),
    purchaseTracking: pixel ? canOptimizeTowards(pixel.status) : false,
  };
}

/**
 * Reads the website once, before the plan is written, so the plan's website
 * advice is about their actual site. Skipped when there's no website or it was
 * already read. A site that can't be read isn't an error — the plan says its
 * advice is general.
 */
export async function readWebsiteForPlan(organizationId: string): Promise<{ read: boolean; note: string | null }> {
  const [org, brain] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { website: true } }),
    db.businessBrain.findUnique({ where: { organizationId }, select: { analyzedAt: true } }),
  ]);
  if (!org?.website) return { read: false, note: null };
  if (brain?.analyzedAt) return { read: true, note: null };
  const result = await analyzeBusiness(organizationId, org.website);
  return result.ok ? { read: true, note: null } : { read: false, note: result.error };
}

export async function createStrategy(organizationId: string): Promise<{ ok: true; ai: boolean } | { ok: false; error: string }> {
  const existing = await db.strategyPlan.findUnique({ where: { organizationId }, select: { id: true } });
  if (existing) return { ok: true, ai: true };
  const input = await strategyInputFor(organizationId);
  if (!input) return { ok: false, error: "Finish your business setup first." };
  await db.organization.update({ where: { id: organizationId }, data: { paymentRequired: true } });
  const { plan, ai } = await generateStrategy(input);
  const planJson = JSON.stringify(plan);
  try {
    await db.strategyPlan.create({
      data: {
        organizationId,
        planJson,
        revisions: {
          create: { version: 0, kind: "original", summary: "Original Plan", changesJson: "[]", planJson, requestedBy: "mairo" },
        },
      },
    });
  } catch {
    // Two tabs raced; the other one wrote it — and recorded it.
    return { ok: true, ai };
  }
  // The plan is the Strategy Agent's work, and who to reach in it the
  // Audience Agent's. Recorded once the plan exists.
  const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  await recordRun({
    organizationId,
    agent: "STRATEGIST",
    task: "write-plan",
    status: "DONE",
    summary: `Wrote your advertising plan: ${GOAL_LABEL[plan.goal].toLowerCase()}, about ${usd(plan.dailyBudget)} a day — waiting for your approval.`,
    detail: plan.summary || null,
    href: "/plan",
  });
  const a = plan.audience;
  await recordRun({
    organizationId,
    agent: "AUDIENCE",
    task: "plan-audience",
    status: "DONE",
    summary: `Chose who your plan reaches: ${[a.location, `ages ${a.ageMin}–${a.ageMax}`].filter(Boolean).join(", ")}${a.interests.length ? `, interested in ${a.interests.slice(0, 3).join(", ")}` : ""}.`,
    detail: a.summary || null,
    href: "/plan",
  });
  return { ok: true, ai };
}

// --- Changing it ---------------------------------------------------------------

export type CommitResult = { ok: true; version: number } | { ok: false; error: string };

export async function commit(
  organizationId: string,
  input: {
    expectedVersion: number;
    plan: StrategyContent;
    changes: PlanChange[];
    kind: "ai" | "edit" | "suggestion" | "undo";
    request?: string | null;
    requestedBy: "you" | "mairo";
    summary?: string;
  },
): Promise<CommitResult> {
  const row = await db.strategyPlan.findUnique({ where: { organizationId } });
  if (!row) return { ok: false, error: "There's no plan yet." };
  if (row.activatedAt) return { ok: false, error: "Your plan is locked in now that your subscription is active. Change the campaign itself in the setup instead." };
  if (row.version !== input.expectedVersion) return { ok: false, error: "Your plan changed in another tab. Reload to see the latest version." };
  if (input.changes.length === 0) return { ok: true, version: row.version };

  const version = row.version + 1;
  const planJson = JSON.stringify(input.plan);
  const updated = await db.$transaction(async (tx) => {
    const claim = await tx.strategyPlan.updateMany({
      where: { id: row.id, version: row.version, activatedAt: null },
      data: {
        planJson,
        version,
        // Any change before payment needs approving again.
        status: "DRAFT",
        approvedAt: null,
        approvedVersion: null,
        approvedSnapshotJson: null,
      },
    });
    if (claim.count === 0) return false;
    await tx.strategyPlanRevision.create({
      data: {
        planId: row.id,
        version,
        kind: input.kind,
        request: input.request?.slice(0, 1000) ?? null,
        summary: (input.summary ?? revisionSummary(input.changes)).slice(0, 500),
        changesJson: JSON.stringify(input.changes),
        planJson,
        requestedBy: input.requestedBy,
      },
    });
    return true;
  });
  if (!updated) return { ok: false, error: "Your plan changed in another tab. Reload to see the latest version." };
  return { ok: true, version };
}

/** Marks the plan as being revised while Mairo works on a request. */
export async function markRevising(organizationId: string, revising: boolean): Promise<void> {
  await db.strategyPlan.updateMany({
    where: { organizationId, activatedAt: null, ...(revising ? {} : { status: "REVISING" }) },
    data: { status: revising ? "REVISING" : "DRAFT", ...(revising ? { approvedAt: null, approvedVersion: null, approvedSnapshotJson: null } : {}) },
  });
}

export async function planAtVersion(planId: string, version: number): Promise<StrategyContent | null> {
  const r = await db.strategyPlanRevision.findUnique({ where: { planId_version: { planId, version } }, select: { planJson: true } });
  return parseStrategy(r?.planJson);
}

// --- Approving ---------------------------------------------------------------------

export async function approve(organizationId: string, expectedVersion: number): Promise<CommitResult> {
  const row = await db.strategyPlan.findUnique({ where: { organizationId } });
  if (!row) return { ok: false, error: "There's no plan yet." };
  if (row.activatedAt) return { ok: true, version: row.version };
  if (row.version !== expectedVersion) return { ok: false, error: "Your plan changed in another tab. Reload and approve the latest version." };
  if (row.status === "REVISING") return { ok: false, error: "Mairo is still updating your plan. Try again in a moment." };
  const plan = parseStrategy(row.planJson);
  if (!plan) return { ok: false, error: "This plan couldn't be read. Ask Mairo to write it again." };

  const claim = await db.strategyPlan.updateMany({
    where: { id: row.id, version: expectedVersion, activatedAt: null },
    data: { status: "APPROVED", approvedAt: new Date(), approvedVersion: row.version, approvedSnapshotJson: row.planJson },
  });
  if (claim.count === 0) return { ok: false, error: "Your plan changed in another tab. Reload and approve the latest version." };

  // The monthly plan page shows the same strategy, marked approved.
  const month = currentMonthKey();
  const monthly = {
    status: "APPROVED" as const,
    strategySummary: plan.summary || `${GOAL_LABEL[plan.goal]} on ${platformsText(plan.platforms)} at ${usd(plan.dailyBudget)}/day.`,
    budgetAllocationJson: JSON.stringify(plan.split.map((s) => ({ channel: s.label, percent: s.percent, rationale: s.why }))),
    keyMetrics: JSON.stringify([]),
  };
  await db.monthlyPlan.upsert({
    where: { organizationId_month: { organizationId, month } },
    create: { organizationId, month, ...monthly },
    update: monthly,
  });
  return { ok: true, version: row.version };
}

// --- After payment -------------------------------------------------------------------

/**
 * Locks the approved plan once the subscription is active (or billing isn't
 * switched on yet). From here the campaign is built from the approved
 * snapshot. Also asks MAIRO to hold before going live: the first campaign only
 * starts when the business presses Launch Campaign.
 */
export async function activateIfPaid(organizationId: string): Promise<StrategyPlan | null> {
  const [row, org] = await Promise.all([
    db.strategyPlan.findUnique({ where: { organizationId } }),
    db.organization.findUnique({ where: { id: organizationId }, select: { subscriptionTier: true, subscriptionStatus: true, paymentRequired: true } }),
  ]);
  if (!row || !org) return row;
  if (row.activatedAt || row.status !== "APPROVED" || !hasActivePlan(org)) return row;
  const [updated] = await db.$transaction([
    db.strategyPlan.update({ where: { id: row.id }, data: { activatedAt: new Date() } }),
    db.organization.update({ where: { id: organizationId }, data: { autoLaunchHeld: true } }),
  ]);
  return updated;
}

/** The summary shown above the pricing: "Your approved plan is ready." */
export function planHeadline(plan: StrategyContent) {
  return {
    goal: GOAL_LABEL[plan.goal],
    platform: platformsText(plan.platforms),
    budget: `${usd(plan.dailyBudget)}/day`,
    campaign: campaignTypeInfo(plan.campaignType).label.split(" — ")[0],
  };
}

/** The approved plan, for the assistant's prompt. Empty when there isn't one. */
export async function strategyBrief(organizationId: string): Promise<string> {
  const row = await db.strategyPlan.findUnique({ where: { organizationId }, select: { approvedSnapshotJson: true } });
  const plan = row ? approvedPlanOf(row) : null;
  if (!plan) return "";
  const h = planHeadline(plan);
  return [
    "The business's approved Mairo Advertising Plan (they reviewed and approved it; don't contradict it without saying why):",
    `- Goal: ${h.goal}; platforms: ${h.platform}; budget: ${h.budget}; campaign: ${h.campaign}`,
    `- Audience: ${plan.audience.location || "location not set"}, ages ${plan.audience.ageMin}-${plan.audience.ageMax}; ${plan.audience.summary}`,
    `- Product: ${plan.product || "not set"}; offer: ${plan.offer || "none"}`,
    `- Creative strategy: ${plan.creativeStrategy}`,
    `- Hooks: ${plan.hooks.join(" | ")}`,
  ].join("\n");
}
