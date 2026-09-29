import { db } from "@/lib/db";
import type { AutomationLevel, DecisionCategory, DecisionStatus } from "@/generated/prisma/enums";
import type { MairoDecision as DecisionRow } from "@/generated/prisma/client";
import { entitlementsFor } from "@/lib/entitlements";
import type { DecisionChange, DecisionDraft, Evidence } from "./types";

// Where decisions live between being noticed and being decided.
//
// Re-running the rules over the same situation updates the pending card
// rather than adding a second one (the dedupe key), and a card whose situation
// has passed is expired rather than left to be approved against numbers that
// are no longer true.

export type DecisionView = {
  id: string;
  kind: string;
  category: DecisionCategory;
  urgent: boolean;
  mairoCampaignId: string | null;
  title: string;
  noticed: string;
  noticedAdvanced: string;
  whyItMatters: string;
  recommendation: string;
  impact: string;
  risk: DecisionRow["risk"];
  confidence: DecisionRow["confidence"];
  evidence: Evidence[];
  changes: DecisionChange[];
  status: DecisionStatus;
  source: string;
  automatic: boolean;
  result: { label: string; before: string | null; after: string | null; ok: boolean; error: string | null }[] | null;
  createdAt: string;
  decidedAt: string | null;
};

export function parseChanges(json: string): DecisionChange[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as DecisionChange[]) : [];
  } catch {
    return [];
  }
}

function parseList<T>(json: string | null): T[] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as T[]) : null;
  } catch {
    return null;
  }
}

export function toView(d: DecisionRow): DecisionView {
  return {
    id: d.id,
    kind: d.kind,
    category: d.category,
    urgent: d.urgent,
    mairoCampaignId: d.mairoCampaignId,
    title: d.title,
    noticed: d.noticed,
    noticedAdvanced: d.noticedAdvanced,
    whyItMatters: d.whyItMatters,
    recommendation: d.recommendation,
    impact: d.impact,
    risk: d.risk,
    confidence: d.confidence,
    evidence: parseList<Evidence>(d.evidenceJson) ?? [],
    changes: parseChanges(d.changesJson),
    status: d.status,
    source: d.source,
    automatic: d.automatic,
    result: parseList(d.resultJson),
    createdAt: d.createdAt.toISOString(),
    decidedAt: d.decidedAt?.toISOString() ?? null,
  };
}

/**
 * Writes this run's drafts. Returns the ids of the pending decisions that
 * came out of it, new or refreshed.
 */
export async function persistDrafts(
  organizationId: string,
  drafts: DecisionDraft[],
  source: "daily" | "assistant" = "daily",
): Promise<string[]> {
  const ids: string[] = [];
  for (const d of drafts) {
    const content = {
      kind: d.kind,
      category: d.category,
      urgent: d.urgent,
      mairoCampaignId: d.mairoCampaignId,
      platform: d.platform,
      title: d.title,
      noticed: d.noticed,
      noticedAdvanced: d.noticedAdvanced,
      whyItMatters: d.whyItMatters,
      recommendation: d.recommendation,
      impact: d.impact,
      risk: d.risk,
      confidence: d.confidence,
      evidenceJson: JSON.stringify(d.evidence),
      changesJson: JSON.stringify(d.changes),
    };
    const existing = await db.mairoDecision.findUnique({
      where: { organizationId_dedupeKey: { organizationId, dedupeKey: d.dedupeKey } },
    });
    if (existing) {
      // Decided already: the customer's answer stands for this situation.
      if (existing.status !== "PENDING") continue;
      await db.mairoDecision.update({ where: { id: existing.id }, data: content });
      ids.push(existing.id);
    } else {
      const row = await db.mairoDecision.create({
        data: { organizationId, dedupeKey: d.dedupeKey, source, ...content },
      });
      ids.push(row.id);
    }
  }
  return ids;
}

/** Pending decisions this run didn't produce again: the situation has passed. */
export async function expireStale(organizationId: string, keep: string[]): Promise<void> {
  await db.mairoDecision.updateMany({
    where: { organizationId, status: "PENDING", id: { notIn: keep } },
    data: { status: "EXPIRED" },
  });
}

/**
 * The automation level MAIRO may actually act at: what the customer chose,
 * capped by what their plan includes.
 */
export async function effectiveLevel(organizationId: string): Promise<AutomationLevel> {
  const [settings, ent] = await Promise.all([
    db.autoOptimizeSettings.findUnique({ where: { organizationId }, select: { level: true, enabled: true } }),
    entitlementsFor(organizationId),
  ]);
  if (!settings?.enabled) return "MANUAL";
  if (settings.level === "AUTOPILOT" && ent.autopilot) return "AUTOPILOT";
  if ((settings.level === "AUTOPILOT" || settings.level === "ASSISTED") && ent.auto_optimize) return "ASSISTED";
  return "MANUAL";
}

export type DecisionCounts = {
  pending: number;
  urgent: number;
  growth: number;
  byCategory: Partial<Record<DecisionCategory, number>>;
};

export async function decisionCounts(organizationId: string): Promise<DecisionCounts> {
  const rows = await db.mairoDecision.findMany({
    where: { organizationId, status: "PENDING" },
    select: { category: true, urgent: true },
  });
  const byCategory: Partial<Record<DecisionCategory, number>> = {};
  for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  return {
    pending: rows.length,
    urgent: rows.filter((r) => r.urgent || r.category === "NEEDS_ATTENTION").length,
    growth: rows.filter((r) => r.category === "GROWTH" || r.category === "BUDGET" || r.category === "TESTING").length,
    byCategory,
  };
}

