import { db } from "@/lib/db";
import { organizationActions } from "@/lib/campaigns/action-log";

// MAIRO Activity: everything MAIRO did to an account, with the reason.
//
// One timeline over three sources, because they were written at different
// times for different features and a customer asking "what did MAIRO do?"
// shouldn't have to know that:
//
//   MairoActivity         — MAIRO Decisions and One-Click Fix
//   OptimizationRecommendation (applied) — the earlier budget optimizer
//   ProtectionEvent       — Spend Protection's warnings, pauses and resumes
//
// Every entry is a real change a network accepted, or a real warning that was
// sent. Nothing here is written for display.

export type ActivityEntry = {
  id: string;
  at: Date;
  action: string;
  summary: string;
  reason: string;
  before: string | null;
  after: string | null;
  automatic: boolean;
  campaignId: string | null;
  source: "decision" | "optimizer" | "protection";
};

export async function recordActivity(input: {
  organizationId: string;
  mairoCampaignId?: string | null;
  decisionId?: string | null;
  action: string;
  summary: string;
  reason: string;
  before?: string | null;
  after?: string | null;
  automatic: boolean;
  actorUserId?: string | null;
}): Promise<void> {
  await db.mairoActivity.create({
    data: {
      organizationId: input.organizationId,
      mairoCampaignId: input.mairoCampaignId ?? null,
      decisionId: input.decisionId ?? null,
      action: input.action,
      summary: input.summary,
      reason: input.reason,
      before: input.before ?? null,
      after: input.after ?? null,
      automatic: input.automatic,
      actorUserId: input.actorUserId ?? null,
    },
  });
}

export async function activityTimeline(organizationId: string, limit = 40): Promise<ActivityEntry[]> {
  const [own, optimizer, protection] = await Promise.all([
    db.mairoActivity.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: limit }),
    organizationActions(organizationId, limit),
    db.protectionEvent.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: limit }),
  ]);

  const entries: ActivityEntry[] = [
    ...own.map((a) => ({
      id: `a:${a.id}`,
      at: a.createdAt,
      action: a.action,
      summary: a.summary,
      reason: a.reason,
      before: a.before,
      after: a.after,
      automatic: a.automatic,
      campaignId: a.mairoCampaignId,
      source: "decision" as const,
    })),
    ...optimizer.map((o) => ({
      id: `o:${o.id}`,
      at: o.at,
      action: o.kind,
      summary: `${o.kind} on ${o.campaignName}.`,
      reason: o.rationale,
      before: null,
      after: null,
      automatic: o.automatic,
      campaignId: o.campaignId,
      source: "optimizer" as const,
    })),
    ...protection.map((p) => ({
      id: `p:${p.id}`,
      at: p.createdAt,
      action: p.action === "PAUSED" ? "Paused by Spend Protection" : p.action === "RESUMED" ? "Resumed" : "Spend warning",
      summary: p.message,
      reason: p.kind === "PAUSED_BY_YOU" ? "You asked for it." : "Your Spend Protection limits.",
      before: null,
      after: null,
      // A pause the customer asked for, or a resume, was theirs — not MAIRO's.
      automatic: p.kind !== "PAUSED_BY_YOU" && p.action !== "RESUMED",
      campaignId: p.mairoCampaignId,
      source: "protection" as const,
    })),
  ];
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
