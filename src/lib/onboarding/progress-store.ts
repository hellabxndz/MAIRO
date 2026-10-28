import { db } from "@/lib/db";
import { hasActivePlan } from "@/lib/readiness";
import { planFor } from "@/lib/plans";
import { parseDraft } from "./draft";
import { onboardingSteps, type OnboardingFacts, type OnboardingStep } from "./progress";
import { businessPixelNeed, pixelStatus } from "@/lib/tracking/pixel-rules";
import { pixelStateFor } from "@/lib/tracking/pixel-setup";

// The facts behind the setup steps, read from the records — the intake, the
// plan and its revisions, the suggested ads, the Meta connection, the
// subscription, the campaign on Meta. One business's records only.

export async function loadOnboardingFacts(organizationId: string, now = new Date()): Promise<OnboardingFacts | null> {
  const [org, intake, brain, plan, meta] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { website: true, subscriptionTier: true, subscriptionStatus: true, paymentRequired: true, onboardingDraft: true },
    }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { id: true } }),
    db.businessBrain.findUnique({ where: { organizationId }, select: { analyzedAt: true } }),
    db.strategyPlan.findUnique({
      where: { organizationId },
      select: { id: true, status: true, activatedAt: true, campaignDraftId: true, campaignId: true },
    }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true, metaAdAccountId: true, pageId: true, pageName: true, tokenExpiresAt: true } }),
  ]);
  if (!org) return null;
  const draft = parseDraft(org.onboardingDraft);

  const [directions, approvals, videos] = await Promise.all([
    db.adAngle.count({ where: { organizationId, angleKind: { not: null }, status: { notIn: ["ARCHIVED", "REJECTED"] } } }),
    db.creativeApproval.findMany({ where: { organizationId, revokedAt: null }, select: { angleId: true, angleRevisionId: true } }),
    db.ownerVideo.count({ where: { organizationId, archivedAt: null } }),
  ]);
  // Approved as it is now: a later edit to the words means it waits to be approved again.
  const latest = approvals.length
    ? await db.adAngle.findMany({ where: { organizationId, id: { in: approvals.map((a) => a.angleId) }, status: { not: "REJECTED" } }, select: { id: true, revisions: { orderBy: { version: "desc" }, take: 1, select: { id: true } } } })
    : [];
  const approvedNow = approvals.some((a) => latest.find((x) => x.id === a.angleId)?.revisions[0]?.id === a.angleRevisionId);

  const [yourChanges, draftRow, campaign, lastBuild] = await Promise.all([
    plan ? db.strategyPlanRevision.count({ where: { planId: plan.id, version: { gt: 0 }, requestedBy: "you" } }) : 0,
    plan?.campaignDraftId ? db.campaignDraft.findFirst({ where: { id: plan.campaignDraftId, organizationId }, select: { step: true } }) : null,
    plan?.campaignId
      ? db.mairoCampaign.findFirst({
          where: { id: plan.campaignId, organizationId },
          select: { id: true, status: true, launchApprovedAt: true, platformCampaigns: { select: { status: true, externalCampaignId: true, externalAdId: true, lastError: true } } },
        })
      : null,
    plan?.activatedAt
      ? db.agentRun.findFirst({ where: { organizationId, agent: "ARCHITECT", task: "build-campaign" }, orderBy: { startedAt: "desc" }, select: { status: true, summary: true, detail: true } })
      : null,
  ]);

  const [pixelState, intakeGoal, profile] = await Promise.all([
    pixelStateFor(organizationId),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { primaryGoal: true } }),
    db.trackingProfile.findUnique({ where: { organizationId }, select: { nicheId: true } }),
  ]);

  const pcs = campaign?.platformCampaigns ?? [];
  const built = pcs.some((p) => p.externalCampaignId && p.externalAdId);
  // Live only once Meta switched it on (the campaign is marked ACTIVE after Meta accepted it).
  const live = pcs.some((p) => p.status === "ACTIVE") && campaign?.status === "ACTIVE";
  const paid = hasActivePlan(org);

  return {
    business: Boolean(intake) || Boolean(draft.business?.savedAt),
    website: org.website,
    learned: brain?.analyzedAt ? { state: "read", note: null } : draft.learn && !draft.learn.ok ? { state: "failed", note: draft.learn.note } : { state: "none", note: null },
    goal: Boolean(intake),
    plan: plan ? { status: plan.status, yourChanges, activated: Boolean(plan.activatedAt) } : null,
    meta: meta ? { status: meta.status, adAccount: meta.metaAdAccountId || null, pageName: meta.pageName, hasPage: Boolean(meta.pageId), expiresAt: meta.tokenExpiresAt } : null,
    creative: { directions, approved: approvedNow, videos },
    pixel: {
      need: businessPixelNeed({ nicheId: profile?.nicheId ?? "general", goal: intakeGoal?.primaryGoal ?? null }),
      decision: pixelState.decision,
      status: pixelStatus(pixelState),
      leadMeasurement: pixelState.leadMeasurement,
      goalsSaved: pixelState.measurement?.goalsSaved ?? false,
      deferred: pixelState.measurement?.deferred ?? false,
    },
    subscription: {
      paid,
      status: org.subscriptionStatus,
      trial: org.subscriptionStatus === "trialing",
      planName: org.subscriptionTier !== "NONE" ? planFor(org.subscriptionTier).name : null,
    },
    campaign: {
      id: campaign?.id ?? null,
      draftStep: draftRow?.step ?? null,
      built,
      buildError: !built && lastBuild && lastBuild.status !== "DONE" ? (lastBuild.detail ?? lastBuild.summary) : null,
      launchApproved: Boolean(campaign?.launchApprovedAt),
      live,
      launchError: live ? null : (pcs.find((p) => p.lastError)?.lastError ?? null),
    },
    now,
  };
}

export async function loadOnboarding(organizationId: string, now = new Date()): Promise<OnboardingStep[] | null> {
  const facts = await loadOnboardingFacts(organizationId, now);
  return facts ? onboardingSteps(facts) : null;
}
