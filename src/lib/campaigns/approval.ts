import { db } from "@/lib/db";
import { approvalHash, approvalState } from "./approval-terms";

export { approvalHash, approvalState, approvalTerms, type ApprovalTermsInput } from "./approval-terms";

// What a launch approval covers.
//
// A person approving a campaign approves its terms: what it may spend, when,
// on whom and where it sends people. The approval is stored with a
// fingerprint of those terms, and every launch path compares the fingerprint
// with the campaign as it is now. A material change after the approval — a
// higher budget, another date, a wider area, a different destination — means
// the approval no longer covers it, and it waits for the owner to approve the
// new terms. The ads' content has its own approval (CreativeApproval, by
// content hash); Meta's object ids aren't terms, so MAIRO finishing a
// half-built campaign never invalidates an approval.
//
// Approvals recorded before fingerprints existed have none, and are honoured
// as they were (nothing about them can be compared).

export const APPROVAL_TERMS_SELECT = {
  objective: true, budgetType: true, totalDailyBudgetCents: true, lifetimeBudgetCents: true, startDate: true, endDate: true,
  geoKey: true, geoRadius: true, ageMin: true, ageMax: true, genders: true, destinationType: true, destinationUrl: true,
  destinationPhone: true, placements: true, specialAdCategory: true, advantageAudience: true, launchApprovedAt: true, launchApprovalHash: true,
  platformCampaigns: { select: { platform: true, dailyBudgetCents: true, lifetimeBudgetCents: true } },
} as const;

/** The campaign's terms and approval, scoped to the business (another business's id reads as missing). */
export async function loadApprovalTerms(organizationId: string, mairoCampaignId: string) {
  return db.mairoCampaign.findFirst({ where: { id: mairoCampaignId, organizationId }, select: APPROVAL_TERMS_SELECT });
}

/**
 * Records a person's approval of the campaign's current terms. Every place a
 * launch approval is written goes through here, so none of them can store an
 * approval without saying what it approved.
 */
export async function recordLaunchApproval(organizationId: string, mairoCampaignId: string, now = new Date()): Promise<boolean> {
  const c = await loadApprovalTerms(organizationId, mairoCampaignId);
  if (!c) return false;
  await db.mairoCampaign.updateMany({
    where: { id: mairoCampaignId, organizationId },
    data: { launchApprovedAt: now, launchApprovalHash: approvalHash(c) },
  });
  return true;
}

/** Whether launch may go ahead on the approval on record. */
export async function approvalCoversNow(organizationId: string, mairoCampaignId: string): Promise<"none" | "covers" | "changed"> {
  const c = await loadApprovalTerms(organizationId, mairoCampaignId);
  return c ? approvalState(c) : "none";
}
