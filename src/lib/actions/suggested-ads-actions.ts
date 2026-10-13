"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { recordRun } from "@/lib/team/runs";
import { executionBlock } from "@/lib/billing/execution";
import { openAiImageConfigured } from "@/lib/ai/openai-image";
import { storageConfigured } from "@/lib/storage/blob";
import { costFor } from "@/lib/creative-studio/pricing";
import { creditBalance, reserveCredits, confirmCredits, releaseCredits } from "@/lib/creative-studio/credits";
import { runGenerate } from "@/lib/creative-studio/pipeline";
import { checkVideo, isOwnUpload } from "@/lib/campaigns/media-rules";
import { loadMetaConnection } from "@/lib/meta/connection";
import { previewCreativeSpec } from "@/lib/meta/previews";
import { isPreviewFormat } from "@/lib/meta/preview-formats";
import { ctaTypeFor, imagePromptFor } from "@/lib/suggested-ads/directions";
import { NO_EDITS } from "@/lib/suggested-ads/video";
import { renderVideoRevision } from "@/lib/suggested-ads/render-run";
import type { HookAngle } from "@/lib/creative/hooks";
import {
  approveCreative,
  confirmedFactsFor,
  draftFromApproval,
  refreshDirections,
  reviseDirection,
  saveOwnerVideo,
  saveVideoEdits,
  suggestedAdsGate,
} from "@/lib/suggested-ads/store";

// "Review your suggested ads": the server side of every button on the page.
//
// Every action reads the business from the signed-in session, never from the
// browser, and passes it to the store, which only ever looks an id up
// together with it. Making a picture is paid: it shows its cost first,
// reserves the credits, and spends them only on a picture that was really
// made and stored. Nothing here talks to an ad account except the preview,
// which Meta draws without creating anything.

const PAGE = "/dashboard/creatives/suggested";

type Fail = { ok: false; error: string };

async function scope(): Promise<{ organizationId: string; userId: string } | null> {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) return null;
  return { organizationId: (await activeOrganizationId()) ?? session.user.organizationId, userId: session.user.id };
}

async function gated(): Promise<{ ok: true; organizationId: string; userId: string } | Fail> {
  const s = await scope();
  if (!s) return { ok: false, error: "Not signed in." };
  const gate = await suggestedAdsGate(s.organizationId);
  if (!gate.ready) return { ok: false, error: gate.next ? `First: ${gate.next.label.toLowerCase()}.` : "Suggested ads aren't open for this business yet." };
  return { ok: true, ...s };
}

const QUALITY = z.enum(["standard", "premium"]);
const ID = z.string().min(5).max(40).regex(/^[a-z0-9]+$/i);

export type CreditQuote = { ok: true; cost: number; remaining: number; allowance: number; available: boolean; blocked: string | null } | Fail;

/** What making a picture would cost, and whether it can be made at all — shown before anything is spent. */
export async function creditQuoteAction(quality: string): Promise<CreditQuote> {
  const s = await scope();
  if (!s) return { ok: false, error: "Not signed in." };
  const q = QUALITY.safeParse(quality);
  if (!q.success) return { ok: false, error: "Choose a quality." };
  const [cost, balance, blocked] = await Promise.all([costFor("GENERATE", q.data), creditBalance(s.organizationId), executionBlock(s.organizationId)]);
  const available = openAiImageConfigured() && storageConfigured();
  return { ok: true, cost, remaining: balance.remaining, allowance: balance.allowance, available, blocked };
}

export type MadeImage = { ok: true; versionId: string; imageUrl: string } | Fail;

/**
 * Makes the picture for one direction, after the owner saw and accepted the
 * cost. The credits are reserved first and spent only if a picture was made
 * and stored; otherwise they're released and the reason is shown.
 */
export async function createAdImageAction(angleId: string, quality: string, acceptedCost: number): Promise<MadeImage> {
  const ctx = await gated();
  if (!ctx.ok) return ctx;
  const id = ID.safeParse(angleId);
  const q = QUALITY.safeParse(quality);
  if (!id.success || !q.success) return { ok: false, error: "That request wasn't valid." };
  if (!openAiImageConfigured() || !storageConfigured()) {
    return { ok: false, error: "Making pictures isn't switched on for this deployment yet, so nothing was made and nothing was charged. You can use your own video instead." };
  }
  const blocked = await executionBlock(ctx.organizationId);
  if (blocked) return { ok: false, error: blocked };

  const angle = await db.adAngle.findFirst({ where: { id: id.data, organizationId: ctx.organizationId, status: { not: "ARCHIVED" } }, include: { revisions: { orderBy: { version: "desc" }, take: 1 } } });
  const words = angle?.revisions[0];
  if (!angle || !words || !angle.angleKind) return { ok: false, error: "That direction isn't in your account." };

  const cost = await costFor("GENERATE", q.data);
  // The price changed between showing it and pressing the button: ask again rather than charge a different amount.
  if (cost !== acceptedCost) return { ok: false, error: `The cost is now ${cost} credit${cost === 1 ? "" : "s"}. Nothing was charged — confirm the new cost to continue.` };

  const { facts } = await confirmedFactsFor(ctx.organizationId);
  const reservation = await reserveCredits(ctx.organizationId, "GENERATE", cost);
  if (!reservation.ok) return { ok: false, error: reservation.reason };

  const outcome = await runGenerate({
    organizationId: ctx.organizationId,
    createdByUserId: ctx.userId,
    prompt: imagePromptFor({ kind: angle.angleKind as HookAngle, hook: words.hook }, facts),
    preset: null,
    format: "PORTRAIT",
    quality: q.data,
  });
  if (!outcome.ok) {
    await releaseCredits(reservation.ledgerId);
    if (outcome.assetId) await db.creativeStudioAsset.updateMany({ where: { id: outcome.assetId, organizationId: ctx.organizationId }, data: { angleId: angle.id } });
    revalidatePath(PAGE);
    return { ok: false, error: `The picture couldn't be made, so no credits were used. ${outcome.error}`.trim() };
  }
  await Promise.all([
    confirmCredits(reservation.ledgerId, outcome.assetId, outcome.versionId),
    db.creativeStudioVersion.update({ where: { id: outcome.versionId }, data: { creditsSpent: cost } }),
    db.creativeStudioAsset.updateMany({ where: { id: outcome.assetId, organizationId: ctx.organizationId }, data: { angleId: angle.id } }),
  ]);
  await recordRun({ organizationId: ctx.organizationId, agent: "CREATIVE", task: "Suggested ad picture", status: "DONE", summary: `Made a picture for “${angle.title}”, one of your suggested ads.`, href: PAGE }).catch(() => null);
  revalidatePath(PAGE);
  revalidatePath("/dashboard/creatives", "layout");
  return { ok: true, versionId: outcome.versionId, imageUrl: outcome.imageUrl };
}

const WORDS = z.object({ hook: z.string().max(400), body: z.string().max(1200), cta: z.string().max(60) });

/** A new version of a direction's words; the earlier ones stay in its history. */
export async function reviseDirectionAction(angleId: string, words: { hook: string; body: string; cta: string }): Promise<{ ok: true; version: number } | Fail> {
  const ctx = await gated();
  if (!ctx.ok) return ctx;
  const id = ID.safeParse(angleId);
  const w = WORDS.safeParse(words);
  if (!id.success || !w.success) return { ok: false, error: "That change wasn't valid." };
  const r = await reviseDirection(ctx.organizationId, ctx.userId, id.data, w.data);
  if (r.ok) revalidatePath(PAGE);
  return r;
}

/** Puts back the words of an earlier version, as a new version. */
export async function restoreDirectionAction(angleId: string, version: number): Promise<{ ok: true; version: number } | Fail> {
  const ctx = await gated();
  if (!ctx.ok) return ctx;
  const id = ID.safeParse(angleId);
  if (!id.success || !Number.isInteger(version)) return { ok: false, error: "That version wasn't valid." };
  const old = await db.adAngleRevision.findFirst({ where: { angleId: id.data, organizationId: ctx.organizationId, version } });
  if (!old) return { ok: false, error: "That version isn't in your account." };
  const r = await reviseDirection(ctx.organizationId, ctx.userId, id.data, { hook: old.hook, body: old.body, cta: old.cta });
  if (r.ok) revalidatePath(PAGE);
  return r;
}

/** Sets aside the unapproved directions and suggests three new ones from today's confirmed facts. */
export async function refreshDirectionsAction(): Promise<{ ok: true; created: number } | Fail> {
  const ctx = await gated();
  if (!ctx.ok) return ctx;
  const r = await refreshDirections(ctx.organizationId, ctx.userId);
  revalidatePath(PAGE);
  return { ok: true, created: r.created };
}

const VIDEO = z.object({
  angleId: ID,
  url: z.string().url().max(600),
  posterUrl: z.string().url().max(600).nullable(),
  name: z.string().max(200),
  type: z.string().max(60),
  durationSec: z.number().positive().max(60 * 241),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
  bytes: z.number().int().positive(),
});

/**
 * Keeps an uploaded video against a direction. The file went straight from
 * the browser to this business's own storage folder; this only accepts a URL
 * in that folder, and checks the video against Meta's rules again here.
 */
export async function saveVideoAction(input: z.input<typeof VIDEO>): Promise<{ ok: true; videoId: string } | Fail> {
  const ctx = await gated();
  if (!ctx.ok) return ctx;
  const v = VIDEO.safeParse(input);
  if (!v.success) return { ok: false, error: "That video's details weren't valid." };
  if (!isOwnUpload(v.data.url, ctx.organizationId) || (v.data.posterUrl && !isOwnUpload(v.data.posterUrl, ctx.organizationId))) {
    return { ok: false, error: "That video isn't in your business's uploads." };
  }
  const check = checkVideo({ type: v.data.type, bytes: v.data.bytes, width: v.data.width, height: v.data.height, durationSec: v.data.durationSec });
  if (check.problems.length) return { ok: false, error: check.problems[0] };
  const r = await saveOwnerVideo(ctx.organizationId, ctx.userId, { ...v.data, durationMs: v.data.durationSec * 1000 });
  if (r.ok) revalidatePath(PAGE);
  return r;
}

/** Saves the video's edit list as a new revision. The uploaded file is never changed. */
export async function saveVideoEditsAction(videoId: string, edits: unknown): Promise<{ ok: true; version: number; changed: boolean } | Fail> {
  const ctx = await gated();
  if (!ctx.ok) return ctx;
  const id = ID.safeParse(videoId);
  if (!id.success) return { ok: false, error: "That video wasn't valid." };
  if (JSON.stringify(edits ?? null).length > 20_000) return { ok: false, error: "Those edits are too long." };
  const r = await saveVideoEdits(ctx.organizationId, ctx.userId, id.data, edits);
  if (r.ok) revalidatePath(PAGE);
  return r;
}

/** Back to the video as uploaded — saved as a new revision, so the edits can be found again. */
export async function revertVideoAction(videoId: string): Promise<{ ok: true; version: number; changed: boolean } | Fail> {
  return saveVideoEditsAction(videoId, NO_EDITS);
}

/** Approves exactly these words with exactly this picture or video version. */
export async function approveCreativeAction(input: { angleId: string; revisionId: string; studioVersionId?: string | null; videoRevisionId?: string | null }): Promise<{ ok: true } | Fail> {
  const ctx = await gated();
  if (!ctx.ok) return ctx;
  const ids = z.object({ angleId: ID, revisionId: ID, studioVersionId: ID.nullish(), videoRevisionId: ID.nullish() }).safeParse(input);
  if (!ids.success) return { ok: false, error: "That approval wasn't valid." };
  const r = await approveCreative(ctx.organizationId, ctx.userId, ids.data);
  if (!r.ok) return r;
  await recordRun({ organizationId: ctx.organizationId, agent: "CREATIVE", task: "Creative approved", status: "DONE", summary: "You approved a suggested ad. It's ready to use in a campaign; nothing has been published.", href: PAGE }).catch(() => null);
  revalidatePath(PAGE);
  revalidatePath("/dashboard/creatives", "layout");
  return { ok: true };
}

/** Opens the campaign builder with exactly the approved ad in a new draft. Nothing is built or spent. */
export async function continueToCampaignAction(angleId: string): Promise<{ ok: true; href: string } | Fail> {
  const ctx = await gated();
  if (!ctx.ok) return ctx;
  const id = ID.safeParse(angleId);
  if (!id.success) return { ok: false, error: "That ad wasn't valid." };
  const r = await draftFromApproval(ctx.organizationId, ctx.userId, id.data);
  return r.ok ? { ok: true, href: `/dashboard/create/meta?draft=${r.draftId}` } : r;
}

/**
 * Meta's own preview of a direction with its picture, in one placement.
 * Meta draws it from a spec; nothing is created in the ad account.
 */
export async function suggestedPreviewAction(angleId: string, studioVersionId: string, format: string): Promise<{ ok: true; src: string } | Fail> {
  const ctx = await gated();
  if (!ctx.ok) return ctx;
  const id = ID.safeParse(angleId);
  const vid = ID.safeParse(studioVersionId);
  if (!id.success || !vid.success || !isPreviewFormat(format)) return { ok: false, error: "That preview isn't available." };
  const [angle, version, org, connection] = await Promise.all([
    db.adAngle.findFirst({ where: { id: id.data, organizationId: ctx.organizationId }, include: { revisions: { orderBy: { version: "desc" }, take: 1 } } }),
    db.creativeStudioVersion.findFirst({ where: { id: vid.data, status: "COMPLETE", asset: { organizationId: ctx.organizationId, angleId: id.data } }, select: { imageUrl: true } }),
    db.organization.findUnique({ where: { id: ctx.organizationId }, select: { website: true } }),
    loadMetaConnection(ctx.organizationId),
  ]);
  const words = angle?.revisions[0];
  if (!words || !version?.imageUrl) return { ok: false, error: "Make the picture first." };
  if (!connection?.pageId) return { ok: false, error: "Choose a Facebook Page on the Meta connection screen to see Meta's previews." };
  const link = org?.website && /^https?:\/\//.test(org.website) ? org.website : `https://www.facebook.com/${connection.pageId}`;
  const spec = {
    object_story_spec: {
      page_id: connection.pageId,
      link_data: { link, message: `${words.hook}\n\n${words.body}`.trim(), name: words.hook.slice(0, 40), picture: version.imageUrl, call_to_action: { type: ctaTypeFor(words.cta), value: { link } } },
    },
  };
  try {
    const src = await previewCreativeSpec(connection.metaAdAccountId, connection.accessToken, spec, format);
    return src ? { ok: true, src } : { ok: false, error: "Meta didn't return a preview for that placement." };
  } catch (error) {
    console.error("Suggested ad preview failed:", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: "Meta couldn't draw that preview just now. The mock-up above shows the layout." };
  }
}

/**
 * Writes the latest edit version of a video into a new file — the trim, the
 * crop and the captions in the picture. The original upload is kept as it
 * was. Safe to press twice: a render already running is waited for, not
 * repeated.
 */
export async function renderVideoAction(videoId: string): Promise<{ ok: true; status: "READY" | "RENDERING" | "NOT_NEEDED"; url: string | null } | Fail> {
  const ctx = await gated();
  if (!ctx.ok) return ctx;
  const id = ID.safeParse(videoId);
  if (!id.success) return { ok: false, error: "That video wasn't valid." };
  const blocked = await executionBlock(ctx.organizationId);
  if (blocked) return { ok: false, error: blocked };
  const r = await renderVideoRevision(ctx.organizationId, id.data);
  if (r.ok && r.status === "READY") {
    await recordRun({ organizationId: ctx.organizationId, agent: "CREATIVE", task: "Video edit rendered", status: "DONE", summary: "Wrote your video edits into a new file. The original is kept as it was.", href: PAGE }).catch(() => null);
  }
  revalidatePath(PAGE);
  return r;
}
