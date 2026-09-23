"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { isWizardStep, type CampaignPlan } from "@/lib/campaigns/plan";
import { reviewCampaign, type CampaignReview } from "@/lib/campaigns/review";
import { writeAdCopyOptions } from "@/lib/ai/ad-copy";
import type { CopyOption } from "@/lib/campaigns/ad-copy";
import { goalOption, PROMOTES_OPTIONS } from "@/lib/campaigns/objectives";
import { listAccountAds, type AccountAd } from "@/lib/meta/existing-ads";

// Saving an unfinished campaign, and checking a finished one before it's built.
// Every query is scoped to the signed-in organization in its WHERE clause.

async function currentScope(): Promise<{ organizationId: string; userId: string } | null> {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) return null;
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  return { organizationId, userId: session.user.id };
}

const SERVICES = new Set(["meta", "tiktok", "multi"]);
/** A plan is small; anything near this is not one. */
const MAX_DRAFT_BYTES = 64_000;

export async function saveCampaignDraftAction(input: {
  draftId: string | null;
  step: string;
  label: string;
  plan: CampaignPlan;
}): Promise<{ ok: true; draftId: string } | { ok: false; error: string }> {
  const scope = await currentScope();
  if (!scope) return { ok: false, error: "Not signed in." };
  if (!SERVICES.has(input.plan?.service) || !isWizardStep(input.step)) {
    return { ok: false, error: "That draft can't be saved." };
  }
  const data = JSON.parse(JSON.stringify(input.plan)) as object;
  if (JSON.stringify(data).length > MAX_DRAFT_BYTES) {
    return { ok: false, error: "That draft is too large to save." };
  }
  const label = input.label.trim().slice(0, 120) || "Untitled campaign";

  if (input.draftId) {
    // Never while it's being built: that would reopen a campaign mid-launch.
    const saved = await db.campaignDraft.updateMany({
      where: { id: input.draftId, organizationId: scope.organizationId, step: { not: "BUILDING" } },
      data: { step: input.step, label, data, service: input.plan.service },
    });
    if (saved.count === 1) return { ok: true, draftId: input.draftId };
    // Being built is not "gone": starting a fresh draft here would hand a
    // second click a draft of its own to build, and build the campaign twice.
    const building = await db.campaignDraft.count({
      where: { id: input.draftId, organizationId: scope.organizationId, step: "BUILDING" },
    });
    if (building > 0) return { ok: false, error: "This campaign is already being built." };
  }

  const draft = await db.campaignDraft.create({
    data: {
      organizationId: scope.organizationId,
      createdByUserId: scope.userId,
      service: input.plan.service,
      step: input.step,
      label,
      data,
    },
    select: { id: true },
  });
  revalidatePath("/dashboard/create");
  return { ok: true, draftId: draft.id };
}

export async function deleteCampaignDraftAction(draftId: string): Promise<void> {
  const scope = await currentScope();
  if (!scope) return;
  await db.campaignDraft.deleteMany({
    where: { id: draftId, organizationId: scope.organizationId, step: { not: "BUILDING" } },
  });
  revalidatePath("/dashboard/create");
}

export async function reviewCampaignAction(
  plan: CampaignPlan
): Promise<{ ok: true; review: CampaignReview } | { ok: false; error: string }> {
  const scope = await currentScope();
  if (!scope) return { ok: false, error: "Not signed in." };
  if (!SERVICES.has(plan?.service)) return { ok: false, error: "That campaign can't be reviewed." };
  try {
    return { ok: true, review: await reviewCampaign(scope.organizationId, plan) };
  } catch (error) {
    console.error("Campaign review failed:", error);
    return { ok: false, error: "MAIRO couldn't finish the review. Try again in a moment." };
  }
}

/** Three versions of the ad's words, written from what the business told MAIRO. */
export async function writeAdCopyAction(
  plan: CampaignPlan
): Promise<{ ok: true; options: CopyOption[] } | { ok: false; error: string }> {
  const scope = await currentScope();
  if (!scope) return { ok: false, error: "Not signed in." };
  if (!SERVICES.has(plan?.service)) return { ok: false, error: "That campaign can't be written for." };
  const promotes = PROMOTES_OPTIONS.find((o) => o.value === plan.promotes)?.label ?? "";
  try {
    const options = await writeAdCopyOptions({
      businessName: String(plan.businessName ?? "").slice(0, 200),
      offering: String(plan.offering ?? "").slice(0, 1000),
      targetAudience: String(plan.targetAudience ?? "").slice(0, 1000),
      differentiator: String(plan.differentiator ?? "").slice(0, 1000),
      advertising: [promotes, String(plan.promotesDetail ?? "").slice(0, 200)].filter(Boolean).join(" — "),
      goal: plan.goal ? goalOption(plan.goal).label : "Get results",
      destination: plan.destinationType ?? null,
      website: String(plan.website ?? "").slice(0, 300),
    });
    return { ok: true, options };
  } catch (error) {
    console.error("Writing ad copy failed:", error);
    return { ok: false, error: "MAIRO couldn't write the ad text just now. Try again, or write your own below." };
  }
}

/** The ads already in the business's Meta ad account that can run again. */
export async function loadAccountAdsAction(): Promise<{ ok: true; ads: AccountAd[] } | { ok: false; error: string }> {
  const scope = await currentScope();
  if (!scope) return { ok: false, error: "Not signed in." };
  const result = await listAccountAds(scope.organizationId);
  return result.ok ? { ok: true, ads: result.data } : { ok: false, error: result.error };
}
