"use server";

import { executionBlock } from "@/lib/billing/execution";
import { revalidatePath } from "next/cache";
import { loadBrain, saveBrain, type BrainProfile } from "@/lib/business/brain";
import { fixElement, improveOptions, type BrandFacts } from "@/lib/ai/ad-score";
import type { FixResult, OptionsResult } from "@/lib/score/edits";
import { applyBusinessAnswer, businessAnswer, questionDef } from "@/lib/score/questions";
import { businessCategory } from "@/lib/social/goals";
import type { FixKind } from "@/lib/score/rules";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { hasOwnWords, isWizardStep, runningCopy, type CampaignPlan } from "@/lib/campaigns/plan";
import { loadMetaConnection } from "@/lib/meta/connection";
import { isPreviewFormat, previewCreativeSpec, previewExistingAd } from "@/lib/meta/previews";
import { creativeOfAccountAd } from "@/lib/meta/existing-ads";
import { findInstagramAccount } from "@/lib/instagram/publish";
import { metaAdCreativeParams } from "@/lib/meta/creatives";
import { resolveDestination } from "@/lib/campaigns/destination";
import { reviewCampaign, type CampaignReview } from "@/lib/campaigns/review";
import { writeAdCopyOptions } from "@/lib/ai/ad-copy";
import type { CopyOption } from "@/lib/campaigns/ad-copy";
import { isOwnUpload } from "@/lib/campaigns/media-rules";
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

// Meta only. A draft saved while TikTok was offered is refused rather than
// half-built.
const SERVICES = new Set(["meta"]);
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
  const blocked = await executionBlock(scope.organizationId);
  if (blocked) return { ok: false, error: blocked };
  if (!SERVICES.has(plan?.service)) return { ok: false, error: "That campaign can't be written for." };
  const promotes = PROMOTES_OPTIONS.find((o) => o.value === plan.promotes)?.label ?? "";
  // The Business Brain's voice and lessons, so every version sounds like
  // this business and leans away from offers that didn't work before.
  const brain = (await loadBrain(scope.organizationId)).profile;
  const lessons = [
    brain.brandVoice ? `Brand voice: ${brain.brandVoice}.` : "",
    brain.successfulOffers.length ? `Offers that worked before: ${brain.successfulOffers.join("; ")}.` : "",
    brain.unsuccessfulOffers.length ? `Offers that didn't work (avoid): ${brain.unsuccessfulOffers.join("; ")}.` : "",
  ].filter(Boolean).join(" ");
  try {
    const options = await writeAdCopyOptions({
      businessName: String(plan.businessName ?? "").slice(0, 200),
      offering: String(plan.offering ?? "").slice(0, 1000),
      targetAudience: String(plan.targetAudience ?? "").slice(0, 1000),
      differentiator: [String(plan.differentiator ?? "").slice(0, 1000), lessons].filter(Boolean).join(" "),
      advertising: [promotes, String(plan.promotesDetail ?? "").slice(0, 200)].filter(Boolean).join(" — "),
      goal: plan.goal ? goalOption(plan.goal).label : "Get results",
      destination: plan.destinationType ?? null,
      website: String(plan.website ?? "").slice(0, 300),
      // Their own creative, so the suggested words fit it. Only this
      // business's own uploads are passed along.
      imageUrl: ownCreativeUrl(plan, scope.organizationId),
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

/**
 * Meta's own preview of the ad as planned, in one placement. Drawn by Meta
 * without creating anything in the ad account.
 */
export async function previewAdAction(
  plan: CampaignPlan,
  format: string
): Promise<{ ok: true; src: string; note: string | null } | { ok: false; error: string }> {
  const scope = await currentScope();
  if (!scope) return { ok: false, error: "Not signed in." };
  if (!SERVICES.has(plan?.service) || !isPreviewFormat(format)) return { ok: false, error: "That preview isn't available." };

  const connection = await loadMetaConnection(scope.organizationId);
  if (!connection) return { ok: false, error: "Connect Meta to see previews." };
  if (!connection.pageId) return { ok: false, error: "Pick a Facebook Page on the Meta connection screen to see previews." };

  try {
    let src: string | null = null;
    let note: string | null = null;

    if (plan.adChoice === "EXISTING_AD" && plan.existingAd) {
      const owned = await creativeOfAccountAd(connection.metaAdAccountId, connection.accessToken, plan.existingAd.id);
      if (!owned.ok) return { ok: false, error: owned.error };
      src = await previewExistingAd(plan.existingAd.id, connection.accessToken, format);
    } else if (plan.adChoice === "FACEBOOK_POST" && plan.selectedPost) {
      src = await previewCreativeSpec(connection.metaAdAccountId, connection.accessToken, { object_story_id: plan.selectedPost.id }, format);
    } else if (plan.adChoice === "INSTAGRAM_POST" && plan.selectedPost) {
      const account = await findInstagramAccount(scope.organizationId);
      if (!account.ok || !account.data) return { ok: false, error: "Link an Instagram account to your Page to preview Instagram posts." };
      src = await previewCreativeSpec(
        connection.metaAdAccountId,
        connection.accessToken,
        { object_id: connection.pageId, instagram_user_id: account.data.igUserId, source_instagram_media_id: plan.selectedPost.id },
        format
      );
    } else if (hasOwnWords(plan)) {
      const words = runningCopy(plan)[0];
      const picture =
        plan.adChoice === "video" ? plan.video?.posterUrl : plan.adChoice === "images" ? plan.images?.[0]?.url : plan.attachedPreview;
      if (plan.adChoice === "images" && (plan.images?.length ?? 0) > 1) note = "This shows your first picture — each of the others runs as its own ad with the same words.";
      if (!words || !picture || !/^https:\/\//.test(picture)) return { ok: false, error: "Finish the ad and its words to see a preview." };
      if (plan.adChoice === "video") note = "The preview shows the video's thumbnail — the video itself plays in the real ad.";
      const spec = previewSpec(plan, connection.pageId, picture, words);
      if (!spec) return { ok: false, error: "Finish where the ad sends people (Your Goal) to see a preview." };
      src = await previewCreativeSpec(connection.metaAdAccountId, connection.accessToken, spec, format);
    } else {
      return { ok: false, error: "There's no ad to preview yet — MAIRO makes it after the campaign is built." };
    }

    return src ? { ok: true, src, note } : { ok: false, error: "Meta didn't return a preview for that placement." };
  } catch (error) {
    console.error("Meta preview failed:", error);
    return { ok: false, error: "Meta couldn't draw that preview just now. Try another placement or try again." };
  }
}

/** The ad as a creative spec, with the picture by URL — nothing uploaded. */
function previewSpec(plan: CampaignPlan, pageId: string, picture: string, words: CopyOption): Record<string, unknown> | null {
  // A form that doesn't exist yet can't be attached; the preview shows the
  // button pointing at the Page instead, which looks the same.
  const destination =
    plan.destinationType === "LEAD_FORM"
      ? ({ type: "WEBSITE", url: `https://www.facebook.com/${pageId}` } as const)
      : resolveDestination(
          { type: plan.destinationType ?? "WEBSITE", url: plan.destinationValue, phone: plan.destinationValue, channel: plan.messageChannel, metaAppId: plan.metaAppId },
          { type: "WEBSITE", url: plan.website }
        );
  if (!destination) return null;
  const params = metaAdCreativeParams({
    adAccountId: "",
    accessToken: "",
    name: "preview",
    pageId,
    imageHash: "",
    destination,
    message: words.primaryText,
    headline: words.headline,
    callToAction: plan.destinationType === "LEAD_FORM" ? "SIGN_UP" : words.cta,
  });
  const story = JSON.parse(String(params.object_story_spec)) as { link_data?: Record<string, unknown> };
  if (!story.link_data) return null;
  delete story.link_data.image_hash;
  story.link_data.picture = picture;
  return { object_story_spec: story };
}

function ownCreativeUrl(plan: CampaignPlan, organizationId: string): string | null {
  const url =
    plan.adChoice === "images"
      ? plan.images?.[0]?.url
      : plan.adChoice === "video"
        ? plan.video?.posterUrl
        : plan.adChoice === "attached"
          ? plan.attachedPreview
          : null;
  if (!url) return null;
  if (plan.adChoice === "attached") return /^https:\/\//.test(url) ? url : null;
  return isOwnUpload(url, organizationId) ? url : null;
}

/**
 * "Fix with AI" on one Pre-Launch Ad Score recommendation. Returns the edit
 * and a before/after; the wizard applies it only when the customer approves.
 */
export async function fixWithAiAction(plan: CampaignPlan, kind: FixKind): Promise<FixResult> {
  const scope = await currentScope();
  if (!scope || !SERVICES.has(plan?.service)) return { ok: false, kind, error: "That campaign can't be fixed here." };
  const brain = (await loadBrain(scope.organizationId)).profile;
  return fixElement({ plan, kind, brand: brandFacts(brain) });
}

function brandFacts(p: BrainProfile): BrandFacts {
  return {
    brandVoice: p.brandVoice,
    offers: p.offers,
    usps: p.usps,
    painPoints: p.painPoints,
    customerResults: p.customerResults,
    objections: p.objections,
    customerPraise: p.customerPraise,
    bestProducts: p.bestProducts,
    serviceArea: p.serviceArea,
  };
}

/**
 * "Improve With MAIRO": three alternatives for one part of the ad, one
 * recommended. Nothing is applied here — the customer picks, and the wizard
 * checks the campaign again on what they chose.
 */
export async function improveOptionsAction(plan: CampaignPlan, kind: FixKind): Promise<OptionsResult> {
  const scope = await currentScope();
  if (!scope || !SERVICES.has(plan?.service)) return { ok: false, kind, error: "That campaign can't be improved here." };
  const brain = (await loadBrain(scope.organizationId)).profile;
  return improveOptions({ plan, kind, brand: brandFacts(brain) });
}

/**
 * Saves an answer to a Business Profile question ("What makes customers
 * choose you?") to the Business Brain, marked as the owner's own words so a
 * fresh website analysis never overwrites it. Campaign answers never come
 * here — they stay on the campaign. Answering doesn't change any score; the
 * next check of the campaign decides that.
 */
export async function answerBusinessQuestionAction(input: {
  id: string;
  answer: string;
  /** A confirmation the owner corrected: the new answer replaces what MAIRO had first. */
  replace?: boolean;
}): Promise<{ ok: true; saved: "saved" | "declined"; label: string } | { ok: false; error: string }> {
  const scope = await currentScope();
  if (!scope) return { ok: false, error: "Not signed in." };
  const def = questionDef(String(input?.id ?? ""));
  if (!def || def.scope !== "business") return { ok: false, error: "That question isn't about your business profile." };
  const record = await loadBrain(scope.organizationId);
  const category = businessCategory(`${record.profile.industry} ${record.profile.overview}`);
  const result = businessAnswer(def.id, String(input.answer ?? ""), category, Boolean(input.replace));
  if (result.kind === "invalid") return { ok: false, error: result.error };
  const profile = applyBusinessAnswer(record.profile, def.id, result);
  const field = result.kind === "save" ? result.field : "declinedQuestions";
  await saveBrain(scope.organizationId, { profile, editedFields: [...new Set([...record.editedFields, field])] });
  revalidatePath("/dashboard/settings/business-brain");
  return { ok: true, saved: result.kind === "save" ? "saved" : "declined", label: def.label };
}

