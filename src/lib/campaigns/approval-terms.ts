import { createHash } from "node:crypto";

// The pure half of launch approvals (see approval.ts): the terms an approval
// covers, their fingerprint, and whether an approval on record still covers
// the campaign as it is now. No database, so status labels and tests use it.

export type ApprovalTermsInput = {
  objective: string;
  budgetType: string;
  totalDailyBudgetCents: number;
  lifetimeBudgetCents: number | null;
  startDate: Date | null;
  endDate: Date | null;
  geoKey: string | null;
  geoRadius: number | null;
  ageMin: number;
  ageMax: number;
  genders: number;
  destinationType: string;
  destinationUrl: string | null;
  destinationPhone: string | null;
  placements: string[];
  specialAdCategory: string | null;
  advantageAudience: boolean;
  platformCampaigns: { platform: string; dailyBudgetCents: number; lifetimeBudgetCents: number | null }[];
};

/** The terms, in a fixed order, so the same campaign always gives the same fingerprint. */
export function approvalTerms(c: ApprovalTermsInput) {
  return {
    objective: c.objective,
    budget: { type: c.budgetType, daily: c.totalDailyBudgetCents, lifetime: c.lifetimeBudgetCents ?? null },
    schedule: { start: c.startDate?.toISOString() ?? null, end: c.endDate?.toISOString() ?? null },
    audience: { geo: c.geoKey ?? null, radius: c.geoRadius ?? null, ageMin: c.ageMin, ageMax: c.ageMax, genders: c.genders, advantage: c.advantageAudience, special: c.specialAdCategory ?? null },
    destination: { type: c.destinationType, url: c.destinationUrl ?? null, phone: c.destinationPhone ?? null },
    placements: [...c.placements].sort(),
    networks: c.platformCampaigns
      .map((p) => ({ platform: p.platform, daily: p.dailyBudgetCents, lifetime: p.lifetimeBudgetCents ?? null }))
      .sort((a, b) => a.platform.localeCompare(b.platform)),
  };
}

export function approvalHash(c: ApprovalTermsInput): string {
  return createHash("sha256").update(JSON.stringify(approvalTerms(c))).digest("hex").slice(0, 32);
}

/**
 * Whether the approval on record covers the campaign as it is now:
 * "none" (never approved), "covers", or "changed" (approved, then changed).
 */
export function approvalState(c: ApprovalTermsInput & { launchApprovedAt: Date | null; launchApprovalHash: string | null }): "none" | "covers" | "changed" {
  if (!c.launchApprovedAt) return "none";
  if (!c.launchApprovalHash) return "covers";
  return c.launchApprovalHash === approvalHash(c) ? "covers" : "changed";
}
