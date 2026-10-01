import { db } from "@/lib/db";
import { gatherDecisionInput } from "./gather";
import { allDrafts, decide } from "./rules";
import { effectiveLevel, expireStale, parseChanges, persistDrafts } from "./store";
import { limitProblem, mayAutoApply } from "./guardrails";
import { applyDecision } from "./apply";
import type { DataStatus } from "./types";
import { runIntelligence } from "@/lib/intelligence/run";
import { runEngineDecisions } from "@/lib/engine";
import { mergeDrafts } from "@/lib/engine/recommend";
import { todayFor } from "@/lib/mission/store";

// The daily look at an account: read the figures, apply the rules, keep the
// decisions, and carry out the ones the customer has let MAIRO make itself.
//
// Runs from the daily cron, and on a page load when the last look is older
// than REFRESH_AFTER_MS — Vercel's Hobby plan allows one cron run a day, and
// a customer opening Mairo Decisions in the afternoon shouldn't be looking at
// the morning's numbers.

export const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

export type RefreshResult = {
  ran: boolean;
  dataStatus: DataStatus | null;
  pending: number;
  autoApplied: number;
};

export async function refreshDecisions(
  organizationId: string,
  opts: { force?: boolean; now?: Date } = {},
): Promise<RefreshResult> {
  const now = opts.now ?? new Date();
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { decisionsCheckedAt: true },
  });
  if (!org) return { ran: false, dataStatus: null, pending: 0, autoApplied: 0 };
  if (!opts.force && org.decisionsCheckedAt && now.getTime() - org.decisionsCheckedAt.getTime() < REFRESH_AFTER_MS) {
    return { ran: false, dataStatus: null, pending: 0, autoApplied: 0 };
  }
  // Stamped first, so two page loads at once don't both ask the networks.
  await db.organization.update({ where: { id: organizationId }, data: { decisionsCheckedAt: now } });

  const input = await gatherDecisionInput(organizationId, now);
  const run = decide(input);
  // The Strategy Engine learns from the same snapshot and adds its moves
  // toward the business's goal. A failure there never blocks the rules.
  const engine = await runEngineDecisions(organizationId, input, await todayFor(organizationId, now)).catch((error) => {
    console.error(`Strategy Engine failed for ${organizationId}:`, error);
    return [];
  });
  const ids = await persistDrafts(organizationId, mergeDrafts(run.decisions, engine), "daily");
  // Only daily decisions expire here; a One-Click Fix proposal is the
  // customer's open question and waits for their answer.
  const assistant = await db.mairoDecision.findMany({
    where: { organizationId, status: "PENDING", source: "assistant" },
    select: { id: true },
  });
  await expireStale(organizationId, [...ids, ...assistant.map((a) => a.id)]);

  // What MAIRO may do on its own, within the customer's level and switches.
  const level = await effectiveLevel(organizationId);
  let autoApplied = 0;
  if (level !== "MANUAL" && ids.length > 0) {
    const settings = await db.autoOptimizeSettings.findUnique({ where: { organizationId } });
    const pending = await db.mairoDecision.findMany({ where: { id: { in: ids }, status: "PENDING" } });
    for (const d of pending) {
      const changes = parseChanges(d.changesJson);
      const switches = {
        requireApprovalNewCreatives: settings?.requireApprovalNewCreatives ?? true,
        requireApprovalAudience: settings?.requireApprovalAudience ?? true,
        requireApprovalPlatformShift: settings?.requireApprovalPlatformShift ?? true,
      };
      if (!mayAutoApply(level, changes, switches)) continue;
      const running = await db.mairoCampaign.aggregate({
        where: { organizationId, status: "ACTIVE" },
        _sum: { totalDailyBudgetCents: true },
      });
      if (limitProblem(changes, input.guardrails, running._sum.totalDailyBudgetCents ?? 0)) continue;
      const outcome = await applyDecision({ organizationId, decisionId: d.id, userId: null, automatic: true });
      if (outcome.ok) autoApplied++;
    }
  }

  // Mairo Intelligence reads the same snapshot: every finding (not only the
  // few kept as decisions), health, the radar and the Morning Brief.
  await runIntelligence(organizationId, input, allDrafts(input)).catch((error) => console.error(`Mairo Intelligence failed for ${organizationId}:`, error));

  const pendingCount = await db.mairoDecision.count({ where: { organizationId, status: "PENDING" } });
  return { ran: true, dataStatus: run.dataStatus, pending: pendingCount, autoApplied };
}

/** Every account with something running, for the daily cron. */
export async function refreshAllDecisions(limit = 40): Promise<{ accounts: number; autoApplied: number }> {
  const orgs = await db.organization.findMany({
    where: { mairoCampaigns: { some: { status: "ACTIVE" } } },
    select: { id: true },
    orderBy: { decisionsCheckedAt: { sort: "asc", nulls: "first" } },
    take: limit,
  });
  let autoApplied = 0;
  for (const o of orgs) {
    try {
      const r = await refreshDecisions(o.id, { force: true });
      autoApplied += r.autoApplied;
    } catch (error) {
      console.error(`Mairo Decisions failed for ${o.id}:`, error);
    }
  }
  return { accounts: orgs.length, autoApplied };
}

/**
 * Why there are no decisions, without asking the networks again: nothing
 * running, still in the learning period, or running and nothing to change.
 */
export async function quickDataStatus(organizationId: string, now = new Date()): Promise<DataStatus> {
  const campaigns = await db.mairoCampaign.findMany({
    where: { organizationId, status: { in: ["ACTIVE", "PAUSED"] } },
    select: { status: true, createdAt: true, startDate: true },
  });
  if (campaigns.length === 0) return "no-campaigns";
  const threeDays = 3 * 86_400_000;
  const settled = campaigns.some((c) => {
    const since = c.startDate && c.startDate > c.createdAt ? c.startDate : c.createdAt;
    return c.status === "ACTIVE" && now.getTime() - since.getTime() >= threeDays;
  });
  return settled ? "enough" : "learning";
}
