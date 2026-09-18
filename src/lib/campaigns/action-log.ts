import { db } from "@/lib/db";

// What MAIRO has actually changed, with the numbers behind each decision.
//
// This is the feature that makes automation acceptable. A product that moves
// somebody's money around without telling them is a product they turn off; the
// same product that says "moved $14 from B to A, because A was bringing leads
// in 31% cheaper" is one they leave running.
//
// Every entry here is a real OptimizationRecommendation that was really
// applied. Nothing is generated for display. That matters more here than
// anywhere else in the product: an invented entry in an audit log is not a
// rounding error, it is a false record of what was done with a customer's
// budget, and the first time one is caught the whole log becomes worthless.
//
// An account with no entries gets an empty state saying so, which is the
// honest thing for a campaign that has not needed changing yet.

export type ActionEntry = {
  id: string;
  at: Date;
  /** The short label — "Budget optimisation", "Audience change". */
  kind: string;
  /** MAIRO's own plain-language reason, as written when it decided. */
  rationale: string;
  /** Which campaign, for the account-wide log. */
  campaignId: string;
  campaignName: string;
  /** True when MAIRO did it itself rather than somebody approving it. */
  automatic: boolean;
  /** The figures the decision was based on, kept so it can be explained later. */
  evidence: Record<string, unknown> | null;
};

/**
 * Names the kind of change from its proposal.
 *
 * The recommendation model does not carry a type — it carries a proposal and a
 * rationale — so the label is read off the shape of what changed rather than
 * stored twice and allowed to disagree with it.
 */
function kindOf(proposalJson: string): string {
  try {
    const proposal = JSON.parse(proposalJson) as unknown;
    if (Array.isArray(proposal) && proposal.length > 1) return "Budget moved";
    if (Array.isArray(proposal) && proposal.length === 1) return "Budget adjusted";
  } catch {
    // A proposal that will not parse is still a real applied change; it just
    // does not get a specific label. Losing the whole entry over it would be
    // the log lying by omission.
  }
  return "Optimisation";
}

function parseEvidence(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Everything MAIRO has applied for this organization, newest first.
 *
 * Only applied ones. A pending recommendation is a suggestion, not an action,
 * and putting the two in one list would mean the log claimed changes that never
 * happened.
 */
export async function organizationActions(
  organizationId: string,
  limit = 25,
): Promise<ActionEntry[]> {
  const rows = await db.optimizationRecommendation.findMany({
    where: {
      appliedAt: { not: null },
      mairoCampaign: { organizationId },
    },
    orderBy: { appliedAt: "desc" },
    take: limit,
    select: {
      id: true,
      appliedAt: true,
      rationale: true,
      proposalJson: true,
      evidenceJson: true,
      automatic: true,
      mairoCampaignId: true,
      mairoCampaign: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    // Non-null by the where clause; the cast keeps the type honest without a
    // second query to prove it.
    at: r.appliedAt as Date,
    kind: kindOf(r.proposalJson),
    rationale: r.rationale,
    campaignId: r.mairoCampaignId,
    campaignName: r.mairoCampaign.name,
    automatic: r.automatic,
    evidence: parseEvidence(r.evidenceJson),
  }));
}

/** The same log, for one campaign. */
export async function campaignActions(
  mairoCampaignId: string,
  limit = 50,
): Promise<ActionEntry[]> {
  const rows = await db.optimizationRecommendation.findMany({
    where: { mairoCampaignId, appliedAt: { not: null } },
    orderBy: { appliedAt: "desc" },
    take: limit,
    select: {
      id: true,
      appliedAt: true,
      rationale: true,
      proposalJson: true,
      evidenceJson: true,
      automatic: true,
      mairoCampaignId: true,
      mairoCampaign: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    at: r.appliedAt as Date,
    kind: kindOf(r.proposalJson),
    rationale: r.rationale,
    campaignId: r.mairoCampaignId,
    campaignName: r.mairoCampaign.name,
    automatic: r.automatic,
    evidence: parseEvidence(r.evidenceJson),
  }));
}

/**
 * "Today", "Yesterday", or the date.
 *
 * The log reads as a feed of things that just happened, and an absolute
 * timestamp on something from four minutes ago makes it read as an archive.
 */
export function whenLabel(at: Date, now = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = (day(now) - day(at)) / 86_400_000;
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function timeLabel(at: Date): string {
  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
